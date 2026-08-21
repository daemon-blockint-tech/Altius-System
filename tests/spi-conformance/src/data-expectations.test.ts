/**
 * Runs the DataExpectationsService conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { DataExpectationsService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryDataExpectationsService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresDataExpectationsService } from '@altius/storage-postgres';
import { registerDataExpectationTests } from './categories/data-expectations.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryDataExpectationsService();
registerDataExpectationTests('InMemoryDataExpectationsService', (): DataExpectationsService => memory);

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

  const SCHEMA_VERSION = 848484;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'ExpectationConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_exp_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerDataExpectationTests('PostgresDataExpectationsService', async (): Promise<DataExpectationsService> => {
    await ensureSchema();
    return new PostgresDataExpectationsService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "quality"."expectations" WHERE "tenant_id" LIKE 't_exp_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the gate behaves correctly, not that it is
// written down anywhere: a store holding expectations on the instance would
// pass every case. This is the half that separates the two — and the failure
// it guards against is silent, because a gate with no expectations passes
// everything rather than erroring.
if (PG_TEST_URL) describe('PostgresDataExpectationsService durability', () => {
  it('survives a restart: the gate still blocks after the process is gone', async () => {
    const TENANT = 't_exp_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const dirty = [{ nhsNumber: 'NHS-1' }, { nhsNumber: null }];

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let id: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [949494]).catch(() => {});
      await first.applySchema(ctx, {
        version: 949494,
        objectTypes: [{ name: 'ExpectationRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresDataExpectationsService(first.pool);
      const e = await svc.create(ctx, {
        name: 'nhs number present',
        description: 'every patient must have an NHS number',
        targetType: 'Patient',
        field: 'nhsNumber',
        type: 'not_null',
        params: {},
        blocking: true,
      });
      id = e.id;
      expect((await svc.gateBuild(ctx, 'Patient', dirty)).passed).toBe(false);
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const fresh = new PostgresDataExpectationsService(second.pool);

      const found = await fresh.get(ctx, id!);
      expect(found).not.toBeNull();
      expect(found!.blocking).toBe(true);
      expect(found!.enabled).toBe(true);
      expect(found!.field).toBe('nhsNumber');

      // The point: an expectation that vanished would not error here — the
      // gate would simply pass, and bad data would flow through something that
      // still looked enforced.
      const gate = await fresh.gateBuild(ctx, 'Patient', dirty);
      expect(gate.passed).toBe(false);
      expect(gate.blockingFailures).toHaveLength(1);
      expect(gate.blockingFailures[0]!.expectationId).toBe(id!);
    } finally {
      await second.pool
        .query(`DELETE FROM "quality"."expectations" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
