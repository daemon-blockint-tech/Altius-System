/**
 * Tests for NoOpLLMClient.
 *
 * Before this change, there was no LLM client stub — the platform had no
 * way to boot without a provider. NoOpLLMClient returns isConfigured()=false
 * and throws descriptive errors on every operation so endpoints can detect
 * the unconfigured state and return a clean 503.
 */

import { describe, it, expect } from 'vitest';
import { NoOpLLMClient } from '../noop-llm-client.js';

const ctx = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-test' };

describe('NoOpLLMClient', () => {
  const client = new NoOpLLMClient();

  it('reports isConfigured() as false', () => {
    expect(client.isConfigured()).toBe(false);
  });

  it('throws on complete()', async () => {
    await expect(client.complete(ctx, 'Hello')).rejects.toThrow(/not configured/i);
  });

  it('throws on embed()', async () => {
    await expect(client.embed(ctx, 'Hello')).rejects.toThrow(/not configured/i);
  });

  it('throws on stream()', async () => {
    await expect(async () => {
      for await (const _ of client.stream(ctx, 'Hello')) { void _; }
    }).rejects.toThrow(/not configured/i);
  });

  it('throws on vectorSearch()', async () => {
    await expect(
      client.vectorSearch(ctx, 'Widget', 'embedding', [0.1, 0.2]),
    ).rejects.toThrow(/not configured/i);
  });
});
