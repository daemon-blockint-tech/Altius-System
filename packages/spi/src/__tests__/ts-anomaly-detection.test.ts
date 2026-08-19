/**
 * Tests for time-series anomaly detection and interval detection.
 */

import { describe, it, expect } from 'vitest';
import { detectAnomalies, detectInterval, pointSatisfies, findConsecutiveRun } from '@altius/spi';
import type { TimeSeriesPoint } from '@altius/spi';

function makePoints(values: number[], intervalMs = 60000): TimeSeriesPoint[] {
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  return values.map((v, i) => ({
    timestamp: new Date(base + i * intervalMs).toISOString(),
    value: v,
  }));
}

// ── pointSatisfies ────────────────────────────────────────────

describe('pointSatisfies', () => {
  it('evaluates gt operator', () => {
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 10 }, 'gt', 5)).toBe(true);
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 5 }, 'gt', 5)).toBe(false);
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 3 }, 'gt', 5)).toBe(false);
  });

  it('evaluates lt operator', () => {
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 3 }, 'lt', 5)).toBe(true);
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 5 }, 'lt', 5)).toBe(false);
  });

  it('returns false for non-numeric values', () => {
    expect(pointSatisfies({ timestamp: '2026-01-01', value: 'hot' }, 'gt', 5)).toBe(false);
  });
});

// ── findConsecutiveRun ────────────────────────────────────────

describe('findConsecutiveRun', () => {
  it('finds a run of consecutive qualifying points', () => {
    const points = makePoints([1, 2, 10, 11, 12, 3]);
    const result = findConsecutiveRun(points, 'gt', 5, 3);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
  });

  it('returns null when not enough consecutive points', () => {
    const points = makePoints([1, 10, 2, 11, 3]);
    const result = findConsecutiveRun(points, 'gt', 5, 3);
    expect(result).toBeNull();
  });

  it('respects minDurationSeconds', () => {
    // 3 points at 1s intervals = 2s duration
    const points = makePoints([10, 11, 12], 1000);
    const result = findConsecutiveRun(points, 'gt', 5, 3, 5);
    expect(result).toBeNull(); // 2s < 5s
  });
});

// ── detectAnomalies ───────────────────────────────────────────

describe('detectAnomalies', () => {
  it('detects z-score anomalies', () => {
    const points = makePoints([10, 10, 10, 10, 10, 10, 10, 10, 10, 100]);
    const anomalies = detectAnomalies(points, { method: 'zscore', zThreshold: 2.0 });
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0]!.value).toBe(100);
    expect(anomalies[0]!.method).toBe('zscore');
  });

  it('returns no anomalies for uniform data', () => {
    const points = makePoints([5, 5, 5, 5, 5]);
    const anomalies = detectAnomalies(points, { method: 'zscore', zThreshold: 3.0 });
    expect(anomalies.length).toBe(0);
  });

  it('detects IQR anomalies', () => {
    const points = makePoints([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
    const anomalies = detectAnomalies(points, { method: 'iqr', iqrMultiplier: 1.5 });
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies.some((a) => a.value === 100)).toBe(true);
  });

  it('detects moving average anomalies', () => {
    // Use varying data so the moving window has non-zero std
    const points = makePoints([10, 12, 8, 11, 9, 10, 12, 8, 11, 9, 50]);
    const anomalies = detectAnomalies(points, {
      method: 'moving_average',
      windowSize: 5,
      sigmaThreshold: 2.0,
    });
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies.some((a) => a.value === 50)).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(detectAnomalies([], { method: 'zscore' })).toEqual([]);
  });

  it('returns empty for non-numeric points', () => {
    const points: TimeSeriesPoint[] = [
      { timestamp: '2026-01-01', value: 'hot' },
      { timestamp: '2026-01-02', value: 'cold' },
    ];
    expect(detectAnomalies(points, { method: 'zscore' })).toEqual([]);
  });
});

// ── detectInterval ────────────────────────────────────────────

describe('detectInterval', () => {
  it('detects regular 1-minute intervals', () => {
    const points = makePoints([1, 2, 3, 4, 5], 60000);
    const result = detectInterval(points);
    expect(result).not.toBeNull();
    expect(result!.medianIntervalSeconds).toBe(60);
    expect(result!.detectedBucket).toBe('1m');
    expect(result!.isRegular).toBe(true);
  });

  it('detects 1-hour intervals', () => {
    const points = makePoints([1, 2, 3, 4], 3600000);
    const result = detectInterval(points);
    expect(result).not.toBeNull();
    expect(result!.detectedBucket).toBe('1h');
  });

  it('detects 1-day intervals', () => {
    const points = makePoints([1, 2, 3], 86400000);
    const result = detectInterval(points);
    expect(result).not.toBeNull();
    expect(result!.detectedBucket).toBe('1d');
  });

  it('identifies gaps', () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const points: TimeSeriesPoint[] = [
      { timestamp: new Date(base).toISOString(), value: 1 },
      { timestamp: new Date(base + 60000).toISOString(), value: 2 },
      { timestamp: new Date(base + 120000).toISOString(), value: 3 },
      // Gap: 10 minutes
      { timestamp: new Date(base + 720000).toISOString(), value: 4 },
      { timestamp: new Date(base + 780000).toISOString(), value: 5 },
    ];
    const result = detectInterval(points);
    expect(result).not.toBeNull();
    expect(result!.gaps.length).toBeGreaterThanOrEqual(1);
    expect(result!.isRegular).toBe(false);
  });

  it('returns null for fewer than 2 points', () => {
    expect(detectInterval([])).toBeNull();
    expect(detectInterval([{ timestamp: '2026-01-01', value: 1 }])).toBeNull();
  });
});
