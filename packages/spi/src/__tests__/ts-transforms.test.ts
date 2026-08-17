/**
 * Tests for time-series transform and summarizer functions.
 */

import { describe, it, expect } from 'vitest';
import {
  resample,
  rollingAggregate,
  lag,
  diff,
  forwardFill,
  linearInterpolate,
  exponentialSmoothing,
  addSeries,
  subtractSeries,
  multiplySeries,
  divideSeries,
  summarize,
} from '@altius/spi';
import type { TimeSeriesPoint } from '@altius/spi';

function ts(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

const POINTS: TimeSeriesPoint[] = [
  { timestamp: ts(0), value: 10 },
  { timestamp: ts(10), value: 20 },
  { timestamp: ts(20), value: 30 },
  { timestamp: ts(30), value: 40 },
  { timestamp: ts(40), value: 50 },
];

describe('resample', () => {
  it('resamples to coarser intervals with avg', () => {
    const result = resample(POINTS, 20, 'avg');
    expect(result).toHaveLength(3);
    expect(result[0]!.value).toBe(15); // avg(10,20)
    expect(result[1]!.value).toBe(35); // avg(30,40)
    expect(result[2]!.value).toBe(50); // just 50
  });

  it('resamples with sum', () => {
    const result = resample(POINTS, 20, 'sum');
    expect(result[0]!.value).toBe(30); // 10+20
    expect(result[1]!.value).toBe(70); // 30+40
  });

  it('handles empty input', () => {
    expect(resample([], 10, 'avg')).toEqual([]);
  });
});

describe('rollingAggregate', () => {
  it('computes rolling average with window 3', () => {
    const result = rollingAggregate(POINTS, 3, 'avg');
    expect(result).toHaveLength(5);
    expect(result[0]!.value).toBe(10); // [10]
    expect(result[1]!.value).toBe(15); // [10,20]
    expect(result[2]!.value).toBe(20); // [10,20,30]
    expect(result[3]!.value).toBe(30); // [20,30,40]
    expect(result[4]!.value).toBe(40); // [30,40,50]
  });

  it('computes rolling sum', () => {
    const result = rollingAggregate(POINTS, 2, 'sum');
    expect(result[0]!.value).toBe(10);
    expect(result[1]!.value).toBe(30); // 10+20
    expect(result[2]!.value).toBe(50); // 20+30
  });

  it('computes rolling std', () => {
    const result = rollingAggregate(POINTS, 3, 'std');
    expect(result).toHaveLength(5);
    // std of [10,20,30] = sqrt(((10-20)^2+(20-20)^2+(30-20)^2)/3) = sqrt(66.67) ≈ 8.16
    expect(result[2]!.value).toBeCloseTo(8.16, 1);
  });
});

describe('lag', () => {
  it('shifts values by n', () => {
    const result = lag(POINTS, 1);
    expect(result).toHaveLength(4);
    expect(result[0]!.value).toBe(10); // shifted from index 0
    expect(result[1]!.value).toBe(20);
    expect(result[2]!.value).toBe(30);
    expect(result[3]!.value).toBe(40);
  });

  it('handles lag larger than array', () => {
    const result = lag(POINTS, 10);
    expect(result).toEqual([]);
  });
});

describe('diff', () => {
  it('computes differences between consecutive points', () => {
    const result = diff(POINTS);
    expect(result).toHaveLength(4);
    expect(result[0]!.value).toBe(10); // 20-10
    expect(result[1]!.value).toBe(10); // 30-20
    expect(result[2]!.value).toBe(10); // 40-30
  });
});

describe('forwardFill', () => {
  it('fills non-numeric values with last known', () => {
    const points: TimeSeriesPoint[] = [
      { timestamp: ts(0), value: 10 },
      { timestamp: ts(10), value: 'missing' as unknown as number },
      { timestamp: ts(20), value: 30 },
    ];
    const result = forwardFill(points);
    expect(result).toHaveLength(3);
    expect(result[1]!.value).toBe(10); // filled with 10
  });
});

describe('linearInterpolate', () => {
  it('interpolates between points at regular intervals', () => {
    const points: TimeSeriesPoint[] = [
      { timestamp: ts(0), value: 0 },
      { timestamp: ts(10), value: 100 },
    ];
    const result = linearInterpolate(points, 5);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]!.value).toBe(0);
    expect(result[1]!.value).toBeCloseTo(50, 0);
    expect(result[2]!.value).toBeCloseTo(100, 0);
  });
});

describe('exponentialSmoothing', () => {
  it('applies exponential smoothing', () => {
    const result = exponentialSmoothing(POINTS, 0.5);
    expect(result).toHaveLength(5);
    expect(result[0]!.value).toBe(10); // first value unchanged
    expect(result[1]!.value).toBe(15); // 0.5*20 + 0.5*10
    expect(result[2]!.value).toBe(22.5); // 0.5*30 + 0.5*15
  });
});

describe('series arithmetic', () => {
  const A: TimeSeriesPoint[] = [
    { timestamp: ts(0), value: 10 },
    { timestamp: ts(10), value: 20 },
  ];
  const B: TimeSeriesPoint[] = [
    { timestamp: ts(0), value: 5 },
    { timestamp: ts(10), value: 4 },
  ];

  it('adds series', () => {
    const result = addSeries(A, B);
    expect(result[0]!.value).toBe(15);
    expect(result[1]!.value).toBe(24);
  });

  it('subtracts series', () => {
    const result = subtractSeries(A, B);
    expect(result[0]!.value).toBe(5);
    expect(result[1]!.value).toBe(16);
  });

  it('multiplies series', () => {
    const result = multiplySeries(A, B);
    expect(result[0]!.value).toBe(50);
    expect(result[1]!.value).toBe(80);
  });

  it('divides series', () => {
    const result = divideSeries(A, B);
    expect(result[0]!.value).toBe(2);
    expect(result[1]!.value).toBe(5);
  });
});

describe('summarize', () => {
  it('computes statistical summary', () => {
    const summary = summarize(POINTS);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(5);
    expect(summary!.mean).toBe(30);
    expect(summary!.median).toBe(30);
    expect(summary!.min).toBe(10);
    expect(summary!.max).toBe(50);
    expect(summary!.range).toBe(40);
    expect(summary!.sum).toBe(150);
    expect(summary!.first).toBe(10);
    expect(summary!.last).toBe(50);
  });

  it('returns null for empty series', () => {
    expect(summarize([])).toBeNull();
  });

  it('returns null for non-numeric series', () => {
    const points: TimeSeriesPoint[] = [
      { timestamp: ts(0), value: 'a' },
      { timestamp: ts(10), value: 'b' },
    ];
    expect(summarize(points)).toBeNull();
  });
});
