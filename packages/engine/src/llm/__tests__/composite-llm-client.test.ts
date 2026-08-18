/**
 * Tests for the CompositeLLMClient.
 *
 * Verifies that completion calls go to the completion client and embedding
 * calls go to the embedding client, with no cross-routing.
 */

import { describe, it, expect } from 'vitest';
import type {
  RequestContext,
  LLMClient,
  LLMResponse,
  LLMEmbedResult,
  VectorSearchResult,
} from '@altius/spi';

import { CompositeLLMClient } from '../composite-llm-client.js';

const ctx = { tenantId: 'default', traceId: 'trace-1' } as unknown as RequestContext;

class LabelClient implements LLMClient {
  readonly label: string;
  constructor(label: string) { this.label = label; }
  isConfigured(): boolean { return true; }
  async complete(): Promise<LLMResponse> {
    return { text: `complete-${this.label}`, model: 'mock', promptTokens: 1, completionTokens: 1, totalTokens: 2, finishReason: 'stop' };
  }
  async embed(): Promise<LLMEmbedResult> {
    return { vector: [1], model: `embed-${this.label}`, dimensions: 1 };
  }
  async *stream(): AsyncIterable<string> { yield `stream-${this.label}`; }
  async vectorSearch(): Promise<VectorSearchResult> {
    return { hits: [{ id: '1', type: 'T', score: 1 }], totalCount: 1 };
  }
}

class NoOpLikeClient implements LLMClient {
  isConfigured(): boolean { return false; }
  async complete(): Promise<LLMResponse> { throw new Error('not configured'); }
  async embed(): Promise<LLMEmbedResult> { throw new Error('not configured'); }
  async *stream(): AsyncIterable<string> { throw new Error('not configured'); }
  async vectorSearch(): Promise<VectorSearchResult> { throw new Error('not configured'); }
}

describe('CompositeLLMClient', () => {
  it('routes complete() to the completion client', async () => {
    const composite = new CompositeLLMClient({
      completion: new LabelClient('daemon'),
      embedding: new LabelClient('openrouter'),
    });

    const result = await composite.complete(ctx, 'hi');
    expect(result.text).toBe('complete-daemon');
  });

  it('routes stream() to the completion client', async () => {
    const composite = new CompositeLLMClient({
      completion: new LabelClient('daemon'),
      embedding: new LabelClient('openrouter'),
    });

    const chunks: string[] = [];
    for await (const c of composite.stream(ctx, 'hi')) chunks.push(c);
    expect(chunks).toEqual(['stream-daemon']);
  });

  it('routes embed() to the embedding client', async () => {
    const composite = new CompositeLLMClient({
      completion: new LabelClient('daemon'),
      embedding: new LabelClient('openrouter'),
    });

    const result = await composite.embed(ctx, 'text');
    expect(result.model).toBe('embed-openrouter');
  });

  it('routes vectorSearch() to the completion client', async () => {
    const composite = new CompositeLLMClient({
      completion: new LabelClient('daemon'),
      embedding: new LabelClient('openrouter'),
    });

    const result = await composite.vectorSearch(ctx, 'T', 'f', [0.1]);
    expect(result.hits[0]!.id).toBe('1');
  });

  it('isConfigured() is true when either side is configured', () => {
    const both = new CompositeLLMClient({
      completion: new LabelClient('a'),
      embedding: new LabelClient('b'),
    });
    expect(both.isConfigured()).toBe(true);

    const completionOnly = new CompositeLLMClient({
      completion: new LabelClient('a'),
      embedding: new NoOpLikeClient(),
    });
    expect(completionOnly.isConfigured()).toBe(true);

    const embeddingOnly = new CompositeLLMClient({
      completion: new NoOpLikeClient(),
      embedding: new LabelClient('b'),
    });
    expect(embeddingOnly.isConfigured()).toBe(true);
  });

  it('isConfigured() is false when neither side is configured', () => {
    const composite = new CompositeLLMClient({
      completion: new NoOpLikeClient(),
      embedding: new NoOpLikeClient(),
    });
    expect(composite.isConfigured()).toBe(false);
  });
});
