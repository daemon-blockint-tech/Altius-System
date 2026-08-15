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
import { MAX_LINK_QUERY_LIMIT } from '@altius/spi';
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
});
