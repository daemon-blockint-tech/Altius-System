/**
 * Integration tests for dataset REST routes — versioned transactional datasets.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryDatasetService } from '@altius/storage-memory';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary name: String! }
`;

function mockUser(t: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId: t };
}

function createDeps(schema: ReturnType<typeof parseOdl>, svc?: InMemoryDatasetService): ApiDependencies {
  return {
    schema, objectManager: {} as never, linkManager: {} as never, actionExecutor: {} as never,
    authorizationService: { check: vi.fn().mockResolvedValue(true), listObjects: vi.fn().mockResolvedValue(['*']), getVisibleFields: vi.fn(), redactFields: vi.fn(), redactFieldsBatch: vi.fn(), clearFieldCache: vi.fn() } as never,
    authenticator: {} as never, storage: {} as never,
    ...(svc ? { datasetService: svc } : {}),
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

const SCHEMA = { columns: [{ name: 'id', type: 'string' as const, nullable: false }, { name: 'value', type: 'integer' as const, nullable: true }], primaryKey: ['id'], version: 1 };

describe('Dataset REST routes', () => {
  const parsed = parseOdl(ODL);
  const service = new InMemoryDatasetService();
  const deps = createDeps(parsed, service);
  const routes = generateRestRoutes(parsed, deps);

  it('creates and retrieves a dataset', async () => {
    const ctx = createCtx(deps, 't1');
    const createRoute = findRoute(routes, 'POST', '/api/v1/datasets');
    const res = await createRoute.handler(restReq('POST', '/api/v1/datasets', { name: 'test_ds', schema: SCHEMA }), ctx);
    expect(res.status).toBe(201);
    const ds = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(ds['name']).toBe('test_ds');

    const getRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name');
    const getRes = await getRoute.handler(restReq('GET', '/api/v1/datasets/test_ds', {}, { name: 'test_ds' }), ctx);
    expect(getRes.status).toBe(200);
  });

  it('lists datasets', async () => {
    const ctx = createCtx(deps, 't1');
    const listRoute = findRoute(routes, 'GET', '/api/v1/datasets');
    const res = await listRoute.handler(restReq('GET', '/api/v1/datasets'), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('inserts and reads rows', async () => {
    const ctx = createCtx(deps, 't1');
    const insertRoute = findRoute(routes, 'POST', '/api/v1/datasets/:name/insert');
    const insertRes = await insertRoute.handler(
      restReq('POST', '/api/v1/datasets/test_ds/insert', { rows: [{ id: 'r1', value: 42 }, { id: 'r2', value: 99 }] }, { name: 'test_ds' }),
      ctx,
    );
    expect(insertRes.status).toBe(200);
    const insertData = (insertRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(insertData['rowsWritten']).toBe(2);

    const readRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name/read');
    const readRes = await readRoute.handler(restReq('GET', '/api/v1/datasets/test_ds/read', {}, { name: 'test_ds' }), ctx);
    expect(readRes.status).toBe(200);
    const readData = (readRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect((readData['rows'] as unknown[]).length).toBe(2);
  });

  it('lists transactions', async () => {
    const ctx = createCtx(deps, 't1');
    const txRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name/transactions');
    const res = await txRoute.handler(restReq('GET', '/api/v1/datasets/test_ds/transactions', {}, { name: 'test_ds' }), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as unknown[];
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('creates and lists branches', async () => {
    const ctx = createCtx(deps, 't1');
    const createBranchRoute = findRoute(routes, 'POST', '/api/v1/datasets/:name/branches');
    const createRes = await createBranchRoute.handler(
      restReq('POST', '/api/v1/datasets/test_ds/branches', { name: 'dev' }, { name: 'test_ds' }),
      ctx,
    );
    expect(createRes.status).toBe(201);

    const listBranchRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name/branches');
    const listRes = await listBranchRoute.handler(restReq('GET', '/api/v1/datasets/test_ds/branches', {}, { name: 'test_ds' }), ctx);
    expect(listRes.status).toBe(200);
    const branches = (listRes.body as Record<string, unknown>)['data'] as unknown[];
    expect(branches.length).toBeGreaterThanOrEqual(1);
  });

  it('drops a dataset', async () => {
    const ctx = createCtx(deps, 't1');
    // Create a dataset to drop
    const createRoute = findRoute(routes, 'POST', '/api/v1/datasets');
    await createRoute.handler(restReq('POST', '/api/v1/datasets', { name: 'to_drop', schema: SCHEMA }), ctx);

    const dropRoute = findRoute(routes, 'DELETE', '/api/v1/datasets/:name');
    const res = await dropRoute.handler(restReq('DELETE', '/api/v1/datasets/to_drop', {}, { name: 'to_drop' }), ctx);
    expect(res.status).toBe(204);

    const getRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name');
    const getRes = await getRoute.handler(restReq('GET', '/api/v1/datasets/to_drop', {}, { name: 'to_drop' }), ctx);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown dataset', async () => {
    const ctx = createCtx(deps, 't1');
    const getRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name');
    const res = await getRoute.handler(restReq('GET', '/api/v1/datasets/nonexistent', {}, { name: 'nonexistent' }), ctx);
    expect(res.status).toBe(404);
  });

  it('isolates tenants', async () => {
    // Tenant A creates a dataset
    const ctxA = createCtx(deps, 'tenant-a');
    const createRoute = findRoute(routes, 'POST', '/api/v1/datasets');
    await createRoute.handler(restReq('POST', '/api/v1/datasets', { name: 'secret_ds', schema: SCHEMA }), ctxA);

    // Tenant B cannot see it
    const ctxB = createCtx(deps, 'tenant-b');
    const getRoute = findRoute(routes, 'GET', '/api/v1/datasets/:name');
    const res = await getRoute.handler(restReq('GET', '/api/v1/datasets/secret_ds', {}, { name: 'secret_ds' }), ctxB);
    expect(res.status).toBe(404);

    // Tenant B's list is empty
    const listRoute = findRoute(routes, 'GET', '/api/v1/datasets');
    const listRes = await listRoute.handler(restReq('GET', '/api/v1/datasets'), ctxB);
    const data = (listRes.body as Record<string, unknown>)['data'] as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns no dataset routes when service is absent', async () => {
    const noSvcDeps = createDeps(parsed);
    const noSvcRoutes = generateRestRoutes(parsed, noSvcDeps);
    const dsRoutes = noSvcRoutes.filter(r => r.pattern.startsWith('/api/v1/datasets'));
    expect(dsRoutes).toHaveLength(0);
  });
});
