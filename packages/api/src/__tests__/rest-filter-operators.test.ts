/**
 * REST list filtering and sorting must reach the same operator set GraphQL has.
 *
 * parseQueryFilter hardcoded `operator: 'eq'` for every filter[...] param, so
 * half the platform's own surface could not express a date range, a numeric
 * comparison, a substring match or a set membership — the rich operator set
 * was GraphQL-only. Worse, Express's qs parser turns `filter[amount][gt]=5`
 * into a nested object, which the old code passed through as
 * `{field:'amount', operator:'eq', value:{gt:'5'}}` — a predicate comparing a
 * column against an object, silently, rather than an error.
 *
 * Sorting was documented but absent: openapi.ts advertises `sort` and `order`
 * query params on GET /api/v1/{plural} that the handler never read, so a
 * client following the published contract got an arbitrary order and no
 * indication it had been ignored.
 *
 * Field names are checked against the schema for the same reason the aggregate
 * route checks them: the providers disagree on an unknown column (Postgres
 * raises, memory returns nothing), so an unvalidated name is a silent wrong
 * answer on one backend.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { RestRoute } from '../rest/types.js';
import type { ResolverContext } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Reading @objectType {
  id: ID! @primary
  ward: String
  value: Float
  recordedAt: DateTime
  doubled: Float @computed(fn: "sumLinks", args: { linkType: "X", field: "value" })
}
`;

const schema = parseOdl(ODL);
const query = vi.fn(async (..._args: unknown[]) => ({ items: [], totalCount: 0 }));

const deps = {
  schema,
  objectManager: { query, aggregate: vi.fn(), get: vi.fn() },
  linkManager: {},
  authorizationService: {
    check: async () => true,
    listObjects: async () => ['*'],
    // No field-permission policy configured — the redaction guard is inactive,
    // which is exactly when an unvalidated name used to reach storage.
    getVisibleFields: () => undefined,
    redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
    redactFieldsBatch: (_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] })),
    clearFieldCache: () => {},
  },
} as unknown as ResolverContext['deps'];

const ctx = {
  user: { id: 'u-1', tenantId: 't-1', roles: ['analyst'] },
  requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
  deps,
} as unknown as ResolverContext;

function listRoute(): RestRoute {
  const route = generateRestRoutes(schema, deps).find(
    r => r.method === 'GET' && r.pattern === '/api/v1/readings',
  );
  if (!route) throw new Error('no list route generated');
  return route;
}

async function get(q: Record<string, unknown>) {
  return listRoute().handler(
    {
      method: 'GET',
      path: '/api/v1/readings',
      params: {},
      // Shaped like Express's qs output, which nests filter[a][gt] into
      // objects — wider than the declared string|string[] request type.
      query: q as Record<string, string | string[] | undefined>,
      body: undefined,
      user: ctx.user,
    },
    ctx,
  );
}

/**
 * The caller-supplied half of the FilterExpression handed to storage.
 *
 * The route always ANDs the parsed filter behind an authorization predicate
 * (`_deleted_at exists false` when every object is authorized, an `_id in […]`
 * otherwise), so the user's filter is the second conjunct.
 */
function filterArg() {
  const combined = query.mock.calls[0]?.[1] as
    | { and?: unknown[]; field?: string }
    | undefined;
  if (combined?.and) return combined.and[1];
  // No caller filter — the route passed the bare authorization predicate.
  return undefined;
}

/** The QueryOptions the route handed to storage. */
function optionsArg() {
  return query.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
}

beforeEach(() => query.mockClear());

describe('REST list filter operators', () => {
  it('still treats filter[field]=value as equality', async () => {
    const res = await get({ filter: { ward: 'ICU' } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({ field: 'ward', operator: 'eq', value: 'ICU' });
  });

  it.each([
    ['gt', 'gt'],
    ['gte', 'gte'],
    ['lt', 'lt'],
    ['lte', 'lte'],
    ['ne', 'neq'],
    ['contains', 'contains'],
    ['startsWith', 'startsWith'],
  ])('maps filter[field][%s] onto the SPI %s operator', async (wire, spi) => {
    const res = await get({ filter: { ward: { [wire]: 'ICU' } } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({ field: 'ward', operator: spi, value: 'ICU' });
  });

  it('supports a numeric range as two predicates', async () => {
    const res = await get({ filter: { value: { gte: '10', lte: '20' } } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({
      and: [
        { field: 'value', operator: 'gte', value: '10' },
        { field: 'value', operator: 'lte', value: '20' },
      ],
    });
  });

  it('splits filter[field][in] on commas', async () => {
    const res = await get({ filter: { ward: { in: 'ICU,ED' } } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({ field: 'ward', operator: 'in', value: ['ICU', 'ED'] });
  });

  it('reads filter[field][exists] as a boolean, not the string "false"', async () => {
    const res = await get({ filter: { ward: { exists: 'false' } } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({ field: 'ward', operator: 'exists', value: false });
  });

  it('turns a repeated param into a set membership rather than dropping all but the first', async () => {
    const res = await get({ filter: { ward: ['ICU', 'ED'] } });
    expect(res.status).toBe(200);
    expect(filterArg()).toEqual({ field: 'ward', operator: 'in', value: ['ICU', 'ED'] });
  });

  it('refuses an unknown operator instead of silently dropping the predicate', async () => {
    const res = await get({ filter: { value: { bogus: '1' } } });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a filter on a field the type does not have', async () => {
    const res = await get({ filter: { nosuchfield: 'x' } });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a filter on a computed field, which has no stored column', async () => {
    const res = await get({ filter: { doubled: { gt: '1' } } });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('REST list sorting', () => {
  it('passes sort and order through as orderBy', async () => {
    const res = await get({ sort: 'recordedAt', order: 'desc' });
    expect(res.status).toBe(200);
    expect(optionsArg()?.['orderBy']).toEqual([{ field: 'recordedAt', direction: 'desc' }]);
  });

  it('defaults to ascending when order is omitted', async () => {
    const res = await get({ sort: 'value' });
    expect(res.status).toBe(200);
    expect(optionsArg()?.['orderBy']).toEqual([{ field: 'value', direction: 'asc' }]);
  });

  it('sends no orderBy when sort is omitted', async () => {
    const res = await get({});
    expect(res.status).toBe(200);
    expect(optionsArg()?.['orderBy']).toBeUndefined();
  });

  it('refuses a sort on a field the type does not have', async () => {
    const res = await get({ sort: 'nosuchfield' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a sort on a computed field', async () => {
    const res = await get({ sort: 'doubled' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an order that is neither asc nor desc', async () => {
    const res = await get({ sort: 'value', order: 'sideways' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
