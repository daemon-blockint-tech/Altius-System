/**
 * Fallback LLM client — tries a primary provider, falls back on error.
 *
 * Wraps two `LLMClient` instances. The primary handles every call; the
 * fallback is invoked only when the primary fails with a transient error
 * (network, 429, 5xx). Non-transient errors (400 bad request, 401/403 auth)
 * surface immediately — the same request to the fallback would fail the same
 * way, and retrying it silently masks a configuration problem.
 *
 * Streaming has a constraint: once the primary has started yielding tokens,
 * a mid-stream failure cannot fall back (the consumer has already received
 * partial output). Fallback applies only to the initial connection — if the
 * primary fails before the first delta, the fallback takes over. After the
 * first delta, errors propagate to the consumer.
 */

import type {
  RequestContext,
  LLMClient,
  LLMCompleteOptions,
  LLMResponse,
  LLMEmbedOptions,
  LLMEmbedResult,
  VectorSearchOptions,
  VectorSearchResult,
} from '@altius/spi';
import { LLMProviderError } from './anthropic-llm-client.js';

export interface FallbackLLMClientConfig {
  /** Primary client — tried first on every call. */
  primary: LLMClient;
  /** Fallback client — invoked when the primary fails transiently. */
  fallback: LLMClient;
  /**
   * Optional logger for primary failures that were recovered by the fallback.
   * Without this, a silent fallback hides a degraded primary from operators.
   */
  onPrimaryFailure?: (error: unknown, method: string) => void;
}

export class FallbackLLMClient implements LLMClient {
  private readonly primary: LLMClient;
  private readonly fallback: LLMClient;
  private readonly onPrimaryFailure?: (error: unknown, method: string) => void;

  constructor(config: FallbackLLMClientConfig) {
    this.primary = config.primary;
    this.fallback = config.fallback;
    this.onPrimaryFailure = config.onPrimaryFailure;
  }

  isConfigured(): boolean {
    // Configured if either client is — the fallback may still serve when the
    // primary is a no-op (e.g. LLM_PROVIDER unset but LLM_FALLBACK_PROVIDER set).
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async complete(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): Promise<LLMResponse> {
    return this.withFallback('complete', (client) => client.complete(ctx, prompt, options));
  }

  async embed(
    ctx: RequestContext,
    text: string,
    options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult> {
    return this.withFallback('embed', (client) => client.embed(ctx, text, options));
  }

  async *stream(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): AsyncIterable<string> {
    // Try the primary first. If it throws before yielding any data, fall back.
    // Once data has been yielded, a failure propagates — the consumer has
    // already received partial output and a switch would corrupt the stream.
    let primaryFailed = false;
    let primaryError: unknown;
    let hasYielded = false;

    try {
      for await (const chunk of this.primary.stream(ctx, prompt, options)) {
        hasYielded = true;
        yield chunk;
      }
      return;
    } catch (err) {
      primaryError = err;
      primaryFailed = true;
      if (hasYielded) {
        // Too late to fall back — the consumer has partial output.
        throw err;
      }
    }

    if (primaryFailed && !hasYielded) {
      if (!isTransient(primaryError)) throw primaryError;
      this.onPrimaryFailure?.(primaryError, 'stream');
      yield* this.fallback.stream(ctx, prompt, options);
    }
  }

  async vectorSearch(
    ctx: RequestContext,
    type: string,
    field: string,
    query: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult> {
    return this.withFallback('vectorSearch', (client) =>
      client.vectorSearch(ctx, type, field, query, options),
    );
  }

  /**
   * Run an operation on the primary; on a transient failure, run it on the
   * fallback. Non-transient errors surface immediately.
   */
  private async withFallback<T>(
    method: string,
    op: (client: LLMClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await op(this.primary);
    } catch (err) {
      if (!isTransient(err)) throw err;
      this.onPrimaryFailure?.(err, method);
      return op(this.fallback);
    }
  }
}

/**
 * Decide whether an error from the primary justifies a fallback attempt.
 *
 * Transient: network errors, 429 (rate limit), 5xx (server error). These are
 * likely provider-side and the fallback may succeed.
 *
 * Non-transient: 400 (bad request), 401/403 (auth). The same request to the
 * fallback would fail the same way, and falling back silently masks a
 * configuration problem the operator needs to see.
 */
function isTransient(err: unknown): boolean {
  if (err instanceof LLMProviderError) {
    return err.retryable;
  }
  // A plain Error from a no-op client ("not configured") is not transient —
  // the fallback is the real client and should be tried directly. Treat
  // "not configured" as transient so a no-op primary + real fallback works.
  if (err instanceof Error && /not configured/i.test(err.message)) {
    return true;
  }
  // Unknown errors (network, timeout) default to transient — better to try
  // the fallback than to surface an error the fallback could have handled.
  return true;
}
