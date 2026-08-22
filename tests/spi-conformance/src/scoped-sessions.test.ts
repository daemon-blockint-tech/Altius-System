/**
 * ScopedSessionStore conformance — the same assertions against every provider.
 *
 * Scoped sessions are a SECURITY store: the auth funnel restricts a caller's
 * effective markings from getActiveForUser, and the check-marking route
 * answers from isMarkingAllowed. Two providers that disagree here disagree
 * about what a caller may see, with neither erring. The semantics pinned:
 *  - empty allowedMarkings = NOTHING allowed (fail closed, matching the
 *    funnel's intersection semantics), never "everything";
 *  - with several active sessions, the MOST RECENTLY CREATED one governs;
 *  - timestamps cross the SPI as ISO 8601 strings, whatever the column type.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { ScopedSessionStore, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryScopedSessionStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresScopedSessionStore } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

let counter = 0;
const tenant = (label: string) => `t_scs_${label}_${counter++}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function runTests(name: string, factory: () => Promise<ScopedSessionStore>): void {
  describe(`[${name}] SPI Conformance: ScopedSessionStore`, () => {
    it('creates and gets a session; timestamps are ISO strings', async () => {
      const store = await factory();
      const t = tenant('create');
      const created = await store.create(t, 'admin-1', {
        userId: 'u-1', allowedMarkings: ['NHS'], excludedMarkings: ['PII'],
        label: 'ward round', durationSeconds: 3600,
      });
      const got = await store.get(t, created.id);
      expect(got).not.toBeNull();
      expect(got!.userId).toBe('u-1');
      expect(got!.allowedMarkings).toEqual(['NHS']);
      expect(got!.excludedMarkings).toEqual(['PII']);
      expect(got!.revoked).toBe(false);
      expect(typeof got!.createdAt).toBe('string');
      expect(typeof got!.expiresAt).toBe('string');
      expect(() => new Date(got!.createdAt).toISOString()).not.toThrow();
    });

    it('getActiveForUser skips revoked and expired sessions', async () => {
      const store = await factory();
      const t = tenant('active');
      const revoked = await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['A'], label: 'r', durationSeconds: 3600 });
      await store.revoke(t, revoked.id);
      await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['B'], label: 'e', durationSeconds: -5 });
      expect(await store.getActiveForUser(t, 'u-1')).toBeNull();
    });

    it('getActiveForUser returns the MOST RECENTLY CREATED active session', async () => {
      const store = await factory();
      const t = tenant('newest');
      await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['OLD'], label: 'old', durationSeconds: 3600 });
      await sleep(10);
      await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['NEW'], label: 'new', durationSeconds: 3600 });
      const active = await store.getActiveForUser(t, 'u-1');
      expect(active).not.toBeNull();
      expect(active!.allowedMarkings).toEqual(['NEW']);
    });

    it('revoke flips the flag and removes the session from active lookup', async () => {
      const store = await factory();
      const t = tenant('revoke');
      const s = await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['A'], label: 'x', durationSeconds: 3600 });
      await store.revoke(t, s.id);
      expect((await store.get(t, s.id))!.revoked).toBe(true);
      expect(await store.getActiveForUser(t, 'u-1')).toBeNull();
    });

    it('isMarkingAllowed: allowed yes; excluded no; not listed no', async () => {
      const store = await factory();
      const t = tenant('marking');
      const s = await store.create(t, 'a', {
        userId: 'u-1', allowedMarkings: ['NHS', 'PII'], excludedMarkings: ['PII'],
        label: 'x', durationSeconds: 3600,
      });
      expect(await store.isMarkingAllowed(t, s.id, 'NHS')).toBe(true);
      expect(await store.isMarkingAllowed(t, s.id, 'PII')).toBe(false); // excluded beats allowed
      expect(await store.isMarkingAllowed(t, s.id, 'SECRET')).toBe(false);
    });

    it('isMarkingAllowed: EMPTY allowedMarkings allows NOTHING (fail closed)', async () => {
      const store = await factory();
      const t = tenant('empty');
      const s = await store.create(t, 'a', { userId: 'u-1', allowedMarkings: [], label: 'lockdown', durationSeconds: 3600 });
      expect(await store.isMarkingAllowed(t, s.id, 'NHS')).toBe(false);
      expect(await store.isMarkingAllowed(t, s.id, 'ANYTHING')).toBe(false);
    });

    it('isMarkingAllowed: revoked, expired, and unknown sessions deny', async () => {
      const store = await factory();
      const t = tenant('deny');
      const revoked = await store.create(t, 'a', { userId: 'u-1', allowedMarkings: ['A'], label: 'r', durationSeconds: 3600 });
      await store.revoke(t, revoked.id);
      const expired = await store.create(t, 'a', { userId: 'u-2', allowedMarkings: ['A'], label: 'e', durationSeconds: -5 });
      expect(await store.isMarkingAllowed(t, revoked.id, 'A')).toBe(false);
      expect(await store.isMarkingAllowed(t, expired.id, 'A')).toBe(false);
      expect(await store.isMarkingAllowed(t, 'no-such-session', 'A')).toBe(false);
    });

    it('tenant isolation: a session is invisible and unusable cross-tenant', async () => {
      const store = await factory();
      const tA = tenant('iso_a');
      const tB = tenant('iso_b');
      const s = await store.create(tA, 'a', { userId: 'u-1', allowedMarkings: ['A'], label: 'x', durationSeconds: 3600 });
      expect(await store.get(tB, s.id)).toBeNull();
      expect(await store.getActiveForUser(tB, 'u-1')).toBeNull();
      expect(await store.list(tB)).toEqual([]);
      expect(await store.isMarkingAllowed(tB, s.id, 'A')).toBe(false);
      await store.revoke(tB, s.id); // cross-tenant revoke is a no-op
      expect((await store.get(tA, s.id))!.revoked).toBe(false);
    });

    it('list filters by user and orders newest first', async () => {
      const store = await factory();
      const t = tenant('list');
      await store.create(t, 'a', { userId: 'u-1', allowedMarkings: [], label: 'first', durationSeconds: 3600 });
      await sleep(10);
      await store.create(t, 'a', { userId: 'u-1', allowedMarkings: [], label: 'second', durationSeconds: 3600 });
      await store.create(t, 'a', { userId: 'u-2', allowedMarkings: [], label: 'other', durationSeconds: 3600 });
      const forUser = await store.list(t, 'u-1');
      expect(forUser.map(s => s.label)).toEqual(['second', 'first']);
      expect((await store.list(t)).length).toBe(3);
    });
  });
}

runTests('InMemoryScopedSessionStore', async () => new InMemoryScopedSessionStore());

const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 828282;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'ScopedSessConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_scs_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => { /* table may not exist yet on a fresh database */ });
      await provider.applySchema(bootstrapCtx, ontology);
    })();
    return ready;
  };

  runTests('PostgresScopedSessionStore', async () => {
    await ensureSchema();
    return new PostgresScopedSessionStore(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "scoped_session"."sessions" WHERE "tenant_id" LIKE 't_scs_%'`)
      .catch(() => {});
    await provider.close();
  });
}
