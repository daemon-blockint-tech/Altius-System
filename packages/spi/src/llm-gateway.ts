/**
 * Governed LLM gateway — OpenAI-compatible chat completions proxy.
 *
 * Provides a standardized chat completions interface that:
 *   - Exposes a model catalog with RIDs and metadata
 *   - Tracks usage (tokens) per tenant/user/model for attribution
 *   - Enforces rate limits per tenant/user
 *   - Supports ZDR (zero data retention) and geo governance flags
 *   - Delegates to the existing LLMClient for actual model calls
 *
 * The gateway wraps LLMClient.complete() with governance layers,
 * making it safe to expose LLM capabilities to end-user applications.
 */

import type { RequestContext } from './ontology.js';

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

/** A model entry in the gateway's catalog. */
export interface ModelCatalogEntry {
  /** Model RID (resource identifier, e.g. 'ri.ai-models..models.gpt-4'). */
  rid: string;
  /** Display name. */
  displayName: string;
  /** Provider ('openai', 'anthropic', 'local', etc.). */
  provider: string;
  /** Model identifier passed to LLMClient. */
  modelId: string;
  /** Context window size in tokens. */
  contextWindow: number;
  /** Max output tokens. */
  maxOutputTokens: number;
  /** Whether the model supports streaming. */
  supportsStreaming: boolean;
  /** Whether the model supports tool/function calling. */
  supportsTools: boolean;
  /** Whether the model has zero-data-retention (no training on inputs). */
  zdr: boolean;
  /** Geographic restriction (e.g. 'EU', 'US', 'any'). */
  geo: 'EU' | 'US' | 'any';
  /** Whether the model is enabled. */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Chat completions (OpenAI-compatible shape)
// ---------------------------------------------------------------------------

/** A chat message in OpenAI format. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool call ID (for role 'tool'). */
  toolCallId?: string;
}

/** Tool call requested by the model. */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Options for a chat completion request. */
export interface ChatCompletionOptions {
  /** Model RID from the catalog. */
  model: string;
  /** Conversation messages. */
  messages: ChatMessage[];
  /** Sampling temperature (0.0-2.0). */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
  /** Whether to stream the response. */
  stream?: boolean;
  /** Optional tools the model may call. */
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  /** Data retention preference. ZDR models require 'ephemeral'. */
  retention?: 'ephemeral' | 'retain';
  /** Requested data residency (EU, US, any). Used for geo routing. */
  dataRegion?: 'EU' | 'US' | 'any';
  /**
   * Sensitive values the caller placed into the prompt, tagged with their
   * source object type and field. The gateway's PII obfuscator checks each
   * declaration against the caller's field permissions: a value sourced from
   * a field the caller cannot read is masked in every message before the
   * payload reaches the LLM provider. Fail-closed: a declaration with no
   * matching field-permission config is treated as not-visible and masked.
   *
   * Callers that build prompts from ontology reads (functions, agents) MUST
   * declare every @sensitive-sourced value they inject. A caller that omits
   * a sensitive value from this list bypasses the obfuscator — the read path
   * already redacts @sensitive fields per the caller's role, so a value the
   * caller can see is one they are permitted to send; a value they cannot see
   * should never have reached the prompt in the first place. This field is
   * the second layer for the case where a function or SDK caller with elevated
   * read access builds a prompt for a downstream model call.
   */
  sensitiveValues?: SensitiveValueDeclaration[];
}

/**
 * A value the caller declares as sensitive, with its source field.
 *
 * The obfuscator uses `(objectType, field)` to look up the caller's field
 * visibility via `FieldVisibilityProvider.getVisibleFields`. If the field is
 * not visible to the caller, every occurrence of `value` in the prompt
 * messages is replaced with `[REDACTED:<field>]`.
 */
export interface SensitiveValueDeclaration {
  /** Object type the value was read from (e.g. `patient`). */
  objectType: string;
  /** Field name the value was read from (e.g. `name`, `nik`). */
  field: string;
  /** The literal value as it appears in the prompt text. */
  value: string;
}

/**
 * Structural interface satisfied by `AuthorizationService` — the obfuscator
 * depends on this minimal contract, not the full service, so the engine layer
 * stays decoupled from `@altius/security`.
 */
export interface FieldVisibilityProvider {
  /**
   * @returns Set of visible field names, or `undefined` when no field-permission
   *          config exists for the object type (the obfuscator treats this as
   *          fail-closed: not visible).
   */
  getVisibleFields(userId: string, roles: string[], objectType: string): Set<string> | undefined;
}

/** A single PII redaction decision recorded by the obfuscator. */
export interface PiiRedactionEvent {
  tenantId: string;
  actorId: string;
  /** Model RID the request was targeting. */
  model: string;
  objectType: string;
  field: string;
  /** `redacted` if the value was masked, `allowed` if the caller may see it. */
  decision: 'redacted' | 'allowed';
  /** Number of message-content occurrences that were masked. */
  occurrences: number;
  timestamp: string;
}

/**
 * PII obfuscator — masks @sensitive-sourced values in prompt messages before
 * they reach an LLM provider. Reuses the same `getVisibleFields` policy the
 * read path enforces, so a value the caller cannot read on the read path is
 * also masked on the LLM egress path.
 */
