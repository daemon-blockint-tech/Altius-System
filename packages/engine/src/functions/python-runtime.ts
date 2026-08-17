/**
 * PythonFunctionRuntime — executes user-authored Python functions.
 *
 * A FunctionType with `runtime: "python"` has its `entry` treated as a
 * Python script path (relative to the pack directory) or inline source.
 * The runtime spawns a Python child process, passes inputs as JSON via
 * stdin, and reads the result from stdout.
 *
 * The Python script must:
 *   1. Read JSON from stdin
 *   2. Compute the result
 *   3. Print JSON to stdout (the result must be the LAST line of stdout)
 *
 * Example Python function:
 *   import json, sys
 *   inputs = json.loads(sys.stdin.read())
 *   result = {"doubled": inputs["x"] * 2}
 *   print(json.dumps(result))
 *
 * Security: like the isolated Node runtime, this forks a child process.
 * It is NOT a security sandbox — the child can open sockets and read files
 * the OS lets it read. A production deployment should use container-based
 * isolation (gVisor, Firecracker, or a container runtime).
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { FunctionRuntime, FunctionRuntimeContext, FunctionLogEntry } from './function-executor.js';

export interface PythonRuntimeConfig {
  /** Python executable path. Default: 'python3'. */
  pythonPath?: string;
  /** Base directory for resolving entry paths. */
  packDir?: string;
  /** Wall-clock timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Max memory in bytes for the child process. */
  maxMemoryBytes?: number;
  /** Pre-registered handlers keyed by entry (for testing). */
  handlers?: Record<string, string>;
}

export class PythonFunctionRuntime implements FunctionRuntime {
  readonly name = 'python';
  private readonly pythonPath: string;
  private readonly packDir?: string;
  private readonly timeoutMs: number;
  private readonly maxMemoryBytes?: number;
  private readonly handlers: Record<string, string>;

  constructor(config: PythonRuntimeConfig = {}) {
    this.pythonPath = config.pythonPath ?? 'python3';
    this.packDir = config.packDir;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxMemoryBytes = config.maxMemoryBytes;
    this.handlers = config.handlers ?? {};
  }

  /** Expose maxMemoryBytes for future resource-limit enforcement. */
  get _maxMemoryBytes(): number | undefined { return this.maxMemoryBytes; }

  /** Register a Python source string for an entry path (used by tests). */
  register(entry: string, source: string): void {
    this.handlers[entry] = source;
  }

  async execute(ctx: FunctionRuntimeContext): Promise<unknown> {
    const source = await this._resolveSource(ctx);
    const result = await this._runPython(source, ctx.inputs, ctx.log);
    return result;
  }

  private async _resolveSource(ctx: FunctionRuntimeContext): Promise<string> {
    // Check registered handlers first (test path)
    const handler = this.handlers[ctx.fn.entry];
    if (handler !== undefined) return handler;

    // If the entry looks like inline Python (contains a newline or starts
    // with import/def/print), treat it as source directly.
    if (ctx.fn.entry.includes('\n') || /^(import |from |def |class |print\()/.test(ctx.fn.entry.trim())) {
      return ctx.fn.entry;
    }

    // Otherwise resolve as a file path relative to the pack directory
    const base = ctx.packDir ?? this.packDir;
    if (!base) {
      throw new Error(`PythonFunctionRuntime: no handler for entry "${ctx.fn.entry}" and no packDir configured`);
    }
    const { readFile } = await import('node:fs/promises');
    const abs = resolve(base, ctx.fn.entry);
    return readFile(abs, 'utf-8');
  }

  private async _runPython(
    source: string,
    inputs: Record<string, unknown>,
    log: (level: FunctionLogEntry['level'], message: string) => void,
  ): Promise<unknown> {
    // Write the source to a temp file so we can pass it to python3
    const tmpDir = await mkdtemp(resolve(tmpdir(), 'altius-py-'));
    const scriptPath = resolve(tmpDir, 'function.py');
    try {
      await writeFile(scriptPath, source, 'utf-8');

      return await new Promise((resolvePromise, rejectPromise) => {
        const env: Record<string, string> = { ...process.env } as Record<string, string>;
        // Strip potentially sensitive env vars
        delete env['ALTius_SECRET'];
        delete env['DATABASE_URL'];

        const child = spawn(this.pythonPath, [scriptPath], {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: this.timeoutMs,
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, this.timeoutMs);

        child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => {
          stderrChunks.push(chunk);
          // Log stderr lines as WARN
          const text = chunk.toString('utf-8').trim();
          if (text) log('WARN', text);
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          rejectPromise(new Error(`PythonFunctionRuntime: failed to spawn python3: ${err.message}`));
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (timedOut) {
            rejectPromise(new Error(`PythonFunctionRuntime: timed out after ${this.timeoutMs}ms`));
            return;
          }
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
          if (code !== 0) {
            rejectPromise(new Error(`PythonFunctionRuntime: python3 exited with code ${code}${stderr ? ': ' + stderr : ''}`));
            return;
          }
          const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim();
          if (!stdout) {
            rejectPromise(new Error('PythonFunctionRuntime: no output from function'));
            return;
          }
          // The result is the LAST line of stdout (allows debug prints above it)
          const lines = stdout.split('\n');
          const lastLine = lines[lines.length - 1]!.trim();
          try {
            resolvePromise(JSON.parse(lastLine));
          } catch {
            rejectPromise(new Error(`PythonFunctionRuntime: output is not valid JSON: ${lastLine.slice(0, 200)}`));
          }
        });

        // Send inputs as JSON via stdin
        child.stdin.write(JSON.stringify(inputs));
        child.stdin.end();
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}
