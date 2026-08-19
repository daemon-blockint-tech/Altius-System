/**
 * Fase 24 REST route integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import {
  InMemoryDatasetService,
  InMemoryDatasetMetadataService,
  InMemoryBatchTransformService,
  InMemorySqlQueryService,
  InMemoryDataExpectationsService,
  InMemoryRulesEngineService,
  InMemoryPipelineService,
  InMemorySyncCdcService,
  InMemoryDatasourceService,
  InMemoryBuildTriggerService,
  InMemoryPipelineBuildService,
  InMemorySqlAnalyticsService,
  InMemoryVariableTransformService,
  InMemoryOntologySqlService,
} from '@altius/storage-memory';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

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
  const datasets = new InMemoryDatasetService();
  return {
    schema,
    objectManager,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: { check: vi.fn().mockResolvedValue(true), listObjects: vi.fn().mockResolvedValue(['*']), getVisibleFields: vi.fn(), redactFields: vi.fn(), redactFieldsBatch: vi.fn() } as never,
    authenticator: {} as never,
    storage: {} as never,
    datasetService: datasets,
    datasetMetadataService: new InMemoryDatasetMetadataService(datasets),
    batchTransformService: new InMemoryBatchTransformService(datasets),
    sqlQueryService: new InMemorySqlQueryService(datasets),
    dataExpectationsService: new InMemoryDataExpectationsService(),
    rulesEngineService: new InMemoryRulesEngineService(),
    pipelineService: new InMemoryPipelineService(),
    syncCdcService: new InMemorySyncCdcService(),
    datasourceService: new InMemoryDatasourceService(),
    buildTriggerService: new InMemoryBuildTriggerService(),
    pipelineBuildService: new InMemoryPipelineBuildService(),
    sqlAnalyticsService: new InMemorySqlAnalyticsService(),
    variableTransformService: new InMemoryVariableTransformService(),
    ontologySqlService: new InMemoryOntologySqlService(async () => []),
  } as ApiDependencies;
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Fase 24 REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = createDeps(parsed);
  const routes = generateRestRoutes(parsed, deps);

  it('registers dataset export route', () => {
    expect(findRoute(routes, 'GET', '/api/v1/datasets/:name/export')).toBeTruthy();
  });

  it('registers batch transform routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/transforms')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/transforms/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/transforms/:id/run')).toBeTruthy();
  });

  it('registers interactive SQL routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/sql/query')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/sql/explain')).toBeTruthy();
  });

  it('registers pipeline routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/pipelines')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/pipelines/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/pipelines/:id/run')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/pipelines/:id/runs')).toBeTruthy();
  });

  it('registers expectations and rules routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/expectations')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/expectations/:id/run')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/rules')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/rules/:id/run')).toBeTruthy();
  });

  it('registers variable transform, analytics, CDC, datasource and build routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/variables/transform')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/variables/transforms')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/sql/analytics')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/sync/cdc')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/sync/cdc/:id/commits')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/sync/cdc/:id/apply')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/datasources')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/datasources/:id/map')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/datasources/:id/sync')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/builds')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/builds')).toBeTruthy();
  });

  it('creates and runs a pipeline', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const create = findRoute(routes, 'POST', '/api/v1/pipelines');
    const cRes = await create.handler(restReq('POST', '/api/v1/pipelines', { name: 'etl', nodes: [] }), ctx);
    expect(cRes.status).toBe(201);
    const p = (cRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    const id = String(p['id']);

    const run = findRoute(routes, 'POST', '/api/v1/pipelines/:id/run');
    const rRes = await run.handler(restReq('POST', `/api/v1/pipelines/${id}/run`, {}, { id }), ctx);
    expect(rRes.status).toBe(200);
  });

  it('creates a datasource, maps, and syncs', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const create = findRoute(routes, 'POST', '/api/v1/datasources');
    const cRes = await create.handler(restReq('POST', '/api/v1/datasources', { name: 'src', connector: 'csv', connection: {}, objectType: 'Patient' }), ctx);
    expect(cRes.status).toBe(201);
    const id = String((cRes.body as { data: { id: string } }).data.id);

    const map = findRoute(routes, 'POST', '/api/v1/datasources/:id/map');
    const mRes = await map.handler(restReq('POST', `/api/v1/datasources/${id}/map`, { mappings: [{ column: 'name', property: 'name' }] }, { id }), ctx);
    expect(mRes.status).toBe(200);

    const sync = findRoute(routes, 'POST', '/api/v1/datasources/:id/sync');
    const sRes = await sync.handler(restReq('POST', `/api/v1/datasources/${id}/sync`, {}, { id }), ctx);
    expect(sRes.status).toBe(200);
  });

  it('exports a dataset to CSV', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    await ctx.deps.datasetService?.create(ctx.requestContext, {
      name: 'sample',
      schema: { columns: [{ name: 'id', type: 'string', nullable: false }, { name: 'name', type: 'string', nullable: false }], version: 1 },
    });
    await ctx.deps.datasetService?.insert(ctx.requestContext, 'sample', { rows: [{ id: '1', name: 'Alice' }] });
    const route = findRoute(routes, 'GET', '/api/v1/datasets/:name/export');
    const res = await route.handler(restReq('GET', '/api/v1/datasets/sample/export', undefined, { name: 'sample' }, { format: 'csv' }), ctx);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
  });
});
