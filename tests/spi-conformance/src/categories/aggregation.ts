import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageProvider } from '@altius/spi';
import type { ProviderFactory } from '../suite.js';
import { tenantA, baseSchema } from '../fixtures.js';

export function registerAggregationTests(name: string, factory: ProviderFactory): void {
  describe(`[${name}] SPI Conformance: Aggregation`, () => {
    let provider: StorageProvider;

    beforeEach(async () => {
      provider = await factory();
      await provider.applySchema(tenantA, baseSchema);
    });

    // Seed data for aggregation tests
    async function seedPatients() {
      await provider.createObject(tenantA, 'Patient', { name: 'Alice', age: 30, status: 'active', score: 95.5, lastVisit: '2024-01-05T09:00:00.000Z' });
      await provider.createObject(tenantA, 'Patient', { name: 'Bob', age: 25, status: 'active', score: 82.0, lastVisit: '2024-03-11T09:00:00.000Z' });
      await provider.createObject(tenantA, 'Patient', { name: 'Charlie', age: 40, status: 'inactive', score: 70.5, lastVisit: '2024-02-20T09:00:00.000Z' });
      await provider.createObject(tenantA, 'Patient', { name: 'Diana', age: 35, status: 'active', score: 88.0, lastVisit: '2024-05-02T09:00:00.000Z' });
      await provider.createObject(tenantA, 'Patient', { name: 'Eve', age: 28, status: 'pending', score: 91.0, lastVisit: '2024-04-17T09:00:00.000Z' });
    }

    // ─── Count ───

    describe('count', () => {
      beforeEach(seedPatients);

      it('count all with field=*', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['count_*']).toBe(5);
        expect(result.totalGroups).toBe(1);
      });

      it('count with filter', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count' }],
          filter: { field: 'status', operator: 'eq', value: 'active' },
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['count_*']).toBe(3);
      });

      it('count on specific field counts non-null values', async () => {
        // Create a patient without a score
        await provider.createObject(tenantA, 'Patient', { name: 'Frank', age: 45, status: 'active' });

        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [
            { field: '*', fn: 'count', alias: 'total' },
            { field: 'score', fn: 'count', alias: 'withScore' },
          ],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['total']).toBe(6);
        expect(result.groups[0]!.values['withScore']).toBe(5);
      });
    });

    // ─── Numeric aggregates ───

    describe('numeric aggregates', () => {
      beforeEach(seedPatients);

      it('sum on numeric field', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'sum' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['sum_age']).toBe(158); // 30+25+40+35+28
      });

      it('avg on numeric field', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'avg' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['avg_age']).toBeCloseTo(31.6, 1); // 158/5
      });

      it('min on numeric field', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'min' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['min_age']).toBe(25);
      });

      it('max on numeric field', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'max' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['max_age']).toBe(40);
      });

      it('multiple aggregates in single query', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [
            { field: '*', fn: 'count', alias: 'total' },
            { field: 'age', fn: 'sum', alias: 'ageSum' },
            { field: 'age', fn: 'avg', alias: 'ageAvg' },
            { field: 'score', fn: 'min', alias: 'minScore' },
            { field: 'score', fn: 'max', alias: 'maxScore' },
          ],
        });
        expect(result.groups).toHaveLength(1);
        const v = result.groups[0]!.values;
        expect(v['total']).toBe(5);
        expect(v['ageSum']).toBe(158);
        expect(v['ageAvg']).toBeCloseTo(31.6, 1);
        expect(v['minScore']).toBeCloseTo(70.5, 1);
        expect(v['maxScore']).toBeCloseTo(95.5, 1);
      });
    });

    // ─── Non-numeric aggregates ───

    // `AggregateGroup.values` is typed `Record<string, number | null>`, so a
    // MIN/MAX over a DateTime or string column has no representation. Left
    // unpinned the two providers diverged: memory dropped the non-numeric
    // inputs and answered null, Postgres ran SQL MIN/MAX and coerced whatever
    // came back — NaN for text, an epoch millisecond count for a timestamp.
    // The agreed contract is to refuse, identically, on both.
    describe('non-numeric aggregates', () => {
      beforeEach(seedPatients);

      it('rejects min on a DateTime field', async () => {
        await expect(
          provider.aggregateObjects(tenantA, 'Patient', {
            fields: [{ field: 'lastVisit', fn: 'min' }],
          }),
        ).rejects.toThrow(/non-numeric/);
      });

      it('rejects max on a string field', async () => {
        await expect(
          provider.aggregateObjects(tenantA, 'Patient', {
            fields: [{ field: 'status', fn: 'max' }],
          }),
        ).rejects.toThrow(/non-numeric/);
      });

      it('rejects sum on a string field', async () => {
        // Postgres raises its own "function sum(text) does not exist" here,
        // so only the rejection itself is portable, not the message.
        await expect(
          provider.aggregateObjects(tenantA, 'Patient', {
            fields: [{ field: 'status', fn: 'sum' }],
          }),
        ).rejects.toThrow();
      });

      it('still returns null for min over a numeric field with no rows', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'min' }],
          filter: { field: 'status', operator: 'eq', value: 'nonexistent' },
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['min_age']).toBeNull();
      });
    });

    // ─── Group by ───

    describe('groupBy', () => {
      beforeEach(seedPatients);

      it('groupBy single field', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
        });
        expect(result.totalGroups).toBe(3); // active, inactive, pending

        const active = result.groups.find((g) => g.keys['status'] === 'active');
        const inactive = result.groups.find((g) => g.keys['status'] === 'inactive');
        const pending = result.groups.find((g) => g.keys['status'] === 'pending');

        expect(active).toBeDefined();
        expect(active!.values['count']).toBe(3);
        expect(inactive).toBeDefined();
        expect(inactive!.values['count']).toBe(1);
        expect(pending).toBeDefined();
        expect(pending!.values['count']).toBe(1);
      });

      it('groupBy with aggregate functions', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [
            { field: '*', fn: 'count', alias: 'count' },
            { field: 'age', fn: 'avg', alias: 'avgAge' },
          ],
          groupBy: ['status'],
        });

        const active = result.groups.find((g) => g.keys['status'] === 'active');
        expect(active).toBeDefined();
        expect(active!.values['count']).toBe(3);
        expect(active!.values['avgAge']).toBeCloseTo(30, 0); // (30+25+35)/3 = 30
      });

      it('groupBy multiple fields', async () => {
        // Add more data for multi-field grouping
        await provider.createObject(tenantA, 'Patient', { name: 'Frank', age: 50, status: 'active', score: 60 });
        await provider.createObject(tenantA, 'Patient', { name: 'Grace', age: 22, status: 'pending', score: 77 });

        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
        });
        // active: Alice,Bob,Diana,Frank = 4; inactive: Charlie = 1; pending: Eve,Grace = 2
        expect(result.totalGroups).toBe(3);
        const active = result.groups.find((g) => g.keys['status'] === 'active');
        expect(active!.values['count']).toBe(4);
      });
    });

    // ─── Empty results ───

    describe('empty results', () => {
      it('returns empty groups when no objects match', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          filter: { field: 'status', operator: 'eq', value: 'nonexistent' },
        });
        // With no groupBy, there's still one group but count is 0
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['count']).toBe(0);
      });

      it('returns empty groups when no objects exist', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.values['count']).toBe(0);
      });

      it('returns no groups when groupBy with no matching data', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          filter: { field: 'status', operator: 'eq', value: 'nonexistent' },
        });
        expect(result.groups).toHaveLength(0);
        expect(result.totalGroups).toBe(0);
      });
    });

    // ─── Ordering ───

    describe('ordering of groups', () => {
      beforeEach(seedPatients);

      it('orders groups by aggregate value ascending', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'count', direction: 'asc' }],
        });
        expect(result.groups.length).toBeGreaterThanOrEqual(2);
        const counts = result.groups.map((g) => g.values['count'] as number);
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
        }
      });

      it('orders groups by group key', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'asc' }],
        });
        const statuses = result.groups.map((g) => g.keys['status'] as string);
        const sorted = [...statuses].sort();
        expect(statuses).toEqual(sorted);
      });
    });

    // ─── Limit / Offset ───

    describe('limit and offset on groups', () => {
      beforeEach(seedPatients);

      it('limit restricts number of groups returned', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'asc' }],
          limit: 2,
        });
        expect(result.groups).toHaveLength(2);
        expect(result.totalGroups).toBe(3); // Still reports total
      });

      it('offset skips initial groups', async () => {
        const allResult = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'asc' }],
        });

        const offsetResult = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'asc' }],
          offset: 1,
        });

        expect(offsetResult.groups[0]!.keys['status']).toBe(
          allResult.groups[1]!.keys['status'],
        );
      });

      it('limit + offset combination', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'asc' }],
          limit: 1,
          offset: 1,
        });
        expect(result.groups).toHaveLength(1);
        expect(result.totalGroups).toBe(3);
      });
    });

    // ─── Custom aliases ───

    describe('custom aliases', () => {
      beforeEach(seedPatients);

      it('uses custom alias for aggregate result', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [
            { field: '*', fn: 'count', alias: 'patientCount' },
            { field: 'age', fn: 'avg', alias: 'averageAge' },
          ],
        });
        expect(result.groups[0]!.values['patientCount']).toBe(5);
        expect(result.groups[0]!.values['averageAge']).toBeCloseTo(31.6, 1);
      });
    });

    // ─── Extended grammar: COUNT DISTINCT / STDDEV / MEDIAN / PERCENTILE ───
    //
    // These are the definitions that make the two providers agree: STDDEV_SAMP
    // (n-1, NULL at n=1) and PERCENTILE_CONT (interpolating). A provider that
    // implemented the population deviation or a nearest-rank percentile would
    // still look plausible in isolation and disagree here.

    describe('extended aggregate functions', () => {
      beforeEach(seedPatients);

      it('count_distinct counts distinct non-null values', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [
            { field: 'status', fn: 'count', alias: 'rows' },
            { field: 'status', fn: 'count_distinct', alias: 'statuses' },
          ],
        });
        expect(result.groups[0]!.values['rows']).toBe(5);
        // active, inactive, pending
        expect(result.groups[0]!.values['statuses']).toBe(3);
      });

      it('stddev is the sample deviation', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'stddev', alias: 'sd' }],
        });
        // ages 30,25,40,35,28 → sample sd ≈ 5.9414 (population ≈ 5.3141)
        expect(result.groups[0]!.values['sd']).toBeCloseTo(5.9414, 3);
      });

      it('stddev of a single row is null, not zero', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'stddev', alias: 'sd' }],
          filter: { field: 'status', operator: 'eq', value: 'pending' },
        });
        expect(result.groups[0]!.values['sd']).toBeNull();
      });

      it('median interpolates between neighbouring values', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'median', alias: 'med' }],
        });
        // sorted 25,28,30,35,40 → 30
        expect(result.groups[0]!.values['med']).toBeCloseTo(30, 6);
      });

      it('percentile uses the requested fraction', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: 'age', fn: 'percentile', percentile: 0.25, alias: 'p25' }],
        });
        // position 0.25 * 4 = 1 → 28
        expect(result.groups[0]!.values['p25']).toBeCloseTo(28, 6);
      });

      it('rejects a percentile without a fraction', async () => {
        await expect(
          provider.aggregateObjects(tenantA, 'Patient', {
            fields: [{ field: 'age', fn: 'percentile', alias: 'p' }],
          }),
        ).rejects.toThrow();
      });
    });

    // ─── HAVING ───

    describe('having', () => {
      beforeEach(seedPatients);

      it('filters groups by aggregate value and counts only survivors', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'n' }],
          groupBy: ['status'],
          having: [{ alias: 'n', operator: 'gte', value: 2 }],
        });
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]!.keys['status']).toBe('active');
        expect(result.totalGroups).toBe(1);
      });

      it('removes the single ungrouped group when it fails the predicate', async () => {
        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'n' }],
          having: [{ alias: 'n', operator: 'gt', value: 1000 }],
        });
        expect(result.groups).toHaveLength(0);
        expect(result.totalGroups).toBe(0);
      });

      it('rejects a predicate naming an aggregate that was not requested', async () => {
        await expect(
          provider.aggregateObjects(tenantA, 'Patient', {
            fields: [{ field: '*', fn: 'count', alias: 'n' }],
            groupBy: ['status'],
            having: [{ alias: 'nope', operator: 'gt', value: 0 }],
          }),
        ).rejects.toThrow();
      });
    });

    // ─── Soft-deleted exclusion ───

    describe('soft-deleted exclusion', () => {
      it('excludes soft-deleted objects from aggregation', async () => {
        const obj1 = await provider.createObject(tenantA, 'Patient', { name: 'A', age: 10, status: 'x' });
        await provider.createObject(tenantA, 'Patient', { name: 'B', age: 20, status: 'x' });
        await provider.deleteObject(tenantA, 'Patient', obj1._id, 'soft');

        const result = await provider.aggregateObjects(tenantA, 'Patient', {
          fields: [{ field: '*', fn: 'count', alias: 'count' }],
        });
        expect(result.groups[0]!.values['count']).toBe(1);
      });
    });
  });
}
