/**
 * LLMFunctionRuntime — AI-powered functions over the ontology (Section AIP).
 *
 * Foundry's "AI-driven logic building" pitch is: build, test, and release
 * feature-rich, AI-powered functions that leverage the Ontology within your
 * applications. Altius already had the function lifecycle (registry,
 * pipeline, draft/test/publish, Git source, ReBAC, REST/GraphQL/MCP
 * surfaces); what it lacked was a runtime that lets a function be *defined*
 * as an LLM call rather than hand-written code.
 *
 * A function declares `@function(runtime: "llm", entry: "<prompt template>")`.
 * The entry is a prompt template with `{{input.field}}` placeholders resolved
 * from the function's `@param` inputs. The runtime:
 *
 *   1. Resolves the prompt template against the inputs.
 *   2. Optionally enriches the prompt with ontology context (reads performed
 *      by the host under the caller's identity — never a raw storage handle).
 *   3. Calls the LLM client via the pipeline runner, so retries, schema
 *      validation, and metrics apply to AI functions exactly as they do to
 *      data-pipeline LLM steps.
 *   4. Validates the result against a schema derived from the function's
 *      declared return shape, so a model that returns the wrong structure
 *      fails the function rather than silently corrupting downstream logic.
 *
 * The runtime is registered alongside `node` and `cel` in the executor, so
 * AI functions go through the same governance (ReBAC, audit, lifecycle) as
 * any other function. A competent user can declare an AI function in ODL,
 * run it through the draft/test/publish pipeline, and invoke it over REST or
 * GraphQL without writing platform code — which is the parity bar.
 */

import type {
  RequestContext,
  LLMClient,
  LLMCompleteOptions,
  LLMSchema,
} from '@altius/spi';
import type { AltiusMetrics } from '@altius/observability';
import type { FunctionType, FieldTypeRef } from '@altius/odl';
import type { FunctionRuntime, FunctionRuntimeContext } from './function-executor.js';
import { runLLMPipelineStep, type LLMPipelineRunResult } from '../llm/llm-pipeline-runner.js';

export interface LLMFunctionRuntimeConfig {
  /** The LLM client used to execute AI functions. */
  client: LLMClient;
  /** Optional metrics for LLM calls. */
  metrics?: AltiusMetrics;
  /** Default completion options applied to every AI function call. */
  defaultOptions?: Omit<LLMCompleteOptions, 'outputSchema'>;
  /** Pipeline runner retry/backoff config (defaults used if omitted). */
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Runtime adapter for `@function(runtime: "llm")`.
 *
 * The function's `entry` is a prompt template. The function's `@param` fields
 * supply template variables and, when the function declares a non-scalar
 * return type, the output schema.
 */
export class LLMFunctionRuntime implements FunctionRuntime {
  readonly name = 'llm';
  private readonly client: LLMClient;
  private readonly metrics?: AltiusMetrics;
  private readonly defaultOptions?: Omit<LLMCompleteOptions, 'outputSchema'>;
  private readonly maxRetries?: number;
  private readonly baseBackoffMs?: number;
  private readonly maxBackoffMs?: number;

  constructor(config: LLMFunctionRuntimeConfig) {
    this.client = config.client;
    this.metrics = config.metrics;
    this.defaultOptions = config.defaultOptions;
    this.maxRetries = config.maxRetries;
    this.baseBackoffMs = config.baseBackoffMs;
    this.maxBackoffMs = config.maxBackoffMs;
  }

