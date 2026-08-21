/**
 * Runs the EventObjectService conformance category against every provider, and
 * checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { EventObjectService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryEventObjectService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresEventObjectService } from '@altius/storage-postgres';
import { registerEventObjectTests } from './categories/event-objects.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryEventObjectService();
registerEventObjectTests('InMemoryEventObjectService', (): EventObjectService => memory);

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

const PROCESS_TABLES = ['events', 'event_thresholds'];

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 949494;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'EvtConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_evt_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerEventObjectTests('PostgresEventObjectService', async (): Promise<EventObjectService> => {
    await ensureSchema();
    return new PostgresEventObjectService(provider.pool);
  });

  afterAll(async () => {
    for (const table of PROCESS_TABLES) {
      await provider.pool
        .query(`DELETE FROM "process"."${table}" WHERE "tenant_id" LIKE 't_evt_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves both providers query the log the same way,
// not that either keeps it. A service holding both maps on the instance would
// pass every case.
//
// Both halves fail quietly, which is what this case is about. A log that lost
// half its events yields a smaller process model rather than an error, and a
// lost threshold simply stops flagging new events — so the case checks that a
// threshold set before the restart still marks an event created after it.
if (PG_TEST_URL) describe('PostgresEventObjectService durability', () => {
  it('survives a restart: the log, the breach flag and the threshold all still apply', async () => {
    const TENANT = 't_evt_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let breachingId: string;
    let cleanId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [959697]).catch(() => {});
      await first.applySchema(ctx, {
        version: 959697,
        objectTypes: [{ name: 'EvtRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresEventObjectService(first.pool);

      await svc.setThreshold(ctx, 'surgery', 'durationMs', 60 * 60 * 1000, 'above');

      const breaching = await svc.create(ctx, {
        eventType: 'surgery', caseId: 'case-1',
        startTime: '2026-08-20T09:00:00.000Z', endTime: '2026-08-20T11:00:00.000Z',
        actorId: 'surgeon-2', badges: ['urgent'], attributes: { theatre: 4 },
      });
      breachingId = breaching.id;
      expect(breaching.thresholdBreached).toBe(true);

      const clean = await svc.create(ctx, {
        eventType: 'surgery', caseId: 'case-1',
        startTime: '2026-08-20T12:00:00.000Z', endTime: '2026-08-20T12:30:00.000Z',
      });
      cleanId = clean.id;
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const svc = new PostgresEventObjectService(second.pool);

      // The log, in time order, with its payload intact.
      const { events, totalCount } = await svc.list(ctx);
      expect(totalCount).toBe(2);
      expect(events.map(e => e.id)).toEqual([breachingId!, cleanId!]);
      expect(events[0]!.badges).toEqual(['urgent']);
      expect(events[0]!.attributes).toEqual({ theatre: 4 });
      expect(events[0]!.durationMs).toBe(2 * 60 * 60 * 1000);
      expect(events[0]!.actorId).toBe('surgeon-2');

      // The breach recorded before the restart, including its detail — the part
      // an alert or a report would read.
      expect(events[0]!.thresholdBreached).toBe(true);
      expect(events[0]!.thresholdDetails).toEqual({
        metric: 'durationMs',
        value: 2 * 60 * 60 * 1000,
        threshold: 60 * 60 * 1000,
        direction: 'above',
      });
      // And the filter still separates them, which is the "not true" case.
      expect((await svc.list(ctx, { thresholdBreached: false })).events.map(e => e.id)).toEqual([cleanId!]);

      // The threshold itself: a NEW event created through the new pool is still
      // flagged. This is the half that would fail silently — a lost threshold
      // does not error, it just stops marking anything.
      const afterRestart = await svc.create(ctx, {
        eventType: 'surgery', caseId: 'case-2',
        startTime: '2026-08-20T14:00:00.000Z', endTime: '2026-08-20T17:00:00.000Z',
      });
      expect(afterRestart.thresholdBreached).toBe(true);
      expect(afterRestart.thresholdDetails!.threshold).toBe(60 * 60 * 1000);
    } finally {
      for (const table of PROCESS_TABLES) {
        await second.pool
          .query(`DELETE FROM "process"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
