/**
 * `aggregate_<Type>`: grouped aggregation for agents, and what it refuses.
 *
 * Every human surface exposes the provider's aggregate; an agent could only
 * page rows through `search_<Type>` and count them itself, which silently
 * stops at the search limit — so "how many patients are active" came back
 * wrong on any real dataset, in the direction that looks like an answer.
 *
 * Exposing it is the easy half. The hard half is that an aggregate has no
 * per-row output to filter afterwards, so every control has to constrain the
 * INPUT: FGA scope and consent narrow the id set before grouping, a redacted
 * field cannot become a group key (group keys ARE the values), and an unknown
 * field is refused rather than left to the two providers to disagree over.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { invokeTool, buildToolList } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  status: String
  age: Int
  name: String @sensitive
  displayName: String @computed(expression: "name")
}
type Ward @objectType { id: ID! @primary  name: String }
`);

const caller: McpCaller = {
  user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'], name: 'U' },
  requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
} as unknown as McpCaller;

interface DepsOptions {
  /** FGA: '*' for unrestricted, otherwise the authorised ids. */
  allowed?: string[];
  /** Field policy; omit for "no field policy configured". */
  visibleFields?: string[];
  consentSubjectTypes?: string[];
  consentDenied?: string[];
  /** Rows the consent scan sees. */
  rows?: { _id: string; _type: string }[];
  aggregateResult?: { groups: unknown[]; totalGroups: number };
  aggregateThrows?: string;
}

function makeDeps(o: DepsOptions = {}): {
  deps: McpServerDependencies;
  aggregateObjects: ReturnType<typeof vi.fn>;
  queryObjects: ReturnType<typeof vi.fn>;
} {
  const aggregateObjects = vi.fn(async () => {
    if (o.aggregateThrows) throw new Error(o.aggregateThrows);
    return o.aggregateResult ?? { groups: [{ keys: {}, values: { 'count_*': 3 } }], totalGroups: 1 };
  });
  const queryObjects = vi.fn(async () => ({
    items: o.rows ?? [],
    totalCount: (o.rows ?? []).length,
    hasNextPage: false,
  }));
  return {
    aggregateObjects,
    queryObjects,
    deps: {
      schema,
      storage: { aggregateObjects, queryObjects },
      consentSubjectTypes: o.consentSubjectTypes,
      consentService: o.consentDenied
        ? {
            checkSingleObject: async (data: unknown, subjectId: string) => ({
              data,
              _consentRestricted: o.consentDenied!.includes(subjectId),
            }),
          }
        : undefined,
      authorizationService: {
        listObjects: async () => o.allowed ?? ['*'],
        getVisibleFields: () => (o.visibleFields ? new Set(o.visibleFields) : undefined),
        redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
          rows.map(data => ({ data, _redactedFields: [] })),
      },
    } as unknown as McpServerDependencies,
  };
}

function parse(res: unknown): Record<string, unknown> & { isError: boolean } {
  const r = res as { content: { text: string }[]; isError?: boolean };
  return {
    ...(JSON.parse(r.content[0]!.text) as Record<string, unknown>),
    isError: r.isError === true,
  };
}

const COUNT_ALL = { fields: [{ field: '*', fn: 'count' }] };

