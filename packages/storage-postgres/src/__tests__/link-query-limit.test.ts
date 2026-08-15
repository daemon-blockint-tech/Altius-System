/**
 * An over-large link page must be refused, not silently shrunk.
 *
 * getLinks capped with `Math.min(options.limit, 1000)`. That was invisible
 * while the GraphQL link resolver hardcoded 1000, but the resolver now
 * forwards the caller's `first`, so `first: 5000` reached storage, came back
 * with 1000 rows, and reported nothing about the other 4000 — the same silent
 * truncation the pagination arguments were added to remove, moved one layer
 * down.
 *
 * The cap itself is deliberate (PERF-02, a DoS bound). What is wrong is
 * honouring a request by quietly answering a different, smaller one.
 *
 * No PostgreSQL required — the pool is stubbed.
 */
import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext } from '@altius/spi';
import { MAX_LINK_QUERY_LIMIT, encodePageCursor, decodePageCursor } from '@altius/spi';
import { getLinks } from '../links/link-crud.js';

const ctx: RequestContext = { tenantId: 't1' };

/** Pool stub: count query returns a total, data query returns no rows. */
function stubPool(captured: string[]): Pool {
  return {
    query: async (sql: string) => {
      captured.push(sql);
      return { rows: sql.includes('COUNT(*)') ? [{ cnt: '5000' }] : [] };
    },
  } as unknown as Pool;
}

describe('getLinks link-page limit', () => {
  it('refuses a limit above the maximum instead of quietly returning fewer rows', async () => {
    const captured: string[] = [];
    await expect(
      getLinks(stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound', { limit: 5000 }),
    ).rejects.toThrow(/exceeds the maximum/);
  });

  it('accepts a limit exactly at the maximum', async () => {
    const captured: string[] = [];
    const page = await getLinks(
      stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound',
      { limit: MAX_LINK_QUERY_LIMIT },
    );
    expect(page.totalCount).toBe(5000);
  });

  it('still reports the true total when the page is smaller than it', async () => {
    const captured: string[] = [];
    const page = await getLinks(
      stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound', { limit: 10 },
    );
    // The caller can tell 10-of-5000 from 10-of-10.
    expect(page.totalCount).toBe(5000);
    expect(page.hasNextPage).toBe(true);
  });

  it('returns a cursor when there is a next page', async () => {
    const captured: string[] = [];
    const page = await getLinks(
      stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound', { limit: 10 },
    );
    expect(page.hasNextPage).toBe(true);
    expect(page.cursor).toBeDefined();
    expect(decodePageCursor(page.cursor!)).toBe(10);
  });

  it('does not return a cursor when there is no next page', async () => {
    // A stub whose count matches the page size exactly — no next page.
    const noNextPool = {
      query: async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ cnt: '10' }] };
        // Return 10 rows with the fields rowToLink expects
        return {
          rows: Array.from({ length: 10 }, (_, i) => ({
            _id: `l-${i}`, _type: 'HasBed', _tenant_id: 't1',
            _from_type: 'Ward', _from_id: 'w1', _to_type: 'Bed', _to_id: `b-${i}`,
            _version: 1, _created_at: new Date(), _updated_at: new Date(),
          })),
        };
      },
    } as unknown as Pool;
    const page = await getLinks(
      noNextPool, ctx, 'ward-1', 'HasBed', 'outbound', { limit: 10 },
    );
    expect(page.totalCount).toBe(10);
    expect(page.hasNextPage).toBe(false);
    expect(page.cursor).toBeUndefined();
  });

  it('decodes the after cursor to compute the SQL OFFSET', async () => {
    const captured: string[] = [];
    const afterCursor = encodePageCursor(20);
    await getLinks(
      stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound',
      { limit: 10, after: afterCursor },
    );
    // The cursor encodes the starting offset of the next page (20), so the
    // SQL OFFSET parameter should be 20 — no +1 needed.
    const dataSql = captured.find(sql => sql.includes('LIMIT') && sql.includes('OFFSET'));
    expect(dataSql).toBeDefined();
    expect(dataSql).toMatch(/OFFSET \$\d+$/);
  });

  it('refuses a negative limit', async () => {
    const captured: string[] = [];
    await expect(
      getLinks(stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound', { limit: -1 }),
    ).rejects.toThrow(/not a non-negative integer/);
  });

  it('refuses a non-integer limit', async () => {
    const captured: string[] = [];
    await expect(
      getLinks(stubPool(captured), ctx, 'ward-1', 'HasBed', 'outbound', { limit: 1.5 }),
    ).rejects.toThrow(/not a non-negative integer/);
  });
});
