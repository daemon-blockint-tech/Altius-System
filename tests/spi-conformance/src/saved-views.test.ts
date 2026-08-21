/**
 * SavedViewStore conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { SavedViewStore, CreateSavedViewInput, RequestContext, OntologySchema } from '@altius/spi';
import { InMemorySavedViewStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresSavedViewStore } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

const INPUT: CreateSavedViewInput = {
  name: 'my-view',
  description: 'A test view',
  objectType: 'Patient',
  widgetType: 'object_table',
  appId: 'app1',
  columns: [{ field: 'name', label: 'Name', visible: true, width: 120 }],
  orderBy: [{ field: 'createdAt', direction: 'asc' as const }],
  density: 'comfortable' as const,
  pageSize: 25,
  widgetConfig: { foo: 'bar' },
};

let counter = 0;
const tenant = (label: string) => `t_sv_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<SavedViewStore>): void {
  describe(`[${name}] SPI Conformance: SavedViewStore`, () => {
    it('creates and gets a view', async () => {
      const store = await factory();
      const t = tenant('create');
      const view = await store.create(CTX(t), INPUT);
      expect(view.id).toBeTruthy();
      expect(view.tenantId).toBe(t);
      expect(view.name).toBe(INPUT.name);
      expect(view.description).toBe(INPUT.description);
      expect(view.objectType).toBe(INPUT.objectType);
      expect(view.widgetType).toBe(INPUT.widgetType);
      expect(view.appId).toBe(INPUT.appId);
      expect(view.isPublic).toBe(false);
      expect(view.createdBy).toBe('u1');
      expect(view.createdAt).toBe(view.updatedAt);

      const fetched = await store.get(CTX(t), view.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(view.id);
      expect(fetched!.columns).toEqual(INPUT.columns);
      expect(fetched!.orderBy).toEqual(INPUT.orderBy);
      expect(fetched!.widgetConfig).toEqual(INPUT.widgetConfig);
    });

    it('gets public views for other actors but hides private ones', async () => {
      const store = await factory();
      const t = tenant('visibility');
      const publicView = await store.create(CTX(t, 'u1'), { ...INPUT, name: 'public', isPublic: true });
      const privateView = await store.create(CTX(t, 'u1'), { ...INPUT, name: 'private' });

      expect(await store.get(CTX(t, 'u2'), publicView.id)).not.toBeNull();
      expect(await store.get(CTX(t, 'u2'), privateView.id)).toBeNull();

      expect(await store.get(CTX(t, 'u1'), privateView.id)).not.toBeNull();
      expect(await store.get(CTX(t, 'u1'), publicView.id)).not.toBeNull();
    });

    it('lists visible views with optional filters', async () => {
      const store = await factory();
      const t = tenant('list');
      await store.create(CTX(t, 'u1'), { ...INPUT, name: 'own-public', isPublic: true });
      await store.create(CTX(t, 'u1'), { ...INPUT, name: 'own-private' });
      await store.create(CTX(t, 'u2'), { ...INPUT, name: 'other-shared', appId: 'app2', isPublic: true });

      const u1List = await store.list(CTX(t, 'u1'));
      expect(u1List).toHaveLength(3);
      expect(u1List.map((v) => v.name)).toContain('own-public');
      expect(u1List.map((v) => v.name)).toContain('own-private');
      expect(u1List.map((v) => v.name)).toContain('other-shared');

      const u2List = await store.list(CTX(t, 'u2'));
      expect(u2List).toHaveLength(2);
      expect(u2List.map((v) => v.name)).toContain('own-public');
      expect(u2List.map((v) => v.name)).toContain('other-shared');
      expect(u2List.map((v) => v.name)).not.toContain('own-private');

      const filtered = await store.list(CTX(t, 'u1'), { objectType: 'Patient' });
      expect(filtered.length).toBeGreaterThanOrEqual(3);

      const app2 = await store.list(CTX(t, 'u1'), { appId: 'app2' });
      expect(app2).toHaveLength(1);
      expect(app2[0]!.name).toBe('other-shared');
    });

    it('updates a view only for the owner', async () => {
      const store = await factory();
      const t = tenant('update');
      const view = await store.create(CTX(t, 'u1'), INPUT);

      await new Promise((r) => setTimeout(r, 5));
      const updated = await store.update(CTX(t, 'u1'), view.id, { name: 'renamed', pageSize: 50 });
      expect(updated.name).toBe('renamed');
      expect(updated.pageSize).toBe(50);
      expect(updated.updatedAt).not.toBe(updated.createdAt);

      await expect(store.update(CTX(t, 'u2'), view.id, { name: 'hijacked' })).rejects.toThrow(/owner/);

      const fetched = await store.get(CTX(t, 'u1'), view.id);
      expect(fetched!.name).toBe('renamed');
    });

    it('deletes a view only for the owner', async () => {
      const store = await factory();
      const t = tenant('delete');
      const view = await store.create(CTX(t, 'u1'), INPUT);

      await expect(store.delete(CTX(t, 'u2'), view.id)).rejects.toThrow(/owner/);
      expect(await store.get(CTX(t, 'u1'), view.id)).not.toBeNull();

      await store.delete(CTX(t, 'u1'), view.id);
      expect(await store.get(CTX(t, 'u1'), view.id)).toBeNull();
    });

    it('isolates tenants', async () => {
      const store = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      const view = await store.create(CTX(t1, 'u1'), INPUT);

      expect(await store.get(CTX(t2, 'u1'), view.id)).toBeNull();
      expect(await store.list(CTX(t2, 'u1'))).toHaveLength(0);
      await expect(store.update(CTX(t2, 'u1'), view.id, { name: 'x' })).rejects.toThrow(/not found/);
      await expect(store.delete(CTX(t2, 'u1'), view.id)).rejects.toThrow(/not found/);
    });
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
runTests('InMemorySavedViewStore', () => Promise.resolve(new InMemorySavedViewStore()));

// ── Postgres ────────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 828286;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'SavedViewConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_sv_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology as unknown as OntologySchema);
    })();
    return ready;
  };

  runTests('PostgresSavedViewStore', async () => {
    await ensureSchema();
    return new PostgresSavedViewStore(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."saved_views" WHERE "tenant_id" LIKE 't_sv_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresSavedViewStore durability', () => {
    it('survives a restart: views persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_sv_restart';
      let viewId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929296,
            objectTypes: [{ name: 'SavedViewRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const store = new PostgresSavedViewStore(first.pool);
        const view = await store.create({ tenantId: TENANT, actorId: 'agent' }, INPUT);
        viewId = view.id;
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929297,
            objectTypes: [{ name: 'SavedViewRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const fresh = new PostgresSavedViewStore(second.pool);
        const view = await fresh.get({ tenantId: TENANT, actorId: 'agent' }, viewId!);
        expect(view).not.toBeNull();
        expect(view!.name).toBe(INPUT.name);
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."saved_views" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
