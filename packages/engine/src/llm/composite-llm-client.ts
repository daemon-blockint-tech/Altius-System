/**
 * Composite LLM client — routes completion and embedding to different providers.
 *
 * A deployment often wants completions from one provider (e.g. Daemon Protocol)
 * and embeddings from another (e.g. OpenRouter), because not every completion
 * provider publishes an embeddings endpoint. The `LLMClient` SPI puts both on
 * the same interface, so without this composite a deployment would have to
 * pick a single provider that does both — or accept that `embed()` throws.
 *
 * This client wraps a "completion" client and an "embedding" client:
 *   - `complete()`, `stream()`, `vectorSearch()` → completion client
 *   - `embed()` → embedding client
 *
 * `isConfigured()` returns true if either side is configured — a deployment
 * that uses only completions (no vector search) still works with a no-op
 * embedding client.
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

export interface CompositeLLMClientConfig {
  /** Handles complete(), stream(), vectorSearch(). */
  completion: LLMClient;
  /** Handles embed(). */
  embedding: LLMClient;
}

export class CompositeLLMClient implements LLMClient {
  private readonly completion: LLMClient;
  private readonly embedding: LLMClient;

  constructor(config: CompositeLLMClientConfig) {
    this.completion = config.completion;
    this.embedding = config.embedding;
  }

  isConfigured(): boolean {
    return this.completion.isConfigured() || this.embedding.isConfigured();
  }

  async complete(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): Promise<LLMResponse> {
    return this.completion.complete(ctx, prompt, options);
  }

  async *stream(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): AsyncIterable<string> {
    yield* this.completion.stream(ctx, prompt, options);
  }

  async embed(
    ctx: RequestContext,
    text: string,
    options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult> {
    return this.embedding.embed(ctx, text, options);
  }

  async vectorSearch(
    ctx: RequestContext,
    type: string,
    field: string,
    query: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult> {
    return this.completion.vectorSearch(ctx, type, field, query, options);
  }
}
