/**
 * Extended aggregation grammar — COUNT DISTINCT, STDDEV, MEDIAN, PERCENTILE
 * and HAVING, on the memory provider.
 *
 * The values asserted here are the definitions Postgres uses, because the two
 * providers must answer the same question the same way: STDDEV is the SAMPLE
 * deviation (n-1, NULL for one row), and MEDIAN/PERCENTILE are CONTINUOUS
 * (interpolating, so the median of [1,2] is 1.5 and appears in neither row).
 * A provider that picked the population deviation or a nearest-rank percentile
 * would pass a laxer test and disagree with the database in production.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'user-1', traceId: 'trace' };

const SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Sale',
      properties: [
        { name: 'region', type: 'string', required: false },
        { name: 'amount', type: 'number', required: false },
        { name: 'rep', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

async function seed(provider: MemoryStorageProvider, rows: Array<Record<string, unknown>>): Promise<void> {
  for (const row of rows) {
    await provider.createObject(CTX, 'Sale', row);
  }
}

describe('extended aggregate functions', () => {
  let provider: MemoryStorageProvider;

  beforeEach(async () => {
    provider = new MemoryStorageProvider();
    await provider.applySchema(CTX, SCHEMA);
    await seed(provider, [
      { id: 's1', region: 'north', amount: 10, rep: 'ann' },
      { id: 's2', region: 'north', amount: 20, rep: 'ann' },
      { id: 's3', region: 'north', amount: 30, rep: 'bob' },
      { id: 's4', region: 'south', amount: 5, rep: 'cai' },
    ]);
  });

  it('counts distinct values, not rows', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [
        { field: 'rep', fn: 'count', alias: 'rows' },
        { field: 'rep', fn: 'count_distinct', alias: 'reps' },
      ],
      groupBy: ['region'],
    });
    const north = result.groups.find(g => g.keys['region'] === 'north')!;
    expect(north.values['rows']).toBe(3);
    expect(north.values['reps']).toBe(2);
  });

  it('computes the SAMPLE standard deviation and returns null for one row', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: 'amount', fn: 'stddev', alias: 'sd' }],
      groupBy: ['region'],
    });
    const north = result.groups.find(g => g.keys['region'] === 'north')!;
    // Sample sd of [10,20,30] = 10 (population sd would be ~8.165).
    expect(north.values['sd']).toBeCloseTo(10, 10);
    const south = result.groups.find(g => g.keys['region'] === 'south')!;
    expect(south.values['sd']).toBeNull();
  });

  it('interpolates median and percentile like PERCENTILE_CONT', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [
        { field: 'amount', fn: 'median', alias: 'med' },
        { field: 'amount', fn: 'percentile', percentile: 0.9, alias: 'p90' },
      ],
    });
    const all = result.groups[0]!;
    // [5,10,20,30] → median interpolates between 10 and 20.
    expect(all.values['med']).toBeCloseTo(15, 10);
    // position = 0.9 * 3 = 2.7 → 20 + 0.7*(30-20) = 27
    expect(all.values['p90']).toBeCloseTo(27, 10);
  });

  it('refuses a percentile with no fraction rather than assuming a median', async () => {
    await expect(
      provider.aggregateObjects(CTX, 'Sale', {
        fields: [{ field: 'amount', fn: 'percentile', alias: 'p' }],
      }),
    ).rejects.toThrow(/fraction between 0 and 1/);
  });

  it('still rejects an unknown function', async () => {
    await expect(
      provider.aggregateObjects(CTX, 'Sale', {
        fields: [{ field: 'amount', fn: 'mode' as never }],
      }),
    ).rejects.toThrow(/Invalid aggregate function/);
  });
});

describe('HAVING filters groups', () => {
  let provider: MemoryStorageProvider;

  beforeEach(async () => {
    provider = new MemoryStorageProvider();
    await provider.applySchema(CTX, SCHEMA);
    await seed(provider, [
      { id: 's1', region: 'north', amount: 10 },
      { id: 's2', region: 'north', amount: 20 },
      { id: 's3', region: 'south', amount: 5 },
      { id: 's4', region: 'east', amount: 100 },
    ]);
  });

  it('drops groups below the threshold and counts only survivors', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
      groupBy: ['region'],
      having: [{ alias: 'total', operator: 'gte', value: 30 }],
    });
    const regions = result.groups.map(g => g.keys['region']).sort();
    expect(regions).toEqual(['east', 'north']);
    // totalGroups must reflect the filtered set, or a client paging by it
    // requests pages that do not exist.
    expect(result.totalGroups).toBe(2);
  });

  it('applies HAVING before limit, so limit pages the filtered groups', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
      groupBy: ['region'],
      having: [{ alias: 'total', operator: 'gte', value: 30 }],
      orderBy: [{ field: 'total', direction: 'desc' }],
      limit: 1,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.keys['region']).toBe('east');
    expect(result.totalGroups).toBe(2);
  });

  it('combines multiple predicates with AND', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
      groupBy: ['region'],
      having: [
        { alias: 'total', operator: 'gte', value: 30 },
        { alias: 'total', operator: 'lt', value: 100 },
      ],
    });
    expect(result.groups.map(g => g.keys['region'])).toEqual(['north']);
  });

  it('drops a null aggregate from a comparison, as SQL does', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: 'amount', fn: 'stddev', alias: 'sd' }],
      groupBy: ['region'],
      having: [{ alias: 'sd', operator: 'gte', value: 0 }],
    });
    // south and east have one row each → sd null → excluded by `>= 0`.
    expect(result.groups.map(g => g.keys['region'])).toEqual(['north']);
  });

  it('can remove the single ungrouped aggregate group entirely', async () => {
    const result = await provider.aggregateObjects(CTX, 'Sale', {
      fields: [{ field: '*', fn: 'count', alias: 'n' }],
      having: [{ alias: 'n', operator: 'gt', value: 1000 }],
    });
    expect(result.groups).toEqual([]);
    expect(result.totalGroups).toBe(0);
  });
});
