/**
 * Anthropic-backed LLMClient.
 *
 * The LLM surface (REST /api/v1/llm/*, the GraphQL fields, and the MCP tools)
 * has been wired end-to-end for a while with `NoOpLLMClient` as the only
 * implementation, so every call answered 503. This is the first real provider
 * behind that surface.
 *
 * Deliberately built on `fetch` rather than a vendor SDK. The Messages API
 * surface used here is two endpoints and a documented SSE stream; an SDK would
 * add a dependency, a version to track, and its own transitive graph to the
 * image scan, for no capability this needs.
 *
 * Two of the four SPI methods are NOT implemented here, and throw rather than
 * approximate:
 *
 *   embed()        Anthropic publishes no embeddings endpoint. Returning a
 *                  zero vector or a hash would satisfy the type and silently
 *                  poison every similarity comparison downstream, which is
 *                  worse than an error naming the real constraint.
 *   vectorSearch() Needs an index in the storage provider; neither the
 *                  Postgres nor the memory provider has one (no pgvector
 *                  column, no `vectorSearch` in either). It is a storage
 *                  capability that happens to sit on this interface, and no
 *                  client can supply it.
 *
 * The API key is read once at construction and never logged, never returned in
 * an error, and never placed in a URL.
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

/** Anthropic requires this header; pinned so a server-side default cannot shift behaviour. */
const ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * `max_tokens` is REQUIRED by the Messages API — omitting it is a 400, not a
 * server-side default. A caller that does not care still needs a number, so
 * this is the value they get.
 */
const DEFAULT_MAX_TOKENS = 4096;

/** Wall-clock ceiling for a single request, so a hung provider cannot pin a worker. */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface AnthropicLLMClientConfig {
  apiKey: string;
  /** Override for a proxy or gateway. Defaults to the public API. */
  baseUrl?: string;
  /** Model used when the caller does not name one. */
  defaultModel?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * An error carrying the provider's HTTP status and whether a retry could help.
 *
 * The REST layer maps `retryable` onto its own category, and the distinction
 * that matters to a caller is 429/5xx (wait and retry) versus 400/401/403
 * (fix the request or the credentials — retrying loops forever).
 */
export class LLMProviderError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'LLMProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
}

