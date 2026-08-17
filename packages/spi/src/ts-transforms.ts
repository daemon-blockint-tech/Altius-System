/**
 * Time-series transform and summarizer engine.
 *
 * Provides operations for transforming and summarizing time-series data:
 *   - Resampling/downsampling to coarser intervals
 *   - Rolling window aggregates (moving average, rolling sum, etc.)
 *   - Lag/lead/diff operations
 *   - Interpolation (linear, forward-fill, backward-fill)
 *   - Series arithmetic (add, subtract, multiply, divide)
 *   - Smoothing (exponential, simple moving average)
 *   - Statistical summaries (mean, median, std, min, max, range)
 */

import type { TimeSeriesPoint } from './time-series.js';

// ---------------------------------------------------------------------------
// Transform operations
// ---------------------------------------------------------------------------

/** Resample a series to a coarser interval by aggregating points within each bucket. */
export function resample(
  points: TimeSeriesPoint[],
  intervalSeconds: number,
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'first' | 'last',
): TimeSeriesPoint[] {
  if (points.length === 0 || intervalSeconds <= 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const buckets = new Map<number, TimeSeriesPoint[]>();

  for (const p of sorted) {
    const t = new Date(p.timestamp).getTime();
    const bucketStart = Math.floor(t / (intervalSeconds * 1000)) * (intervalSeconds * 1000);
    const arr = buckets.get(bucketStart) ?? [];
    arr.push(p);
    buckets.set(bucketStart, arr);
  }

  const result: TimeSeriesPoint[] = [];
  for (const [bucketStart, bucketPoints] of buckets) {
    const values = bucketPoints.map(p => p.value).filter((v): v is number => typeof v === 'number');
    if (values.length === 0) continue;
    let value: number;
    switch (aggregation) {
      case 'avg': value = values.reduce((s, v) => s + v, 0) / values.length; break;
      case 'sum': value = values.reduce((s, v) => s + v, 0); break;
      case 'min': value = Math.min(...values); break;
      case 'max': value = Math.max(...values); break;
      case 'count': value = values.length; break;
      case 'first': value = values[0]!; break;
      case 'last': value = values[values.length - 1]!; break;
    }
    result.push({ timestamp: new Date(bucketStart).toISOString(), value });
  }

  return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Rolling window aggregate over a series. */
export function rollingAggregate(
  points: TimeSeriesPoint[],
  windowSize: number,
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'std',
): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const result: TimeSeriesPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = sorted.slice(start, i + 1)
      .map(p => p.value)
      .filter((v): v is number => typeof v === 'number');
    if (window.length === 0) continue;

    let value: number;
    switch (aggregation) {
      case 'avg': value = window.reduce((s, v) => s + v, 0) / window.length; break;
      case 'sum': value = window.reduce((s, v) => s + v, 0); break;
      case 'min': value = Math.min(...window); break;
      case 'max': value = Math.max(...window); break;
      case 'std': {
        const mean = window.reduce((s, v) => s + v, 0) / window.length;
        const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
        value = Math.sqrt(variance);
        break;
      }
    }
    result.push({ timestamp: sorted[i]!.timestamp, value });
  }

  return result;
}

/** Compute the lag (value shifted by n positions). */
export function lag(points: TimeSeriesPoint[], n: number): TimeSeriesPoint[] {
  if (points.length === 0 || n <= 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const result: TimeSeriesPoint[] = [];
  for (let i = n; i < sorted.length; i++) {
    result.push({ timestamp: sorted[i]!.timestamp, value: sorted[i - n]!.value });
  }
  return result;
}

/** Compute the difference between consecutive points. */
export function diff(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const result: TimeSeriesPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.value;
    const curr = sorted[i]!.value;
    if (typeof prev === 'number' && typeof curr === 'number') {
      result.push({ timestamp: sorted[i]!.timestamp, value: curr - prev });
    }
  }
  return result;
}

/** Forward-fill missing values (carry last known value forward). */
export function forwardFill(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const result: TimeSeriesPoint[] = [];
  let lastValue: number | undefined;
  for (const p of sorted) {
    if (typeof p.value === 'number') {
      lastValue = p.value;
      result.push({ ...p });
    } else if (lastValue !== undefined) {
      result.push({ ...p, value: lastValue });
    }
  }
  return result;
}

