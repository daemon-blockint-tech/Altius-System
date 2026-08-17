/**
 * Bucket interval must be allowlisted before it reaches SQL.
 *
 * `date_trunc('${bucket.interval}', col)` interpolates the interval as a raw
 * SQL string literal. Every other untrusted input on this path is either
 * parameterised or allowlisted — the aggregate function has ALLOWED_FNS, the
 * field names are quoted identifiers checked against the schema by the REST
 * route. The interval had neither: the REST aggregate route casts the body
 * value (`b.interval.toLowerCase() as BucketInterval`) without a runtime
 * check, so an authenticated caller controlled that literal and could close
 * the quote. GraphQL is safe only because its SDL enum rejects the value
 * first; nothing protected REST, MCP, or any future caller.
 *
 * No PostgreSQL required — the pool is stubbed so the generated SQL can be
 * inspected without a live database.
 */
import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext, BucketInterval } from '@altius/spi';
import { aggregateObjects } from '../objects/aggregate.js';

const ctx: RequestContext = { tenantId: 't1' };

/** A Pool stub that records every SQL string it is asked to run. */
function stubPool(captured: string[]): Pool {
  return {
    query: async (sql: string) => {
      captured.push(sql);
      // The total-group count query reads rows[0].cnt; the main query maps rows.
      return { rows: [{ cnt: '0' }] };
    },
  } as unknown as Pool;
}

describe('aggregateObjects — bucket interval', () => {
  it('rejects an interval outside the allowlist instead of interpolating it', async () => {
    const captured: string[] = [];
    const malicious =
      "day', \"amount\") AS a, (SELECT current_setting('is_superuser')) AS pwned --";

    await expect(
      aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [{ field: 'timestamp', interval: malicious as BucketInterval }],
      }),
    ).rejects.toThrow(/Invalid bucket interval/);

    // Nothing may reach the database at all.
    expect(captured.join('\n')).not.toContain('pwned');
    expect(captured).toHaveLength(0);
  });

  it.each(['day', 'week', 'month', 'year'] as BucketInterval[])(
    'accepts the supported interval %s',
    async (interval) => {
      const captured: string[] = [];

      await aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [{ field: 'timestamp', interval }],
      });

      expect(captured.join('\n')).toContain(`date_trunc('${interval}'`);
    },
  );

  it('rejects a case-variant that would otherwise slip past a lowercase check', async () => {
    const captured: string[] = [];

    await expect(
      aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [
          { field: 'timestamp', interval: 'DAY; DROP TABLE x' as BucketInterval },
        ],
      }),
    ).rejects.toThrow(/Invalid bucket interval/);
    expect(captured).toHaveLength(0);
  });

  it('emits width_bucket for NumericBucket with parameterized min/max/numBuckets', async () => {
    const captured: string[] = [];

    await aggregateObjects(stubPool(captured), ctx, 'Transaction', {
      fields: [{ field: '*', fn: 'count' }],
      buckets: [{ field: 'amount', min: 0, max: 100, numBuckets: 5 }],
    });

    const sql = captured.join('\n');
    expect(sql).toContain('width_bucket(');
    // min/max/numBuckets must be parameterized, not interpolated
    expect(sql).toMatch(/\$\d+,\s*\$\d+,\s*\$\d+\)/);
    expect(sql).not.toContain('width_bucket("amount"::numeric, 0, 100, 5)');
  });

  it('rejects NumericBucket with numBuckets <= 0', async () => {
    const captured: string[] = [];

    await expect(
      aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [{ field: 'amount', min: 0, max: 100, numBuckets: 0 }],
      }),
    ).rejects.toThrow(/numBuckets must be positive/);
    expect(captured).toHaveLength(0);
  });

  it('rejects NumericBucket with min >= max', async () => {
    const captured: string[] = [];

    await expect(
      aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [{ field: 'amount', min: 100, max: 100, numBuckets: 5 }],
      }),
    ).rejects.toThrow(/min must be less than max/);
    expect(captured).toHaveLength(0);
  });

  it('rejects NumericBucket with non-numeric min/max/numBuckets', async () => {
    const captured: string[] = [];

    await expect(
      aggregateObjects(stubPool(captured), ctx, 'Transaction', {
        fields: [{ field: '*', fn: 'count' }],
        buckets: [{ field: 'amount', min: '0' as unknown as number, max: 100, numBuckets: 5 }],
      }),
    ).rejects.toThrow(/requires numeric min, max, and numBuckets/);
    expect(captured).toHaveLength(0);
  });
});
