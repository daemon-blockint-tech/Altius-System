/**
 * Tests for the InMemoryTimeSeriesStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTimeSeriesStore } from '../in-memory-time-series-store.js';

describe('InMemoryTimeSeriesStore', () => {
  let store: InMemoryTimeSeriesStore;
  const ctx = { tenantId: 'test', branch: 'main' };

  beforeEach(() => {
    store = new InMemoryTimeSeriesStore();
  });

  it('stores and retrieves points', async () => {
    await store.putPoint(ctx, 'Sensor', 's-1', 'temperature', {
      timestamp: '2026-01-01T10:00:00Z',
      value: 20.5,
    });
    await store.putPoint(ctx, 'Sensor', 's-1', 'temperature', {
      timestamp: '2026-01-01T11:00:00Z',
      value: 21.0,
    });

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {});
    expect(result.points).toHaveLength(2);
    expect(result.points![0].value).toBe(20.5);
    expect(result.points![1].value).toBe(21.0);
    expect(result.totalCount).toBe(2);
  });

  it('filters by time range', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T11:00:00Z', value: 21 },
      { timestamp: '2026-01-01T12:00:00Z', value: 22 },
      { timestamp: '2026-01-01T13:00:00Z', value: 23 },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      start: '2026-01-01T11:00:00Z',
      end: '2026-01-01T13:00:00Z',
    });
    expect(result.points).toHaveLength(2);
    expect(result.points![0].value).toBe(21);
    expect(result.points![1].value).toBe(22);
  });

  it('returns points in descending order', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T11:00:00Z', value: 21 },
      { timestamp: '2026-01-01T12:00:00Z', value: 22 },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      order: 'desc',
    });
    expect(result.points![0].value).toBe(22);
    expect(result.points![2].value).toBe(20);
  });

  it('limits the number of points', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T11:00:00Z', value: 21 },
      { timestamp: '2026-01-01T12:00:00Z', value: 22 },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      limit: 2,
    });
    expect(result.points).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });

  it('bucketizes into hourly averages', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T10:30:00Z', value: 22 },
      { timestamp: '2026-01-01T11:00:00Z', value: 24 },
      { timestamp: '2026-01-01T11:45:00Z', value: 26 },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      bucket: { interval: '1h', function: 'avg' },
    });
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets![0].value).toBe(21); // (20+22)/2
    expect(result.buckets![0].count).toBe(2);
    expect(result.buckets![1].value).toBe(25); // (24+26)/2
    expect(result.buckets![1].count).toBe(2);
  });

  it('bucketizes with sum function', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 10 },
      { timestamp: '2026-01-01T10:30:00Z', value: 20 },
      { timestamp: '2026-01-01T11:00:00Z', value: 30 },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      bucket: { interval: '1h', function: 'sum' },
    });
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets![0].value).toBe(30); // 10+20
    expect(result.buckets![1].value).toBe(30);
  });

  it('gets the latest point', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T12:00:00Z', value: 22 },
      { timestamp: '2026-01-01T11:00:00Z', value: 21 },
    ]);

    const latest = await store.getLatestPoint(ctx, 'Sensor', 's-1', 'temperature');
    expect(latest).not.toBeNull();
    expect(latest!.value).toBe(22);
  });

  it('returns null for latest point on non-existent series', async () => {
    const latest = await store.getLatestPoint(ctx, 'Sensor', 's-1', 'temperature');
    expect(latest).toBeNull();
  });

  it('deletes a range of points', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20 },
      { timestamp: '2026-01-01T11:00:00Z', value: 21 },
      { timestamp: '2026-01-01T12:00:00Z', value: 22 },
    ]);

    const deleted = await store.deleteRange(
      ctx, 'Sensor', 's-1', 'temperature',
      '2026-01-01T11:00:00Z',
      '2026-01-01T12:00:00Z',
    );
    expect(deleted).toBe(1);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {});
    expect(result.points).toHaveLength(2);
  });

  it('filters by tags', async () => {
    await store.putPoints(ctx, 'Sensor', 's-1', 'temperature', [
      { timestamp: '2026-01-01T10:00:00Z', value: 20, tags: { sensor: 'a' } },
      { timestamp: '2026-01-01T11:00:00Z', value: 21, tags: { sensor: 'b' } },
      { timestamp: '2026-01-01T12:00:00Z', value: 22, tags: { sensor: 'a' } },
    ]);

    const result = await store.getSeries(ctx, 'Sensor', 's-1', 'temperature', {
      tags: { sensor: 'a' },
    });
    expect(result.points).toHaveLength(2);
    expect(result.points![0].value).toBe(20);
    expect(result.points![1].value).toBe(22);
  });
});
