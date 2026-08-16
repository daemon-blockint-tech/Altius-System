/**
 * Runs the shared SPI conformance suite against PostgresStorageProvider.
 *
 * The suite previously ran against the memory provider only, so any behaviour
 * that differed between the two — a filter honoured in one and ignored in the
 * other — was structurally undetectable. Gated on PG_TEST_URL so it stays a
 * no-op when no database is available.
 *
 *   PG_TEST_URL=postgresql://altius:postgres@localhost:5432/altius pnpm test
 */

import { describe, afterAll } from 'vitest';
import { PostgresStorageProvider } from '@altius/storage-postgres';
import { runConformanceSuite } from './suite.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

if (PG_TEST_URL) {
  const url = new URL(PG_TEST_URL);
  let schemaCounter = 0;

  type Live = { dataSchema: string; provider: PostgresStorageProvider };
  let live: Live | null = null;

  /**
   * Drop the schema and close the pool, in that order — the DROP needs the pool.
   *
   * Both halves matter and each was leaking:
   *
   * - The schema name embeds process.pid and nothing removed it, so schemas
   *   accumulated for ever. Once a pid is recycled the name collides and the
   *   provider's `CREATE TABLE IF NOT EXISTS` silently adopts the earlier run's
   *   tables, columns and all — results then depend on debris, and a column
   *   created before a type-mapping fix reports a divergence that no longer
   *   exists.
   *
   * - Every provider opens its own pool of up to 10 connections
   *   (postgres-storage-provider.ts: `max: config.maxPoolSize ?? 10`) and the
   *   suite asks for a fresh provider in every beforeEach. Nothing closed them,
   *   so roughly ten providers exhausted a default max_connections=100 and the
   *   remainder of the run failed with "sorry, too many clients already" —
   *   which looks like provider divergence and is not.
   *
   * Drops by exact recorded name, never a wildcard.
   */
  async function retire(previous: Live | null): Promise<void> {
    if (!previous) return;
    try {
      await previous.provider.pool.query(`DROP SCHEMA IF EXISTS "${previous.dataSchema}" CASCADE`);
    } finally {
      await previous.provider.pool.end().catch(() => {});
    }
  }

  runConformanceSuite('PostgresStorageProvider', async () => {
    // Retiring the previous provider here, rather than collecting them all for
    // afterAll, is what bounds live connections to one pool. Safe because tests
    // within a file run sequentially: nothing in this suite is marked
    // `concurrent` and the vitest config sets no in-file parallelism, so by the
    // time a new provider is requested the previous one is finished with.
    await retire(live);
    live = null;

    // Each provider instance gets its own Postgres schema so suites that apply
    // different ontologies cannot collide.
    schemaCounter += 1;
    const dataSchema = `conformance_${process.pid}_${schemaCounter}`;
    const provider = new PostgresStorageProvider({
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      dataSchema,
      // Lets the same suite run against a Postgres WITHOUT Apache AGE, which
      // is what every managed service is. If any behaviour silently depended
      // on the graph mirror, this run is where it surfaces.
      enableGraph: process.env['PG_TEST_ENABLE_GRAPH'] !== 'false',
    });
    await provider.pool.query(`CREATE SCHEMA IF NOT EXISTS "${dataSchema}"`);
    live = { dataSchema, provider };
    return provider;
  });

  // The last provider has no successor to retire it.
  afterAll(async () => {
    await retire(live);
    live = null;
  });
} else {
  describe.skip('[PostgresStorageProvider] SPI Conformance (set PG_TEST_URL)', () => {});
}
