/**
 * Tests for the first real LLMClient.
 *
 * The SSE reader gets the most attention because it is the part that breaks on
 * conditions a live call will not reliably reproduce: a network chunk is not
 * an SSE event, so events arrive split down the middle, several to a chunk, or
 * with a multi-byte character straddling the boundary. Driving it from a
 * hand-built stream is the only way to pin those.
 *
 * `fetch` is stubbed rather than hitting the network: these must run in CI with
 * no API key and no egress.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RequestContext } from '@altius/spi';

import {
  AnthropicLLMClient,
  LLMProviderError,
  readTextDeltas,
} from '../anthropic-llm-client.js';
import { OpenAICompatibleLLMClient } from '../openai-compatible-llm-client.js';
import { FallbackLLMClient } from '../fallback-llm-client.js';
import { CompositeLLMClient } from '../composite-llm-client.js';
import { createLLMClient } from '../create-llm-client.js';
import { NoOpLLMClient } from '../noop-llm-client.js';

const ctx = { tenantId: 'default', traceId: 'trace-1' } as unknown as RequestContext;

function client(): AnthropicLLMClient {
  return new AnthropicLLMClient({ apiKey: 'test-key' });
}

/** A ReadableStream over the given chunks, so boundaries are exact. */
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

describe('AnthropicLLMClient — complete', () => {
  it('reports itself configured, unlike the no-op it replaces', () => {
    expect(client().isConfigured()).toBe(true);
    expect(new NoOpLLMClient().isConfigured()).toBe(false);
  });

  it('concatenates text blocks and derives the token total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
          model: 'claude-sonnet-4-5',
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 5 },
        }),
      ),
    );

    const result = await client().complete(ctx, 'hi');

    expect(result.text).toBe('Hello world');
    expect(result.promptTokens).toBe(12);
    expect(result.completionTokens).toBe(5);
    // The provider reports the halves, not the sum; deriving it keeps the
    // invariant true rather than trusting a field that may be absent.
    expect(result.totalTokens).toBe(17);
    expect(result.finishReason).toBe('stop');
  });

  it('skips non-text blocks instead of stringifying undefined into the answer', async () => {
    // A tool_use block has no `text`. Concatenating it naively puts the literal
    // "undefined" in the middle of the user's completion.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          content: [
            { type: 'text', text: 'before ' },
            { type: 'tool_use', id: 'tu_1', name: 'search' },
            { type: 'text', text: 'after' },
          ],
          model: 'm',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    );

    const result = await client().complete(ctx, 'hi');
    expect(result.text).toBe('before after');
    expect(result.text).not.toContain('undefined');
  });

  it('maps the provider stop_reason vocabulary onto the SPI values', async () => {
    for (const [provider, expected] of [
      ['end_turn', 'stop'],
      ['stop_sequence', 'stop'],
      ['max_tokens', 'length'],
      [null, 'unknown'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            content: [{ type: 'text', text: '' }],
            model: 'm',
            stop_reason: provider,
            usage: {},
          }),
        ),
      );
      const result = await client().complete(ctx, 'hi');
      expect(result.finishReason).toBe(expected);
    }
  });

  it('sends max_tokens, which the API rejects the request without', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ content: [], model: 'm', stop_reason: 'end_turn', usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi');

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('puts systemPrompt in the system field, not in the message list', async () => {
    // The Messages API has no `system` role; sending one is a 400.
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ content: [], model: 'm', stop_reason: 'end_turn', usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi', { systemPrompt: 'be terse', stop: ['END'] });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.system).toBe('be terse');
    expect(body.stop_sequences).toEqual(['END']);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
  });

  it('never puts the API key in the URL', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ content: [], model: 'm', stop_reason: 'end_turn', usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client().complete(ctx, 'hi');

    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('test-key');
  });
});

