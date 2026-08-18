/**
 * OpenAI-compatible LLM client.
 *
 * Targets any provider that speaks the OpenAI Chat Completions + Embeddings
 * API shape: `/chat/completions`, `/embeddings`, `Authorization: Bearer`,
 * choices/usage/delta JSON. This covers OpenAI itself, OpenRouter, Daemon
 * Protocol, Together, Anyscale, vLLM, Ollama's OpenAI shim, and most other
 * "OpenAI-compatible" gateways.
 *
 * Built on `fetch` for the same reasons as the Anthropic client: no vendor SDK
 * dependency, no transitive graph for the image scan, and the surface is two
 * endpoints plus a documented SSE stream.
 *
 * Unlike the Anthropic client, this one implements `embed()`: the OpenAI
 * embeddings endpoint (`POST /embeddings`) is part of the same shape, and most
 * compatible providers expose it. A provider that does not will return a 404,
 * which surfaces as a non-retryable `LLMProviderError` — the caller sees a
 * clear error rather than a silent zero vector.
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

// Reuse the error class from the Anthropic client — same shape, same callers.
export { LLMProviderError } from './anthropic-llm-client.js';
import { LLMProviderError } from './anthropic-llm-client.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface OpenAICompatibleLLMClientConfig {
  apiKey: string;
  /** Base URL up to but excluding `/chat/completions`. Default: OpenAI. */
  baseUrl?: string;
  /** Model used when the caller does not name one. */
  defaultModel?: string;
  /** Model used for `embed()` when the caller does not name one. */
  defaultEmbeddingModel?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Optional extra headers merged onto every request. Useful for provider
   * metadata headers like OpenRouter's `HTTP-Referer` / `X-Title`.
   */
  extraHeaders?: Record<string, string>;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export class OpenAICompatibleLLMClient implements LLMClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #defaultModel: string;
  readonly #defaultEmbeddingModel: string;
  readonly #timeoutMs: number;
  readonly #extraHeaders: Record<string, string>;

  constructor(config: OpenAICompatibleLLMClientConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAICompatibleLLMClient requires an apiKey');
    }
    this.#apiKey = config.apiKey;
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.#defaultEmbeddingModel = config.defaultEmbeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#extraHeaders = config.extraHeaders ?? {};
  }

  isConfigured(): boolean {
    return true;
  }

  /**
   * Build the request body for `/chat/completions`.
   *
   * The SPI's `systemPrompt` becomes a leading `system` message — the OpenAI
   * shape has a `system` role, unlike Anthropic's top-level `system` field.
   */
  #body(prompt: string, options: LLMCompleteOptions | undefined, stream: boolean): string {
    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: options?.model ?? this.#defaultModel,
      messages,
    };
    if (typeof options?.temperature === 'number') body['temperature'] = options.temperature;
    if (typeof options?.maxTokens === 'number') body['max_tokens'] = options.maxTokens;
    else body['max_tokens'] = DEFAULT_MAX_TOKENS;
    if (options?.stop && options.stop.length > 0) body['stop'] = options.stop;
    if (stream) body['stream'] = true;
    return JSON.stringify(body);
  }

  async #post(
    path: string,
    body: string,
    ctx: RequestContext,
    stream: boolean,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.#baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.#apiKey}`,
          ...(ctx.traceId ? { 'x-request-id': ctx.traceId } : {}),
          ...this.#extraHeaders,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(`LLM request failed: ${reason}`, 503, true);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new LLMProviderError(
        `LLM provider returned ${response.status}: ${await safeErrorText(response)}`,
        response.status,
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
    const response = await this.#post('/chat/completions', this.#body(prompt, options, false), ctx, false);
    const json = (await response.json()) as OpenAIChatResponse;

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';
    const promptTokens = json.usage?.prompt_tokens ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;

    return {
      text,
      model: json.model ?? options?.model ?? this.#defaultModel,
      promptTokens,
      completionTokens,
      totalTokens: json.usage?.total_tokens ?? promptTokens + completionTokens,
      finishReason: mapFinishReason(choice?.finish_reason),
    };
  }

  async *stream(
    ctx: RequestContext,
    prompt: string,
    options?: LLMCompleteOptions,
  ): AsyncIterable<string> {
    const response = await this.#post('/chat/completions', this.#body(prompt, options, true), ctx, true);
    yield* readOpenAIDeltas(response.body!);
  }

  async embed(
    ctx: RequestContext,
    text: string,
    options?: LLMEmbedOptions,
  ): Promise<LLMEmbedResult> {
    const model = options?.model ?? this.#defaultEmbeddingModel;
    const body = JSON.stringify({ model, input: text });
    const response = await this.#post('/embeddings', body, ctx, false);
    const json = (await response.json()) as OpenAIEmbeddingResponse;

    const vector = json.data?.[0]?.embedding;
    if (!vector || !Array.isArray(vector)) {
      throw new LLMProviderError(
        'LLM provider returned no embedding vector in the response',
        502,
        true,
      );
    }

    return {
      vector,
      model: json.model ?? model,
      dimensions: vector.length,
    };
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

/** Map OpenAI finish_reason values onto the SPI's finishReason. */
function mapFinishReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls';
    case 'content_filter':
      return 'content_filter';
    case null:
    case undefined:
      return 'unknown';
    default:
      return reason;
  }
}

/**
 * Yield text deltas from an OpenAI-compatible SSE stream.
 *
 * OpenAI streams `data: { choices: [{ delta: { content: "..." } }] }` records
 * terminated by a blank line, ending with `data: [DONE]`. The buffering
 * concerns are identical to the Anthropic reader — a network chunk is not an
 * SSE event — so the record-accumulation strategy is the same.
 */
export async function* readOpenAIDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const record = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const text = textFromOpenAIRecord(record);
        if (text) yield text;
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Extract the content delta from one OpenAI SSE record, or '' if it carries none. */
function textFromOpenAIRecord(record: string): string {
  let payload = '';
  for (const line of record.split('\n')) {
    if (line.startsWith('data:')) payload += line.slice(5).trimStart();
  }
  if (!payload || payload === '[DONE]') return '';

  try {
    const event = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const delta = event.choices?.[0]?.delta?.content;
    return typeof delta === 'string' ? delta : '';
  } catch {
    return '';
  }
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return '(no response body)';
  }
}