export class AnthropicLLMClient implements LLMClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #defaultModel: string;
  readonly #timeoutMs: number;

  constructor(config: AnthropicLLMClientConfig) {
    if (!config.apiKey) {
      throw new Error('AnthropicLLMClient requires an apiKey');
    }
    this.#apiKey = config.apiKey;
    // Trailing slashes would produce `//v1/messages`, which some proxies 404.
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return true;
  }

  /**
   * Build the request body shared by `complete` and `stream`.
   *
   * `systemPrompt` becomes the top-level `system` field rather than a message:
   * the Messages API has no `system` role, and passing one is a 400.
   */
  #body(prompt: string, options: LLMCompleteOptions | undefined, stream: boolean): string {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.#defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    };
    if (options?.systemPrompt) body['system'] = options.systemPrompt;
    if (typeof options?.temperature === 'number') body['temperature'] = options.temperature;
    if (options?.stop && options.stop.length > 0) body['stop_sequences'] = options.stop;
    if (stream) body['stream'] = true;
    return JSON.stringify(body);
  }

  async #post(body: string, ctx: RequestContext, stream: boolean): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.#baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.#apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Lets a provider-side trace be lined up with ours when a call is
          // slow or rejected; carries no tenant or user data.
          ...(ctx.traceId ? { 'x-request-id': ctx.traceId } : {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // An abort is a timeout, and a timeout is worth retrying; a DNS or TLS
      // failure is not distinguishable here, so treat the whole class as
      // retryable rather than telling a caller not to try again when they
      // might succeed.
      const reason = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(`LLM request failed: ${reason}`, 503, true);
    } finally {
      // Clear on every path. Left pending, the abort would fire mid-stream on
      // a response that had already arrived.
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new LLMProviderError(
        `LLM provider returned ${response.status}: ${await safeErrorText(response)}`,
        response.status,
        // 429 and 5xx are transient; 4xx below that is the caller's request or
        // credentials and will fail identically every time.
        response.status === 429 || response.status >= 500,
      );
    }
    if (stream && !response.body) {
      throw new LLMProviderError('LLM provider returned no response body to stream', 502, true);
    }
    return response;
  }

  async complete(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): Promise<LLMResponse> {
    const response = await this.#post(this.#body(prompt, options, false), ctx, false);
    const json = (await response.json()) as AnthropicMessageResponse;

    // Content is a list of blocks. Only text blocks carry text — a tool_use
    // block has no `text`, and concatenating `undefined` would produce the
    // string "undefined" in the middle of a response.
    const text = (json.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    const promptTokens = json.usage?.input_tokens ?? 0;
    const completionTokens = json.usage?.output_tokens ?? 0;

    return {
      text,
      model: json.model ?? options?.model ?? this.#defaultModel,
      promptTokens,
      completionTokens,
      // The provider reports the two halves, not the sum. Deriving it keeps
      // the invariant total === prompt + completion true by construction.
      totalTokens: promptTokens + completionTokens,
      // `end_turn` is the provider's word for what the SPI calls 'stop'.
      finishReason: mapStopReason(json.stop_reason),
    };
  }

  async *stream(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): AsyncIterable<string> {
    const response = await this.#post(this.#body(prompt, options, true), ctx, true);
    yield* readTextDeltas(response.body!);
  }

  async embed(
    _ctx: RequestContext,
    _text: string,
    _options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult> {
    throw new LLMProviderError(
      'Anthropic publishes no embeddings endpoint. Configure a provider that ' +
        'offers embeddings for LLM_EMBEDDING_PROVIDER, or call an embedding ' +
        'service directly — this client cannot produce a meaningful vector.',
      501,
      false,
    );
  }

  async vectorSearch(
    _ctx: RequestContext,
    _type: string,
    _field: string,
    _query: number[],
    _options?: VectorSearchOptions,
  ): Promise<VectorSearchResult> {
    throw new LLMProviderError(
      'Vector search requires a vector index in the storage provider; neither ' +
        'the Postgres nor the memory provider has one. It is a storage ' +
        'capability, and no LLM client can supply it.',
      501,
      false,
    );
  }
}

/**
 * The provider's error body, if it is readable.
 *
 * Never throws: this runs while already handling a failure, and a parse error
 * here would replace the real status with a confusing one. Truncated because
 * an HTML error page from a proxy can be arbitrarily long and ends up in logs.
 */
async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return '(no response body)';
  }
}

/** Map the provider's stop_reason vocabulary onto the SPI's finishReason. */
function mapStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case null:
    case undefined:
      return 'unknown';
    default:
      return reason;
  }
}

/**
 * Yield the text deltas from a Messages API SSE stream.
 *
 * Exported for its own tests: the buffering is the part that breaks, and it
 * breaks only on chunk boundaries a live call will not reliably reproduce.
 *
 * Two properties the naive version gets wrong:
 *
 *  - A network chunk is not an SSE event. One chunk may hold several events,
 *    or half of one, so lines are accumulated and only complete records
 *    (terminated by a blank line) are parsed.
 *  - A `data:` payload may itself contain newlines, and the JSON text may
 *    contain the literal string "data:", so the split is on the record
 *    separator, not on every occurrence of the prefix.
 */
export async function* readTextDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  // `stream: true` matters: a multi-byte character split across two chunks
  // decodes to a replacement character without it.
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE records are separated by a blank line. Keep the trailing fragment.
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const record = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const text = textFromRecord(record);
        if (text) yield text;
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // Releasing matters on early exit: a consumer that breaks out of the loop
    // would otherwise leave the socket held until GC.
    reader.releaseLock();
  }
}

/** Extract the text delta from one SSE record, or '' if it carries none. */
function textFromRecord(record: string): string {
  let payload = '';
  for (const line of record.split('\n')) {
    // Both `data: {...}` and `data:{...}` are valid SSE.
    if (line.startsWith('data:')) payload += line.slice(5).trimStart();
  }
  if (!payload || payload === '[DONE]') return '';

  try {
    const event = JSON.parse(payload) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return event.delta.text ?? '';
    }
  } catch {
    // A malformed record is skipped rather than killing the stream: the rest
    // of the completion is still worth delivering.
  }
  return '';
}