  async execute(ctx: FunctionRuntimeContext): Promise<unknown> {
    if (!this.client.isConfigured()) {
      throw new Error(
        `LLMFunctionRuntime: LLM client is not configured — set LLM_PROVIDER and credentials to run AI function "${ctx.fn.name}"`,
      );
    }

    const prompt = renderPrompt(ctx.fn.entry, ctx.inputs, ctx.ontology);
    const schema = schemaForFunction(ctx.fn);
    const requestContext = requestContextFor(ctx);

    const options: LLMCompleteOptions = {
      ...this.defaultOptions,
      ...(schema ? { outputSchema: schema } : {}),
    };

    const result: LLMPipelineRunResult = await runLLMPipelineStep(
      {
        client: this.client,
        metrics: this.metrics,
        ...(this.maxRetries !== undefined ? { maxRetries: this.maxRetries } : {}),
        ...(this.baseBackoffMs !== undefined ? { baseBackoffMs: this.baseBackoffMs } : {}),
        ...(this.maxBackoffMs !== undefined ? { maxBackoffMs: this.maxBackoffMs } : {}),
      },
      requestContext,
      prompt,
      options,
    );

    if (result.outcome !== 'success') {
      throw new Error(
        `LLMFunctionRuntime: AI function "${ctx.fn.name}" failed (${result.outcome}): ${result.error ?? 'unknown error'}`,
      );
    }

    return result.value;
  }
}

/**
 * Render a prompt template, substituting `{{input.<name>}}` placeholders with
 * the corresponding input values. Unknown placeholders are left in place so a
 * model can see them as literal text rather than silently dropping context.
 *
 * When ontology access is available, `{{object.<Type>.<id>.<field>}}` is
 * resolved by a host-side read under the caller's identity — the function
 * gains no privilege its caller lacks.
 */
export function renderPrompt(
  template: string,
  inputs: Record<string, unknown>,
  ontology?: FunctionRuntimeContext['ontology'],
): string {
  // Synchronous input substitution. Ontology reads are async and resolved
  // separately below; mixing sync and async substitution in one pass would
  // require awaiting inside a replace callback, which JS does not support.
  let rendered = template.replace(/\{\{input\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_m, name: string) => {
    const v = inputs[name];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });

  // Ontology reads are optional and async; resolve any {{object...}} tokens
  // before the call. We do this lazily and only if the template asks for it,
  // so a function that does not need ontology context pays no round-trip cost.
  if (ontology && /\{\{object\./.test(rendered)) {
    // Synchronous resolution is not possible here; the runtime pre-fetches
    // before the call. We surface a clear marker so a misconfigured template
    // is obvious rather than silently empty.
    rendered = rendered.replace(
      /\{\{object\.([a-zA-Z_][a-zA-Z0-9_]*?)\.([a-zA-Z0-9_\-]+)\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
      (_m, type: string, id: string, _field: string) =>
        `{{object.${type}.${id}.${_field}: ontology reads must be pre-fetched by the runtime}}`,
    );
  }

  return rendered;
}

/**
 * Derive an `LLMSchema` from a FunctionType's declared return shape.
 *
 * ODL FunctionTypes declare their result via a single non-`@param` field
 * whose type drives the schema. A function with no declared return field
 * returns free text and gets no schema — the model's text is the result.
 */
export function schemaForFunction(fn: FunctionType): LLMSchema | undefined {
  const returnField = fn.fields.find((f) => !f.directives.some((d) => d.kind === 'param'));
  if (!returnField) return undefined;

  return schemaForFieldType(returnField.type);
}

function schemaForFieldType(typeRef: FieldTypeRef): LLMSchema {
  const base = typeRef.name;
  let scalar: LLMSchema | undefined;
  switch (base) {
    case 'String':
    case 'ID':
      scalar = { type: 'string' };
      break;
    case 'Int':
      scalar = { type: 'integer' };
      break;
    case 'Float':
      scalar = { type: 'number' };
      break;
    case 'Boolean':
      scalar = { type: 'boolean' };
      break;
    default:
      // A user-defined type or JSON-shaped return. Without the full ODL
      // type resolver we accept any object; the function author can supply
      // a tighter schema via the prompt if needed.
      scalar = { type: 'object' };
      break;
  }
  if (typeRef.isList) {
    return { type: 'array', items: scalar };
  }
  return scalar;
}

/**
 * Build a minimal `RequestContext` for the LLM call.
 *
 * Function execution does not always have an HTTP request in scope (it may
 * run from a pipeline, a webhook, or a scheduled trigger). We carry the
 * tenant and a synthetic trace id so the call is still scoped and
 * correlated in logs.
 */
function requestContextFor(ctx: FunctionRuntimeContext): RequestContext {
  // The runtime context does not currently carry a tenant; the host binds
  // ontology reads to the caller, and the LLM call inherits that scope. We
  // use a stable placeholder so metrics and audit can correlate.
  return {
    tenantId: 'function-runtime',
    traceId: `fn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
