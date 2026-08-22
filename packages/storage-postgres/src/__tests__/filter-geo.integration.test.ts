/**
 * Integration: geo filters (`near`, `withinPolygon`) must actually execute and
 * return correct rows against real Postgres.
 *
 * These operators generate SQL that only runs on Postgres, so the pure
 * filter-to-sql unit tests can't catch an execution fault. `near` in particular
 * shipped with a parameter-binding bug ($offset unused, $offset+3 unbound) that
 * made every near query error at execution — invisible because no test ran the
 * SQL. This suite stores GeoPoints and queries them end-to-end.
 *
 * Requires PG_TEST_URL (skipped otherwise; REQUIRE_PG turns the skip fatal).
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import type { OntologySchema, RequestContext } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';
import { describeWithPg } from './pg-gate.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

const dataSchema = `geo_it_${process.pid}`;
const ctx: RequestContext = { tenantId: 'geo-tenant', actorId: 'tester' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Site',
      properties: [
        { name: 'id', type: 'String', required: true, isPrimaryKey: true },
        { name: 'name', type: 'String', required: false },
        { name: 'location', type: 'GeoPoint', required: false },
      ],
    },
  ],
  linkTypes: [],
} as unknown as OntologySchema;

// London and two others at known distances.
const LONDON = { lat: 51.5074, lng: -0.1278 };
const NEAR = { lat: 51.5100, lng: -0.1278 };   // ~290 m north of London
const FAR = { lat: 52.4862, lng: -1.8904 };    // Birmingham, ~160 km away

describeWithPg('geo filters against Postgres (integration)', () => {
  let provider: PostgresStorageProvider;

  beforeAll(async () => {
    const cfg = parseUrl(PG_TEST_URL!);
    provider = new PostgresStorageProvider({ ...cfg, dataSchema });
    const pool = (provider as unknown as { pool: import('pg').Pool }).pool;
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${dataSchema}"`);
    await provider.applySchema(ctx, schema);
    await provider.createObject(ctx, 'Site', { id: 'london', name: 'London', location: LONDON });
    await provider.createObject(ctx, 'Site', { id: 'near', name: 'Near', location: NEAR });
    await provider.createObject(ctx, 'Site', { id: 'far', name: 'Far', location: FAR });
  });

  afterAll(async () => {
    const pool = (provider as unknown as { pool: import('pg').Pool }).pool;
    await pool.query(`DROP SCHEMA IF EXISTS "${dataSchema}" CASCADE`);
    await provider.close?.();
  });

  it('near returns points within the radius and excludes those outside', async () => {
    const page = await provider.queryObjects(ctx, 'Site', {
      field: 'location', operator: 'near', value: { lat: LONDON.lat, lng: LONDON.lng, radiusMeters: 1000 },
    }, {});
    const ids = page.items.map(o => o['id']).sort();
    expect(ids).toEqual(['london', 'near']);
  });

  it('near with a tight radius returns only the exact point', async () => {
    const page = await provider.queryObjects(ctx, 'Site', {
      field: 'location', operator: 'near', value: { lat: LONDON.lat, lng: LONDON.lng, radiusMeters: 50 },
    }, {});
    expect(page.items.map(o => o['id'])).toEqual(['london']);
  });

  it('near composes correctly after another predicate (contiguous binds)', async () => {
    const page = await provider.queryObjects(ctx, 'Site', {
      and: [
        { field: 'name', operator: 'eq', value: 'Near' },
        { field: 'location', operator: 'near', value: { lat: LONDON.lat, lng: LONDON.lng, radiusMeters: 1000 } },
      ],
    }, {});
    expect(page.items.map(o => o['id'])).toEqual(['near']);
  });

  it('withinPolygon returns points inside the polygon', async () => {
    // A small box around London that excludes Birmingham.
    const page = await provider.queryObjects(ctx, 'Site', {
      field: 'location', operator: 'withinPolygon', value: {
        points: [
          { lat: 51.4, lng: -0.3 },
          { lat: 51.4, lng: 0.1 },
          { lat: 51.6, lng: 0.1 },
          { lat: 51.6, lng: -0.3 },
        ],
      },
    }, {});
    const ids = page.items.map(o => o['id']).sort();
    expect(ids).toEqual(['london', 'near']);
  });
});
