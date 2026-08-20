/**
 * Gate for the suites that need a real PostgreSQL.
 *
 * These suites skip when PG_TEST_URL is unset, which is right for a laptop and
 * wrong for CI: a skipped suite and a passing suite are indistinguishable in
 * the job summary. That gap is not hypothetical — it is how three defects
 * shipped while the storage-postgres suite reported green:
 *
 *   - createObject failed for every FULLTEXT-indexed type (the suite that
 *     would have caught it died in beforeAll and reported as skipped)
 *   - comments and notifications could not be written at all, their TEXT[]
 *     columns bound as JSON strings, with no Postgres coverage whatsoever
 *   - CREATE EXTENSION vector aborted every schema apply on stock Postgres
 *
 * Each was graded against tests that only ever ran on the memory provider.
 *
 * So when REQUIRE_PG is set, a missing PG_TEST_URL is a hard failure rather
 * than a silent skip. CI sets it on the Postgres job; nothing else needs to.
 */

import { describe } from 'vitest';

const PG_TEST_URL = process.env['PG_TEST_URL'];
const REQUIRE_PG = process.env['REQUIRE_PG'] === '1' || process.env['REQUIRE_PG'] === 'true';

if (REQUIRE_PG && !PG_TEST_URL) {
  throw new Error(
    'REQUIRE_PG is set but PG_TEST_URL is not, so the Postgres suites would silently skip and the job ' +
      'would report success without exercising Postgres at all. Provision the database and set PG_TEST_URL, ' +
      'or unset REQUIRE_PG to allow skipping.',
  );
}

/**
 * `describe` when a database is configured; `describe.skip` otherwise.
 *
 * Annotated explicitly because vitest's suite-collector type cannot be named
 * from outside its own package, so an inferred export breaks the build
 * (TS2742/TS4023). Callers only ever invoke it as `describeWithPg(name, fn)`.
 */
export const describeWithPg: typeof describe = (
  PG_TEST_URL ? describe : describe.skip
) as typeof describe;

/** The configured connection string. Only read inside a describeWithPg block. */
export const pgTestUrl = PG_TEST_URL;
