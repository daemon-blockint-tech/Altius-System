/**
 * Integration tests for usage metrics REST routes.
 *
 * The record() method is tested directly via the service (not via REST)
 * to verify the instrumentation write path works, then the read endpoints
 * are tested via the REST layer.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryOntologyUsageMetricsService } from '@altius/storage-memory';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';
import type { OntologyUsageEvent } from '@altius/spi';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary name: String! }
`;

function mockUser(t: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId: t };
}

function createDeps(schema: ReturnType<typeof parseOdl>, svc?: InMemoryOntologyUsageMetricsService): ApiDependencies {
  return {
    schema, objectManager: {} as never, linkManager: {} as never, actionExecutor: {} as never,
    authorizationService: { check: vi.fn().mockResolvedValue(true), listObjects: vi.fn().mockResolvedValue(['*']), getVisibleFields: vi.fn(), redactFields: vi.fn(), redactFieldsBatch: vi.fn(), clearFieldCache: vi.fn() } as never,
    authenticator: {} as never, storage: {} as never,
    ...(svc ? { usageMetricsService: svc } : {}),
  } as ApiDependencies;
}

function createCtx(deps: ApiDependencies, t: string): ResolverContext {
  return { requestContext: { tenantId: t, actorId: 'user-1', traceId: 'trace-test' }, user: mockUser(t), deps };
}

function restReq(method: string, path: string, body?: unknown, params?: Record<string, string>, query?: Record<string, string | string[] | undefined>): RestRequest {
  return { method, path, params: params ?? {}, query: query ?? {}, body: body ?? {}, user: mockUser('t1') };
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

function makeEvent(tenantId: string, operation: string, objectType: string, success: boolean, durationMs: number, userId?: string): OntologyUsageEvent {
  return {
    tenantId, userId, operation: operation as OntologyUsageEvent['operation'],
    objectType, success, durationMs, timestamp: new Date().toISOString(),
  };
}

describe('Usage metrics REST routes', () => {
  const parsed = parseOdl(ODL);
  const service = new InMemoryOntologyUsageMetricsService();
  const deps = createDeps(parsed, service);
  const routes = generateRestRoutes(parsed, deps);

  // Seed data via the instrumentation write path (record() — NOT a REST endpoint)
  async function seed(tenantId: string) {
    await service.record(makeEvent(tenantId, 'read', 'Widget', true, 10, 'user-1'));
    await service.record(makeEvent(tenantId, 'read', 'Widget', true, 20, 'user-2'));
    await service.record(makeEvent(tenantId, 'create', 'Widget', true, 30, 'user-1'));
    await service.record(makeEvent(tenantId, 'action', 'Widget', false, 100, 'user-1'));
  }

  it('returns per-object-type metrics', async () => {
    await seed('t1');
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'GET', '/api/v1/usage/object-types');
    const res = await route.handler(restReq('GET', '/api/v1/usage/object-types'), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThan(0);
  });

  it('returns per-action/function metrics', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'GET', '/api/v1/usage/actions');
    const res = await route.handler(restReq('GET', '/api/v1/usage/actions'), ctx);
    expect(res.status).toBe(200);
  });

  it('returns a usage summary', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'GET', '/api/v1/usage/summary');
    const res = await route.handler(restReq('GET', '/api/v1/usage/summary'), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['totalOperations']).toBeDefined();
  });

  it('queries raw events', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'GET', '/api/v1/usage/events');
    const res = await route.handler(restReq('GET', '/api/v1/usage/events', {}, {}, { objectType: 'Widget' }), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThan(0);
  });

  it('returns active user count', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'GET', '/api/v1/usage/active-users');
    const res = await route.handler(restReq('GET', '/api/v1/usage/active-users'), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(typeof data['activeUsers']).toBe('number');
  });

  it('creates and lists monitoring rules', async () => {
    const ctx = createCtx(deps, 't1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/usage/rules');
    const res = await createRoute.handler(
      restReq('POST', '/api/v1/usage/rules', {
        name: 'High error rate',
        metric: 'error_rate',
        objectType: '*',
        operation: '*',
        threshold: 0.1,
        operator: 'gt',
        windowSeconds: 300,
        enabled: true,
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const rule = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(rule['name']).toBe('High error rate');

    const listRoute = findRoute(routes, 'GET', '/api/v1/usage/rules');
    const listRes = await listRoute.handler(restReq('GET', '/api/v1/usage/rules'), ctx);
    expect(listRes.status).toBe(200);
    const rules = (listRes.body as Record<string, unknown>)['data'] as unknown[];
    expect(rules.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a monitoring rule', async () => {
    const ctx = createCtx(deps, 't1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/usage/rules');
    const createRes = await createRoute.handler(
      restReq('POST', '/api/v1/usage/rules', { name: 'ToDelete', metric: 'request_count', objectType: '*', operation: '*', threshold: 100, operator: 'gt', windowSeconds: 60 }),
      ctx,
    );
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const deleteRoute = findRoute(routes, 'DELETE', '/api/v1/usage/rules/:id');
    const res = await deleteRoute.handler(restReq('DELETE', `/api/v1/usage/rules/${id}`, {}, { id }), ctx);
    expect(res.status).toBe(204);
  });

  it('evaluates monitoring rules', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'POST', '/api/v1/usage/rules/evaluate');
    const res = await route.handler(restReq('POST', '/api/v1/usage/rules/evaluate'), ctx);
    expect(res.status).toBe(200);
  });

  it('returns 400 when creating rule without name', async () => {
    const ctx = createCtx(deps, 't1');
    const route = findRoute(routes, 'POST', '/api/v1/usage/rules');
    const res = await route.handler(restReq('POST', '/api/v1/usage/rules', { metric: 'error_rate' }), ctx);
    expect(res.status).toBe(400);
  });

  it('isolates tenants — tenant A events invisible to tenant B', async () => {
    await seed('tenant-iso-a');
    const ctxB = createCtx(deps, 'tenant-iso-b');
    const eventsRoute = findRoute(routes, 'GET', '/api/v1/usage/events');
    const res = await eventsRoute.handler(restReq('GET', '/api/v1/usage/events'), ctxB);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns no usage routes when service is absent', async () => {
    const noSvcDeps = createDeps(parsed);
    const noSvcRoutes = generateRestRoutes(parsed, noSvcDeps);
    const usageRoutes = noSvcRoutes.filter(r => r.pattern.startsWith('/api/v1/usage'));
    expect(usageRoutes).toHaveLength(0);
  });

  it('does NOT expose a record endpoint — write path is instrumentation only', async () => {
    const recordRoutes = routes.filter(r => r.pattern.includes('/record') || r.pattern === '/api/v1/usage/events' && r.method === 'POST');
    expect(recordRoutes).toHaveLength(0);
  });
});
