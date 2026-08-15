/**
 * Tests for LLM generate + embed endpoints over REST and GraphQL.
 *
 * Before this change, there was no LLM client in the repo, no prompt/generation
 * endpoint, and no embed endpoint. The SDL contained no generate/embed fields.
 * A NoOpLLMClient stub lets the platform boot without a provider.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { LLMClient, LLMResponse, LLMEmbedResult } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Widget @objectType {
  id: ID! @primary
  name: String!
}
`;

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1', name: 'Test', email: 'test@test.uk',
    roles: ['admin'], groups: [], tenantId: 'tenant-1',
  };
}

function createMockDeps(schema: ParsedSchema, llmClient?: LLMClient): ApiDependencies {
  return {
    schema,
    objectManager: {} as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation((_u, _r, _t, obj) => ({ data: obj, _redactedFields: [] })),
      redactFieldsBatch: vi.fn().mockImplementation((_u, _r, _t, objs) => objs.map((o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }))),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: vi.fn().mockReturnValue(undefined) },
    consentService: undefined,
    auditWriter: undefined,
    storage: {
      getObjectHistory: vi.fn().mockResolvedValue([]),
    } as unknown as ApiDependencies['storage'],
    ...(llmClient ? { llmClient } : {}),
  };
}

function createCtx(deps: ApiDependencies): ResolverContext {
  const u = createMockUser();
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps,
  };
}

function createRestRequest(overrides: Partial<RestRequest> = {}): RestRequest {
  return {
    method: 'POST',
    path: '/api/v1/llm/generate',
    params: {},
    query: {},
    body: {},
    user: createMockUser(),
    ...overrides,
  };
}

// ─── Mock LLM client ───

function createMockLlmClient(configured: boolean): LLMClient {
  const completeResponse: LLMResponse = {
    text: 'Hello from the model',
    model: 'test-model',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    finishReason: 'stop',
  };
  const embedResponse: LLMEmbedResult = {
    vector: [0.1, 0.2, 0.3],
    model: 'test-embed',
    dimensions: 3,
  };
  return {
    isConfigured: () => configured,
    complete: vi.fn().mockResolvedValue(completeResponse),
    embed: vi.fn().mockResolvedValue(embedResponse),
    stream: async function* () { yield 'Hello'; yield ' world'; },
    vectorSearch: vi.fn().mockResolvedValue({ hits: [], totalCount: 0 }),
  };
}

// ════════════════════════════════════════════════════════════════════

describe('LLM endpoints over HTTP', () => {
  const schema = parseOdl(ODL);

  it('emits generate and embed in the GraphQL SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('generate(input: GenerateInput!): GenerateResult!');
    expect(sdl).toContain('embed(input: EmbedInput!): EmbedResult!');
    expect(sdl).toContain('input GenerateInput');
    expect(sdl).toContain('input EmbedInput');
  });

  it('REST generate returns 503 when no LLM client is configured', async () => {
    const deps = createMockDeps(schema); // no llmClient
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/generate')!;

    const res = await route.handler(
      createRestRequest({ body: { prompt: 'Hello' } }),
      createCtx(deps),
    );

    expect(res.status).toBe(503);
  });

  it('REST generate returns 503 when LLM client is not configured (NoOp)', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(false));
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/generate')!;

    const res = await route.handler(
      createRestRequest({ body: { prompt: 'Hello' } }),
      createCtx(deps),
    );

    expect(res.status).toBe(503);
  });

  it('REST generate returns completion when LLM is configured', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(true));
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/generate')!;

    const res = await route.handler(
      createRestRequest({ body: { prompt: 'Hello', model: 'gpt-4', temperature: 0.7 } }),
      createCtx(deps),
    );

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data['text']).toBe('Hello from the model');
    expect(body.data['model']).toBe('test-model');
    expect(body.data['totalTokens']).toBe(15);
  });

  it('REST generate returns 400 when prompt is missing', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(true));
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/generate')!;

    const res = await route.handler(
      createRestRequest({ body: {} }),
      createCtx(deps),
    );

    expect(res.status).toBe(400);
  });

  it('REST embed returns embedding when LLM is configured', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(true));
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/embed')!;

    const res = await route.handler(
      createRestRequest({
        path: '/api/v1/llm/embed',
        body: { text: 'Hello world' },
      }),
      createCtx(deps),
    );

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data['vector']).toEqual([0.1, 0.2, 0.3]);
    expect(body.data['dimensions']).toBe(3);
  });

  it('REST embed returns 503 when LLM is not configured', async () => {
    const deps = createMockDeps(schema);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/embed')!;

    const res = await route.handler(
      createRestRequest({
        path: '/api/v1/llm/embed',
        body: { text: 'Hello' },
      }),
      createCtx(deps),
    );

    expect(res.status).toBe(503);
  });

  it('GraphQL generate resolver returns completion', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(true));
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Mutation'] as Record<string, unknown>)['generate'] as (parent: unknown, args: { input: { prompt: string } }, ctx: ResolverContext) => Promise<unknown>;

    const result = await resolver(undefined, { input: { prompt: 'Hello' } }, createCtx(deps));

    expect(result).toMatchObject({
      text: 'Hello from the model',
      model: 'test-model',
      totalTokens: 15,
    });
  });

  it('GraphQL generate resolver throws when not configured', async () => {
    const deps = createMockDeps(schema);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Mutation'] as Record<string, unknown>)['generate'] as (parent: unknown, args: { input: { prompt: string } }, ctx: ResolverContext) => Promise<unknown>;

    await expect(resolver(undefined, { input: { prompt: 'Hello' } }, createCtx(deps))).rejects.toThrow();
  });

  it('GraphQL embed resolver returns embedding', async () => {
    const deps = createMockDeps(schema, createMockLlmClient(true));
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Mutation'] as Record<string, unknown>)['embed'] as (parent: unknown, args: { input: { text: string } }, ctx: ResolverContext) => Promise<unknown>;

    const result = await resolver(undefined, { input: { text: 'Hello' } }, createCtx(deps));

    expect(result).toMatchObject({
      vector: [0.1, 0.2, 0.3],
      dimensions: 3,
    });
  });

  it('LLM client complete is called with the request context', async () => {
    const mockClient = createMockLlmClient(true);
    const deps = createMockDeps(schema, mockClient);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/llm/generate')!;

    await route.handler(
      createRestRequest({ body: { prompt: 'Hello' } }),
      createCtx(deps),
    );

    expect(mockClient.complete).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'Hello',
      expect.objectContaining({}),
    );
  });
});
