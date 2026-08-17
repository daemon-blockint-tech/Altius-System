/**
 * In-memory time-series store for development and testing.
 *
 * Stores points in a per-tenant Map keyed by (objectType, objectId, property).
 * Points are sorted by timestamp. Bucketing is computed on read.
 */

import type {
  TimeSeriesStore,
  TimeSeriesPoint,
  TimeSeriesQuery,
  TimeSeriesResult,
  TimeSeriesBucketPoint,
} from '@altius/spi';

interface SeriesKey {
  tenantId: string;
  objectType: string;
  objectId: string;
  property: string;
}

function keyToString(k: SeriesKey): string {
  return `${k.tenantId}:${k.objectType}:${k.objectId}:${k.property}`;
}

export class InMemoryTimeSeriesStore implements TimeSeriesStore {
  private readonly series = new Map<string, TimeSeriesPoint[]>();

  async putPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    point: TimeSeriesPoint,
  ): Promise<void> {
    const key = keyToString({ tenantId: ctx.tenantId, objectType, objectId, property });
    let points = this.series.get(key);
    if (!points) {
      points = [];
      this.series.set(key, points);
    }
    points.push(point);
    // Keep sorted by timestamp
    points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async putPoints(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    newPoints: TimeSeriesPoint[],
  ): Promise<void> {
    for (const p of newPoints) {
      await this.putPoint(ctx, objectType, objectId, property, p);
    }
  }

  async getSeries(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    const key = keyToString({ tenantId: ctx.tenantId, objectType, objectId, property });
    let points = this.series.get(key) ?? [];

    // Filter by time range
    if (query.start) {
      points = points.filter(p => p.timestamp >= query.start!);
    }
    if (query.end) {
      points = points.filter(p => p.timestamp < query.end!);
    }

    // Filter by tags
    if (query.tags) {
      points = points.filter(p => {
        if (!p.tags) return false;
        return Object.entries(query.tags!).every(([k, v]) => p.tags![k] === v);
      });
    }

    const totalCount = points.length;

    // Order
    const order = query.order ?? 'asc';
    if (order === 'desc') {
      points = [...points].reverse();
    }

    // Bucketing
    if (query.bucket) {
      const buckets = this.bucketize(points, query.bucket.interval, query.bucket.function);
      return {
        objectType,
        objectId,
        property,
        buckets,
        totalCount,
      };
    }

    // Limit
    if (query.limit) {
      points = points.slice(0, query.limit);
    }

    return {
      objectType,
      objectId,
      property,
      points,
      totalCount,
    };
  }

  async deleteRange(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    start: string,
    end: string,
  ): Promise<number> {
    const key = keyToString({ tenantId: ctx.tenantId, objectType, objectId, property });
    const points = this.series.get(key);
    if (!points) return 0;

    const before = points.length;
    const remaining = points.filter(p => p.timestamp < start || p.timestamp >= end);
    this.series.set(key, remaining);
    return before - remaining.length;
  }

  async getLatestPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
  ): Promise<TimeSeriesPoint | null> {
    const key = keyToString({ tenantId: ctx.tenantId, objectType, objectId, property });
    const points = this.series.get(key);
    if (!points || points.length === 0) return null;
    return points[points.length - 1] ?? null;
  }

  /**
   * Bucketize points into fixed-width time intervals.
   */
  private bucketize(
    points: TimeSeriesPoint[],
    interval: string,
    fn: string,
  ): TimeSeriesBucketPoint[] {
    if (points.length === 0) return [];

    const bucketMs = this.parseInterval(interval);
    if (bucketMs === 0) return [];

    // Group points into buckets
    const buckets = new Map<number, TimeSeriesPoint[]>();
    for (const p of points) {
      const ts = new Date(p.timestamp).getTime();
      const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
      const arr = buckets.get(bucketStart) ?? [];
      arr.push(p);
      buckets.set(bucketStart, arr);
    }

    // Aggregate each bucket
    const result: TimeSeriesBucketPoint[] = [];
    for (const [bucketStart, bucketPoints] of buckets) {
      const values = bucketPoints.map(p => p.value).filter((v): v is number => typeof v === 'number');
      let value = 0;
      switch (fn) {
        case 'avg':
          value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case 'sum':
          value = values.reduce((a, b) => a + b, 0);
          break;
        case 'min':
          value = values.length > 0 ? Math.min(...values) : 0;
          break;
        case 'max':
          value = values.length > 0 ? Math.max(...values) : 0;
          break;
        case 'count':
          value = bucketPoints.length;
          break;
        case 'first': {
          const first = bucketPoints[0];
          value = first && typeof first.value === 'number' ? first.value : 0;
          break;
        }
        case 'last': {
          const last = bucketPoints[bucketPoints.length - 1];
          value = last && typeof last.value === 'number' ? last.value : 0;
          break;
        }
      }
      result.push({
        timestamp: new Date(bucketStart).toISOString(),
        value,
        count: bucketPoints.length,
      });
    }

    // Sort by bucket start
    result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return result;
  }

  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smhdw])$/);
    if (!match) return 0;
    const n = parseInt(match[1]!, 10);
    const unit = match[2]!;
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    };
    return n * (multipliers[unit] ?? 0);
  }
}
