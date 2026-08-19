/**
 * Fase 25 REST route integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import {
  InMemoryAgentService,
  InMemoryModelCatalogService,
  InMemoryEvalService,
  InMemoryHumanInTheLoopService,
  InMemoryVectorSearchService,
  InMemoryCopilotService,
  InMemoryEmbeddingStore,
  InMemoryLLMUsageTracker,
  InMemoryLLMRateLimiter,
  InMemoryLLMGatewayService,
} from '@altius/storage-memory';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';
import type { LLMGateway } from '@altius/spi';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String!
}
`;

function mockUser(tenantId: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId };
}

function createCtx(deps: ApiDependencies, tenantId: string): ResolverContext {
  const u = mockUser(tenantId);
  return { requestContext: { tenantId, actorId: u.id, traceId: 'trace-test' }, user: u, deps };
}

function restReq(method: string, path: string, body?: unknown, params?: Record<string, string>, query?: Record<string, string | string[] | undefined>): RestRequest {
  return { method, path, params: params ?? {}, query: query ?? {}, body: body ?? {}, user: mockUser('tenant-1') };
}

function createDeps(schema: ReturnType<typeof parseOdl>): ApiDependencies {
  const objectManager = {
    get: vi.fn().mockResolvedValue(null),
    query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    aggregate: vi.fn().mockResolvedValue({ groups: [], totalCount: 0 }),
    search: vi.fn().mockResolvedValue({ items: [] }),
  } as never;
  const llmGateway = Object.assign(new InMemoryLLMGatewayService(), {
    usageTracker: new InMemoryLLMUsageTracker(),
    rateLimiter: new InMemoryLLMRateLimiter(),
  }) as unknown as LLMGateway;
  const embeddingStore = new InMemoryEmbeddingStore();
  return {
    schema,
    objectManager,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: { check: vi.fn().mockResolvedValue(true), listObjects: vi.fn().mockResolvedValue(['*']), getVisibleFields: vi.fn(), redactFields: vi.fn(), redactFieldsBatch: vi.fn() } as never,
    authenticator: {} as never,
    storage: {} as never,
    llmGateway,
    agentService: new InMemoryAgentService(),
    modelCatalogService: new InMemoryModelCatalogService(),
    evalService: new InMemoryEvalService(),
    humanInTheLoopService: new InMemoryHumanInTheLoopService(),
    vectorSearchService: new InMemoryVectorSearchService(embeddingStore),
    copilotService: new InMemoryCopilotService(),
  } as ApiDependencies;
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Fase 25 REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = createDeps(parsed);
  const routes = generateRestRoutes(parsed, deps);
  const ctx = createCtx(deps, 'tenant-1');

  it('registers agent routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/agents')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/agents')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/agents/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/agents/:id/run')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/agents/:id/chat')).toBeTruthy();
  });

  it('registers LLM model and application routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/llm/models')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/llm/models/:rid')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/llm/applications')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/llm/applications')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/llm/applications/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/llm/playground')).toBeTruthy();
  });

  it('registers eval, proposal, embedding and copilot routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/evals')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/evals')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/evals/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/evals/:id/run')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ai-proposals')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ai-proposals')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/embeddings/models')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/embeddings')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/embeddings/search')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/copilots/suggest')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/copilots/apply')).toBeTruthy();
  });

  it('creates and retrieves an agent', async () => {
    const createRoute = findRoute(routes, 'POST', '/api/v1/agents');
    const createRes = await createRoute!.handler(restReq('POST', '/api/v1/agents', { name: 'test-agent' }), ctx);
    expect(createRes.status).toBe(201);
    const agent = createRes.body as { data: { id: string } };
    expect(agent.data.id).toBeTruthy();

    const getRoute = findRoute(routes, 'GET', '/api/v1/agents/:id');
    const getRes = await getRoute!.handler(restReq('GET', '/api/v1/agents/:id', {}, { id: agent.data.id }), ctx);
    expect(getRes.status).toBe(200);
    expect((getRes.body as { data: { name: string } }).data.name).toBe('test-agent');
  });

  it('validates missing agent name', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/agents');
    const res = await route!.handler(restReq('POST', '/api/v1/agents', {}), ctx);
    expect(res.status).toBe(400);
  });

  it('creates and runs an LLM application', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/llm/applications');
    const res = await route!.handler(restReq('POST', '/api/v1/llm/applications', { name: 'app', modelRid: 'ri.ai-models..models.default', userPromptTemplate: 'Hello {{name}}' }), ctx);
    expect(res.status).toBe(201);
    const body = res.body as { data: { id: string } };
    expect(body.data.id).toBeTruthy();

    const getRoute = findRoute(routes, 'GET', '/api/v1/llm/applications/:id');
    const getRes = await getRoute!.handler(restReq('GET', '/api/v1/llm/applications/:id', {}, { id: body.data.id }), ctx);
    expect(getRes.status).toBe(200);
  });

  it('runs prompt playground', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/llm/playground');
    const res = await route!.handler(restReq('POST', '/api/v1/llm/playground', { modelRid: 'ri.ai-models..models.default', userPrompt: 'hello' }), ctx);
    expect(res.status).toBe(200);
    const body = res.body as { data: { response: string } };
    expect(typeof body.data.response).toBe('string');
  });

  it('creates and runs an eval suite', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/evals');
    const res = await route!.handler(restReq('POST', '/api/v1/evals', { name: 'suite', testCases: [{ name: 'tc', input: 'hello', metrics: [{ name: 'exact', type: 'exact_match' as const }] }] }), ctx);
    expect(res.status).toBe(201);
    const body = res.body as { data: { id: string } };
    expect(body.data.id).toBeTruthy();

    const runRoute = findRoute(routes, 'POST', '/api/v1/evals/:id/run');
    const runRes = await runRoute!.handler(restReq('POST', '/api/v1/evals/:id/run', {}, { id: body.data.id }), ctx);
    expect(runRes.status).toBe(200);
  });

  it('creates and searches a proposal', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/ai-proposals');
    const res = await route!.handler(restReq('POST', '/api/v1/ai-proposals', { title: 'change', type: 'edit', changes: [{ objectType: 'Patient', objectId: '1', operation: 'update' }] }), ctx);
    expect(res.status).toBe(201);
    const body = res.body as { data: { id: string } };
    expect(body.data.id).toBeTruthy();

    const listRoute = findRoute(routes, 'GET', '/api/v1/ai-proposals');
    const listRes = await listRoute!.handler(restReq('GET', '/api/v1/ai-proposals'), ctx);
    expect(listRes.status).toBe(200);
    expect((listRes.body as { totalCount: number }).totalCount).toBeGreaterThan(0);
  });

  it('generates an embedding', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/embeddings');
    const res = await route!.handler(restReq('POST', '/api/v1/embeddings', { text: 'hello world' }), ctx);
    expect(res.status).toBe(200);
    const body = res.body as { data: { vector: number[]; dimensions: number } };
    expect(body.data.vector.length).toBeGreaterThan(0);
    expect(body.data.dimensions).toBeGreaterThan(0);
  });

  it('returns copilot suggestions', async () => {
    const route = findRoute(routes, 'POST', '/api/v1/copilots/suggest');
    const res = await route!.handler(restReq('POST', '/api/v1/copilots/suggest', { copilotId: 'default' }), ctx);
    expect(res.status).toBe(200);
    const body = res.body as { data: { prompts: unknown[] } };
    expect(Array.isArray(body.data.prompts)).toBe(true);
  });

  it('returns LLM usage for a user', async () => {
    const route = findRoute(routes, 'GET', '/api/v1/llm/usage/:user');
    const res = await route!.handler(restReq('GET', '/api/v1/llm/usage/:user', {}, { user: 'user-1' }), ctx);
    expect(res.status).toBe(200);
    expect((res.body as { records: unknown[] }).records).toEqual([]);
  });
});