describe('AnthropicLLMClient — error mapping', () => {
  it('marks 429 and 5xx retryable, and 4xx not', async () => {
    for (const [status, retryable] of [
      [400, false],
      [401, false],
      [403, false],
      [429, true],
      [500, true],
      [503, true],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status })));

      // A caller told to retry a 401 loops forever; one told not to retry a
      // 429 gives up on a call that would have succeeded.
      const err = await client()
        .complete(ctx, 'hi')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(LLMProviderError);
      expect((err as LLMProviderError).status).toBe(status);
      expect((err as LLMProviderError).retryable).toBe(retryable);
    }
  });

  it('does not leak the API key in the error text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));

    const err = await client()
      .complete(ctx, 'hi')
      .catch((e: unknown) => e);

    expect(String((err as Error).message)).not.toContain('test-key');
  });

  it('treats a transport failure as retryable rather than telling the caller to give up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );

    const err = (await client()
      .complete(ctx, 'hi')
      .catch((e: unknown) => e)) as LLMProviderError;

    expect(err).toBeInstanceOf(LLMProviderError);
    expect(err.retryable).toBe(true);
  });

  it('refuses embed and vectorSearch instead of returning a meaningless vector', async () => {
    // A zero vector satisfies the type and silently poisons every similarity
    // comparison downstream — worse than an error naming the constraint.
    await expect(client().embed(ctx, 'text')).rejects.toThrow(/no embeddings endpoint/i);
    await expect(client().vectorSearch(ctx, 'Patient', 'vec', [0.1])).rejects.toThrow(
      /storage/i,
    );
  });
});

