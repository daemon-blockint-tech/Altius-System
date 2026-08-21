/**
 * Runs the BatchTransformService conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * Each provider supplies a matching (transforms, datasets) pair, so the memory
 * transform service is never tested against Postgres datasets or the reverse.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { OntologySchema, RequestContext, DatasetSchema } from '@altius/spi';
import { InMemoryBatchTransformService, InMemoryDatasetService } from '@altius/storage-memory';
import {
  PostgresStorageProvider,
  PostgresBatchTransformService,
  PostgresDatasetService,
} from '@altius/storage-postgres';
import { registerBatchTransformTests, type TransformPair } from './categories/batch-transforms.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memoryDatasets = new InMemoryDatasetService();
const memoryTransforms = new InMemoryBatchTransformService(memoryDatasets);
registerBatchTransformTests('InMemoryBatchTransformService', (): TransformPair => ({
  transforms: memoryTransforms,
  datasets: memoryDatasets,
}));

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

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'amount', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 838383;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'TransformConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_tx_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerBatchTransformTests('PostgresBatchTransformService', async (): Promise<TransformPair> => {
    await ensureSchema();
    const datasets = new PostgresDatasetService(provider.pool);
    return { transforms: new PostgresBatchTransformService(provider.pool, datasets), datasets };
  });

  afterAll(async () => {
    for (const table of ['transform_builds', 'transform_schedules', 'transforms', 'rows', 'transactions', 'branches', 'metadata']) {
      await provider.pool
        .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" LIKE 't_tx_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
if (PG_TEST_URL) describe('PostgresBatchTransformService durability', () => {
  it('survives a restart: the transform, its build history and its schedule are all still there', async () => {
    const TENANT = 't_tx_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let buildId: string;
    let scheduleId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [939393]).catch(() => {});
      await first.applySchema(ctx, {
        version: 939393,
        objectTypes: [{ name: 'TransformRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const datasets = new PostgresDatasetService(first.pool);
      const svc = new PostgresBatchTransformService(first.pool, datasets);
      await datasets.create(ctx, { name: 'src', schema: SCHEMA });
      await datasets.create(ctx, { name: 'dst', schema: SCHEMA });
      await datasets.insert(ctx, 'src', { rows: [{ id: 1, amount: 10 }, { id: 2, amount: 20 }] });
      await svc.create(ctx, {
        name: 'nightly', description: 'copy src to dst',
        inputs: ['src'], output: 'dst', kind: 'map', source: 'passthrough',
        incremental: true,
      });
      buildId = (await svc.startBuild(ctx, 'nightly', 'schedule')).id;
      scheduleId = (await svc.schedule(ctx, 'nightly', '0 2 * * *')).scheduleId;
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const datasets = new PostgresDatasetService(second.pool);
      const fresh = new PostgresBatchTransformService(second.pool, datasets);

      const t = await fresh.get(ctx, 'nightly');
      expect(t).not.toBeNull();
      expect(t!.inputs).toEqual(['src']);
      expect(t!.incremental).toBe(true);
      expect(t!.lastBuildId).toBe(buildId!);
      expect(t!.lastBuildState).toBe('succeeded');

      const build = await fresh.getBuild(ctx, buildId!);
      expect(build!.state).toBe('succeeded');
      expect(build!.rowsRead).toBe(2);
      expect(build!.trigger).toBe('schedule');
      expect(await fresh.listBuilds(ctx, 'nightly')).toHaveLength(1);

      // A schedule that vanished would silently stop firing, which is the
      // whole reason it is worth persisting.
      const schedules = await fresh.listSchedules(ctx);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.id).toBe(scheduleId!);
      expect(schedules[0]!.cronExpression).toBe('0 2 * * *');

      // And the restored transform still runs, against durable datasets.
      const rerun = await fresh.startBuild(ctx, 'nightly', 'manual');
      expect(rerun.state).toBe('succeeded');
      expect(rerun.rowsRead).toBe(2);
      expect(await fresh.listBuilds(ctx, 'nightly')).toHaveLength(2);
    } finally {
      for (const table of ['transform_builds', 'transform_schedules', 'transforms', 'rows', 'transactions', 'branches', 'metadata']) {
        await second.pool
          .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });

  it('does not carry a registered executor across the restart, and says so by falling back', async () => {
    // Recording the known limitation as a test rather than only as a comment:
    // a TransformExecutor is a live object, so the registry is per-process in
    // every provider. On a second replica the build silently uses the built-in
    // pass-through instead. Making that honest is a contract change, not a
    // storage one.
    const TENANT = 't_tx_executor_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const datasets = new PostgresDatasetService(first.pool);
      const svc = new PostgresBatchTransformService(first.pool, datasets);
      await datasets.create(ctx, { name: 'src', schema: SCHEMA });
      await datasets.create(ctx, { name: 'dst', schema: SCHEMA });
      await datasets.insert(ctx, 'src', { rows: [{ id: 1, amount: 10 }, { id: 2, amount: 20 }] });
      await svc.create(ctx, {
        name: 'filtered', description: '', inputs: ['src'], output: 'dst',
        kind: 'filter', source: 'amount>15',
      });
      await svc.registerExecutor(ctx, 'filtered', {
        execute: (inputs) => inputs[0]!.filter(r => Number(r['amount']) > 15),
      });
      const build = await svc.startBuild(ctx, 'filtered', 'manual');
      expect(build.rowsWritten).toBe(1);
    } finally {
      await first.close();
    }

    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const datasets = new PostgresDatasetService(second.pool);
      const fresh = new PostgresBatchTransformService(second.pool, datasets);
      const build = await fresh.startBuild(ctx, 'filtered', 'manual');
      // Two rows, not one: the executor did not survive, so the default
      // pass-through ran. Asserted so the limitation cannot regress unnoticed
      // into someone believing executors are durable.
      expect(build.rowsWritten).toBe(2);
    } finally {
      for (const table of ['transform_builds', 'transform_schedules', 'transforms', 'rows', 'transactions', 'branches', 'metadata']) {
        await second.pool
          .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
