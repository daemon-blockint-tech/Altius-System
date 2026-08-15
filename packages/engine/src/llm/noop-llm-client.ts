/**
 * No-op LLM client stub.
 *
 * Default implementation used when no LLM provider is configured. Returns
 * empty responses so the platform boots and the generate/embed endpoints
 * return a clear "not configured" error rather than crashing.
 *
 * Deployments replace this with a real provider client (OpenAI, Anthropic,
 * local model) by injecting a different LLMClient into ApiDependencies.
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

export class NoOpLLMClient implements LLMClient {
  isConfigured(): boolean {
    return false;
  }

  async complete(
    _ctx: RequestContext,
    _prompt: string,
    _options?: LLMCompleteOptions,
  ): Promise<LLMResponse> {
    throw new Error('LLM client not configured — set LLM_PROVIDER and associated credentials to enable completions');
  }

  async embed(
    _ctx: RequestContext,
    _text: string,
    _options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult> {
    throw new Error('LLM client not configured — set LLM_PROVIDER and associated credentials to enable embeddings');
  }

  async *stream(
    _ctx: RequestContext,
    _prompt: string,
    _options?: LLMCompleteOptions,
  ): AsyncIterable<string> {
    throw new Error('LLM client not configured — set LLM_PROVIDER and associated credentials to enable streaming');
  }

  async vectorSearch(
    _ctx: RequestContext,
    _type: string,
    _field: string,
    _query: number[],
    _options?: VectorSearchOptions,
  ): Promise<VectorSearchResult> {
    throw new Error('LLM client not configured — vector search requires an embedding provider');
  }
}
