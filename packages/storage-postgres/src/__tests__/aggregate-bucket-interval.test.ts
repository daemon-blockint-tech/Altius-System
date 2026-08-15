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
});
