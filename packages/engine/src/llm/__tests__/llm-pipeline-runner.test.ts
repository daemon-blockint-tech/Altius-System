import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runLLMPipelineStep,
  isRetryableProviderError,
  backoffFor,
  parseJsonOutput,
  validateSchema,
} from '../llm-pipeline-runner.js';
import type { LLMClient, LLMResponse, RequestContext } from '@altius/spi';

const ctx: RequestContext = { tenantId: 'test', traceId: 't-1' };

function makeResponse(text: string, tokens = 10): LLMResponse {
  return {
    text,
    model: 'test-model',
    promptTokens: 5,
    completionTokens: tokens - 5,
    totalTokens: tokens,
    finishReason: 'stop',
  };
}

function makeClient(overrides: Partial<LLMClient> = {}): LLMClient {
  return {
    isConfigured: () => true,
    complete: vi.fn(async () => makeResponse('{"score": 42}')),
    embed: vi.fn(),
    stream: vi.fn(),
    vectorSearch: vi.fn(),
    ...overrides,
  };
}

describe('runLLMPipelineStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success with text when no schema is set', async () => {
    const client = makeClient();
    const result = await runLLMPipelineStep({ client, maxRetries: 0 }, ctx, 'hello');
    expect(result.outcome).toBe('success');
    expect(result.text).toBe('{"score": 42}');
    expect(result.retries).toBe(0);
  });

  it('returns success with parsed value when schema is set and output conforms', async () => {
    const client = makeClient();
    const result = await runLLMPipelineStep(
      { client, maxRetries: 0 },
      ctx,
      'hello',
      { outputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } } },
    );
    expect(result.outcome).toBe('success');
    expect(result.value).toEqual({ score: 42 });
  });

  it('retries on retryable provider error then succeeds', async () => {
    const retryableErr = Object.assign(new Error('429'), { retryable: true });
    const complete = vi
      .fn<LLMClient['complete']>()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValueOnce(makeResponse('ok'));
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 2, baseBackoffMs: 1 },
      ctx,
      'hello',
    );
    expect(result.outcome).toBe('success');
    expect(result.retries).toBe(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('returns provider_error when retries exhausted on retryable error', async () => {
    const retryableErr = Object.assign(new Error('503'), { retryable: true });
    const complete = vi.fn<LLMClient['complete']>().mockRejectedValue(retryableErr);
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 1, baseBackoffMs: 1 },
      ctx,
      'hello',
    );
    expect(result.outcome).toBe('provider_error');
    expect(result.retries).toBe(1);
  });

  it('returns provider_error immediately on non-retryable error', async () => {
    const err = Object.assign(new Error('400 bad request'), { retryable: false });
    const complete = vi.fn<LLMClient['complete']>().mockRejectedValue(err);
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 3, baseBackoffMs: 1 },
      ctx,
      'hello',
    );
    expect(result.outcome).toBe('provider_error');
    expect(result.retries).toBe(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('retries on schema error (invalid JSON) then succeeds', async () => {
    const complete = vi
      .fn<LLMClient['complete']>()
      .mockResolvedValueOnce(makeResponse('not json at all'))
      .mockResolvedValueOnce(makeResponse('{"score": 7}'));
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 2, baseBackoffMs: 1 },
      ctx,
      'hello',
      { outputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } } },
    );
    expect(result.outcome).toBe('success');
    expect(result.value).toEqual({ score: 7 });
    expect(result.retries).toBe(1);
  });

  it('returns schema_error when retries exhausted on conformance failure', async () => {
    const complete = vi.fn<LLMClient['complete']>().mockResolvedValue(makeResponse('{"name": "bob"}'));
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 1, baseBackoffMs: 1 },
      ctx,
      'hello',
      { outputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } } },
    );
    expect(result.outcome).toBe('schema_error');
    expect(result.retries).toBe(1);
  });

  it('strips code fences when parsing JSON', async () => {
    const complete = vi.fn<LLMClient['complete']>().mockResolvedValue(makeResponse('```json\n{"score": 1}\n```'));
    const client = makeClient({ complete });
    const result = await runLLMPipelineStep(
      { client, maxRetries: 0 },
      ctx,
      'hello',
      { outputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } } },
    );
    expect(result.outcome).toBe('success');
    expect(result.value).toEqual({ score: 1 });
  });

  it('returns misconfigured when no client is supplied', async () => {
    const result = await runLLMPipelineStep({ client: undefined as unknown as LLMClient }, ctx, 'hello');
    expect(result.outcome).toBe('misconfigured');
  });
});

describe('isRetryableProviderError', () => {
  it('returns true when error has retryable=true', () => {
    expect(isRetryableProviderError(Object.assign(new Error('x'), { retryable: true }))).toBe(true);
  });
  it('returns false for plain errors', () => {
    expect(isRetryableProviderError(new Error('x'))).toBe(false);
  });
});

describe('backoffFor', () => {
  it('increases with attempt number', () => {
    const b1 = backoffFor(1, 100, 10_000);
    const b2 = backoffFor(2, 100, 10_000);
    const b3 = backoffFor(3, 100, 10_000);
    // Allow jitter, but the trend must be increasing.
    expect(b2).toBeGreaterThanOrEqual(b1 * 0.5);
    expect(b3).toBeGreaterThanOrEqual(b2 * 0.5);
  });
  it('caps at maxBackoffMs', () => {
    const b = backoffFor(10, 100, 1000);
    // With ±25% jitter on a capped value of 1000, max is 1250.
    expect(b).toBeLessThanOrEqual(1250);
  });
});

describe('parseJsonOutput', () => {
  it('parses valid JSON', () => {
    expect(parseJsonOutput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
  it('returns error on invalid JSON', () => {
    const r = parseJsonOutput('not json');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });
  it('strips code fences', () => {
    expect(parseJsonOutput('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe('validateSchema', () => {
  it('validates a conforming object', () => {
    const schema = { type: 'object' as const, required: ['name'], properties: { name: { type: 'string' as const } } };
    expect(validateSchema({ name: 'bob' }, schema).ok).toBe(true);
  });
  it('rejects missing required field', () => {
    const schema = { type: 'object' as const, required: ['name'], properties: { name: { type: 'string' as const } } };
    const r = validateSchema({}, schema);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('name');
  });
  it('rejects wrong type', () => {
    expect(validateSchema(42, { type: 'string' }).ok).toBe(false);
  });
  it('validates arrays', () => {
    const schema = { type: 'array' as const, items: { type: 'number' as const } };
    expect(validateSchema([1, 2, 3], schema).ok).toBe(true);
    expect(validateSchema([1, 'x'], schema).ok).toBe(false);
  });
  it('validates enum', () => {
    const schema = { type: 'string' as const, enum: ['a', 'b'] };
    expect(validateSchema('a', schema).ok).toBe(true);
    expect(validateSchema('c', schema).ok).toBe(false);
  });
});
