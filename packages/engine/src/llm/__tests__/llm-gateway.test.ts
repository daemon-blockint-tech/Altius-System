/**
 * Tests for the LLM gateway, usage tracker, and rate limiter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultLLMGateway } from '../llm-gateway.js';
import { InMemoryLLMUsageTracker } from '@altius/storage-memory';
import { InMemoryLLMRateLimiter } from '@altius/storage-memory';
import type { LLMClient, LLMResponse, LLMEmbedResult, RequestContext } from '@altius/spi';
import type { ModelCatalogEntry } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

class MockLLMClient implements LLMClient {
  isConfigured(): boolean { return true; }

  async complete(_ctx: RequestContext, prompt: string, options?: { model?: string }): Promise<LLMResponse> {
    return {
      text: `Response to: ${prompt.slice(0, 50)}`,
      model: options?.model ?? 'mock-model',
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: 50,
      totalTokens: Math.ceil(prompt.length / 4) + 50,
      finishReason: 'stop',
    };
  }

  async embed(_ctx: RequestContext, _text: string): Promise<LLMEmbedResult> {
    return { vector: [1, 0, 0], model: 'mock-embed', dimensions: 3 };
  }

  async *stream(_ctx: RequestContext, _prompt: string): AsyncIterable<string> {
    yield 'chunk';
  }

  async vectorSearch(): Promise<{ hits: never[]; totalCount: 0 }> {
    return { hits: [], totalCount: 0 };
  }
}

const MODELS: ModelCatalogEntry[] = [
  {
    rid: 'ri.ai-models..models.claude-3-opus',
    displayName: 'Claude 3 Opus',
    provider: 'anthropic',
    modelId: 'claude-3-opus',
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsTools: true,
    zdr: false,
    geo: 'any',
    enabled: true,
  },
  {
    rid: 'ri.ai-models..models.claude-3-sonnet',
    displayName: 'Claude 3 Sonnet',
    provider: 'anthropic',
    modelId: 'claude-3-sonnet',
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsTools: true,
    zdr: true,
    geo: 'EU',
    enabled: true,
  },
  {
    rid: 'ri.ai-models..models.disabled-model',
    displayName: 'Disabled Model',
    provider: 'anthropic',
    modelId: 'disabled',
    contextWindow: 100_000,
    maxOutputTokens: 2_048,
    supportsStreaming: false,
    supportsTools: false,
    zdr: false,
    geo: 'any',
    enabled: false,
  },
];

describe('DefaultLLMGateway', () => {
  let gateway: DefaultLLMGateway;
  let usageTracker: InMemoryLLMUsageTracker;
  let rateLimiter: InMemoryLLMRateLimiter;

  beforeEach(() => {
    usageTracker = new InMemoryLLMUsageTracker();
    rateLimiter = new InMemoryLLMRateLimiter();
    gateway = new DefaultLLMGateway({
      llmClient: new MockLLMClient(),
      models: MODELS,
      usageTracker,
      rateLimiter,
    });
  });

  it('lists enabled models', async () => {
    const models = await gateway.listModels(CTX);
    expect(models).toHaveLength(2); // excludes disabled
    expect(models.some(m => m.rid === 'ri.ai-models..models.claude-3-opus')).toBe(true);
  });

  it('gets a specific model', async () => {
    const model = await gateway.getModel(CTX, 'ri.ai-models..models.claude-3-opus');
    expect(model?.displayName).toBe('Claude 3 Opus');
  });

  it('returns null for unknown model', async () => {
    const model = await gateway.getModel(CTX, 'ri.ai-models..models.unknown');
    expect(model).toBeNull();
  });

  it('creates a chat completion', async () => {
    const result = await gateway.chatCompletion(CTX, {
      model: 'ri.ai-models..models.claude-3-opus',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, world!' },
      ],
      temperature: 0.7,
      maxTokens: 100,
    });
    expect(result.object).toBe('chat.completion');
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.message.role).toBe('assistant');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it('throws for unknown model', async () => {
    await expect(gateway.chatCompletion(CTX, {
      model: 'ri.ai-models..models.unknown',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow('Model not found');
  });

  it('throws for disabled model', async () => {
    await expect(gateway.chatCompletion(CTX, {
      model: 'ri.ai-models..models.disabled-model',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow('disabled');
  });

  it('records usage after completion', async () => {
    await gateway.chatCompletion(CTX, {
      model: 'ri.ai-models..models.claude-3-opus',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const summary = await usageTracker.summarize('t1');
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalTokens).toBeGreaterThan(0);
    expect(summary.byModel).toHaveLength(1);
    expect(summary.byModel[0]!.model).toBe('ri.ai-models..models.claude-3-opus');
  });

  it('enforces rate limits', async () => {
    await rateLimiter.setConfig('t1', {
      requestsPerMinute: 2,
      tokensPerMinute: 100_000,
      requestsPerDay: 10_000,
      tokensPerDay: 10_000_000,
    });

    // First two should succeed
    await gateway.chatCompletion(CTX, { model: 'ri.ai-models..models.claude-3-opus', messages: [{ role: 'user', content: 'a' }] });
    await gateway.chatCompletion(CTX, { model: 'ri.ai-models..models.claude-3-opus', messages: [{ role: 'user', content: 'b' }] });

    // Third should be rate limited
    await expect(gateway.chatCompletion(CTX, { model: 'ri.ai-models..models.claude-3-opus', messages: [{ role: 'user', content: 'c' }] }))
      .rejects.toThrow('Rate limit');
  });
});

describe('InMemoryLLMUsageTracker', () => {
  let tracker: InMemoryLLMUsageTracker;

  beforeEach(() => {
    tracker = new InMemoryLLMUsageTracker();
  });

  it('records and queries usage', async () => {
    await tracker.record({ tenantId: 't1', userId: 'u1', model: 'm1', operation: 'completion', promptTokens: 10, completionTokens: 20, totalTokens: 30, timestamp: '2026-01-01T00:00:00Z' });
    await tracker.record({ tenantId: 't1', userId: 'u2', model: 'm1', operation: 'completion', promptTokens: 5, completionTokens: 15, totalTokens: 20, timestamp: '2026-01-01T01:00:00Z' });
    await tracker.record({ tenantId: 't2', userId: 'u1', model: 'm1', operation: 'completion', promptTokens: 5, completionTokens: 5, totalTokens: 10, timestamp: '2026-01-01T02:00:00Z' });

    const t1 = await tracker.query({ tenantId: 't1' });
    expect(t1.totalCount).toBe(2);

    const u1 = await tracker.query({ tenantId: 't1', userId: 'u1' });
    expect(u1.totalCount).toBe(1);
  });

  it('summarizes usage', async () => {
    await tracker.record({ tenantId: 't1', userId: 'u1', model: 'm1', operation: 'completion', promptTokens: 10, completionTokens: 20, totalTokens: 30, timestamp: '2026-01-01T00:00:00Z' });
    await tracker.record({ tenantId: 't1', userId: 'u1', model: 'm2', operation: 'completion', promptTokens: 5, completionTokens: 15, totalTokens: 20, timestamp: '2026-01-01T01:00:00Z' });
    await tracker.record({ tenantId: 't1', userId: 'u2', model: 'm1', operation: 'completion', promptTokens: 5, completionTokens: 5, totalTokens: 10, timestamp: '2026-01-01T02:00:00Z' });

    const summary = await tracker.summarize('t1');
    expect(summary.totalRequests).toBe(3);
    expect(summary.totalTokens).toBe(60);
    expect(summary.byModel).toHaveLength(2);
    expect(summary.byUser).toHaveLength(2);
  });

  it('filters by time range', async () => {
    await tracker.record({ tenantId: 't1', userId: 'u1', model: 'm1', operation: 'completion', promptTokens: 10, completionTokens: 20, totalTokens: 30, timestamp: '2026-01-01T00:00:00Z' });
    await tracker.record({ tenantId: 't1', userId: 'u1', model: 'm1', operation: 'completion', promptTokens: 5, completionTokens: 15, totalTokens: 20, timestamp: '2026-06-01T00:00:00Z' });

    const early = await tracker.query({ tenantId: 't1', endTime: '2026-03-01T00:00:00Z' });
    expect(early.totalCount).toBe(1);
  });
});

describe('InMemoryLLMRateLimiter', () => {
  let limiter: InMemoryLLMRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryLLMRateLimiter();
  });

  it('allows requests within limits', async () => {
    const result = await limiter.check('t1', 100);
    expect(result.allowed).toBe(true);
  });

  it('blocks requests exceeding per-minute tokens', async () => {
    await limiter.setConfig('t1', { requestsPerMinute: 100, tokensPerMinute: 50, requestsPerDay: 10000, tokensPerDay: 1000000 });
    const result = await limiter.check('t1', 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('tokens per minute');
  });

  it('records and checks usage', async () => {
    await limiter.setConfig('t1', { requestsPerMinute: 2, tokensPerMinute: 100000, requestsPerDay: 10000, tokensPerDay: 1000000 });
    await limiter.recordUsage('t1', 50);
    await limiter.recordUsage('t1', 50);
    const result = await limiter.check('t1', 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('requests per minute');
  });

  it('returns default config for unknown tenant', async () => {
    const config = await limiter.getConfig('unknown');
    expect(config.requestsPerMinute).toBe(60);
  });

  it('sets and gets custom config', async () => {
    await limiter.setConfig('t1', { requestsPerMinute: 10, tokensPerMinute: 5000, requestsPerDay: 100, tokensPerDay: 50000 });
    const config = await limiter.getConfig('t1');
    expect(config.requestsPerMinute).toBe(10);
  });
});
