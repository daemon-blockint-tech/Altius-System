/**
 * Child process that runs one pack-authored function and exits.
 *
 * Kept as plain JS at the package root on purpose: `../../function-worker.js`
 * resolves to this same file from `src/functions/` under vitest and from
 * `dist/functions/` in a built image, so the runtime needs no build step and
 * no dev/prod branch.
 *
 * The parent forks this with a scrubbed env and a heap cap, sends one job, and
 * kills the process if it overruns. Nothing here reads the parent's
 * environment — that is the point of the isolation.
 *
 * Protocol (IPC):
 *   parent -> { entry, inputs, packDir }
 *   child  -> { type: 'log',  level, message }
 *   child  -> { type: 'done', result }
 *   child  -> { type: 'error', message }
 */

import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

function send(msg) {
  if (process.send) process.send(msg);
}

process.once('message', async (job) => {
  try {
    const { entry, inputs, packDir } = job;
    const target = packDir ? resolvePath(packDir, entry) : resolvePath(entry);
    const mod = await import(pathToFileURL(target).href);
    const handler = mod.default;

    if (typeof handler !== 'function') {
      send({ type: 'error', message: `entry "${entry}" does not export a function` });
      process.exit(0);
    }

    const helpers = {
      log: (level, message) => send({ type: 'log', level, message: String(message) }),
    };

    const result = await handler(inputs ?? {}, helpers);

    // Surface non-serialisable results as an error rather than letting
    // structured-clone throw inside process.send with a cryptic message.
    try {
      send({ type: 'done', result: JSON.parse(JSON.stringify(result ?? null)) });
    } catch {
      send({ type: 'error', message: 'function returned a value that is not JSON-serialisable' });
    }
    process.exit(0);
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    process.exit(0);
  }
});