/** Linear interpolation between points at regular intervals. */
export function linearInterpolate(
  points: TimeSeriesPoint[],
  intervalSeconds: number,
): TimeSeriesPoint[] {
  if (points.length === 0 || intervalSeconds <= 0) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const numericPoints = sorted.filter(p => typeof p.value === 'number') as Array<{ timestamp: string; value: number }>;
  if (numericPoints.length === 0) return [];

  const result: TimeSeriesPoint[] = [];
  const intervalMs = intervalSeconds * 1000;
  const startTime = new Date(numericPoints[0]!.timestamp).getTime();
  const endTime = new Date(numericPoints[numericPoints.length - 1]!.timestamp).getTime();

  for (let t = startTime; t <= endTime; t += intervalMs) {
    const ts = new Date(t).toISOString();
    // Find surrounding points
    let prev: { timestamp: string; value: number } | undefined;
    let next: { timestamp: string; value: number } | undefined;
    for (const p of numericPoints) {
      const pt = new Date(p.timestamp).getTime();
      if (pt <= t) prev = p;
      if (pt >= t && !next) next = p;
    }
    if (!prev || !next) continue;
    if (prev === next) {
      result.push({ timestamp: ts, value: prev.value });
      continue;
    }
    const prevT = new Date(prev.timestamp).getTime();
    const nextT = new Date(next.timestamp).getTime();
    const ratio = (t - prevT) / (nextT - prevT);
    const value = prev.value + (next.value - prev.value) * ratio;
    result.push({ timestamp: ts, value });
  }

  return result;
}

/** Exponential smoothing. */
export function exponentialSmoothing(points: TimeSeriesPoint[], alpha: number): TimeSeriesPoint[] {
  if (points.length === 0 || alpha <= 0 || alpha > 1) return [];
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const numericPoints = sorted.filter(p => typeof p.value === 'number') as Array<{ timestamp: string; value: number }>;
  if (numericPoints.length === 0) return [];

  const result: TimeSeriesPoint[] = [{ ...numericPoints[0]! }];
  for (let i = 1; i < numericPoints.length; i++) {
    const prevSmoothed = result[i - 1]!.value as number;
    const currentValue = numericPoints[i]!.value;
    const smoothed = alpha * currentValue + (1 - alpha) * prevSmoothed;
    result.push({ timestamp: numericPoints[i]!.timestamp, value: smoothed });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Series arithmetic
// ---------------------------------------------------------------------------

/** Add two series point-by-point (matching by timestamp). */
export function addSeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return arithmetic(a, b, (x, y) => x + y);
}

/** Subtract series b from series a. */
export function subtractSeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return arithmetic(a, b, (x, y) => x - y);
}

/** Multiply two series. */
export function multiplySeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return arithmetic(a, b, (x, y) => x * y);
}

/** Divide series a by series b. */
export function divideSeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return arithmetic(a, b, (x, y) => y === 0 ? 0 : x / y);
}

function arithmetic(
  a: TimeSeriesPoint[],
  b: TimeSeriesPoint[],
  op: (x: number, y: number) => number,
): TimeSeriesPoint[] {
  const bMap = new Map(b.map(p => [p.timestamp, p.value]));
  const result: TimeSeriesPoint[] = [];
  for (const pa of a) {
    const bv = bMap.get(pa.timestamp);
    if (typeof pa.value === 'number' && typeof bv === 'number') {
      result.push({ timestamp: pa.timestamp, value: op(pa.value, bv) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Statistical summary
// ---------------------------------------------------------------------------

/** Statistical summary of a series. */
export interface SeriesSummary {
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  range: number;
  first: number;
  last: number;
  sum: number;
}

/** Compute a statistical summary of a series. */
export function summarize(points: TimeSeriesPoint[]): SeriesSummary | null {
  const values = points
    .map(p => p.value)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  if (values.length === 0) return null;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = values.length % 2 === 0
    ? (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2
    : values[Math.floor(values.length / 2)]!;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;

  return {
    count: values.length,
    mean,
    median,
    std: Math.sqrt(variance),
    min: values[0]!,
    max: values[values.length - 1]!,
    range: values[values.length - 1]! - values[0]!,
    first: values[0]!,
    last: values[values.length - 1]!,
    sum: values.reduce((s, v) => s + v, 0),
  };
}
