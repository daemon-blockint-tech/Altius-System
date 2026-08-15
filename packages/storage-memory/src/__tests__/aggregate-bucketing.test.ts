/**
 * Tests for date bucketing in the memory storage provider's aggregate.
 *
 * Before this change, AggregateQuery had no `buckets` field — the only
 * grouping was via `groupBy` on raw field values. A Chart XY over time
 * could not group by month, and a Pivot Table could not roll up by week.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-test' };

const SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Transaction',
      properties: [
        { name: 'amount', type: 'number', required: true },
        { name: 'timestamp', type: 'datetime', required: false },
        { name: 'status', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

describe('MemoryStorageProvider aggregate with date bucketing', () => {
  let storage: MemoryStorageProvider;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(CTX, SCHEMA);

    // Create transactions across 3 months
    await storage.createObject(CTX, 'Transaction', { amount: 100, timestamp: '2025-01-05T10:00:00Z', status: 'PENDING' });
    await storage.createObject(CTX, 'Transaction', { amount: 200, timestamp: '2025-01-20T15:00:00Z', status: 'COMPLETED' });
    await storage.createObject(CTX, 'Transaction', { amount: 150, timestamp: '2025-02-10T12:00:00Z', status: 'COMPLETED' });
    await storage.createObject(CTX, 'Transaction', { amount: 300, timestamp: '2025-02-25T09:00:00Z', status: 'PENDING' });
    await storage.createObject(CTX, 'Transaction', { amount: 250, timestamp: '2025-03-15T14:00:00Z', status: 'COMPLETED' });
  });

  it('groups by month bucket', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'totalAmount' }],
      buckets: [{ field: 'timestamp', interval: 'month' }],
    });

    expect(result.groups).toHaveLength(3);
    // Groups are ordered by the bucket key (ISO string → chronological)
    expect(result.groups[0]!.keys['timestamp']).toBe('2025-01-01T00:00:00.000Z');
    expect(result.groups[0]!.values['totalAmount']).toBe(300); // 100 + 200
    expect(result.groups[1]!.keys['timestamp']).toBe('2025-02-01T00:00:00.000Z');
    expect(result.groups[1]!.values['totalAmount']).toBe(450); // 150 + 300
    expect(result.groups[2]!.keys['timestamp']).toBe('2025-03-01T00:00:00.000Z');
    expect(result.groups[2]!.values['totalAmount']).toBe(250);
  });

  it('groups by day bucket', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
      buckets: [{ field: 'timestamp', interval: 'day' }],
    });

    // 5 distinct days
    expect(result.groups).toHaveLength(5);
    expect(result.groups[0]!.keys['timestamp']).toBe('2025-01-05T00:00:00.000Z');
    expect(result.groups[0]!.values['cnt']).toBe(1);
  });

  it('groups by year bucket', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
      buckets: [{ field: 'timestamp', interval: 'year' }],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.keys['timestamp']).toBe('2025-01-01T00:00:00.000Z');
    expect(result.groups[0]!.values['cnt']).toBe(5);
  });

  it('groups by week bucket (Monday-start)', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
      buckets: [{ field: 'timestamp', interval: 'week' }],
    });

    // Jan 5 2025 is a Sunday → week starts Mon Dec 30 2024
    // Jan 20 2025 is a Monday → week starts Jan 20
    // Feb 10 2025 is a Monday → week starts Feb 10
    // Feb 25 2025 is a Tuesday → week starts Mon Feb 24
    // Mar 15 2025 is a Saturday → week starts Mon Mar 10
    expect(result.groups).toHaveLength(5);
    expect(result.groups[0]!.keys['timestamp']).toBe('2024-12-30T00:00:00.000Z');
    expect(result.groups[1]!.keys['timestamp']).toBe('2025-01-20T00:00:00.000Z');
  });

  it('uses custom alias for bucket key', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
      buckets: [{ field: 'timestamp', interval: 'month', alias: 'month' }],
    });

    expect(result.groups[0]!.keys['month']).toBe('2025-01-01T00:00:00.000Z');
    expect(result.groups[0]!.keys['timestamp']).toBeUndefined();
  });

  it('combines bucket with groupBy', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: 'amount', fn: 'sum', alias: 'total' }],
      groupBy: ['status'],
      buckets: [{ field: 'timestamp', interval: 'month' }],
    });

    // 3 months × 2 statuses (PENDING in Jan+Feb, COMPLETED in Jan+Feb+Mar)
    // Jan: PENDING(100), COMPLETED(200)
    // Feb: PENDING(300), COMPLETED(150)
    // Mar: COMPLETED(250)
    expect(result.groups).toHaveLength(5);
  });

  it('handles null date values', async () => {
    await storage.createObject(CTX, 'Transaction', { amount: 999, timestamp: null as unknown as string, status: 'PENDING' });

    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
      buckets: [{ field: 'timestamp', interval: 'month' }],
    });

    // The null-timestamp row gets its own group with key null
    const nullGroup = result.groups.find(g => g.keys['timestamp'] === null);
    expect(nullGroup).toBeDefined();
    expect(nullGroup!.values['cnt']).toBe(1);
  });

  it('returns empty groups when no items match and bucketing is used', async () => {
    const result = await storage.aggregateObjects(CTX, 'Transaction', {
      fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
      buckets: [{ field: 'timestamp', interval: 'month' }],
      filter: { field: 'amount', operator: 'gt', value: 10000 },
    });

    expect(result.groups).toHaveLength(0);
    expect(result.totalGroups).toBe(0);
  });

  // Parity with Postgres, which allowlists the interval before interpolating
  // it into date_trunc(). Without this the memory provider truncates to day
  // granularity for anything it does not recognise, so the same query returns
  // a plausible wrong answer here and an error there.
  it('rejects an unsupported bucket interval instead of silently using day', async () => {
    await expect(
      storage.aggregateObjects(CTX, 'Transaction', {
        fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
        buckets: [{ field: 'timestamp', interval: 'hour' as never }],
      }),
    ).rejects.toThrow(/Invalid bucket interval/);
  });

  it('rejects an unsupported bucket interval even with zero matching rows', async () => {
    await expect(
      storage.aggregateObjects(CTX, 'Transaction', {
        fields: [{ field: '*', fn: 'count', alias: 'cnt' }],
        buckets: [{ field: 'timestamp', interval: 'hour' as never }],
        filter: { field: 'amount', operator: 'gt', value: 10000 },
      }),
    ).rejects.toThrow(/Invalid bucket interval/);
  });
});
