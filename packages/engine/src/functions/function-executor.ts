/**
 * FunctionExecutor — invokes user-authored FunctionTypes (Section 6).
 *
 * A FunctionType is a pure computation declared in ODL with
 * `@function(runtime: "...", entry: "...")`. Unlike an ActionType, it has
 * no YAML manifest, no side-effects, and no transactional mutation: it
 * takes named params and returns a JSON result.
 *
 * Runtimes are pluggable via the `FunctionRuntime` interface. The engine
 * ships with two built-in adapters:
 *
 *  - `node` — loads a CommonJS/ESM module from the pack directory and
 *    calls its default export. Used for in-process Node functions.
 *  - `cel` — delegates expression-style functions to the CEL sidecar
 *    (the same `CelEvaluator` used by constraint evaluation).
 *
 * Custom runtimes (e.g. a future WASM or remote-worker adapter) can be
 * registered via `FunctionExecutorConfig.runtimes`.
 */

import type { ParsedSchema, FunctionType } from '@altius/odl';
import type { CelEvaluator } from '../objects/validation.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single log line captured during function execution. */
export interface FunctionLogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
}

/** The result of executing a FunctionType. */
export interface FunctionExecutionResult {
  /** The function's return value (JSON-serialisable). */
  result: unknown;
  /** Captured log lines (when the runtime supports log capture). */
  logs: FunctionLogEntry[];
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
}

/** Context passed to a FunctionRuntime adapter. */
export interface FunctionRuntimeContext {
  /** The FunctionType definition from the parsed schema. */
  fn: FunctionType;
  /** Resolved input values keyed by @param field name. */
  inputs: Record<string, unknown>;
  /** Pack-relative base directory for module resolution. */
  packDir?: string;
  /** Optional CEL evaluator (passed through to runtimes that need it). */
  celEvaluator?: CelEvaluator;
  /** Logger sink for runtimes that capture logs. */
  log: (level: FunctionLogEntry['level'], message: string) => void;
}

/**
 * A runtime adapter implements a single `runtime` name (e.g. "node",
 * "cel"). Adapters are stateless; the FunctionExecutor owns lifecycle.
 */
export interface FunctionRuntime {
  /** The runtime name this adapter handles (e.g. "node", "cel"). */
  name: string;
  /** Execute the function and return its result. */
  execute(ctx: FunctionRuntimeContext): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Built-in runtime: node
// ---------------------------------------------------------------------------

/**
 * Node runtime — dynamically imports the function's entry module relative
 * to the pack directory and calls its default export.
 *
 * The module's default export must be an async function:
 *
 *   export default async function (inputs, { log }) { ... return value; }
 *
 * For tests and environments without a real pack directory, a `registry`
 * of pre-registered handlers keyed by `entry` can be supplied via
 * `NodeRuntimeConfig.handlers`. This is the primary path used by the
 * FunctionExecutor tests and by in-process packs that register handlers
 * at boot.
 */
export interface NodeRuntimeConfig {
  /** Map of entry path → handler. Used when packDir resolution is unavailable. */
  handlers?: Record<string, (inputs: Record<string, unknown>, helpers: NodeRuntimeHelpers) => Promise<unknown>>;
  /** Base directory for resolving entry paths. */
  packDir?: string;
}

export interface NodeRuntimeHelpers {
  log: (level: FunctionLogEntry['level'], message: string) => void;
}

export class NodeFunctionRuntime implements FunctionRuntime {
  readonly name = 'node';
  private readonly handlers: Record<string, (inputs: Record<string, unknown>, helpers: NodeRuntimeHelpers) => Promise<unknown>>;
  private readonly packDir?: string;

  constructor(config: NodeRuntimeConfig = {}) {
    this.handlers = config.handlers ?? {};
    this.packDir = config.packDir;
  }

  /** Register a handler at runtime (used by packs and tests). */
  register(entry: string, handler: (inputs: Record<string, unknown>, helpers: NodeRuntimeHelpers) => Promise<unknown>): void {
    this.handlers[entry] = handler;
  }

  async execute(ctx: FunctionRuntimeContext): Promise<unknown> {
    const handler = this.handlers[ctx.fn.entry];
    if (handler) {
      return handler(ctx.inputs, { log: ctx.log });
    }

    if (!this.packDir && !ctx.packDir) {
      throw new Error(`NodeFunctionRuntime: no handler registered for entry "${ctx.fn.entry}" and no packDir configured`);
    }

    // Dynamic import relative to the pack directory. Node's ESM resolver
    // requires a file URL; resolve from the configured base.
    const base = ctx.packDir ?? this.packDir!;
    const path = await import('node:path');
    const url = await import('node:url');
    const abs = path.resolve(base, ctx.fn.entry);
    const moduleUrl = url.pathToFileURL(abs).href;
    const mod = await import(moduleUrl);
    const fn = mod.default ?? mod[ctx.fn.name] ?? mod;
    if (typeof fn !== 'function') {
      throw new Error(`NodeFunctionRuntime: entry "${ctx.fn.entry}" does not export a function`);
    }
    return fn(ctx.inputs, { log: ctx.log });
  }
}

// ---------------------------------------------------------------------------
// Built-in runtime: cel
// ---------------------------------------------------------------------------

/**
 * CEL runtime — for pure-expression functions. The FunctionType's `entry`
 * is treated as a CEL expression (not a module path), and the inputs are
 * bound as top-level variables.
 *
 * Example ODL:
 *   type Score @function(runtime: "cel", entry: "riskScore * 1.5") {
 *     riskScore: Float @param
 *   }
 */
export class CelFunctionRuntime implements FunctionRuntime {
  readonly name = 'cel';

