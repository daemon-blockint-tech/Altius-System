/**
 * Dataset read/export addressing and shaping, and dataset schema retrieval.
 *
 * Two capabilities are pinned here:
 *
 *  1. `GET /api/v1/datasets/:name/read` must be addressable by branch and
 *     transaction AND shapeable by column projection, filter, sort and page,
 *     with a CSV rendering — the four dimensions a table-export API is judged
 *     on. Before this existed the route parsed only limit/offset/transaction,
 *     so a caller could not project columns or get CSV out of a dataset at all.
 *
 *  2. `GET /api/v1/datasets/:name/schema?version=` must return the schema that
 *     was in force at that version, reconstructed from the schema_change
 *     transaction log. The old implementation returned the CURRENT columns with
 *     the requested version number stamped on it — a wrong answer that reads
 *     like a right one.
 *
 * And on the ontology side, `GET /api/v1/{plural}/export` must be pageable:
 * the row cap without an offset made every row past the cap unreachable.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryDatasetService, InMemoryDatasetMetadataService } from '@altius/storage-memory';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary name: String! }
`;

const TENANT = 't1';

function mockUser(): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId: TENANT };
}

function createDeps(
  schema: ReturnType<typeof parseOdl>,
  extra: Partial<ApiDependencies> = {},
): ApiDependencies {
  return {
    schema,
    objectManager: { query: vi.fn() } as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn((_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
        objs.map(o => ({ data: o, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    ...extra,
  } as ApiDependencies;
}

function ctxFor(deps: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: TENANT, actorId: 'user-1', traceId: 'trace-test' },
    user: mockUser(),
    deps,
  };
}

function req(
  method: string,
  path: string,
  params: Record<string, string> = {},
  query: Record<string, string | string[] | undefined> = {},
  body?: unknown,
): RestRequest {
  return { method, path, params, query, body: body ?? {}, user: mockUser() };
}

function routeFor(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const r = routes.find(x => x.method === method && x.pattern === pattern);
  if (!r) throw new Error(`Route not found: ${method} ${pattern}`);
  return r;
}

const V1 = {
  columns: [
    { name: 'id', type: 'string' as const, nullable: false },
    { name: 'name', type: 'string' as const, nullable: true },
    { name: 'qty', type: 'integer' as const, nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

const V2 = {
  columns: [...V1.columns, { name: 'colour', type: 'string' as const, nullable: true }],
  primaryKey: ['id'],
  version: 2,
};

async function seedDataset(): Promise<{
  routes: ReturnType<typeof generateRestRoutes>;
  ctx: ResolverContext;
  service: InMemoryDatasetService;
}> {
  const parsed = parseOdl(ODL);
  const service = new InMemoryDatasetService();
  const deps = createDeps(parsed, {
    datasetService: service,
    datasetMetadataService: new InMemoryDatasetMetadataService(service),
  });
  const routes = generateRestRoutes(parsed, deps);
  const ctx = ctxFor(deps);

  await routeFor(routes, 'POST', '/api/v1/datasets').handler(
    req('POST', '/api/v1/datasets', {}, {}, { name: 'stock', schema: V1 }),
    ctx,
  );
  await routeFor(routes, 'POST', '/api/v1/datasets/:name/insert').handler(
    req('POST', '/api/v1/datasets/stock/insert', { name: 'stock' }, {}, {
      rows: [
        { id: 'a', name: 'bolt', qty: 5 },
        { id: 'b', name: 'nut', qty: 12 },
        { id: 'c', name: 'washer', qty: 1 },
      ],
    }),
    ctx,
  );
  return { routes, ctx, service };
}

describe('dataset read — projection, filter, sort, CSV', () => {
  it('projects only the requested columns', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/read').handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, { columns: 'id,qty' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const rows = ((res.body as Record<string, unknown>)['data'] as { rows: Record<string, unknown>[] }).rows;
    expect(rows.length).toBe(3);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['id', 'qty']);
  });

  it('rejects a column that is not in the schema', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/read').handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, { columns: 'id,nosuchcol' }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('nosuchcol');
  });

  it('filters and sorts', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/read').handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, {
        filter: JSON.stringify({ qty: { gte: 5 } }),
        orderBy: 'qty:desc',
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const rows = ((res.body as Record<string, unknown>)['data'] as { rows: Record<string, unknown>[] }).rows;
    expect(rows.map(r => r['id'])).toEqual(['b', 'a']);
  });

  it('rejects a malformed filter and an unknown sort column', async () => {
    const { routes, ctx } = await seedDataset();
    const read = routeFor(routes, 'GET', '/api/v1/datasets/:name/read');
    const badFilter = await read.handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, { filter: 'not-json' }),
      ctx,
    );
    expect(badFilter.status).toBe(400);
    const badSort = await read.handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, { orderBy: 'nope:asc' }),
      ctx,
    );
    expect(badSort.status).toBe(400);
  });

  it('renders CSV over the projected columns', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/read').handler(
      req('GET', '/api/v1/datasets/stock/read', { name: 'stock' }, {
        format: 'csv',
        columns: 'id,name',
        orderBy: 'id:asc',
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers?.['Content-Type']).toContain('text/csv');
    expect(res.body).toBe('id,name\na,bolt\nb,nut\nc,washer');
  });

  it('404s on an unknown dataset instead of an empty page', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/read').handler(
      req('GET', '/api/v1/datasets/ghost/read', { name: 'ghost' }, {}),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe('dataset schema retrieval by version and transaction', () => {
  it('returns the historical schema, not the current one with a version stamp', async () => {
    const { routes, ctx } = await seedDataset();
    await routeFor(routes, 'PUT', '/api/v1/datasets/:name/schema').handler(
      req('PUT', '/api/v1/datasets/stock/schema', { name: 'stock' }, {}, { schema: V2 }),
      ctx,
    );

    const get = routeFor(routes, 'GET', '/api/v1/datasets/:name/schema');

    const current = await get.handler(req('GET', '/api/v1/datasets/stock/schema', { name: 'stock' }, {}), ctx);
    expect(current.status).toBe(200);
    const currentSchema = (current.body as Record<string, unknown>)['data'] as typeof V2;
    expect(currentSchema.version).toBe(2);
    expect(currentSchema.columns.map(c => c.name)).toContain('colour');

    const historical = await get.handler(
      req('GET', '/api/v1/datasets/stock/schema', { name: 'stock' }, { version: '1' }),
      ctx,
    );
    expect(historical.status).toBe(200);
    const oldSchema = (historical.body as Record<string, unknown>)['data'] as typeof V1;
    expect(oldSchema.version).toBe(1);
    // The whole point: v1 never had `colour`.
    expect(oldSchema.columns.map(c => c.name)).toEqual(['id', 'name', 'qty']);
  });

  it('resolves the schema as of a transaction id', async () => {
    const { routes, ctx } = await seedDataset();
    await routeFor(routes, 'PUT', '/api/v1/datasets/:name/schema').handler(
      req('PUT', '/api/v1/datasets/stock/schema', { name: 'stock' }, {}, { schema: V2 }),
      ctx,
    );
    const txRes = await routeFor(routes, 'GET', '/api/v1/datasets/:name/transactions').handler(
      req('GET', '/api/v1/datasets/stock/transactions', { name: 'stock' }, {}),
      ctx,
    );
    const txs = (txRes.body as Record<string, unknown>)['data'] as { id: string; type: string }[];
    const schemaTx = txs.find(t => t.type === 'schema_change');
    expect(schemaTx).toBeDefined();

    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/schema').handler(
      req('GET', '/api/v1/datasets/stock/schema', { name: 'stock' }, { asOfTransactionId: schemaTx!.id }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(((res.body as Record<string, unknown>)['data'] as typeof V2).version).toBe(2);
  });

  it('404s for a version that never existed and 400s on a non-numeric one', async () => {
    const { routes, ctx } = await seedDataset();
    const get = routeFor(routes, 'GET', '/api/v1/datasets/:name/schema');
    const missing = await get.handler(
      req('GET', '/api/v1/datasets/stock/schema', { name: 'stock' }, { version: '99' }),
      ctx,
    );
    expect(missing.status).toBe(404);
    const bad = await get.handler(
      req('GET', '/api/v1/datasets/stock/schema', { name: 'stock' }, { version: 'abc' }),
      ctx,
    );
    expect(bad.status).toBe(400);
  });

  it('reports rowCount through the metadata route', async () => {
    const { routes, ctx } = await seedDataset();
    const res = await routeFor(routes, 'GET', '/api/v1/datasets/:name/metadata').handler(
      req('GET', '/api/v1/datasets/stock/metadata', { name: 'stock' }, {}),
      ctx,
    );
    expect(res.status).toBe(200);
    const md = (res.body as Record<string, unknown>)['data'] as { rowCount: number; latestTransactionId: string };
    expect(md.rowCount).toBe(3);
    expect(md.latestTransactionId).toBeTruthy();
  });
});

describe('object export paging and projection', () => {
  const parsed = parseOdl(ODL);

  function exportDeps(items: Record<string, unknown>[]): ApiDependencies {
    return createDeps(parsed, {
      objectManager: {
        query: vi.fn().mockResolvedValue({ items, totalCount: items.length, hasNextPage: false }),
      } as never,
    });
  }

  function widget(id: string): Record<string, unknown> {
    return { _id: id, _type: 'Widget', _version: 1, id, name: `w-${id}` };
  }

  it('passes ?offset= through to storage and advertises the next page', async () => {
    const deps = exportDeps([widget('1'), widget('2'), widget('3')]);
    const routes = generateRestRoutes(parsed, deps);
    const res = await routeFor(routes, 'GET', '/api/v1/widgets/export').handler(
      req('GET', '/api/v1/widgets/export', {}, { limit: '2', offset: '10' }),
      ctxFor(deps),
    );
    expect(res.status).toBe(200);
    const queryMock = deps.objectManager.query as ReturnType<typeof vi.fn>;
    expect(queryMock.mock.calls[0]?.[2]).toMatchObject({ offset: 10, limit: 3 });
    expect(res.headers?.['X-Export-Offset']).toBe('10');
    expect(res.headers?.['X-Export-Truncated']).toBe('true');
    expect(res.headers?.['X-Export-Next-Offset']).toBe('12');
  });

  it('omits the next-page cursor on the last page', async () => {
    const deps = exportDeps([widget('1')]);
    const routes = generateRestRoutes(parsed, deps);
    const res = await routeFor(routes, 'GET', '/api/v1/widgets/export').handler(
      req('GET', '/api/v1/widgets/export', {}, { limit: '2' }),
      ctxFor(deps),
    );
    expect(res.headers?.['X-Export-Truncated']).toBe('false');
    expect(res.headers?.['X-Export-Next-Offset']).toBeUndefined();
  });

  it('projects export columns and rejects unknown ones', async () => {
    const deps = exportDeps([widget('1')]);
    const routes = generateRestRoutes(parsed, deps);
    const route = routeFor(routes, 'GET', '/api/v1/widgets/export');

    const ok = await route.handler(
      req('GET', '/api/v1/widgets/export', {}, { format: 'csv', columns: 'id,_version' }),
      ctxFor(deps),
    );
    expect(ok.status).toBe(200);
    expect((ok.body as string).split('\n')[0]).toBe('id,_version');

    const bad = await route.handler(
      req('GET', '/api/v1/widgets/export', {}, { columns: 'id,secretField' }),
      ctxFor(deps),
    );
    expect(bad.status).toBe(400);
  });

  it('rejects a negative offset', async () => {
    const deps = exportDeps([widget('1')]);
    const routes = generateRestRoutes(parsed, deps);
    const res = await routeFor(routes, 'GET', '/api/v1/widgets/export').handler(
      req('GET', '/api/v1/widgets/export', {}, { offset: '-5' }),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
  });
});
