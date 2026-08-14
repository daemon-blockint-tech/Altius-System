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

import { describe } from 'vitest';
import { PostgresStorageProvider } from '@altius/storage-postgres';
import { runConformanceSuite } from './suite.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

if (PG_TEST_URL) {
  const url = new URL(PG_TEST_URL);
  let schemaCounter = 0;

  runConformanceSuite('PostgresStorageProvider', async () => {
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
    });
    await provider.pool.query(`CREATE SCHEMA IF NOT EXISTS "${dataSchema}"`);
    return provider;
  });
} else {
  describe.skip('[PostgresStorageProvider] SPI Conformance (set PG_TEST_URL)', () => {});
}
