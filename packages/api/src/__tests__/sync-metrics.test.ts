/**
 * T3: Tests that startSyncMetricsGauge mirrors SyncScheduler.stats() onto
 * the declared Prometheus gauges (syncRecordsProcessed, syncRecordsFailed,
 * syncConsecutiveFailures, syncLastProcessedTimestamp).
 *
 * Uses a stub scheduler with a controllable stats() return value — no
 * real connectors or timers are needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { register } from 'prom-client';
import type { SyncScheduler, DatasourceStatus } from '@altius/sync';
import {
  startSyncMetricsGauge,
} from '../metrics.js';

function makeStubScheduler(statuses: DatasourceStatus[]): Pick<SyncScheduler, 'stats'> {
  return { stats: () => statuses };
}

/**
 * Read a labelled gauge value from the Prometheus text exposition format.
 * Returns the first matching value or undefined.
 */
async function gaugeValue(metricName: string, datasource: string): Promise<number | undefined> {
  const text = await register.metrics();
  // Match: metric_name{datasource="x"} 42
  const re = new RegExp(`${metricName}\\{datasource="${datasource}"\\}\\s+(\\S+)`);
  const m = text.match(re);
  return m ? Number(m[1]) : undefined;
}

describe('startSyncMetricsGauge', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  it('updates gauges from scheduler.stats() on tick', async () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const scheduler = makeStubScheduler([
      {
        datasource: 'src-a',
        mode: 'POLLING',
        intervalMs: 30_000,
        ticks: 5,
        consecutiveFailures: 2,
        lastError: null,
        lastTickAt: now.toISOString(),
        running: false,
        cdc: { recordsProcessed: 100, recordsFailed: 3, lastCheckpoint: null, lastProcessedAt: now.toISOString(), isRunning: false },
      },
    ]);

    const stop = startSyncMetricsGauge(scheduler as SyncScheduler, 1_000_000);
    // The initial tick runs synchronously before the interval starts.
    expect(await gaugeValue('altius_sync_records_processed', 'src-a')).toBe(100);
    expect(await gaugeValue('altius_sync_records_failed', 'src-a')).toBe(3);
    expect(await gaugeValue('altius_sync_consecutive_failures', 'src-a')).toBe(2);
    expect(await gaugeValue('altius_sync_last_processed_timestamp_seconds', 'src-a')).toBe(Math.floor(now.getTime() / 1000));
    stop();
  });

  it('handles multiple datasources', async () => {
    const scheduler = makeStubScheduler([
      {
        datasource: 'src-a',
        mode: 'POLLING',
        intervalMs: 30_000,
        ticks: 1,
        consecutiveFailures: 0,
        lastError: null,
        lastTickAt: null,
        running: false,
        cdc: { recordsProcessed: 10, recordsFailed: 0, lastCheckpoint: null, lastProcessedAt: null, isRunning: false },
      },
      {
        datasource: 'src-b',
        mode: 'CDC',
        intervalMs: 5_000,
        ticks: 3,
        consecutiveFailures: 5,
        lastError: 'connection refused',
        lastTickAt: null,
        running: true,
        cdc: { recordsProcessed: 200, recordsFailed: 50, lastCheckpoint: null, lastProcessedAt: null, isRunning: true },
      },
    ]);

    const stop = startSyncMetricsGauge(scheduler as SyncScheduler, 1_000_000);
    expect(await gaugeValue('altius_sync_records_processed', 'src-a')).toBe(10);
    expect(await gaugeValue('altius_sync_records_processed', 'src-b')).toBe(200);
    expect(await gaugeValue('altius_sync_consecutive_failures', 'src-b')).toBe(5);
    stop();
  });

  it('skips lastProcessedTimestamp when null', async () => {
    const scheduler = makeStubScheduler([
      {
        datasource: 'src-null',
        mode: 'POLLING',
        intervalMs: 30_000,
        ticks: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastTickAt: null,
        running: false,
        cdc: { recordsProcessed: 0, recordsFailed: 0, lastCheckpoint: null, lastProcessedAt: null, isRunning: false },
      },
    ]);

    const stop = startSyncMetricsGauge(scheduler as SyncScheduler, 1_000_000);
    // Records/failures still set; timestamp gauge has no value for this datasource.
    expect(await gaugeValue('altius_sync_records_processed', 'src-null')).toBe(0);
    expect(await gaugeValue('altius_sync_last_processed_timestamp_seconds', 'src-null')).toBeUndefined();
    stop();
  });
});
