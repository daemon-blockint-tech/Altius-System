/**
 * Runs the OntologyChangeHistoryService conformance category against every
 * provider, and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { OntologyChangeHistoryService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryOntologyChangeHistoryService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresOntologyChangeHistoryService } from '@altius/storage-postgres';
import { registerChangeHistoryTests, type ChangeHistoryReader } from './categories/ontology-change-history.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
// A fresh instance per factory call, because the reader is a constructor
// argument and one case needs an instance that has one.
registerChangeHistoryTests(
  'InMemoryOntologyChangeHistoryService',
  (reader?: ChangeHistoryReader): OntologyChangeHistoryService =>
    new InMemoryOntologyChangeHistoryService(reader),
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

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 898989;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'OchConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_och_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerChangeHistoryTests('PostgresOntologyChangeHistoryService', async (reader?: ChangeHistoryReader): Promise<OntologyChangeHistoryService> => {
    await ensureSchema();
    return new PostgresOntologyChangeHistoryService(provider.pool, reader);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."ontology_change_history" WHERE "tenant_id" LIKE 't_och_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the history behaves correctly, not that it
// is written anywhere: a store holding records on the instance would pass every
// case.
//
// What is worth being precise about is *what* survives. The snapshot and the
// attribution survive, and they are the audit trail. The `applied` and
// `restored` claims survive too — and they were never true, in either provider.
// A persisted claim is more convincing than a transient one, which is exactly
// why the case below asserts the snapshot and the attribution rather than
// treating a surviving `version: 2` as evidence that a schema changed.
if (PG_TEST_URL) describe('PostgresOntologyChangeHistoryService durability', () => {
  it('survives a restart: the snapshot, the attribution and the version are all still there', async () => {
    const TENANT = 't_och_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'schema-admin' };
    const snapshot = {
      objectTypes: [{ name: 'Patient', properties: [{ name: 'nhsNumber', type: 'String' }] }],
      linkTypes: [],
    };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let id: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [999999]).catch(() => {});
      await first.applySchema(ctx, {
        version: 999999,
        objectTypes: [{ name: 'OchRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresOntologyChangeHistoryService(first.pool);
      const record = await svc.saveChange(ctx, {
        migrationClass: 'breaking',
        diffSummary: 'made nhsNumber required',
        snapshot,
      });
      id = record.id;
      expect((await svc.applyChange(ctx, id)).version).toBe(2);
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const svc = new PostgresOntologyChangeHistoryService(second.pool);

      const found = await svc.getChange(ctx, id!);
      expect(found).not.toBeNull();
      // Who changed the schema, when, and how risky it was: the audit answer.
      expect(found!.appliedBy).toBe('schema-admin');
      expect(found!.migrationClass).toBe('breaking');
      expect(found!.diffSummary).toBe('made nhsNumber required');
      expect(found!.version).toBe(2);
      // And the snapshot, which is the part a change history is for — a record
      // that lost it is a timestamp with a name attached.
      expect(found!.snapshot).toEqual(snapshot);

      // Reachable through the list surface too, filters and all.
      expect((await svc.listChanges(ctx, { objectType: 'Patient' })).map(r => r.id)).toEqual([id!]);
      expect(await svc.listChanges(ctx, { migrationClass: 'additive' })).toHaveLength(0);
      expect((await svc.validateChange(ctx, id!)).valid).toBe(true);
    } finally {
      await second.pool
        .query(`DELETE FROM "governance"."ontology_change_history" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
