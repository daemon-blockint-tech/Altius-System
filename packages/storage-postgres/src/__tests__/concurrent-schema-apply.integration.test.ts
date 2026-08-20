/**
 * Concurrent applySchema against real Postgres.
 *
 * `applySchema` has two paths. The first boot against a database falls through
 * to the migration, which holds an advisory lock and is commented as
 * serialising concurrent startup. Every boot afterwards takes the early return
 * — the version is already recorded — and that path used to run the whole
 * platform DDL unlocked.
 *
 * That is backwards: the early return is the *common* path, taken by every
 * restart for the life of the cluster, while the locked one runs once ever.
 *
 * Idempotent is not concurrency-safe. `CREATE TABLE IF NOT EXISTS`,
 * `CREATE INDEX IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` each
 * take locks on the objects they touch, and two sessions running the list at
 * once can acquire them in an order that deadlocks — Postgres aborts one side
 * with "deadlock detected" and that pod fails to boot.
 *
 * This reproduces it: several providers applying the same already-applied
 * schema at the same time, which is a rolling restart. It fails reliably
 * without the lock and passes with it, and it gets more likely as the platform
 * DDL grows — which it has, by four tables over the last few changes.
 *
 * Requires PostgreSQL. Set PG_TEST_URL or this is skipped.
 */

import { it, expect, afterAll } from 'vitest';
import type { OntologySchema, RequestContext } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';
import { describeWithPg as pgGate } from './pg-gate.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

const describeWithPg = pgGate;

/** The key applySchema's migration path locks on. */
const MIGRATION_LOCK_KEY = 0x4F46;

const SCHEMA_VERSION = 606060;
const TENANT = 'tenant-concurrent-apply';
const ctx: RequestContext = { tenantId: TENANT, actorId: 'test-actor' };

const schema: OntologySchema = {
  version: SCHEMA_VERSION,
  objectTypes: [{ name: 'ConcurrentDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
  linkTypes: [],
};

describeWithPg('concurrent applySchema (integration)', () => {
  const providers: PostgresStorageProvider[] = [];

  afterAll(async () => {
    await Promise.all(providers.map(p => p.close().catch(() => {})));
  });

  it('waits for the migration advisory lock before running platform DDL on the restart path', async () => {
    // Asserting the mechanism rather than racing for a deadlock. A natural
    // collision is timing-dependent and so makes an unreliable regression
    // test — it reproduces under parallel vitest workers and not always from
    // one process. Holding the lock from another session is deterministic: if
    // the early return takes the lock, applySchema cannot finish while it is
    // held, and if it does not, applySchema sails straight through.
    const provider = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    providers.push(provider);

    // Boot once so the version is recorded and the next call takes the early
    // return — the path every restart uses.
    await provider.pool
      .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
      .catch(() => {
        /* table may not exist yet on a fresh database */
      });
    await provider.applySchema(ctx, schema);

    // Same key the migration path uses. Session-scoped here so it outlives the
    // statement; it conflicts with the transaction-scoped one all the same.
    const blocker = await provider.pool.connect();
    let released = false;
    try {
      await blocker.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

      const apply = provider.applySchema(ctx, schema);
      // Swallow a later rejection so an unhandled rejection cannot escape
      // while the race is pending.
      apply.catch(() => {});

      const outcome = await Promise.race([
        apply.then(() => 'completed' as const),
        new Promise<'blocked'>(resolve => setTimeout(() => resolve('blocked'), 1_500)),
      ]);

      expect(
        outcome,
        'applySchema ran the platform DDL while the migration advisory lock was held by ' +
          'another session. Those statements are idempotent but not concurrency-safe: two ' +
          'pods restarting together can deadlock on the locks CREATE TABLE / CREATE INDEX / ' +
          'ALTER TABLE take, and one of them fails to boot.',
      ).toBe('blocked');

      await blocker.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      released = true;

      // Once the lock is free it finishes normally rather than erroring.
      await expect(apply).resolves.toMatchObject({ success: true });
    } finally {
      if (!released) {
        await blocker.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
      }
      blocker.release();
    }
  });

  it('lets several pods apply an already-applied schema at once', async () => {
    // The scenario the lock exists for: a rolling restart. Not a reliable
    // reproducer on its own (see above), kept as a smoke test that the
    // serialisation does not itself break concurrent boot.
    const pods = Array.from({ length: 6 }, () => new PostgresStorageProvider(parseUrl(PG_TEST_URL!)));
    providers.push(...pods);

    const results = await Promise.allSettled(pods.map(p => p.applySchema(ctx, schema)));
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

    expect(failures, `applySchema failed on ${failures.length}/6 concurrent pods: ${failures.join(' | ')}`).toEqual([]);
    expect(results.every(r => r.status === 'fulfilled' && r.value.success)).toBe(true);
  });
});
