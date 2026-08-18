/**
 * Tests for the OpenAI-compatible LLM client.
 *
 * Mirrors the Anthropic client tests: `fetch` is stubbed, SSE is driven from
 * hand-built streams, and no network egress is required.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RequestContext } from '@altius/spi';

import {
  OpenAICompatibleLLMClient,
  LLMProviderError,
  readOpenAIDeltas,
} from '../openai-compatible-llm-client.js';

const ctx = { tenantId: 'default', traceId: 'trace-1' } as unknown as RequestContext;

function client(opts?: Partial<ConstructorParameters<typeof OpenAICompatibleLLMClient>[0]>): OpenAICompatibleLLMClient {
  return new OpenAICompatibleLLMClient({ apiKey: 'test-key', ...opts });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function collect(iter: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const piece of iter) out += piece;
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAICompatibleLLMClient — complete', () => {
  it('reports itself configured', () => {
    expect(client().isConfigured()).toBe(true);
  });

  it('extracts the first choice content and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          model: 'oc/deepseek-v4-flash-free',
        }),
      ),
    );

    const result = await client().complete(ctx, 'hi');

    expect(result.text).toBe('Hello world');
    expect(result.promptTokens).toBe(10);
    expect(result.completionTokens).toBe(2);
    expect(result.totalTokens).toBe(12);
    expect(result.finishReason).toBe('stop');
    expect(result.model).toBe('oc/deepseek-v4-flash-free');
  });

  it('derives totalTokens when the provider omits it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: 'x' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      ),
    );

    const result = await client().complete(ctx, 'hi');
    expect(result.totalTokens).toBe(8);
  });

  it('maps finish_reason variants', async () => {
    for (const [provider, expected] of [
      ['stop', 'stop'],
      ['length', 'length'],
      ['tool_calls', 'tool_calls'],
      ['content_filter', 'content_filter'],
      [null, 'unknown'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            choices: [{ message: { content: '' }, finish_reason: provider }],
            usage: {},
          }),
        ),
      );
      const result = await client().complete(ctx, 'hi');
      expect(result.finishReason).toBe(expected);
    }
  });

  it('puts systemPrompt as a leading system message', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi', { systemPrompt: 'be terse', stop: ['END'] });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(calls[0]![1]!.body));
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be terse' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(body.stop).toEqual(['END']);
  });

  it('sends Authorization: Bearer, not x-api-key', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi');

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const headers = new Headers(calls[0]![1]!.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('x-api-key')).toBeNull();
  });

  it('merges extraHeaders into the request', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client({ extraHeaders: { 'X-Title': 'Altius' } }).complete(ctx, 'hi');

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const headers = new Headers(calls[0]![1]!.headers);
    expect(headers.get('X-Title')).toBe('Altius');
  });

  it('never puts the API key in the URL', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi');

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(String(calls[0]![0])).not.toContain('test-key');
  });
});

describe('OpenAICompatibleLLMClient — embed', () => {
  it('calls /embeddings and returns the vector', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
      ),
    );

    const result = await client().embed(ctx, 'hello');

    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result.dimensions).toBe(3);
    expect(result.model).toBe('text-embedding-3-small');
  });

  it('throws when the provider returns no embedding', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })));

    const err = await client().embed(ctx, 'hello').catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
  });
});

describe('OpenAICompatibleLLMClient — error mapping', () => {
  it('marks 429 and 5xx retryable, 4xx not', async () => {
    for (const [status, retryable] of [
      [400, false],
      [401, false],
      [403, false],
      [429, true],
      [500, true],
      [503, true],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status })));
      const err = await client().complete(ctx, 'hi').catch((e) => e);
      expect(err).toBeInstanceOf(LLMProviderError);
      expect((err as LLMProviderError).status).toBe(status);
      expect((err as LLMProviderError).retryable).toBe(retryable);
    }
  });

  it('does not leak the API key in the error text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));
    const err = await client().complete(ctx, 'hi').catch((e) => e);
    expect(String((err as Error).message)).not.toContain('test-key');
  });

  it('treats a transport failure as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('socket hang up'); }));
    const err = await client().complete(ctx, 'hi').catch((e) => e) as LLMProviderError;
    expect(err).toBeInstanceOf(LLMProviderError);
    expect(err.retryable).toBe(true);
  });
});

describe('readOpenAIDeltas — SSE buffering', () => {
  const event = (text: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

  it('reassembles an event split across chunk boundaries', async () => {
    const whole = event('hello');
    const cut = Math.floor(whole.length / 2);
    const out = await collect(readOpenAIDeltas(streamOf([whole.slice(0, cut), whole.slice(cut)])));
    expect(out).toBe('hello');
  });

  it('handles several events in one chunk', async () => {
    const out = await collect(readOpenAIDeltas(streamOf([event('a') + event('b') + event('c')])));
    expect(out).toBe('abc');
  });

  it('stops at the [DONE] sentinel', async () => {
    const out = await collect(readOpenAIDeltas(streamOf([event('kept') + 'data: [DONE]\n\n'])));
    expect(out).toBe('kept');
  });

  it('skips a malformed record', async () => {
    const out = await collect(readOpenAIDeltas(streamOf([event('a') + 'data: {not json\n\n' + event('b')])));
    expect(out).toBe('ab');
  });
});

describe('OpenAICompatibleLLMClient — stream', () => {
  it('sets stream:true and yields the deltas', async () => {
    const body = streamOf([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'streamed' } }] })}\n\n`,
    ]);
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(body, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await collect(client().stream(ctx, 'hi'));

    expect(out).toBe('streamed');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0]![1]!.body)).stream).toBe(true);
  });
});

describe('OpenAICompatibleLLMClient — vectorSearch', () => {
  it('throws 501 — vector search is a storage capability', async () => {
    await expect(client().vectorSearch(ctx, 'Patient', 'vec', [0.1])).rejects.toThrow(/storage/i);
  });
});