export interface PiiObfuscator {
  /**
   * Mask non-visible sensitive values in-place across all messages.
   * @returns the obfuscated messages and the list of redaction decisions.
   */
  obfuscate(
    ctx: RequestContext,
    messages: ChatMessage[],
    sensitiveValues: SensitiveValueDeclaration[] | undefined,
    model: string,
  ): Promise<{ messages: ChatMessage[]; redactions: PiiRedactionEvent[] }>;
}

/** A single chunk of a streaming chat completion. */
export interface ChatCompletionStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string; toolCalls?: ChatToolCall[] };
    finishReason: string | null;
  }>;
}

/** A chat completion response (OpenAI-compatible). */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

/** Options for an embedding request. */
export interface EmbeddingOptions {
  /** Model RID from the catalog. */
  model: string;
  /** Input text(s) to embed. */
  input: string | string[];
}

/** A single embedding vector. */
export interface EmbeddingVector {
  /** The index of the input this vector corresponds to. */
  index: number;
  /** Embedding values. */
  embedding: number[];
}

/** Embedding response (OpenAI-compatible shape). */
export interface EmbeddingResult {
  object: 'list';
  model: string;
  data: EmbeddingVector[];
  usage: { promptTokens: number; totalTokens: number };
}

/** A usage record for metering and attribution. */
export interface LLMUsageRecord {
  /** Tenant ID. */
  tenantId: string;
  /** User ID. */
  userId: string;
  /** Model used. */
  model: string;
  /** Operation type. */
  operation: 'completion' | 'embedding' | 'stream';
  /** Prompt tokens. */
  promptTokens: number;
  /** Completion tokens. */
  completionTokens: number;
  /** Total tokens. */
  totalTokens: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Usage query. */
export interface UsageQuery {
  tenantId?: string;
  userId?: string;
  model?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

/** Usage summary. */
export interface UsageSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  byModel: Array<{ model: string; requests: number; tokens: number }>;
  byUser: Array<{ userId: string; requests: number; tokens: number }>;
}

/**
 * Usage tracker — records LLM usage for metering and attribution.
 */
export interface LLMUsageTracker {
  /** Record a usage event. */
  record(record: LLMUsageRecord): Promise<void>;

  /** Query usage records. */
  query(query: UsageQuery): Promise<{ records: LLMUsageRecord[]; totalCount: number }>;

  /** Get a usage summary. */
  summarize(tenantId: string, startTime?: string, endTime?: string): Promise<UsageSummary>;

  /** Get total token count for a tenant. */
  getTotalTokens(tenantId: string, startTime?: string, endTime?: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Rate limit configuration per tenant. */
export interface RateLimitConfig {
  /** Max requests per minute. */
  requestsPerMinute: number;
  /** Max tokens per minute. */
  tokensPerMinute: number;
  /** Max requests per day. */
  requestsPerDay: number;
  /** Max tokens per day. */
  tokensPerDay: number;
}

/** Rate limit check result. */
export interface RateLimitResult {
  allowed: boolean;
  /** Reason for rejection if not allowed. */
  reason?: string;
  /** Current requests in the current minute. */
  currentRequestsPerMinute: number;
  /** Current tokens in the current minute. */
  currentTokensPerMinute: number;
}

/**
 * Rate limiter — enforces per-tenant request and token limits.
 */
export interface LLMRateLimiter {
  /** Check if a request is allowed. */
  check(tenantId: string, estimatedTokens: number): Promise<RateLimitResult>;

  /** Record actual token usage after a request completes. */
  recordUsage(tenantId: string, tokens: number): Promise<void>;

  /** Get the rate limit config for a tenant. */
  getConfig(tenantId: string): Promise<RateLimitConfig>;

  /** Set the rate limit config for a tenant. */
  setConfig(tenantId: string, config: RateLimitConfig): Promise<void>;
}

// ---------------------------------------------------------------------------
// LLM Gateway
// ---------------------------------------------------------------------------

/** A streamed chat completion chunk (OpenAI-compatible SSE format). */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finishReason: string | null;
  }>;
}

/**
 * Governed LLM gateway — wraps LLMClient with model catalog, usage tracking,
 * rate limiting, and governance flags.
 */
export interface LLMGateway {
  /** List available models in the catalog. */
  listModels(ctx: RequestContext): Promise<ModelCatalogEntry[]>;

  /** Get a specific model from the catalog. */
  getModel(ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null>;

  /** Create a chat completion (OpenAI-compatible). */
  chatCompletion(ctx: RequestContext, options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

  /**
   * Stream a chat completion token-by-token (OpenAI-compatible SSE).
   *
   * Yields ChatCompletionChunk objects. The first chunk contains the role
   * delta; subsequent chunks contain content deltas; the final chunk has
   * finishReason set and an empty delta.
   *
   * Rate limiting is checked before the first token. Usage is recorded
   * after the stream completes (estimated tokens if the provider doesn't
   * report them).
   */
  streamChatCompletion(ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionChunk>;

  /** Create a streaming chat completion (SSE). */
  chatCompletionStream(ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionStreamChunk>;

  /** Create an embedding (OpenAI-compatible). */
  createEmbedding(ctx: RequestContext, options: EmbeddingOptions): Promise<EmbeddingResult>;

  /** Get the usage tracker. */
  usageTracker: LLMUsageTracker;

  /** Get the rate limiter. */
  rateLimiter: LLMRateLimiter;
}

// ---------------------------------------------------------------------------
// Default rate limits
// ---------------------------------------------------------------------------

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 60,
  tokensPerMinute: 100_000,
  requestsPerDay: 10_000,
  tokensPerDay: 10_000_000,
};
