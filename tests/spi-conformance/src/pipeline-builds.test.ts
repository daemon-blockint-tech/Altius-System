/**
 * Runs the PipelineBuildService conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { PipelineBuildService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryPipelineBuildService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresPipelineBuildService } from '@altius/storage-postgres';
import { registerPipelineBuildTests } from './categories/pipeline-builds.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryPipelineBuildService();
registerPipelineBuildTests('InMemoryPipelineBuildService', (): PipelineBuildService => memory);

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

  const SCHEMA_VERSION = 858585;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'PipelineConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_pb_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerPipelineBuildTests('PostgresPipelineBuildService', async (): Promise<PipelineBuildService> => {
    await ensureSchema();
    return new PostgresPipelineBuildService(provider.pool);
  });

  afterAll(async () => {
    for (const table of ['builds', 'schedules', 'action_triggers']) {
      await provider.pool
        .query(`DELETE FROM "pipeline"."${table}" WHERE "tenant_id" LIKE 't_pb_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the service behaves correctly, not that it
// wrote anything down: a store holding all three maps on the instance would
// pass every case. This is the half that separates the two — and both failures
// it guards against are silent. A lost schedule stops firing, which looks like
// nothing happening; a lost action trigger stops kicking off pipelines, with
// nothing erroring anywhere.
if (PG_TEST_URL) describe('PostgresPipelineBuildService durability', () => {
  it('survives a restart: schedule, action trigger and build history are all still there', async () => {
    const TENANT = 't_pb_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let scheduleId: string;
    let buildId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [959595]).catch(() => {});
      await first.applySchema(ctx, {
        version: 959595,
        objectTypes: [{ name: 'PipelineRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresPipelineBuildService(first.pool);

      const schedule = await svc.createSchedule(ctx, {
        pipelineName: 'nightly_ingest',
        cronExpression: '0 2 * * *',
        maxRetries: 5,
        abortOnFailure: true,
      });
      scheduleId = schedule.id;

      await svc.registerActionTrigger(ctx, 'approveOrder', 'order_pipeline');

      const build = await svc.startBuild(ctx, 'nightly_ingest', 'schedule');
      buildId = build.id;
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const fresh = new PostgresPipelineBuildService(second.pool);

      // The schedule: a registration that vanished would not error, it would
      // simply stop firing.
      const schedules = await fresh.listSchedules(ctx);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.id).toBe(scheduleId!);
      expect(schedules[0]!.pipelineName).toBe('nightly_ingest');
      expect(schedules[0]!.cronExpression).toBe('0 2 * * *');
      expect(schedules[0]!.enabled).toBe(true);
      expect(schedules[0]!.maxRetries).toBe(5);
      expect(schedules[0]!.abortOnFailure).toBe(true);

      // The action trigger: lose it and the action still succeeds, it just
      // stops kicking anything off.
      expect(await fresh.getActionTriggers(ctx, 'approveOrder')).toEqual(['order_pipeline']);
      const fired = await fresh.triggerForAction(ctx, 'approveOrder');
      expect(fired).toHaveLength(1);
      expect(fired[0]!.pipelineName).toBe('order_pipeline');

      // The build history, including the steps, which are JSONB rather than a
      // scalar column and so are the part most likely to round-trip wrong.
      const build = await fresh.getBuild(ctx, buildId!);
      expect(build).not.toBeNull();
      expect(build!.pipelineName).toBe('nightly_ingest');
      expect(build!.trigger).toBe('schedule');
      expect(build!.state).toBe('succeeded');
      expect(build!.triggeredBy).toBe('u1');
      expect(build!.durationMs).toBe(100);
      expect(build!.steps).toEqual([{ name: 'init', state: 'succeeded', durationMs: 50 }]);

      // And a retry against a build written by the process that is now gone.
      const retried = await fresh.retryBuild(ctx, buildId!);
      expect(retried.retryCount).toBe(1);
    } finally {
      for (const table of ['builds', 'schedules', 'action_triggers']) {
        await second.pool
          .query(`DELETE FROM "pipeline"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
