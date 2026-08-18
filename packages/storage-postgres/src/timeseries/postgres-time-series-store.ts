/**
 * PostgreSQL TimeSeriesStore — timestamped values for @timeSeries properties.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  TimeSeriesStore,
  TimeSeriesPoint,
  TimeSeriesQuery,
  TimeSeriesResult,
  TimeSeriesBucketPoint,
} from '@altius/spi';

export class PostgresTimeSeriesStore implements TimeSeriesStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async putPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    point: TimeSeriesPoint,
  ): Promise<void> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "timeseries"."points"
        ("id", "tenant_id", "object_type", "object_id", "field", "timestamp", "value", "tags")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ctx.tenantId, objectType, objectId, property, point.timestamp, point.value, point.tags ? JSON.stringify(point.tags) : null],
    );
  }

  async putPoints(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    points: TimeSeriesPoint[],
  ): Promise<void> {
    // Batch insert using unnest for efficiency.
    const ids = points.map(() => randomUUID());
    const tenantIds = points.map(() => ctx.tenantId);
    const objectTypes = points.map(() => objectType);
    const objectIds = points.map(() => objectId);
    const fields = points.map(() => property);
    const timestamps = points.map(p => p.timestamp);
    const values = points.map(p => p.value);
    const tags = points.map(p => p.tags ? JSON.stringify(p.tags) : null);

    await this.pool.query(
      `INSERT INTO "timeseries"."points"
        ("id", "tenant_id", "object_type", "object_id", "field", "timestamp", "value", "tags")
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::text[], $8::jsonb[])`,
      [ids, tenantIds, objectTypes, objectIds, fields, timestamps, values.map(String), tags],
    );
  }

  async getSeries(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult> {
    const conditions = [`"tenant_id" = $1`, `"object_type" = $2`, `"object_id" = $3`, `"field" = $4`];
    const params: unknown[] = [ctx.tenantId, objectType, objectId, property];
    let idx = 5;

    if (query.start) {
      conditions.push(`"timestamp" >= $${idx++}`);
      params.push(query.start);
    }
    if (query.end) {
      conditions.push(`"timestamp" < $${idx++}`);
      params.push(query.end);
    }

    const order = query.order === 'desc' ? 'DESC' : 'ASC';
    const limit = query.limit ?? 10000;

    // If bucketing is requested, aggregate; otherwise return raw points.
    if (query.bucket) {
      const fn = query.bucket.function.toUpperCase();
      const interval = query.bucket.interval;
      const bucketQuery = `SELECT
        date_trunc($${idx++}, "timestamp") AS bucket_start,
        ${fn}("value"::numeric) AS value,
        COUNT(*)::int AS count
       FROM "timeseries"."points"
       WHERE ${conditions.join(' AND ')}
       GROUP BY bucket_start
       ORDER BY bucket_start ${order}
       LIMIT $${idx++}`;
      const bucketParams = [...params, interval, limit];
      const result = await this.pool.query(bucketQuery, bucketParams);

      const buckets: TimeSeriesBucketPoint[] = result.rows.map(r => ({
        timestamp: r['bucket_start'],
        value: Number(r['value']),
        count: r['count'],
      }));

      return { objectType, objectId, property, buckets, totalCount: buckets.length };
    }

    const result = await this.pool.query(
      `SELECT "timestamp", "value", "tags" FROM "timeseries"."points"
       WHERE ${conditions.join(' AND ')}
       ORDER BY "timestamp" ${order}
       LIMIT $${idx++}`,
      [...params, limit],
    );

    const points: TimeSeriesPoint[] = result.rows.map(r => ({
      timestamp: r['timestamp'],
      value: r['value'],
      tags: r['tags'] ?? undefined,
    }));

    return { objectType, objectId, property, points, totalCount: points.length };
  }

  async deleteRange(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    start: string,
    end: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM "timeseries"."points"
       WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3 AND "field" = $4
       AND "timestamp" >= $5 AND "timestamp" < $6`,
      [ctx.tenantId, objectType, objectId, property, start, end],
    );
    return result.rowCount ?? 0;
  }

  async getLatestPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
  ): Promise<TimeSeriesPoint | null> {
    const result = await this.pool.query(
      `SELECT "timestamp", "value", "tags" FROM "timeseries"."points"
       WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3 AND "field" = $4
       ORDER BY "timestamp" DESC LIMIT 1`,
      [ctx.tenantId, objectType, objectId, property],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0]!;
    return { timestamp: r['timestamp'], value: r['value'], tags: r['tags'] ?? undefined };
  }
}
