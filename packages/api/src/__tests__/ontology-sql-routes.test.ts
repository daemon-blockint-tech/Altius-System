/**
 * Integration tests for ontology SQL REST routes — SQL Studio.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryOntologySqlService } from '@altius/storage-memory';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Widget @objectType {
  id: ID! @primary
  name: String!
  category: String
}
`;

function mockUser(tenantId: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId };
}

function createDeps(schema: ReturnType<typeof parseOdl>, svc?: InMemoryOntologySqlService): ApiDependencies {
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
    ...(svc ? { ontologySqlService: svc } : {}),
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

describe('Ontology SQL REST routes', () => {
  const parsed = parseOdl(ODL);

  // Use a mock object reader that returns test data
  const reader = async () => [
    { id: 'w1', properties: { _id: 'w1', name: 'Widget A', category: 'tools' } },
    { id: 'w2', properties: { _id: 'w2', name: 'Widget B', category: 'tools' } },
  ];
  const service = new InMemoryOntologySqlService(reader);
  const deps = createDeps(parsed, service);
  const routes = generateRestRoutes(parsed, deps);

  it('executes a SQL query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/sql/execute');
    const res = await route.handler(
      restReq('POST', '/api/v1/sql/execute', { sql: 'SELECT * FROM Widget' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['columns']).toBeDefined();
    expect(data['rows']).toBeDefined();
  });

  it('returns 400 when sql is missing', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/sql/execute');
    const res = await route.handler(restReq('POST', '/api/v1/sql/execute', {}), ctx);
    expect(res.status).toBe(400);
  });

  it('explains a SQL query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/sql/explain');
    const res = await route.handler(
      restReq('POST', '/api/v1/sql/explain', { sql: 'SELECT name FROM Widget WHERE category = \'tools\'' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['parsed']).toBeDefined();
    expect(data['objectTypes']).toBeDefined();
  });

  it('validates a SQL query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/sql/validate');
    const res = await route.handler(
      restReq('POST', '/api/v1/sql/validate', { sql: 'SELECT * FROM Widget' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['valid']).toBe(true);
  });

  it('lists virtual tables', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'GET', '/api/v1/sql/tables');
    const res = await route.handler(restReq('GET', '/api/v1/sql/tables'), ctx);
    expect(res.status).toBe(200);
  });

  it('creates and retrieves a saved query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const res = await createRoute.handler(
      restReq('POST', '/api/v1/sql/saved', { name: 'My Query', sql: 'SELECT * FROM Widget', tags: ['demo'] }),
      ctx,
    );
    expect(res.status).toBe(201);
    const query = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(query['name']).toBe('My Query');

    const getRoute = findRoute(routes, 'GET', '/api/v1/sql/saved/:id');
    const getRes = await getRoute.handler(
      restReq('GET', `/api/v1/sql/saved/${query['id']}`, {}, { id: query['id'] as string }),
      ctx,
    );
    expect(getRes.status).toBe(200);
  });

  it('lists saved queries', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'Q1', sql: 'SELECT * FROM Widget' }), ctx);
    await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'Q2', sql: 'SELECT name FROM Widget' }), ctx);

    const listRoute = findRoute(routes, 'GET', '/api/v1/sql/saved');
    const res = await listRoute.handler(restReq('GET', '/api/v1/sql/saved'), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('updates a saved query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const createRes = await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'Original', sql: 'SELECT * FROM Widget' }), ctx);
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const updateRoute = findRoute(routes, 'PUT', '/api/v1/sql/saved/:id');
    const res = await updateRoute.handler(
      restReq('PUT', `/api/v1/sql/saved/${id}`, { name: 'Updated', sql: 'SELECT name FROM Widget' }, { id }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['name']).toBe('Updated');
  });

  it('deletes a saved query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const createRes = await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'ToDelete', sql: 'SELECT * FROM Widget' }), ctx);
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const deleteRoute = findRoute(routes, 'DELETE', '/api/v1/sql/saved/:id');
    const res = await deleteRoute.handler(restReq('DELETE', `/api/v1/sql/saved/${id}`, {}, { id }), ctx);
    expect(res.status).toBe(204);
  });

  it('shares a saved query', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const createRes = await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'Share', sql: 'SELECT * FROM Widget' }), ctx);
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const shareRoute = findRoute(routes, 'POST', '/api/v1/sql/saved/:id/share');
    const res = await shareRoute.handler(
      restReq('POST', `/api/v1/sql/saved/${id}/share`, { userIds: ['user-2', 'user-3'] }, { id }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['sharedWith']).toContain('user-2');
  });

  it('returns 400 when sharing without userIds', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const createRes = await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'S', sql: 'SELECT * FROM Widget' }), ctx);
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const shareRoute = findRoute(routes, 'POST', '/api/v1/sql/saved/:id/share');
    const res = await shareRoute.handler(restReq('POST', `/api/v1/sql/saved/${id}/share`, {}, { id }), ctx);
    expect(res.status).toBe(400);
  });

  it('isolates tenants — tenant A saved query invisible to tenant B', async () => {
    const ctxA = createCtx(deps, 'tenant-a');
    const createRoute = findRoute(routes, 'POST', '/api/v1/sql/saved');
    const createRes = await createRoute.handler(restReq('POST', '/api/v1/sql/saved', { name: 'Secret', sql: 'SELECT * FROM Widget' }), ctxA);
    const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

    const ctxB = createCtx(deps, 'tenant-b');
    const getRoute = findRoute(routes, 'GET', '/api/v1/sql/saved/:id');
    const res = await getRoute.handler(restReq('GET', `/api/v1/sql/saved/${id}`, {}, { id }), ctxB);
    expect(res.status).toBe(404);
  });

  it('returns no SQL routes when service is absent', async () => {
    const noSvcDeps = createDeps(parsed);
    const noSvcRoutes = generateRestRoutes(parsed, noSvcDeps);
    const sqlRoutes = noSvcRoutes.filter(r => r.pattern.startsWith('/api/v1/sql/'));
    expect(sqlRoutes).toHaveLength(0);
  });
});
