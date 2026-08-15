/**
 * Aggregate orderBy on a measure alias — the core pivot operation — must be
 * accepted on REST and GraphQL, not rejected as an "unknown field".
 *
 * The field-name validation guard (added in 9504d9c) folded orderBy field names
 * into the same schema-field check as aggregate fields and groupBy keys. An
 * aggregate alias is never a schema field, so "top N groups by the measure"
 * was rejected even though both storage providers implement it.
 *
 * Also covers: GraphQL aggregate now accepts orderBy/limit/offset (previously
 * SDL-only without those args), and the object-set aggregate route now applies
 * the consent gate (previously skipped).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import type { ObjectSetDefinition, AggregateResult } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import { generateResolvers } from '../graphql/resolver-generator.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Reading @objectType {
  id: ID! @primary
  ward: String
  value: Float
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'u-1', name: 'Test', email: 't@t.io',
  roles: ['analyst'], groups: [], tenantId: 't-1',
};

const REQ_CTX = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' };

const AGG_RESULT: AggregateResult = {
  groups: [
    { keys: { ward: 'B' }, values: { total: 9 } },
    { keys: { ward: 'A' }, values: { total: 6 } },
  ],
  totalGroups: 2,
};

function makeDeps(
  schema: ParsedSchema,
  aggregateImpl: ReturnType<typeof vi.fn>,
  overrides: Partial<ApiDependencies> = {},
): ApiDependencies {
  return {
    schema,
    objectManager: {
      aggregate: aggregateImpl,
      query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: () => undefined,
      redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
      redactFieldsBatch: (_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] })),
      clearFieldCache: () => {},
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: undefined,
    auditWriter: undefined,
    storage: {} as unknown as ApiDependencies['storage'],
    ...overrides,
  } as unknown as ApiDependencies;
}

function restCtx(deps: ApiDependencies): ResolverContext {
  return { user: USER, requestContext: REQ_CTX, deps } as unknown as ResolverContext;
}

describe('aggregate orderBy on alias — REST', () => {
  let schema: ParsedSchema;
  beforeAll(() => { schema = parseOdl(ODL); });

  it('accepts orderBy on an explicit aggregate alias', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const deps = makeDeps(schema, aggregate);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'POST' && r.pattern.endsWith('/aggregate'),
    )!;
    const res = await route.handler(
      { method: 'POST', path: '/api/v1/readings/aggregate', params: {}, query: {}, body: {
        fields: [{ field: 'value', fn: 'sum', alias: 'total' }],
        groupBy: ['ward'],
        orderBy: [{ field: 'total', direction: 'desc' }],
        limit: 5,
      }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalled();
    const q = aggregate.mock.calls[0]![1];
    expect(q.orderBy).toEqual([{ field: 'total', direction: 'desc' }]);
    expect(q.limit).toBe(5);
  });

  it('accepts orderBy on the default aggregate alias (sum_value)', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const deps = makeDeps(schema, aggregate);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'POST' && r.pattern.endsWith('/aggregate'),
    )!;
    const res = await route.handler(
      { method: 'POST', path: '/api/v1/readings/aggregate', params: {}, query: {}, body: {
        fields: [{ field: 'value', fn: 'sum' }],
        groupBy: ['ward'],
        orderBy: [{ field: 'sum_value', direction: 'desc' }],
      }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalled();
  });

  it('still rejects orderBy on a truly unknown field', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const deps = makeDeps(schema, aggregate);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'POST' && r.pattern.endsWith('/aggregate'),
    )!;
    const res = await route.handler(
      { method: 'POST', path: '/api/v1/readings/aggregate', params: {}, query: {}, body: {
        fields: [{ field: 'value', fn: 'sum', alias: 'total' }],
        groupBy: ['ward'],
        orderBy: [{ field: 'nope', direction: 'desc' }],
      }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('nope');
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe('aggregate orderBy/limit/offset — GraphQL', () => {
  let schema: ParsedSchema;
  beforeAll(() => { schema = parseOdl(ODL); });

  async function callAggregateResolver(deps: ApiDependencies, args: Record<string, unknown>) {
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = resolvers['Query']!['readingAggregate'] as (
      parent: unknown, args: Record<string, unknown>, ctx: ResolverContext,
    ) => Promise<AggregateResult>;
    return resolver(undefined, args, restCtx(deps));
  }

  it('accepts orderBy on an aggregate alias and passes it through', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const deps = makeDeps(schema, aggregate);
    await callAggregateResolver(deps, {
      fields: [{ field: 'value', fn: 'SUM', alias: 'total' }],
      groupBy: ['ward'],
      orderBy: [{ field: 'total', direction: 'desc' }],
      limit: 5,
      offset: 0,
    });
    expect(aggregate).toHaveBeenCalled();
    const q = aggregate.mock.calls[0]![1];
    expect(q.orderBy).toEqual([{ field: 'total', direction: 'desc' }]);
    expect(q.limit).toBe(5);
    expect(q.offset).toBe(0);
  });

  it('rejects an unknown field in GraphQL aggregate (field validation parity with REST)', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const deps = makeDeps(schema, aggregate);
    await expect(callAggregateResolver(deps, {
      fields: [{ field: 'no_such_column', fn: 'SUM' }],
      groupBy: ['ward'],
    })).rejects.toThrow();
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe('object-set aggregate — consent gate', () => {
  let schema: ParsedSchema;
  beforeAll(() => { schema = parseOdl(ODL); });

  function savedSet(overrides: Partial<ObjectSetDefinition>): ObjectSetDefinition {
    return {
      id: 'os-1', name: 'set', objectType: 'Reading',
      createdBy: USER.id, createdAt: '2025-01-01T00:00:00Z' as never,
      updatedAt: '2025-01-01T00:00:00Z' as never,
      isPublic: false, tenantId: 't-1',
      aggregation: {
        fields: [{ field: 'value', fn: 'sum' as never, alias: 'total' }],
        groupBy: ['ward'],
      },
      ...overrides,
    } as ObjectSetDefinition;
  }

  it('applies the consent gate and returns empty when no records are consented', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    // consentService that denies everything
    const consentService = {
      filterList: vi.fn().mockResolvedValue({ edges: [], denied: [] }),
      checkConsent: vi.fn().mockResolvedValue(false),
      recordConsent: vi.fn(),
      revokeConsent: vi.fn(),
    } as unknown as ApiDependencies['consentService'];
    const objectSetManager = {
      get: vi.fn().mockResolvedValue(savedSet({})),
    } as unknown as ApiDependencies['objectSetManager'];
    // Make the type a consent subject so the gate fires
    const deps = makeDeps(schema, aggregate, {
      consentService,
      objectSetManager,
      consentSubjectTypes: ['Reading'],
    });
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'GET' && r.pattern === '/api/v1/object-sets/:id/aggregate',
    )!;
    const res = await route.handler(
      { method: 'GET', path: '/api/v1/object-sets/os-1/aggregate', params: { id: 'os-1' }, query: {}, body: undefined, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    expect((res.body as { data: AggregateResult }).data.groups).toEqual([]);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('runs the aggregation when consent is granted', async () => {
    const aggregate = vi.fn().mockResolvedValue(AGG_RESULT);
    const consentService = {
      filterList: vi.fn().mockImplementation((items: { _id: string }[]) => ({
        edges: items,
        denied: [],
      })),
      checkConsent: vi.fn().mockResolvedValue(true),
      recordConsent: vi.fn(),
      revokeConsent: vi.fn(),
    } as unknown as ApiDependencies['consentService'];
    const objectSetManager = {
      get: vi.fn().mockResolvedValue(savedSet({})),
    } as unknown as ApiDependencies['objectSetManager'];
    // objectManager.query must return items so consent can filter them
    const objectManager = {
      aggregate,
      query: vi.fn().mockResolvedValue({ items: [{ _id: 'r-1', ward: 'A', value: 1 }], totalCount: 1 }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'];
    const deps = makeDeps(schema, aggregate, {
      consentService,
      objectSetManager,
      objectManager,
      consentSubjectTypes: ['Reading'],
    });
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'GET' && r.pattern === '/api/v1/object-sets/:id/aggregate',
    )!;
    const res = await route.handler(
      { method: 'GET', path: '/api/v1/object-sets/os-1/aggregate', params: { id: 'os-1' }, query: {}, body: undefined, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalled();
  });
});
