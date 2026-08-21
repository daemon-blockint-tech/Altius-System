/**
 * Runs the DatasetService conformance category against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not —
 * a contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { afterAll } from 'vitest';
import type { DatasetService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryDatasetService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresDatasetService } from '@altius/storage-postgres';
import { registerDatasetServiceTests } from './categories/dataset-service.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
// One instance across the category: every case works on its own dataset name,
// so a shared instance exercises the same isolation Postgres has to provide.
const memory = new InMemoryDatasetService();
registerDatasetServiceTests('InMemoryDatasetService', (): DatasetService => memory);

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

if (PG_TEST_URL) {
  const u = new URL(PG_TEST_URL);
  const provider = new PostgresStorageProvider({
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  });

  const SCHEMA_VERSION = 717171;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'DatasetConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't-conf', actorId: 'conformance' };

  // applySchema emits the platform DDL the dataset tables live in. It is
  // awaited lazily by the factory so no work happens when the category is
  // filtered out.
  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology);
    })();
    return ready;
  };

  registerDatasetServiceTests('PostgresDatasetService', async (): Promise<DatasetService> => {
    await ensureSchema();
    return new PostgresDatasetService(provider.pool);
  });

  afterAll(async () => {
    for (const tenant of ['t-conf', 't-conf-a', 't-conf-b']) {
      for (const table of ['rows', 'transactions', 'branches', 'metadata']) {
        await provider.pool
          .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" = $1`, [tenant])
          .catch(() => {});
      }
    }
    await provider.close();
  });
}
