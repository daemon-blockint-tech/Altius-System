/**
 * Integration tests for data-freshness REST routes.
 *
 * Verifies that the generator-style routes correctly invoke the
 * DataFreshnessService and return appropriate responses, including
 * cross-tenant isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryDataFreshnessService } from '@altius/storage-memory';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Widget @objectType {
  id: ID! @primary
  name: String!
}
`;

function mockUser(tenantId: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId };
}

function createDeps(schema: ReturnType<typeof parseOdl>, svc?: InMemoryDataFreshnessService): ApiDependencies {
  return {
    schema,
    objectManager: {} as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    ...(svc ? { dataFreshnessService: svc } : {}),
  } as ApiDependencies;
}

function createCtx(deps: ApiDependencies, tenantId: string): ResolverContext {
  const u = mockUser(tenantId);
  return { requestContext: { tenantId, actorId: u.id, traceId: 'trace-test' }, user: u, deps };
}

function restReq(method: string, path: string, body?: unknown, params?: Record<string, string>, query?: Record<string, string | string[] | undefined>): RestRequest {
  return { method, path, params: params ?? {}, query: query ?? {}, body: body ?? {}, user: mockUser('tenant-1') };
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Data freshness REST routes', () => {
  const parsed = parseOdl(ODL);
  const service = new InMemoryDataFreshnessService();
  const deps = createDeps(parsed, service);
  const routes = generateRestRoutes(parsed, deps);

  it('records a sync and retrieves it by type', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const syncRoute = findRoute(routes, 'POST', '/api/v1/data-freshness/sync');
    const res = await syncRoute.handler(
      restReq('POST', '/api/v1/data-freshness/sync', { objectType: 'Patient', recordCount: 100, succeeded: true }),
      ctx,
    );
    expect(res.status).toBe(201);
    const record = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(record['objectType']).toBe('Patient');
    expect(record['lastSyncSucceeded']).toBe(true);

    const getRoute = findRoute(routes, 'GET', '/api/v1/data-freshness/types/:type');
    const getRes = await getRoute.handler(restReq('GET', '/api/v1/data-freshness/types/Patient', {}, { type: 'Patient' }), ctx);
    expect(getRes.status).toBe(200);
    const fetched = (getRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(fetched['objectType']).toBe('Patient');
  });

  it('returns 404 for unknown type', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const getRoute = findRoute(routes, 'GET', '/api/v1/data-freshness/types/:type');
    const res = await getRoute.handler(restReq('GET', '/api/v1/data-freshness/types/Unknown', {}, { type: 'Unknown' }), ctx);
    expect(res.status).toBe(404);
  });

  it('queries freshness records', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const queryRoute = findRoute(routes, 'GET', '/api/v1/data-freshness');
    const res = await queryRoute.handler(restReq('GET', '/api/v1/data-freshness', {}, {}, { objectType: 'Patient' }), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a freshness summary', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const summaryRoute = findRoute(routes, 'GET', '/api/v1/data-freshness/summary');
    const res = await summaryRoute.handler(restReq('GET', '/api/v1/data-freshness/summary'), ctx);
    expect(res.status).toBe(200);
    const summary = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(summary['totalTypes']).toBeDefined();
  });

  it('deletes a freshness record', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    // First record a sync for a type we can delete
    const syncRoute = findRoute(routes, 'POST', '/api/v1/data-freshness/sync');
    await syncRoute.handler(
      restReq('POST', '/api/v1/data-freshness/sync', { objectType: 'ToDelete', recordCount: 1, succeeded: true }),
      ctx,
    );
    const deleteRoute = findRoute(routes, 'DELETE', '/api/v1/data-freshness/types/:type');
    const res = await deleteRoute.handler(restReq('DELETE', '/api/v1/data-freshness/types/ToDelete', {}, { type: 'ToDelete' }), ctx);
    expect(res.status).toBe(204);
  });

  it('isolates tenants — tenant A sync is invisible to tenant B', async () => {
    // Tenant A records a sync
    const ctxA = createCtx(deps, 'tenant-a');
    const syncRoute = findRoute(routes, 'POST', '/api/v1/data-freshness/sync');
    await syncRoute.handler(
      restReq('POST', '/api/v1/data-freshness/sync', { objectType: 'Secret', recordCount: 42, succeeded: true }),
      ctxA,
    );

    // Tenant B queries — should not see tenant A's record
    const ctxB = createCtx(deps, 'tenant-b');
    const getRoute = findRoute(routes, 'GET', '/api/v1/data-freshness/types/:type');
    const res = await getRoute.handler(restReq('GET', '/api/v1/data-freshness/types/Secret', {}, { type: 'Secret' }), ctxB);
    expect(res.status).toBe(404);

    // Tenant B queries all — should be empty
    const queryRoute = findRoute(routes, 'GET', '/api/v1/data-freshness');
    const queryRes = await queryRoute.handler(restReq('GET', '/api/v1/data-freshness'), ctxB);
    const data = ((queryRes.body as Record<string, unknown>)['data']) as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns no routes when service is absent', async () => {
    const noSvcDeps = createDeps(parsed);
    const noSvcRoutes = generateRestRoutes(parsed, noSvcDeps);
    const freshnessRoutes = noSvcRoutes.filter(r => r.pattern.startsWith('/api/v1/data-freshness'));
    expect(freshnessRoutes).toHaveLength(0);
  });
});
