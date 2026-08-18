/**
 * Tests for the FallbackLLMClient.
 *
 * Uses mock clients that succeed or throw on demand, so no network egress is
 * required.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  RequestContext,
  LLMClient,
  LLMResponse,
  LLMEmbedResult,
  VectorSearchResult,
} from '@altius/spi';

import { FallbackLLMClient } from '../fallback-llm-client.js';
import { LLMProviderError } from '../anthropic-llm-client.js';

const ctx = { tenantId: 'default', traceId: 'trace-1' } as unknown as RequestContext;

/** A mock client that either succeeds or throws a configured error. */
class MockClient implements LLMClient {
  readonly label: string;
  private readonly configured: boolean;
  private readonly completeError: unknown;
  private readonly embedError: unknown;
  private readonly streamError: unknown;
  private readonly streamChunks: string[];

  constructor(opts: {
    label: string;
    configured?: boolean;
    completeError?: unknown;
    embedError?: unknown;
    streamError?: unknown;
    streamChunks?: string[];
  }) {
    this.label = opts.label;
    this.configured = opts.configured ?? true;
    this.completeError = opts.completeError;
    this.embedError = opts.embedError;
    this.streamError = opts.streamError;
    this.streamChunks = opts.streamChunks ?? [];
  }

  isConfigured(): boolean { return this.configured; }

  async complete(): Promise<LLMResponse> {
    if (this.completeError) throw this.completeError;
    return {
      text: `from-${this.label}`,
      model: 'mock',
      promptTokens: 5,
      completionTokens: 5,
      totalTokens: 10,
      finishReason: 'stop',
    };
  }

  async embed(): Promise<LLMEmbedResult> {
    if (this.embedError) throw this.embedError;
    return { vector: [1, 2, 3], model: 'mock-embed', dimensions: 3 };
  }

  async *stream(): AsyncIterable<string> {
    if (this.streamError) throw this.streamError;
    for (const chunk of this.streamChunks) yield chunk;
  }

  async vectorSearch(): Promise<VectorSearchResult> {
    return { hits: [], totalCount: 0 };
  }
}

describe('FallbackLLMClient — complete', () => {
  it('uses the primary when it succeeds', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary' }),
      fallback: new MockClient({ label: 'fallback' }),
    });

    const result = await fb.complete(ctx, 'hi');
    expect(result.text).toBe('from-primary');
  });

  it('falls back when the primary throws a transient error', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', completeError: new LLMProviderError('rate limited', 429, true) }),
      fallback: new MockClient({ label: 'fallback' }),
    });

    const result = await fb.complete(ctx, 'hi');
    expect(result.text).toBe('from-fallback');
  });

  it('surfaces a non-retryable error without falling back', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', completeError: new LLMProviderError('bad request', 400, false) }),
      fallback: new MockClient({ label: 'fallback' }),
    });

    const err = await fb.complete(ctx, 'hi').catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect((err as LLMProviderError).status).toBe(400);
  });

  it('calls onPrimaryFailure when the fallback is used', async () => {
    const onFail = vi.fn();
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', completeError: new LLMProviderError('down', 503, true) }),
      fallback: new MockClient({ label: 'fallback' }),
      onPrimaryFailure: onFail,
    });

    await fb.complete(ctx, 'hi');
    expect(onFail).toHaveBeenCalledOnce();
    expect(onFail.mock.calls[0]![1]).toBe('complete');
  });

  it('does not call onPrimaryFailure when the primary succeeds', async () => {
    const onFail = vi.fn();
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary' }),
      fallback: new MockClient({ label: 'fallback' }),
      onPrimaryFailure: onFail,
    });

    await fb.complete(ctx, 'hi');
    expect(onFail).not.toHaveBeenCalled();
  });

  it('falls back when the primary is a no-op ("not configured")', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'noop', configured: false, completeError: new Error('LLM client not configured') }),
      fallback: new MockClient({ label: 'real' }),
    });

    const result = await fb.complete(ctx, 'hi');
    expect(result.text).toBe('from-real');
    expect(fb.isConfigured()).toBe(true);
  });
});

describe('FallbackLLMClient — embed', () => {
  it('uses the primary when it succeeds', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary' }),
      fallback: new MockClient({ label: 'fallback' }),
    });

    const result = await fb.embed(ctx, 'text');
    expect(result.model).toBe('mock-embed');
  });

  it('falls back on a transient error', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', embedError: new LLMProviderError('down', 503, true) }),
      fallback: new MockClient({ label: 'fallback' }),
    });

    const result = await fb.embed(ctx, 'text');
    expect(result.vector).toEqual([1, 2, 3]);
  });
});

describe('FallbackLLMClient — stream', () => {
  it('uses the primary when it succeeds', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', streamChunks: ['a', 'b', 'c'] }),
      fallback: new MockClient({ label: 'fallback', streamChunks: ['x'] }),
    });

    const chunks: string[] = [];
    for await (const c of fb.stream(ctx, 'hi')) chunks.push(c);
    expect(chunks).toEqual(['a', 'b', 'c']);
  });

  it('falls back when the primary fails before yielding any data', async () => {
    const fb = new FallbackLLMClient({
      primary: new MockClient({ label: 'primary', streamError: new LLMProviderError('down', 503, true) }),
      fallback: new MockClient({ label: 'fallback', streamChunks: ['recovered'] }),
    });

    const chunks: string[] = [];
    for await (const c of fb.stream(ctx, 'hi')) chunks.push(c);
    expect(chunks).toEqual(['recovered']);
  });

  it('propagates a mid-stream failure without falling back', async () => {
    // The primary yields one chunk then throws. The consumer has already
    // received partial output — a switch to the fallback would corrupt the
    // stream, so the error must propagate.
    const primary = new MockClient({ label: 'primary' });
    // Override stream to yield then throw.
    (primary as unknown as { stream: () => AsyncIterable<string> }).stream = async function* () {
      yield 'partial';
      throw new LLMProviderError('mid-stream failure', 502, true);
    };

    const fb = new FallbackLLMClient({
      primary,
      fallback: new MockClient({ label: 'fallback', streamChunks: ['too-late'] }),
    });

    const chunks: string[] = [];
    const err = await (async () => {
      try {
        for await (const c of fb.stream(ctx, 'hi')) chunks.push(c);
      } catch (e) { return e; }
    })();

    expect(chunks).toEqual(['partial']);
    expect(err).toBeInstanceOf(LLMProviderError);
  });
});
