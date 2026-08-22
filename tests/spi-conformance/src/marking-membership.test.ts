/**
 * MarkingMembershipStore conformance — the same assertions against every provider.
 *
 * Marking memberships are a SECURITY store: the auth funnel unions
 * listForUser() with the caller's token claims before scoped-session
 * narrowing, so two providers that disagree here disagree about what a
 * caller may see. The semantics pinned:
 *  - grant is idempotent (re-granting refreshes grantedBy/At, not a duplicate);
 *  - revoke is idempotent (revoking a non-membership returns false, not an error);
 *  - listForUser returns only that user's markings, sorted, tenant-scoped;
 *  - listMembers returns only that marking's members, paged, tenant-scoped;
 *  - cross-tenant queries return nothing (tenant isolation).
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { MarkingMembershipStore } from '@altius/spi';
import { InMemoryMarkingMembershipStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresMarkingMembershipStore } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';
// pgTestUrl is a string constant (process.env['PG_TEST_URL']), not a function.

let counter = 0;
const tenant = (label: string) => `t_mm_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<MarkingMembershipStore>): void {
  describe(`[${name}] SPI Conformance: MarkingMembershipStore`, () => {
    it('grant creates a membership; listForUser returns it', async () => {
      const store = await factory();
      const t = tenant('grant');
      const row = await store.grant(t, 'u-1', 'NHS-CONFIDENTIAL', 'admin-1');
      expect(row.tenantId).toBe(t);
      expect(row.userId).toBe('u-1');
      expect(row.marking).toBe('NHS-CONFIDENTIAL');
      expect(row.grantedBy).toBe('admin-1');
      expect(typeof row.grantedAt).toBe('string');
      expect(() => new Date(row.grantedAt).toISOString()).not.toThrow();

      const markings = await store.listForUser(t, 'u-1');
      expect(markings).toEqual(['NHS-CONFIDENTIAL']);
    });

    it('grant is idempotent — re-granting refreshes, not duplicates', async () => {
      const store = await factory();
      const t = tenant('idempotent');
      await store.grant(t, 'u-1', 'SECRET', 'admin-1');
      const row2 = await store.grant(t, 'u-1', 'SECRET', 'admin-2');
      expect(row2.grantedBy).toBe('admin-2');

      const markings = await store.listForUser(t, 'u-1');
      expect(markings).toEqual(['SECRET']); // still one entry
    });

    it('listForUser returns sorted markings for that user only', async () => {
      const store = await factory();
      const t = tenant('sorted');
      await store.grant(t, 'u-1', 'ZEBRA', 'admin-1');
      await store.grant(t, 'u-1', 'ALPHA', 'admin-1');
      await store.grant(t, 'u-2', 'BETA', 'admin-1');

      const u1 = await store.listForUser(t, 'u-1');
      expect(u1).toEqual(['ALPHA', 'ZEBRA']);

      const u2 = await store.listForUser(t, 'u-2');
      expect(u2).toEqual(['BETA']);
    });

    it('revoke removes a membership; returns true', async () => {
      const store = await factory();
      const t = tenant('revoke');
      await store.grant(t, 'u-1', 'SECRET', 'admin-1');
      const removed = await store.revoke(t, 'u-1', 'SECRET');
      expect(removed).toBe(true);

      const markings = await store.listForUser(t, 'u-1');
      expect(markings).toEqual([]);
    });

    it('revoke is idempotent — revoking a non-membership returns false', async () => {
      const store = await factory();
      const t = tenant('revoke-idempotent');
      const removed = await store.revoke(t, 'u-1', 'NEVER_GRANTED');
      expect(removed).toBe(false);
    });

    it('listMembers returns members of a marking, paged', async () => {
      const store = await factory();
      const t = tenant('members');
      await store.grant(t, 'u-1', 'SECRET', 'admin-1');
      await store.grant(t, 'u-2', 'SECRET', 'admin-1');
      await store.grant(t, 'u-3', 'SECRET', 'admin-1');

      const page1 = await store.listMembers(t, 'SECRET', { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);

      const page2 = await store.listMembers(t, 'SECRET', { limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it('cross-tenant queries return nothing (tenant isolation)', async () => {
      const store = await factory();
      const t1 = tenant('iso-1');
      const t2 = tenant('iso-2');
      await store.grant(t1, 'u-1', 'SECRET', 'admin-1');

      // listForUser on t2 must not see t1's grant
      const cross = await store.listForUser(t2, 'u-1');
      expect(cross).toEqual([]);

      // listMembers on t2 must not see t1's grant
      const crossMembers = await store.listMembers(t2, 'SECRET');
      expect(crossMembers).toEqual([]);

      // revoke on t2 must not affect t1
      const crossRevoke = await store.revoke(t2, 'u-1', 'SECRET');
      expect(crossRevoke).toBe(false);

      // t1 still has the grant
      const stillThere = await store.listForUser(t1, 'u-1');
      expect(stillThere).toEqual(['SECRET']);
    });
  });
}

runTests('Memory', async () => new InMemoryMarkingMembershipStore());

// Postgres half — runs when PG_TEST_URL is set
const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => {
    if (provider) await provider.close();
  });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    return new PostgresMarkingMembershipStore(provider.pool);
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: MarkingMembershipStore', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
