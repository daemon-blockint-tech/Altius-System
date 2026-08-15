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
 *   parent -> { entry, inputs, packDir }            (the job, exactly once)
 *   child  -> { type: 'log',  level, message }
 *   child  -> { type: 'ontology', id, op, args }    (read request)
 *   parent -> { type: 'ontology-result', id, ok, value | error }
 *   child  -> { type: 'done', result }
 *   child  -> { type: 'error', message }
 *
 * Ontology reads travel back to the parent rather than being done here on
 * purpose: this process is forked with a scrubbed env precisely so it holds no
 * database or OpenFGA credentials. The parent performs the read bound to the
 * invoking user, so a function can never read what its caller could not.
 */

import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

function send(msg) {
  if (process.send) process.send(msg);
}

// In-flight host reads, keyed by correlation id. A function may await several
// concurrently, so replies cannot be matched by arrival order.
const pending = new Map();
let seq = 0;
let jobStarted = false;

function callHost(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    send({ type: 'ontology', id, op, args });
  });
}

const ontology = {
  getObject: (type, id) => callHost('getObject', [type, id]),
  // Not a write: the parent runs a declared action through the governed
  // pipeline. Pack code never touches storage.
  applyAction: (actionName, params) => callHost('applyAction', [actionName, params ?? {}]),
  queryObjects: (type, filter, limit) => callHost('queryObjects', [type, filter ?? null, limit ?? null]),
};

process.on('message', (msg) => {
  if (msg && msg.type === 'ontology-result') {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.value);
    else waiter.reject(new Error(msg.error));
    return;
  }
  // Anything that is not a reply is the job, and there is only ever one.
  if (jobStarted) return;
  jobStarted = true;
  void runJob(msg);
});

async function runJob(job) {
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
      ontology,
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
}
