/**
 * Runs the VariableTransformService conformance category against every
 * provider, and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point, and here agreement decides what value a
 * pipeline computes.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { OntologySchema, RequestContext, TransformStep, VariableTransformService } from '@altius/spi';
import { InMemoryVariableTransformService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresVariableTransformService } from '@altius/storage-postgres';
import { registerVariableTransformTests } from './categories/variable-transforms.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryVariableTransformService();
registerVariableTransformTests(
  'InMemoryVariableTransformService',
  (): VariableTransformService => memory,
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

  const SCHEMA_VERSION = 929292;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'VtxConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_vtx_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerVariableTransformTests('PostgresVariableTransformService', async (): Promise<VariableTransformService> => {
    await ensureSchema();
    return new PostgresVariableTransformService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "dataset"."transform_pipelines" WHERE "tenant_id" LIKE 't_vtx_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves both providers compute the same value from
// the same pipeline, not that either remembers the pipeline. A service holding
// its definitions on the instance would pass every case.
//
// The failure this guards against is loud rather than silent — `execute` throws
// `Transform pipeline not found`. That is still worth a test: a pipeline is
// user-authored configuration, someone composed those steps, and a caller
// cannot recover from losing them by retrying.
if (PG_TEST_URL) describe('PostgresVariableTransformService durability', () => {
  it('survives a restart: the pipeline still exists and still computes the same value', async () => {
    const TENANT = 't_vtx_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const steps: TransformStep[] = [
      { kind: 'trim', args: {} },
      { kind: 'upper', args: {} },
      { kind: 'pad', args: { length: 6, pad: '*', side: 'left' } },
    ];

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [939495]).catch(() => {});
      await first.applySchema(ctx, {
        version: 939495,
        objectTypes: [{ name: 'VtxRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresVariableTransformService(first.pool);
      await svc.create(ctx, { name: 'normalise_code', description: 'trim, upper, pad', steps });
      expect(await svc.execute(ctx, 'normalise_code', '  abc  ')).toBe('***ABC');
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const svc = new PostgresVariableTransformService(second.pool);

      const found = await svc.get(ctx, 'normalise_code');
      expect(found).not.toBeNull();
      expect(found!.description).toBe('trim, upper, pad');
      // The steps and their arguments, which are the pipeline: an argument that
      // did not survive would silently change what this computes rather than
      // failing to load.
      expect(found!.steps).toEqual(steps);
      expect(found!.createdBy).toBe('u1');

      // And the value itself, recomputed through the new pool.
      expect(await svc.execute(ctx, 'normalise_code', '  abc  ')).toBe('***ABC');
      expect(await svc.executeBatch(ctx, 'normalise_code', ['  ab ', 'cdef'])).toEqual(['****AB', '**CDEF']);
      expect((await svc.list(ctx)).map(p => p.name)).toEqual(['normalise_code']);
    } finally {
      await second.pool
        .query(`DELETE FROM "dataset"."transform_pipelines" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
