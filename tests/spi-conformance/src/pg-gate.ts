/**
 * Gate for the Postgres half of the conformance suite.
 *
 * The suite runs against the memory provider unconditionally and against
 * Postgres only when PG_TEST_URL is set. That asymmetry is the reason provider
 * divergence went undetected for so long: memory issues no SQL, so a whole
 * class of defect is structurally invisible to the default run, and a skipped
 * Postgres half looks exactly like a passing one.
 *
 * REQUIRE_PG turns that skip into a hard failure. CI sets it on the job that
 * provisions a database, so a broken service container or a dropped env var
 * fails the build instead of quietly reducing coverage to memory.
 */

const REQUIRE_PG = process.env['REQUIRE_PG'] === '1' || process.env['REQUIRE_PG'] === 'true';

export const pgTestUrl = process.env['PG_TEST_URL'];

if (REQUIRE_PG && !pgTestUrl) {
  throw new Error(
    'REQUIRE_PG is set but PG_TEST_URL is not, so the Postgres conformance run would silently skip and ' +
      'the job would report success having exercised only the memory provider. Provision the database and ' +
      'set PG_TEST_URL, or unset REQUIRE_PG to allow skipping.',
  );
}

/**
 * Parse a `postgres://user:pass@host:port/database` URL into the discrete
 * fields that {@link PostgresStorageConfig} expects. The config interface
 * does not accept a connection string, so each conformance test must parse
 * the URL itself before constructing the provider.
 */
export function parsePgUrl(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}
