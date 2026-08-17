/**
 * LLM client SPI (Section AIP).
 *
 * Defines the contract for LLM completions, embeddings, and streaming.
 * Deployments plug in a concrete implementation (OpenAI, Anthropic, local
 * model, etc.) via ApiDependencies.llmClient. The default NoOpLLMClient
 * returns empty responses so the platform boots without a provider.
 *
 * All operations are tenant-scoped through RequestContext and audited via
 * AuditWriter with operation.type = 'llm.call' (convention per T5.3).
 */

// RequestContext lives in ontology.ts alongside the other core SPI types —
// there is no request-context module. As committed this did not compile, so
// @altius/spi (and therefore every package downstream of it) failed to build.
import type { RequestContext } from './ontology.js';

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/**
 * A minimal JSON-Schema-like shape used to constrain and validate LLM output.
 *
 * Deliberately a subset of draft-07: the pipeline runner only needs to verify
 * that a model's text parses to JSON and conforms to a structural contract,
 * not full schema validation. Keeping it small avoids a json-schema-validator
 * dependency and keeps the validator auditable.
 */
export interface LLMSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  /** For `type: 'object'` — required property names. */
  required?: string[];
  /** For `type: 'object'` — per-property schemas. */
  properties?: Record<string, LLMSchema>;
  /** For `type: 'array'` — element schema. */
  items?: LLMSchema;
  /** For `type: 'string'` — enumerated allowed values. */
  enum?: Array<string | number>;
  /** Human description used in prompt generation, not validation. */
  description?: string;
}

export interface LLMCompleteOptions {
  /** Model identifier (provider-specific, e.g. 'gpt-4', 'claude-3-opus'). */
  model?: string;
  /** Sampling temperature (0.0 = deterministic, 1.0 = creative). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** System prompt prepended to the user prompt. */
  systemPrompt?: string;
  /** Stop sequences that end generation. */
  stop?: string[];
  /**
   * When set, the caller is asking for structured output conforming to this
   * schema. The provider is expected to return JSON; the pipeline runner
   * validates the parsed result against the schema and retries on a parse or
   * conformance failure (subject to `maxRetries`).
   *
   * Providers that ignore this option still work — the runner's validator is
   * the source of truth, not the provider's own enforcement.
   */
  outputSchema?: LLMSchema;
}

export interface LLMResponse {
  /** Generated text. */
  text: string;
  /** Model that produced the response. */
  model: string;
  /** Tokens in the prompt. */
  promptTokens: number;
  /** Tokens in the completion. */
  completionTokens: number;
  /** Total tokens (prompt + completion). */
  totalTokens: number;
  /** Provider-specific finish reason ('stop', 'length', 'content_filter'). */
  finishReason: string;
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export interface LLMEmbedOptions {
  /** Model identifier (provider-specific, e.g. 'text-embedding-3-small'). */
  model?: string;
}

export interface LLMEmbedResult {
  /** Embedding vector (float[]). */
  vector: number[];
  /** Model that produced the embedding. */
  model: string;
  /** Dimensionality of the vector. */
  dimensions: number;
}

// ---------------------------------------------------------------------------
// Vector search
// ---------------------------------------------------------------------------

export interface VectorSearchOptions {
  /** Number of results to return (default 10). */
  limit?: number;
  /** Minimum similarity score (0.0 to 1.0). Results below this are excluded. */
  minScore?: number;
  /** Optional filter to narrow the search space. */
  filter?: Record<string, unknown>;
}

export interface VectorSearchHit {
  /** Object ID. */
  id: string;
  /** Object type. */
  type: string;
  /** Similarity score (0.0 to 1.0). */
  score: number;
}

export interface VectorSearchResult {
  hits: VectorSearchHit[];
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface LLMClient {
  /**
   * Generate a completion for the given prompt.
   *
   * @param ctx    - Tenant-scoped request context
   * @param prompt - User prompt text
   * @param options - Generation options
   */
  complete(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): Promise<LLMResponse>;

  /**
   * Generate an embedding vector for the given text.
   *
   * @param ctx    - Tenant-scoped request context
   * @param text   - Text to embed
   * @param options - Embedding options
   */
  embed(
    ctx: RequestContext,
    text: string,
    options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult>;

  /**
   * Stream a completion token-by-token.
   *
   * @param ctx    - Tenant-scoped request context
   * @param prompt - User prompt text
   * @param options - Generation options
   * @returns AsyncIterable yielding text chunks as they arrive
   */
  stream(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): AsyncIterable<string>;

  /**
   * Search for objects by vector similarity.
   *
   * @param ctx        - Tenant-scoped request context
   * @param type       - Object type to search
   * @param field      - Field containing the embedding vector
   * @param query      - Query embedding vector
   * @param options    - Search options
   */
  vectorSearch(
    ctx: RequestContext,
    type: string,
    field: string,
    query: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult>;

  /** Whether this client is configured and ready (vs a no-op stub). */
  isConfigured(): boolean;
}
