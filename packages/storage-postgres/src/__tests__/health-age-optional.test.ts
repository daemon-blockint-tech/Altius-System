/**
 * A missing Apache AGE extension must not fail the storage health check.
 *
 * The AGE graph is write-only: object-crud/link-crud mirror vertices and edges
 * into it and both ageQuery() helpers swallow failures by design, while
 * traversal.ts resolves paths with SQL JOINs on the link tables. Nothing reads
 * the graph back.
 *
 * Before this, healthCheck returned healthy:false whenever any link type was
 * registered and the extension was absent. /health answers 503 on unhealthy and
 * is the readiness probe, so a Postgres without AGE took the whole pod out of
 * service — and fired StorageUnhealthy — over a graph no query touches.
 *
 * Unit test rather than an integration one: the existing healthCheck coverage
 * lives in provider-lifecycle.integration.test.ts, which is skipped without a
 * live database, so it gives no signal on exactly this regression.
 */

import { describe, it, expect } from 'vitest';

import { PostgresStorageProvider } from '../postgres-storage-provider.js';
import type { PostgresStorageConfig } from '../postgres-storage-provider.js';

/** Minimal pg.Pool stand-in: answers the connectivity probe and the extension lookup. */
function fakePool(ageInstalled: boolean) {
  return {
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    async query(sql: string) {
      if (sql.includes('pg_extension')) {
        return { rows: ageInstalled ? [{ extname: 'age' }] : [] };
      }
      return { rows: [{ ok: 1 }] };
    },
  };
}

/**
 * Build a provider whose pool is stubbed and whose registered schema declares a
 * link type — the condition that used to make a missing AGE fatal.
 */
function providerWithoutDatabase(ageInstalled: boolean): PostgresStorageProvider {
  const provider = new PostgresStorageProvider({
    host: 'unused', port: 5432, database: 'unused', user: 'unused', password: 'unused',
  } as PostgresStorageConfig);

  const internals = provider as unknown as {
    _pool: unknown;
    _schemas: Map<number, { linkTypes: unknown[] }>;
    _currentSchemaVersion: number;
  };
  internals._pool = fakePool(ageInstalled);
  internals._schemas = new Map([[1, { linkTypes: [{ name: 'AdmittedTo' }] }]]);
  internals._currentSchemaVersion = 1;

  return provider;
}

describe('healthCheck AGE handling', () => {
  it('stays healthy when AGE is absent but link types are registered', async () => {
    const status = await providerWithoutDatabase(false).healthCheck();

    expect(status.healthy).toBe(true); // regression: used to be false -> 503 -> pod pulled
    expect(status.details?.['ageExtension']).toBe(false);
    expect(String(status.details?.['note'])).toMatch(/traversal are unaffected/i);
  });

  it('reports no caveat when AGE is present', async () => {
    const status = await providerWithoutDatabase(true).healthCheck();

    expect(status.healthy).toBe(true);
    expect(status.details?.['ageExtension']).toBe(true);
    expect(status.details?.['note']).toBeUndefined();
  });
});