  async execute(ctx: FunctionRuntimeContext): Promise<unknown> {
    if (!ctx.celEvaluator) {
      throw new Error('CelFunctionRuntime: no CelEvaluator configured');
    }
    const result = await ctx.celEvaluator.evaluate(ctx.fn.entry, ctx.inputs);
    if (result.error) {
      throw new Error(`CelFunctionRuntime: CEL evaluation failed: ${result.error}`);
    }
    return result.value;
  }
}

// ---------------------------------------------------------------------------
// FunctionExecutor
// ---------------------------------------------------------------------------

export interface FunctionExecutorConfig {
  schema: ParsedSchema;
  /** Runtime adapters keyed by name. Defaults to node + cel if omitted. */
  runtimes?: FunctionRuntime[];
  /** Optional CEL evaluator passed through to CEL-backed functions. */
  celEvaluator?: CelEvaluator;
  /** Pack-relative base directory for node runtime module resolution. */
  packDir?: string;
  /**
   * Per-function base directory, keyed by FunctionType name.
   *
   * A single `packDir` cannot be correct once more than one pack is loaded: the
   * schema merges every pack's FunctionTypes into one list, while the entry
   * path is relative to the pack that declared it. Callers that know the
   * provenance supply it here; `packDir` remains the fallback.
   */
  packDirByFunction?: Record<string, string>;
}

/**
 * Executes FunctionTypes declared in the schema.
 *
 * Lookup is by function name. The executor validates that the requested
 * function exists, that all @param fields are present in the inputs, and
 * that a runtime adapter is registered for the function's runtime.
 */
export class FunctionExecutor {
  private readonly schema: ParsedSchema;
  private readonly runtimes: Map<string, FunctionRuntime>;
  private readonly celEvaluator?: CelEvaluator;
  private readonly packDir?: string;
  private readonly packDirByFunction: Record<string, string>;

  constructor(config: FunctionExecutorConfig) {
    this.schema = config.schema;
    this.celEvaluator = config.celEvaluator;
    this.packDir = config.packDir;
    this.packDirByFunction = config.packDirByFunction ?? {};
    this.runtimes = new Map();

    const defaults: FunctionRuntime[] = [
      new NodeFunctionRuntime({ packDir: config.packDir }),
      new CelFunctionRuntime(),
    ];
    for (const rt of config.runtimes ?? defaults) {
      this.runtimes.set(rt.name, rt);
    }
  }

  /** Register a custom runtime adapter (overrides built-ins by name). */
  registerRuntime(rt: FunctionRuntime): void {
    this.runtimes.set(rt.name, rt);
  }

  /** Look up a FunctionType by name. */
  getFunction(name: string): FunctionType | undefined {
    return this.schema.functionTypes.find(f => f.name === name);
  }

  /**
   * Execute a function by name with the given inputs.
   *
   * @throws if the function is unknown, a required param is missing, or
   *         the runtime adapter raises an error.
   */
  async execute(
    name: string,
    inputs: Record<string, unknown>,
  ): Promise<FunctionExecutionResult> {
    const fn = this.getFunction(name);
    if (!fn) {
      throw new Error(`FunctionExecutor: unknown function "${name}"`);
    }

    // Validate required params
    for (const field of fn.fields) {
      const isParam = field.directives.some(d => d.kind === 'param');
      if (!isParam) continue;
      if (field.type.nonNull && (inputs[field.name] === undefined || inputs[field.name] === null)) {
        throw new Error(`FunctionExecutor: missing required param "${field.name}" for function "${name}"`);
      }
    }

    const runtime = this.runtimes.get(fn.runtime);
    if (!runtime) {
      throw new Error(`FunctionExecutor: no runtime registered for "${fn.runtime}" (function "${name}")`);
    }

    const logs: FunctionLogEntry[] = [];
    const log = (level: FunctionLogEntry['level'], message: string): void => {
      logs.push({ level, message, timestamp: new Date().toISOString() });
    };

    const start = Date.now();
    const result = await runtime.execute({
      fn,
      inputs,
      // The declaring pack's directory when known — see packDirByFunction.
      packDir: this.packDirByFunction[name] ?? this.packDir,
      celEvaluator: this.celEvaluator,
      log,
    });
    const durationMs = Date.now() - start;

    return { result, logs, durationMs };
  }
}