describe('aggregate_<Type> MCP tool', () => {
  it('is offered for every object type', () => {
    const { deps } = makeDeps();
    const names = buildToolList(deps).map(t => t.name);
    expect(names).toContain('aggregate_Patient');
    expect(names).toContain('aggregate_Ward');
  });

  it('advertises the full function set, including the extended grammar', () => {
    const { deps } = makeDeps();
    const tool = buildToolList(deps).find(t => t.name === 'aggregate_Patient')!;
    const schemaJson = JSON.stringify(tool.inputSchema);
    for (const fn of ['count', 'sum', 'avg', 'min', 'max', 'count_distinct', 'stddev', 'median', 'percentile']) {
      expect(schemaJson).toContain(fn);
    }
  });

  it('runs a grouped aggregate and returns the groups', async () => {
    const { deps, aggregateObjects } = makeDeps({
      aggregateResult: { groups: [{ keys: { status: 'active' }, values: { n: 2 } }], totalGroups: 1 },
    });
    const out = parse(await invokeTool('aggregate_Patient', {
      fields: [{ field: '*', fn: 'count', alias: 'n' }],
      groupBy: ['status'],
    }, caller, deps));

    expect(out.isError).toBe(false);
    expect(out['totalGroups']).toBe(1);
    const query = aggregateObjects.mock.calls[0]![2] as Record<string, unknown>;
    expect(query['groupBy']).toEqual(['status']);
    expect(query['fields']).toEqual([{ field: '*', fn: 'count', alias: 'n' }]);
  });

  it('passes percentile and having through to the provider', async () => {
    const { deps, aggregateObjects } = makeDeps();
    const out = parse(await invokeTool('aggregate_Patient', {
      fields: [
        { field: 'age', fn: 'percentile', percentile: 0.9, alias: 'p90' },
        { field: 'age', fn: 'sum', alias: 'total' },
      ],
      having: [{ alias: 'total', operator: 'GT', value: 10 }],
    }, caller, deps));

    expect(out.isError).toBe(false);
    const query = aggregateObjects.mock.calls[0]![2] as Record<string, unknown>;
    expect(query['having']).toEqual([{ alias: 'total', operator: 'gt', value: 10 }]);
    expect(query['fields']).toContainEqual({ field: 'age', fn: 'percentile', alias: 'p90', percentile: 0.9 });
  });

  it('refuses a percentile with no fraction', async () => {
    const { deps, aggregateObjects } = makeDeps();
    const out = parse(await invokeTool('aggregate_Patient', {
      fields: [{ field: 'age', fn: 'percentile' }],
    }, caller, deps));
    expect(out.isError).toBe(true);
    expect(String(out['error'])).toMatch(/percentile fraction/);
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('refuses an unknown function, an unknown field, and an unknown group key', async () => {
    const { deps, aggregateObjects } = makeDeps();
    for (const args of [
      { fields: [{ field: 'age', fn: 'mode' }] },
      { fields: [{ field: 'nosuch', fn: 'sum' }] },
      { fields: [{ field: '*', fn: 'count' }], groupBy: ['nosuch'] },
      // @computed has no stored column to aggregate.
      { fields: [{ field: 'displayName', fn: 'count' }] },
    ]) {
      const out = parse(await invokeTool('aggregate_Patient', args, caller, deps));
      expect(out.isError).toBe(true);
    }
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('refuses a having alias that names no requested aggregate', async () => {
    const { deps, aggregateObjects } = makeDeps();
    const out = parse(await invokeTool('aggregate_Patient', {
      fields: [{ field: '*', fn: 'count', alias: 'n' }],
      having: [{ alias: 'typo', operator: 'gt', value: 1 }],
    }, caller, deps));
    expect(out.isError).toBe(true);
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('refuses to aggregate or group by a field the caller cannot read', async () => {
    const { deps, aggregateObjects } = makeDeps({ visibleFields: ['id', 'status', 'age'] });
    const agg = parse(await invokeTool('aggregate_Patient', {
      fields: [{ field: 'name', fn: 'count_distinct', alias: 'names' }],
    }, caller, deps));
    expect(agg.isError).toBe(true);
    expect(String(agg['error'])).toMatch(/redacted/);

    const grouped = parse(await invokeTool('aggregate_Patient', {
      fields: [{ field: '*', fn: 'count' }],
      groupBy: ['name'],
    }, caller, deps));
    expect(grouped.isError).toBe(true);
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('scopes the aggregate to FGA-authorised ids', async () => {
    const { deps, aggregateObjects } = makeDeps({ allowed: ['patient:p-1', 'patient:p-2'] });
    await invokeTool('aggregate_Patient', COUNT_ALL, caller, deps);
    const query = aggregateObjects.mock.calls[0]![2] as { filter: { field: string; operator: string; value: string[] } };
    expect(query.filter).toEqual({ field: '_id', operator: 'in', value: ['p-1', 'p-2'] });
  });

  it('returns an empty result, not an error, when nothing is authorised', async () => {
    const { deps, aggregateObjects } = makeDeps({ allowed: [] });
    const out = parse(await invokeTool('aggregate_Patient', COUNT_ALL, caller, deps));
    expect(out.isError).toBe(false);
    expect(out['totalGroups']).toBe(0);
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('narrows a consent-gated type to consented records before grouping', async () => {
    const { deps, aggregateObjects } = makeDeps({
      consentSubjectTypes: ['Patient'],
      consentDenied: ['p-2'],
      rows: [
        { _id: 'p-1', _type: 'Patient' },
        { _id: 'p-2', _type: 'Patient' },
      ],
    });
    await invokeTool('aggregate_Patient', COUNT_ALL, caller, deps);
    const query = aggregateObjects.mock.calls[0]![2] as { filter: { value: string[] } };
    expect(query.filter.value).toEqual(['p-1']);
  });

  it('returns no groups when consent excludes every record', async () => {
    const { deps, aggregateObjects } = makeDeps({
      consentSubjectTypes: ['Patient'],
      consentDenied: ['p-1'],
      rows: [{ _id: 'p-1', _type: 'Patient' }],
    });
    const out = parse(await invokeTool('aggregate_Patient', COUNT_ALL, caller, deps));
    expect(out.isError).toBe(false);
    expect(out['totalGroups']).toBe(0);
    expect(aggregateObjects).not.toHaveBeenCalled();
  });

  it('leaves a non-gated type unconstrained by consent', async () => {
    const { deps, aggregateObjects, queryObjects } = makeDeps({
      consentSubjectTypes: ['Patient'],
      consentDenied: [],
    });
    await invokeTool('aggregate_Ward', COUNT_ALL, caller, deps);
    expect(queryObjects).not.toHaveBeenCalled();
    expect(aggregateObjects).toHaveBeenCalled();
  });

  it('caps the group count it will return', async () => {
    const { deps, aggregateObjects } = makeDeps();
    await invokeTool('aggregate_Patient', { ...COUNT_ALL, limit: 99999 }, caller, deps);
    const query = aggregateObjects.mock.calls[0]![2] as { limit: number };
    expect(query.limit).toBe(200);
  });

  it('surfaces a provider error as a tool error, not a thrown exception', async () => {
    const { deps } = makeDeps({ aggregateThrows: 'Aggregate sum on non-numeric field' });
    const out = parse(await invokeTool('aggregate_Patient', { fields: [{ field: 'status', fn: 'sum' }] }, caller, deps));
    expect(out.isError).toBe(true);
    expect(String(out['error'])).toContain('non-numeric');
  });

  it('requires a fields array', async () => {
    const { deps } = makeDeps();
    const out = parse(await invokeTool('aggregate_Patient', {}, caller, deps));
    expect(out.isError).toBe(true);
    expect(String(out['error'])).toMatch(/fields is required/);
  });
});
