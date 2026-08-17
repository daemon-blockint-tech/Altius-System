import { describe, it, expect, vi } from 'vitest';
import { LLMFunctionRuntime, schemaForFunction, renderPrompt } from '../llm-function-runtime.js';
import type { LLMClient, LLMResponse } from '@altius/spi';
import type { FunctionType, FieldTypeRef } from '@altius/odl';

function makeField(
  name: string,
  typeRef: FieldTypeRef,
  isParam: boolean,
): FunctionType['fields'][number] {
  return {
    name,
    type: typeRef,
    directives: isParam ? [{ kind: 'param' }] : [],
  };
}

function makeFunctionType(overrides: Partial<FunctionType> = {}): FunctionType {
  return {
    kind: 'functionType',
    name: 'ScoreRisk',
    fields: [
      makeField('patientId', { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, true),
      makeField('result', { name: 'Float', nonNull: true, isList: false, listElementNonNull: false }, false),
    ],
    directives: [{ kind: 'function', runtime: 'llm', entry: 'Score risk for {{input.patientId}}' }],
    runtime: 'llm',
    entry: 'Score risk for {{input.patientId}}',
    requiredRoles: ['analyst'],
    ...overrides,
  };
}

function makeClient(text: string): LLMClient {
  const response: LLMResponse = {
    text,
    model: 'test',
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    finishReason: 'stop',
  };
  return {
    isConfigured: () => true,
    complete: vi.fn(async () => response),
    embed: vi.fn(),
    stream: vi.fn(),
    vectorSearch: vi.fn(),
  };
}

describe('LLMFunctionRuntime', () => {
  it('executes an LLM-backed function and returns parsed output', async () => {
    const client = makeClient('{"result": 0.87}');
    const runtime = new LLMFunctionRuntime({ client, maxRetries: 0 });
    const fn = makeFunctionType();
    const result = await runtime.execute({
      fn,
      inputs: { patientId: 'p-123' },
      log: () => {},
    });
    expect(result).toBe(0.87);
    expect(client.complete).toHaveBeenCalledOnce();
  });

  it('throws when the LLM client is not configured', async () => {
    const client: LLMClient = {
      isConfigured: () => false,
      complete: vi.fn(),
      embed: vi.fn(),
      stream: vi.fn(),
      vectorSearch: vi.fn(),
    };
    const runtime = new LLMFunctionRuntime({ client });
    await expect(
      runtime.execute({ fn: makeFunctionType(), inputs: {}, log: () => {} }),
    ).rejects.toThrow('not configured');
  });

  it('throws on schema validation failure', async () => {
    const client = makeClient('{"wrongField": true}');
    const runtime = new LLMFunctionRuntime({ client, maxRetries: 0 });
    await expect(
      runtime.execute({ fn: makeFunctionType(), inputs: { patientId: 'p1' }, log: () => {} }),
    ).rejects.toThrow('schema_error');
  });
});

describe('schemaForFunction', () => {
  it('derives an object schema wrapping the Float return field', () => {
    const fn = makeFunctionType();
    const schema = schemaForFunction(fn);
    expect(schema).toEqual({
      type: 'object',
      required: ['result'],
      properties: { result: { type: 'number' } },
    });
  });

  it('derives an array schema for a list return field', () => {
    const fn = makeFunctionType({
      fields: [
        makeField('q', { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, true),
        makeField('tags', { name: 'String', nonNull: false, isList: true, listElementNonNull: false }, false),
      ],
    });
    const schema = schemaForFunction(fn);
    expect(schema).toEqual({
      type: 'object',
      required: ['tags'],
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    });
  });

  it('returns undefined when there is no non-param return field', () => {
    const fn = makeFunctionType({
      fields: [makeField('q', { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, true)],
    });
    expect(schemaForFunction(fn)).toBeUndefined();
  });
});

describe('renderPrompt', () => {
  it('substitutes input placeholders', () => {
    const result = renderPrompt('Hello {{input.name}}, you are {{input.age}}', {
      name: 'Alice',
      age: 30,
    });
    expect(result).toBe('Hello Alice, you are 30');
  });

  it('leaves unknown placeholders in place', () => {
    const result = renderPrompt('Hello {{input.unknown}}', {});
    expect(result).toBe('Hello ');
  });

  it('JSON-serializes non-string values', () => {
    const result = renderPrompt('Data: {{input.obj}}', { obj: { a: 1 } });
    expect(result).toBe('Data: {"a":1}');
  });
});
