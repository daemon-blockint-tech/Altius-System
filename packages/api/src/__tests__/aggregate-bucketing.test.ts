/**
 * Tests for date bucketing exposure over GraphQL and REST.
 *
 * Before this change, the aggregate SDL and REST body had no `buckets`
 * argument — a Chart XY over time could not ask the API to group by month.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { AggregateResult } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Transaction @objectType {
  id: ID! @primary
  amount: Float!
  timestamp: DateTime!
  status: String
}
`;

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1', name: 'Test', email: 'test@test.uk',
    roles: ['admin'], groups: [], tenantId: 'tenant-1',
  };
}

function createMockDeps(schema: ParsedSchema, aggregateResult: AggregateResult): ApiDependencies {
  return {
    schema,
    objectManager: {
      aggregate: vi.fn().mockResolvedValue(aggregateResult),
    } as unknown as ApiDependencies['objectManager'],
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

describe('Aggregate date bucketing over HTTP', () => {
  const schema = parseOdl(ODL);

  it('emits DateBucketInput and BucketInterval in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('enum BucketInterval');
    expect(sdl).toContain('input DateBucketInput');
    expect(sdl).toContain('buckets: [DateBucketInput!]');
  });

  it('GraphQL resolver passes buckets to the aggregate query', async () => {
    const result: AggregateResult = {
      groups: [
        { keys: { timestamp: '2025-01-01T00:00:00.000Z' }, values: { total: 300 } },
        { keys: { timestamp: '2025-02-01T00:00:00.000Z' }, values: { total: 450 } },
      ],
      totalGroups: 2,
    };
    const deps = createMockDeps(schema, result);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Query'] as Record<string, unknown>)['transactionAggregate'] as (parent: unknown, args: unknown, ctx: ResolverContext) => Promise<AggregateResult>;

    await resolver(undefined, {
      fields: [{ field: 'amount', fn: 'SUM', alias: 'total' }],
      buckets: [{ field: 'timestamp', interval: 'MONTH' }],
    }, createCtx(deps));

    const call = (deps.objectManager.aggregate as ReturnType<typeof vi.fn>).mock.calls[0];
    const query = call[1];
    expect(query.buckets).toEqual([{ field: 'timestamp', interval: 'month', alias: undefined }]);
  });

  it('REST route passes buckets to the aggregate query', async () => {
    const result: AggregateResult = { groups: [], totalGroups: 0 };
    const deps = createMockDeps(schema, result);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/transactions/aggregate')!;

    const req: RestRequest = {
      method: 'POST',
      path: '/api/v1/transactions/aggregate',
      params: {},
      query: {},
      body: {
        fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
        buckets: [{ field: 'timestamp', interval: 'month' }],
      },
      user: createMockUser(),
    };

    await route.handler(req, createCtx(deps));

    const call = (deps.objectManager.aggregate as ReturnType<typeof vi.fn>).mock.calls[0];
    const query = call[1];
    expect(query.buckets).toEqual([{ field: 'timestamp', interval: 'month', alias: undefined }]);
  });
});
