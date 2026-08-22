/**
 * FunctionRevisionStore conformance — the same assertions against every provider.
 *
 * The store persists the function authoring lifecycle (draft → published →
 * deprecated). Two providers that disagree here disagree about which function
 * revision a deployment believes is live. Pinned semantics:
 *  - create then get returns the revision (tenant-scoped);
 *  - listByFunction returns a tenant's revisions oldest-first;
 *  - getActive returns the single published revision (or null);
 *  - update overwrites status / publishedAt;
 *  - JSONB test inputs/outputs round-trip;
 *  - cross-tenant get/list/getActive return nothing (isolation).
 *
 * Memory always runs; Postgres runs when PG_TEST_URL is set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FunctionRevisionStore, FunctionRevision } from '@altius/spi';
import { InMemoryFunctionRevisionStore } from '@altius/engine';
import { PostgresStorageProvider, PostgresFunctionRevisionStore, generatePlatformDDL } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';

// Tenants are unique per run: Postgres keeps rows between runs where a fresh
// Map does not, so a fixed name made the listing and isolation cases count
// every row every previous run had left behind.
const RUN = `fnrev_${Date.now().toString(36)}_${Math.trunc(process.hrtime()[1] / 1000)}`;
const T = (label: string): string => `${RUN}_${label}`;


function makeRevision(tenantId: string, functionName: string, revision: number, overrides: Partial<FunctionRevision> = {}): FunctionRevision {
  return {
    id: randomUUID(),
    functionName,
    revision,
    status: 'draft',
    runtime: 'node',
    entry: 'functions/f.mjs',
    source: 'export default async (x) => x',
    testInputs: [{ x: 1 }],
    expectedOutputs: [1],
    tenantId,
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function runTests(name: string, factory: () => Promise<FunctionRevisionStore>): void {
  describe(`[${name}] SPI Conformance: FunctionRevisionStore`, () => {
    it('create then get returns the revision, tenant-scoped', async () => {
      const store = await factory();
      const rev = makeRevision(T('t_1'), 'Doubler', 1);
      await store.create(rev);
      const got = await store.get(T('t_1'), rev.id);
      expect(got).not.toBeNull();
      expect(got!.functionName).toBe('Doubler');
      expect(got!.status).toBe('draft');
      // JSONB round-trips.
      expect(got!.testInputs).toEqual([{ x: 1 }]);
      expect(got!.expectedOutputs).toEqual([1]);
      // Another tenant sees nothing.
      expect(await store.get(T('t_2'), rev.id)).toBeNull();
    });

    it('listByFunction returns a tenant\'s revisions oldest-first', async () => {
      const store = await factory();
      const r1 = makeRevision(T('t_list'), 'Fn', 1);
      const r2 = makeRevision(T('t_list'), 'Fn', 2);
      await store.create(r2);
      await store.create(r1);
      const list = await store.listByFunction(T('t_list'), 'Fn');
      expect(list.map(r => r.revision)).toEqual([1, 2]);
      expect(await store.listByFunction('other', 'Fn')).toEqual([]);
    });

    it('getActive returns the single published revision', async () => {
      const store = await factory();
      const r1 = makeRevision(T('t_act'), 'Fn', 1);
      await store.create(r1);
      expect(await store.getActive(T('t_act'), 'Fn')).toBeNull();
      await store.update({ ...r1, status: 'published', publishedAt: new Date().toISOString() });
      const active = await store.getActive(T('t_act'), 'Fn');
      expect(active!.id).toBe(r1.id);
      expect(active!.status).toBe('published');
      // Deprecate it → no active.
      await store.update({ ...r1, status: 'deprecated' });
      expect(await store.getActive(T('t_act'), 'Fn')).toBeNull();
    });

    it('update overwrites status and publishedAt', async () => {
      const store = await factory();
      const r = makeRevision(T('t_upd'), 'Fn', 1);
      await store.create(r);
      const when = new Date().toISOString();
      await store.update({ ...r, status: 'published', publishedAt: when });
      const got = await store.get(T('t_upd'), r.id);
      expect(got!.status).toBe('published');
      expect(got!.publishedAt).toBe(when);
    });

    it('isolates the same function name across tenants', async () => {
      const store = await factory();
      const a = makeRevision(T('ten_a'), 'Score', 1, { status: 'published', publishedAt: new Date().toISOString() });
      const b = makeRevision(T('ten_b'), 'Score', 1);
      await store.create(a);
      await store.create(b);
      expect((await store.getActive(T('ten_a'), 'Score'))!.id).toBe(a.id);
      expect(await store.getActive(T('ten_b'), 'Score')).toBeNull();
      expect(await store.get(T('ten_b'), a.id)).toBeNull();
      expect(await store.listByFunction(T('ten_b'), 'Score')).toHaveLength(1);
    });
  });
}

runTests('Memory', async () => new InMemoryFunctionRevisionStore());

const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => {
    if (provider) await provider.close();
  });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    for (const stmt of generatePlatformDDL()) await provider.pool.query(stmt);
    return new PostgresFunctionRevisionStore(provider.pool);
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: FunctionRevisionStore', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
