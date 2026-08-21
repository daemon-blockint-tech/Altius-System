/**
 * Runs the ConflictResolutionService conformance category against every
 * provider, and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point, and here agreement decides what value
 * gets written into a field.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { ConflictResolutionService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryConflictResolutionService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresConflictResolutionService } from '@altius/storage-postgres';
import { registerConflictResolutionTests } from './categories/conflict-resolution.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryConflictResolutionService();
registerConflictResolutionTests(
  'InMemoryConflictResolutionService',
  (): ConflictResolutionService => memory,
);

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

const SYNC_TABLES = ['data_conflicts', 'conflict_settings'];

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 909090;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'CflConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema({ tenantId: 't_cfl_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerConflictResolutionTests('PostgresConflictResolutionService', async (): Promise<ConflictResolutionService> => {
    await ensureSchema();
    return new PostgresConflictResolutionService(provider.pool);
  });

  afterAll(async () => {
    for (const table of SYNC_TABLES) {
      await provider.pool
        .query(`DELETE FROM "sync"."${table}" WHERE "tenant_id" LIKE 't_cfl_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves both providers resolve a conflict the same
// way, not that either remembers one. A service holding both maps on the
// instance would pass every case.
//
// Both halves fail silently, which is what this case is really about: an
// unresolved conflict that disappears means the datasource and the user edit
// quietly keep different values with nothing erring, and a lost default
// strategy falls back to `user_edits_win` rather than reporting that the
// tenant's choice is gone.
if (PG_TEST_URL) describe('PostgresConflictResolutionService durability', () => {
  it('survives a restart: the queue, the recorded decision and the chosen strategy', async () => {
    const TENANT = 't_cfl_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let resolvedId: string;
    let pendingId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [919293]).catch(() => {});
      await first.applySchema(ctx, {
        version: 919293,
        objectTypes: [{ name: 'CflRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresConflictResolutionService(first.pool);

      await svc.setDefaultStrategy(ctx, 'latest_value_wins');

      const resolved = await svc.detect(ctx, {
        objectType: 'Patient', objectId: 'p1', field: 'ward',
        datasourceValue: { ward: 'Cardiology', bed: 3 },
        userValue: { ward: 'Oncology' },
        datasourceTimestamp: '2026-08-20T09:00:00.000Z',
        userTimestamp: '2026-08-20T10:00:00.000Z',
      } as Parameters<typeof svc.detect>[1]);
      resolvedId = resolved.id;
      await svc.resolve(ctx, resolvedId, 'merge');

      const pending = await svc.detect(ctx, {
        objectType: 'Patient', objectId: 'p2', field: 'ward',
        datasourceValue: 'Cardiology', userValue: 'Oncology',
        datasourceTimestamp: '2026-08-20T09:00:00.000Z',
        userTimestamp: '2026-08-20T10:00:00.000Z',
      } as Parameters<typeof svc.detect>[1]);
      pendingId = pending.id;
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const svc = new PostgresConflictResolutionService(second.pool);

      // The tenant's choice, which would otherwise silently revert to
      // `user_edits_win` and resolve every future conflict the other way.
      expect(await svc.getDefaultStrategy(ctx)).toBe('latest_value_wins');

      // The queue: still exactly one conflict awaiting a decision. A lost queue
      // reads as "nothing to do" rather than as an error.
      const unresolved = await svc.listUnresolved(ctx);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]!.id).toBe(pendingId!);

      // The decision already made, including the merged object — the part a
      // TEXT column would have mangled.
      const done = await svc.get(ctx, resolvedId!);
      expect(done!.resolved).toBe(true);
      expect(done!.resolvedBy).toBe('merge');
      expect(done!.resolvedValue).toEqual({ ward: 'Oncology', bed: 3 });
      expect(done!.datasourceValue).toEqual({ ward: 'Cardiology', bed: 3 });

      // And it is still refused a second decision through the new pool.
      await expect(svc.resolve(ctx, resolvedId!, 'user_edits_win')).rejects.toThrow(/already resolved/i);
    } finally {
      for (const table of SYNC_TABLES) {
        await second.pool
          .query(`DELETE FROM "sync"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
