/**
 * An aggregate over a field the type does not have must be refused, not guessed.
 *
 * `AggregateFieldInput.field` is an unvalidated string and nothing checked it
 * against the schema, so the two providers disagreed on the same request:
 * Postgres builds SUM("no_such_column") and raises, while the memory provider
 * finds nothing and returns a null group — a silent wrong answer that looks
 * like real data. @computed fields hit the same path: they are query-time
 * values with no stored column.
 */

import { describe, it, expect, vi } from 'vitest';
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
  doubled: Float @computed(fn: "sumLinks", args: { linkType: "X", field: "value" })
}
`;

const schema = parseOdl(ODL);
const aggregate = vi.fn(async () => ({ groups: [], totalGroups: 0 }));

const deps = {
  schema,
  objectManager: { aggregate, query: vi.fn(), get: vi.fn() },
  linkManager: {},
  authorizationService: {
    check: async () => true,
    listObjects: async () => ['reading:r-1'],
    // No field-permission config — the redaction guard is inactive, which is
    // exactly when an unknown field used to reach storage unchallenged.
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

function aggregateRoute(): RestRoute {
  const route = generateRestRoutes(schema, deps).find(
    r => r.method === 'POST' && r.pattern.endsWith('/aggregate'),
  );
  if (!route) throw new Error('no aggregate route generated');
  return route;
}

async function post(body: unknown) {
  return aggregateRoute().handler(
    {
      method: 'POST',
      path: '/api/v1/readings/aggregate',
      params: {},
      query: {},
      body,
      user: ctx.user,
    } as never,
    ctx,
  );
}

describe('aggregate field validation', () => {
  it('refuses a field the type does not have, instead of asking storage', async () => {
    aggregate.mockClear();

    const res = await post({ fields: [{ field: 'no_such_column', fn: 'sum' }] });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('no_such_column');
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('refuses a computed field, which has no stored value to aggregate', async () => {
    aggregate.mockClear();

    const res = await post({ fields: [{ field: 'doubled', fn: 'sum' }] });

    expect(res.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('refuses an unknown groupBy as well as an unknown aggregate field', async () => {
    const res = await post({ fields: [{ field: 'value', fn: 'sum' }], groupBy: ['nope'] });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('nope');
  });

  it('still aggregates a real stored field', async () => {
    aggregate.mockClear();

    const res = await post({ fields: [{ field: 'value', fn: 'sum' }], groupBy: ['ward'] });

    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalled();
  });
});
