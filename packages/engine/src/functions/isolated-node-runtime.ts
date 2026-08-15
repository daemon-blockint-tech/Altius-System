/**
 * Isolated node runtime — runs a pack-authored function in a separate process.
 *
 * The built-in `NodeFunctionRuntime` imports the entry module into the API
 * process. That process holds the Postgres URL, the OIDC client secret and the
 * OpenFGA store token, so pack code running there can read every one of them
 * from `process.env`, and an accidental infinite loop hangs the gateway for
 * every tenant.
 *
 * This adapter forks a child instead:
 *   - `env: {}` — the parent's secrets are not in the child's environment
 *   - `--max-old-space-size` — a runaway allocation kills the child, not the API
 *   - wall-clock timeout — a non-terminating function is SIGKILLed
 *
 * Isolation is process-level, not a security sandbox: the child can still open
 * sockets and read files the OS lets it read. Untrusted third-party code needs
 * a container or a seccomp/landlock profile on top; this closes the two holes
 * that made the in-process runtime unusable for pack code.
 *
 * Because the child is a fresh process, the in-process `handlers` registry the
 * built-in runtime supports cannot work here — entries must be real modules.
 */

import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type {
  FunctionRuntime,
  FunctionRuntimeContext,
  FunctionLogEntry,
  FunctionOntologyAccess,
} from './function-executor.js';

const WORKER_URL = new URL('../../function-worker.js', import.meta.url);

export interface IsolatedNodeRuntimeConfig {
  /** Base directory for resolving entry paths. Overridden per call by ctx.packDir. */
  packDir?: string;
  /** Wall-clock budget per call. Default 5000ms. */
  timeoutMs?: number;
  /** Child heap cap in MB, passed as --max-old-space-size. Default 128. */
  memoryLimitMb?: number;
  /** Runtime name to register under. Default 'node-isolated'. */
  name?: string;
}

type WorkerMessage =
  | { type: 'log'; level: FunctionLogEntry['level']; message: string }
  | { type: 'ontology'; id: number; op: string; args: unknown[] }
  | { type: 'done'; result: unknown }
  | { type: 'error'; message: string };

export class IsolatedNodeFunctionRuntime implements FunctionRuntime {
  readonly name: string;
  private readonly packDir?: string;
  private readonly timeoutMs: number;
  private readonly memoryLimitMb: number;

  constructor(config: IsolatedNodeRuntimeConfig = {}) {
    this.name = config.name ?? 'node-isolated';
    this.packDir = config.packDir;
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.memoryLimitMb = config.memoryLimitMb ?? 128;
  }

  async execute(ctx: FunctionRuntimeContext): Promise<unknown> {
    const entry = ctx.fn.entry;
    if (!entry) {
      throw new Error(`${this.name}: function "${ctx.fn.name}" declares no entry module`);
    }

    const child = fork(WORKER_URL, [], {
      // The whole point: the child must not inherit the gateway's secrets.
      env: {},
      execArgv: [`--max-old-space-size=${this.memoryLimitMb}`],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    return await this.awaitResult(child, ctx, entry);
  }

  private awaitResult(child: ChildProcess, ctx: FunctionRuntimeContext, entry: string): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeAllListeners();
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new Error(
          `${this.name}: function "${ctx.fn.name}" exceeded ${this.timeoutMs}ms and was terminated`,
        )));
      }, this.timeoutMs);
      // A pending function must not hold the process open at shutdown.
      timer.unref?.();

      child.on('message', (raw: unknown) => {
        const msg = raw as WorkerMessage;
        if (msg.type === 'log') {
          ctx.log(msg.level, msg.message);
          return;
        }
        if (msg.type === 'ontology') {
          // Served, not settled: the function is still running and is awaiting
          // this reply. Errors travel back as a rejected read so pack code can
          // catch them, rather than killing the call from out here.
          void this.serveOntology(child, ctx.ontology, msg);
          return;
        }
        if (msg.type === 'done') {
          finish(() => resolve(msg.result));
          return;
        }
        finish(() => reject(new Error(`${this.name}: ${msg.message}`)));
      });

      child.on('error', (err) => {
        finish(() => reject(new Error(`${this.name}: ${err.message}`)));
      });

      // Exit without a result means the child died — OOM kill, or a crash in
      // the entry module that took the process down before it could report.
      child.on('exit', (code, signal) => {
        finish(() => reject(new Error(
          `${this.name}: function "${ctx.fn.name}" exited without a result ` +
          `(code ${code ?? 'null'}, signal ${signal ?? 'null'}) — a heap-limit kill looks like this`,
        )));
      });

      child.send({ entry, inputs: ctx.inputs, packDir: ctx.packDir ?? this.packDir });
    });
  }

  private async serveOntology(
    child: ChildProcess,
    ontology: FunctionOntologyAccess | undefined,
    msg: { id: number; op: string; args: unknown[] },
  ): Promise<void> {
    let reply: Record<string, unknown>;
    try {
      if (!ontology) {
        throw new Error(
          'no ontology reader is configured for this runtime, so functions cannot read objects',
        );
      }
      let value: unknown;
      if (msg.op === 'getObject') {
        const [objectType, id] = msg.args as [string, string];
        value = await ontology.getObject(objectType, id);
      } else if (msg.op === 'applyAction') {
        if (!ontology.applyAction) {
          throw new Error(
            'this deployment offers no applyAction path, so functions cannot change the ontology',
          );
        }
        const [actionName, params] = msg.args as [string, Record<string, unknown>];
        value = await ontology.applyAction(actionName, params);
      } else {
        throw new Error(`unsupported ontology operation "${msg.op}"`);
      }
      reply = { type: 'ontology-result', id: msg.id, ok: true, value: value ?? null };
    } catch (err) {
      reply = {
        type: 'ontology-result',
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    // The child may already be gone (timeout kill, crash); sending then throws.
    if (child.connected) child.send(reply);
  }
}
