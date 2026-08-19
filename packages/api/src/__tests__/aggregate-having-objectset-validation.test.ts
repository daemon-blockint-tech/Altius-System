/**
 * REST surface for the extended aggregation grammar, and input validation on
 * saved object sets.
 *
 * Three gaps are closed here:
 *
 *  1. HAVING and PERCENTILE existed in neither the REST body nor the SPI, so
 *     "regions whose total exceeds X" — the core pivot question — had no
 *     expression short of fetching every group and filtering client-side.
 *  2. POST /api/v1/object-sets took its body on trust. A set naming a type or
 *     field that does not exist was accepted, and only failed later, on
 *     someone else's execute request.
 *  3. The object-set aggregate route checked field VISIBILITY but never
 *     field EXISTENCE, so a saved aggregation over a dropped field returned a
 *     null group on memory and raised on Postgres.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';
import type { AggregateQuery, ObjectSetDefinition } from '@altius/spi';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Sale @objectType {
  id: ID! @primary
  region: String @indexed
  amount: Int
}
`;

const TENANT = 't1';

function user(): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'T', email: 't@t.uk', roles: ['admin'], groups: ['team-a'], tenantId: TENANT };
}

function ctxFor(deps: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: TENANT, actorId: 'user-1', actorGroups: ['team-a'], traceId: 'trace' },
    user: user(),
    deps,
  };
}

function req(method: string, path: string, body?: unknown, params: Record<string, string> = {}): RestRequest {
  return { method, path, params, query: {}, body: body ?? {}, user: user() };
}

function routeFor(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const r = routes.find(x => x.method === method && x.pattern === pattern);
  if (!r) throw new Error(`Route not found: ${method} ${pattern}`);
  return r;
}

function baseDeps(extra: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    schema: parseOdl(ODL),
    objectManager: {
      aggregate: vi.fn().mockResolvedValue({ groups: [], totalGroups: 0 }),
      query: vi.fn().mockResolvedValue({ items: [], totalCount: 0, hasNextPage: false }),
    } as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
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

describe('POST /api/v1/sales/aggregate — having and percentile', () => {
  it('passes a validated HAVING clause and percentile fraction to the ObjectManager', async () => {
    const deps = baseDeps();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'POST', '/api/v1/sales/aggregate').handler(
      req('POST', '/api/v1/sales/aggregate', {
        fields: [
          { field: 'amount', fn: 'sum', alias: 'total' },
          { field: 'amount', fn: 'percentile', percentile: 0.95, alias: 'p95' },
        ],
        groupBy: ['region'],
        having: [{ alias: 'total', operator: 'GTE', value: 100 }],
      }),
      ctxFor(deps),
    );
    expect(res.status).toBe(200);
    const query = (deps.objectManager.aggregate as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as AggregateQuery;
    expect(query.having).toEqual([{ alias: 'total', operator: 'gte', value: 100 }]);
    expect(query.fields).toEqual([
      { field: 'amount', fn: 'sum', alias: 'total' },
      { field: 'amount', fn: 'percentile', alias: 'p95', percentile: 0.95 },
    ]);
  });

  it('refuses a HAVING alias that is not one of the requested aggregates', async () => {
    const deps = baseDeps();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'POST', '/api/v1/sales/aggregate').handler(
      req('POST', '/api/v1/sales/aggregate', {
        fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
        groupBy: ['region'],
        having: [{ alias: 'typo', operator: 'gte', value: 1 }],
      }),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('typo');
    expect(deps.objectManager.aggregate).not.toHaveBeenCalled();
  });

  it('refuses an unknown HAVING operator and a non-numeric value', async () => {
    const deps = baseDeps();
    const routes = generateRestRoutes(deps.schema, deps);
    const route = routeFor(routes, 'POST', '/api/v1/sales/aggregate');
    const badOp = await route.handler(
      req('POST', '/api/v1/sales/aggregate', {
        fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
        having: [{ alias: 'total', operator: 'between', value: 1 }],
      }),
      ctxFor(deps),
    );
    expect(badOp.status).toBe(400);
    const badValue = await route.handler(
      req('POST', '/api/v1/sales/aggregate', {
        fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
        having: [{ alias: 'total', operator: 'gte', value: 'lots' }],
      }),
      ctxFor(deps),
    );
    expect(badValue.status).toBe(400);
  });

  it('accepts a null HAVING value for an is-null comparison', async () => {
    const deps = baseDeps();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'POST', '/api/v1/sales/aggregate').handler(
      req('POST', '/api/v1/sales/aggregate', {
        fields: [{ field: 'amount', fn: 'stddev', alias: 'sd' }],
        groupBy: ['region'],
        having: [{ alias: 'sd', operator: 'ne', value: null }],
      }),
      ctxFor(deps),
    );
    expect(res.status).toBe(200);
    const query = (deps.objectManager.aggregate as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as AggregateQuery;
    expect(query.having).toEqual([{ alias: 'sd', operator: 'ne', value: null }]);
  });
});

describe('POST /api/v1/object-sets — input validation', () => {
  function withStore(): { deps: ApiDependencies; created: ObjectSetDefinition[] } {
    const created: ObjectSetDefinition[] = [];
    const deps = baseDeps({
      objectSetManager: {
        create: vi.fn(async (def: Omit<ObjectSetDefinition, 'id' | 'createdAt' | 'updatedAt'>) => {
          const full = { ...def, id: `os-${created.length + 1}`, createdAt: 'now', updatedAt: 'now' } as ObjectSetDefinition;
          created.push(full);
          return full;
        }),
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        update: vi.fn(async (_id: string, updates: Record<string, unknown>) => ({ ...created[0], ...updates })),
        delete: vi.fn(),
      } as never,
    });
    return { deps, created };
  }

  it('accepts a well-formed set and records its sharing lists', async () => {
    const { deps, created } = withStore();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'POST', '/api/v1/object-sets').handler(
      req('POST', '/api/v1/object-sets', {
        name: 'big-sales',
        objectType: 'Sale',
        filter: { field: 'amount', operator: 'gt', value: 100 },
        orderBy: [{ field: 'amount', direction: 'desc' }],
        limit: 10,
        sharedWithUsers: ['mate'],
        sharedWithGroups: ['team-a'],
      }),
      ctxFor(deps),
    );
    expect(res.status).toBe(201);
    expect(created[0]!.sharedWithUsers).toEqual(['mate']);
    const body = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(body['sharedWithGroups']).toEqual(['team-a']);
  });

  it.each([
    ['a missing name', { objectType: 'Sale' }],
    ['a blank name', { name: '   ', objectType: 'Sale' }],
    ['an unknown object type', { name: 'x', objectType: 'Ghost' }],
    ['an unknown filter field', { name: 'x', objectType: 'Sale', filter: { field: 'nope', operator: 'eq', value: 1 } }],
    ['an unknown sort field', { name: 'x', objectType: 'Sale', orderBy: [{ field: 'nope', direction: 'asc' }] }],
    ['a bad sort direction', { name: 'x', objectType: 'Sale', orderBy: [{ field: 'amount', direction: 'sideways' }] }],
    ['a non-positive limit', { name: 'x', objectType: 'Sale', limit: 0 }],
    ['a non-boolean isPublic', { name: 'x', objectType: 'Sale', isPublic: 'yes' }],
    ['a non-array share list', { name: 'x', objectType: 'Sale', sharedWithUsers: 'mate' }],
    ['an unknown aggregation field', { name: 'x', objectType: 'Sale', aggregation: { fields: [{ field: 'nope', fn: 'sum' }] } }],
  ])('rejects %s', async (_label, body) => {
    const { deps } = withStore();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'POST', '/api/v1/object-sets').handler(
      req('POST', '/api/v1/object-sets', body),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
    expect(deps.objectSetManager!.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed share list on update', async () => {
    const { deps } = withStore();
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'PUT', '/api/v1/object-sets/:id').handler(
      req('PUT', '/api/v1/object-sets/os-1', { sharedWithGroups: [''] }, { id: 'os-1' }),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/object-sets/:id/aggregate — field existence', () => {
  it('refuses a saved aggregation over a field the schema does not have', async () => {
    const def: ObjectSetDefinition = {
      id: 'os-1',
      name: 'stale',
      objectType: 'Sale',
      aggregation: { fields: [{ field: 'droppedColumn', fn: 'sum', alias: 'total' }] },
      createdBy: 'user-1',
      createdAt: 'now',
      updatedAt: 'now',
      isPublic: true,
      tenantId: TENANT,
    };
    const deps = baseDeps({
      objectSetManager: { get: vi.fn().mockResolvedValue(def) } as never,
    });
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'GET', '/api/v1/object-sets/:id/aggregate').handler(
      req('GET', '/api/v1/object-sets/os-1/aggregate', {}, { id: 'os-1' }),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('droppedColumn');
    expect(deps.objectManager.aggregate).not.toHaveBeenCalled();
  });

  it('still runs a saved aggregation over real fields', async () => {
    const def: ObjectSetDefinition = {
      id: 'os-2',
      name: 'good',
      objectType: 'Sale',
      aggregation: { fields: [{ field: 'amount', fn: 'sum', alias: 'total' }], groupBy: ['region'] },
      createdBy: 'user-1',
      createdAt: 'now',
      updatedAt: 'now',
      isPublic: true,
      tenantId: TENANT,
    };
    const deps = baseDeps({
      objectSetManager: { get: vi.fn().mockResolvedValue(def) } as never,
    });
    const routes = generateRestRoutes(deps.schema, deps);
    const res = await routeFor(routes, 'GET', '/api/v1/object-sets/:id/aggregate').handler(
      req('GET', '/api/v1/object-sets/os-2/aggregate', {}, { id: 'os-2' }),
      ctxFor(deps),
    );
    expect(res.status).toBe(200);
    expect(deps.objectManager.aggregate).toHaveBeenCalled();
  });
});
