/**
 * Runs the SqlQueryService conformance category against every provider, and
 * checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryDatasetService, InMemorySqlQueryService } from '@altius/storage-memory';
import {
  PostgresStorageProvider,
  PostgresDatasetService,
  PostgresSqlQueryService,
} from '@altius/storage-postgres';
import { registerSqlQueryTests, type SqlQueryPair } from './categories/sql-query.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
// One dataset service, handed to the query service — the way the API wires it.
const memoryDatasets = new InMemoryDatasetService();
const memorySql = new InMemorySqlQueryService(memoryDatasets);
registerSqlQueryTests(
  'InMemorySqlQueryService',
  (): SqlQueryPair => ({ sql: memorySql, datasets: memoryDatasets }),
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

  const SCHEMA_VERSION = 878787;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'SqlConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_sql_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  // Two objects over one pool, so the query reads the very tables the dataset
  // service writes. Sharing is by table here, not by instance.
  registerSqlQueryTests('PostgresSqlQueryService', async (): Promise<SqlQueryPair> => {
    await ensureSchema();
    return {
      sql: new PostgresSqlQueryService(provider.pool),
      datasets: new PostgresDatasetService(provider.pool),
    };
  });

  afterAll(async () => {
    for (const table of ['sql_jobs', 'rows', 'transactions', 'branches', 'metadata']) {
      await provider.pool
        .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" LIKE 't_sql_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// The contract above proves the query runs and the job reads back, not that
// either outlives the process. A service holding its jobs on the instance would
// pass every case — and the specific thing that would be lost is the result
// set, since `results()` reads the rows off the job rather than re-running the
// query.
if (PG_TEST_URL) describe('PostgresSqlQueryService durability', () => {
  it('survives a restart: the job, its rows and its columns are all still there', async () => {
    const TENANT = 't_sql_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let jobId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [979797]).catch(() => {});
      await first.applySchema(ctx, {
        version: 979797,
        objectTypes: [{ name: 'SqlRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const datasets = new PostgresDatasetService(first.pool);
      await datasets.create(ctx, {
        name: 'admissions',
        schema: {
          columns: [
            { name: 'id', type: 'string', nullable: false },
            { name: 'ward', type: 'string', nullable: false },
            { name: 'los', type: 'integer', nullable: false },
          ],
          primaryKey: ['id'],
          version: 1,
        },
      });
      await datasets.insert(ctx, 'admissions', {
        rows: [
          { id: 'a1', ward: 'A', los: 3 },
          { id: 'a2', ward: 'B', los: 9 },
          { id: 'a3', ward: 'A', los: 5 },
        ],
      });

      const sql = new PostgresSqlQueryService(first.pool);
      const job = await sql.submit(ctx, {
        sql: "SELECT id, los FROM admissions WHERE ward = 'A' ORDER BY los DESC",
      });
      jobId = job.id;
      expect(job.state).toBe('succeeded');
      expect(job.rowCount).toBe(2);
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const sql = new PostgresSqlQueryService(second.pool);

      const job = await sql.get(ctx, jobId!);
      expect(job).not.toBeNull();
      expect(job!.state).toBe('succeeded');
      expect(job!.submittedBy).toBe('u1');
      expect(job!.rowCount).toBe(2);
      expect(job!.resultColumns).toEqual(['id', 'los']);

      // The result rows specifically: `results()` reads them off the job rather
      // than re-running the query, so a service that lost them would answer an
      // empty array for a job still reporting `succeeded` and `rowCount: 2`.
      const rows = await sql.results(ctx, jobId!);
      expect(rows).toEqual([{ id: 'a3', los: 5 }, { id: 'a1', los: 3 }]);

      // And the datasets underneath are still queryable through the new pool.
      const rerun = await sql.submit(ctx, { sql: 'SELECT * FROM admissions' });
      expect(rerun.rowCount).toBe(3);
      expect((await sql.list(ctx)).map(j => j.id)).toEqual([rerun.id, jobId!]);
    } finally {
      for (const table of ['sql_jobs', 'rows', 'transactions', 'branches', 'metadata']) {
        await second.pool
          .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