describe('readTextDeltas — SSE buffering', () => {
  const event = (text: string) =>
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
    })}\n\n`;

  it('reassembles an event split across chunk boundaries', async () => {
    // A network chunk is not an SSE event. Splitting mid-record is the normal
    // case over a real socket, and the naive line-at-a-time reader drops it.
    const whole = event('hello');
    const cut = Math.floor(whole.length / 2);
    const out = await collect(readTextDeltas(streamOf([whole.slice(0, cut), whole.slice(cut)])));
    expect(out).toBe('hello');
  });

  it('handles several events arriving in one chunk', async () => {
    const out = await collect(readTextDeltas(streamOf([event('a') + event('b') + event('c')])));
    expect(out).toBe('abc');
  });

  it('does not split on a "data:" that appears inside the payload', async () => {
    // Splitting on every occurrence of the prefix rather than on the record
    // separator corrupts any completion that mentions it.
    const out = await collect(readTextDeltas(streamOf([event('see data: here')])));
    expect(out).toBe('see data: here');
  });

  it('survives a multi-byte character split across chunks', async () => {
    const whole = event('café');
    const bytes = new TextEncoder().encode(whole);
    // Cut inside the two-byte é, which decodes to U+FFFD without streaming mode.
    const eIndex = bytes.lastIndexOf(0xc3);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, eIndex + 1));
        controller.enqueue(bytes.slice(eIndex + 1));
        controller.close();
      },
    });

    const out = await collect(readTextDeltas(stream));
    expect(out).toBe('café');
    expect(out).not.toContain('�');
  });

  it('ignores non-text events and the [DONE] sentinel', async () => {
    const noise =
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
      'event: ping\ndata: {"type":"ping"}\n\n' +
      event('kept') +
      'data: [DONE]\n\n';
    expect(await collect(readTextDeltas(streamOf([noise])))).toBe('kept');
  });

  it('skips a malformed record rather than killing the rest of the completion', async () => {
    const out = await collect(
      readTextDeltas(streamOf([event('a') + 'data: {not json\n\n' + event('b')])),
    );
    expect(out).toBe('ab');
  });

  it('accepts data with no space after the colon', async () => {
    const compact = `data:${JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'tight' },
    })}\n\n`;
    expect(await collect(readTextDeltas(streamOf([compact])))).toBe('tight');
  });
});

describe('AnthropicLLMClient — stream', () => {
  it('sets stream:true and yields the deltas', async () => {
    const body = streamOf([
      `data: ${JSON.stringify({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'streamed' },
      })}\n\n`,
    ]);
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(body, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await collect(client().stream(ctx, 'hi'));

    expect(out).toBe('streamed');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).stream).toBe(true);
  });
});

describe('createLLMClient', () => {
  it('returns the no-op when no provider is set, so the platform still boots', () => {
    // A deployment with no LLM must answer 503 on the LLM routes, not refuse
    // to start.
    expect(createLLMClient({})).toBeInstanceOf(NoOpLLMClient);
    expect(createLLMClient({ LLM_PROVIDER: '' })).toBeInstanceOf(NoOpLLMClient);
    expect(createLLMClient({ LLM_PROVIDER: 'none' })).toBeInstanceOf(NoOpLLMClient);
  });

  it('builds the Anthropic client from the environment', () => {
    const built = createLLMClient({ LLM_PROVIDER: 'Anthropic', ANTHROPIC_API_KEY: 'k' });
    expect(built).toBeInstanceOf(AnthropicLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('throws when a provider is named but its credential is missing', () => {
    // Falling back to the no-op here would look healthy and 503 every call,
    // indistinguishable from "not configured yet".
    expect(() => createLLMClient({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('rejects an unknown provider rather than silently doing nothing', () => {
    expect(() => createLLMClient({ LLM_PROVIDER: 'gpt5' })).toThrow(/Unknown LLM_PROVIDER/);
  });

  it('rejects a non-numeric timeout', () => {
    expect(() =>
      createLLMClient({
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'k',
        LLM_TIMEOUT_MS: 'soon',
      }),
    ).toThrow(/positive number/);
  });

  it('builds a daemon client from LLM_DAEMON_* env vars', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'daemon',
      LLM_DAEMON_API_KEY: 'dk',
      LLM_DAEMON_MODEL: 'oc/deepseek-v4-flash-free',
    });
    expect(built).toBeInstanceOf(OpenAICompatibleLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('throws when daemon is named but LLM_DAEMON_API_KEY is missing', () => {
    expect(() => createLLMClient({ LLM_PROVIDER: 'daemon' })).toThrow(/LLM_DAEMON_API_KEY/);
  });

  it('builds an openrouter client from LLM_OPENROUTER_* env vars', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'openrouter',
      LLM_OPENROUTER_API_KEY: 'ork',
      LLM_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash',
    });
    expect(built).toBeInstanceOf(OpenAICompatibleLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('throws when openrouter is named but LLM_OPENROUTER_API_KEY is missing', () => {
    expect(() => createLLMClient({ LLM_PROVIDER: 'openrouter' })).toThrow(/LLM_OPENROUTER_API_KEY/);
  });

  it('wraps primary + fallback in a FallbackLLMClient when LLM_FALLBACK_PROVIDER is set', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'daemon',
      LLM_DAEMON_API_KEY: 'dk',
      LLM_FALLBACK_PROVIDER: 'openrouter',
      LLM_OPENROUTER_API_KEY: 'ork',
    });
    expect(built).toBeInstanceOf(FallbackLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('returns a FallbackLLMClient with a no-op primary when only LLM_FALLBACK_PROVIDER is set', () => {
    const built = createLLMClient({
      LLM_FALLBACK_PROVIDER: 'openrouter',
      LLM_OPENROUTER_API_KEY: 'ork',
    });
    expect(built).toBeInstanceOf(FallbackLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('supports openai as a provider with OPENAI_API_KEY fallback', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'oai',
    });
    expect(built).toBeInstanceOf(OpenAICompatibleLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('wraps completion + embedding in a CompositeLLMClient when LLM_EMBEDDING_PROVIDER is set', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'daemon',
      LLM_DAEMON_API_KEY: 'dk',
      LLM_EMBEDDING_PROVIDER: 'openrouter',
      LLM_OPENROUTER_API_KEY: 'ork',
    });
    expect(built).toBeInstanceOf(CompositeLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('wraps fallback completion + embedding in a CompositeLLMClient', () => {
    const built = createLLMClient({
      LLM_PROVIDER: 'daemon',
      LLM_DAEMON_API_KEY: 'dk',
      LLM_FALLBACK_PROVIDER: 'openrouter',
      LLM_OPENROUTER_API_KEY: 'ork',
      LLM_EMBEDDING_PROVIDER: 'openrouter',
    });
    // The completion chain is a FallbackLLMClient, wrapped in a Composite.
    expect(built).toBeInstanceOf(CompositeLLMClient);
    expect(built.isConfigured()).toBe(true);
  });

  it('throws when LLM_EMBEDDING_PROVIDER is set but its key is missing', () => {
    expect(() =>
      createLLMClient({
        LLM_PROVIDER: 'daemon',
        LLM_DAEMON_API_KEY: 'dk',
        LLM_EMBEDDING_PROVIDER: 'openrouter',
      }),
    ).toThrow(/LLM_OPENROUTER_API_KEY/);
  });
});
