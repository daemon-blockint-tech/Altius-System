/**
 * WorkshopPlatformService conformance — same assertions against every provider.
 *
 * All 52 methods are the shared DocStoreWorkshopPlatformService, so the two
 * providers differ only in where documents live. These pin app/page/widget CRUD,
 * variables, object-view defaults, the seeded widget catalog, URL-state
 * round-trip and tenant isolation across both.
 *
 * Memory always runs; Postgres runs when PG_TEST_URL is set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { WorkshopPlatformService, RequestContext } from '@altius/spi';
import { InMemoryWorkshopPlatformService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresWorkshopPlatformService, generatePlatformDDL } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';

const ctx = (tenantId: string): RequestContext => ({ tenantId, actorId: 'u-1' });

function runTests(name: string, factory: () => Promise<WorkshopPlatformService>): void {
  describe(`[${name}] SPI Conformance: WorkshopPlatformService`, () => {
    it('creates, lists, updates and deletes an app, tenant-scoped', async () => {
      const svc = await factory();
      const app = await svc.createApp(ctx('t-1'), { name: 'Ops' });
      expect(app.name).toBe('Ops');
      expect(app.version).toBe(1);

      const got = await svc.getApp(ctx('t-1'), app.id);
      expect(got!.name).toBe('Ops');
      // Another tenant sees nothing.
      expect(await svc.getApp(ctx('t-2'), app.id)).toBeNull();
      expect(await svc.listApps(ctx('t-2'))).toEqual([]);

      const upd = await svc.updateApp(ctx('t-1'), app.id, { name: 'Ops 2' });
      expect(upd.name).toBe('Ops 2');
      expect(upd.version).toBe(2);

      await svc.deleteApp(ctx('t-1'), app.id);
      expect(await svc.getApp(ctx('t-1'), app.id)).toBeNull();
    });

    it('adds a page, section and widget, threading through app version', async () => {
      const svc = await factory();
      const app = await svc.createApp(ctx('t-pg'), { name: 'A' });
      let updated = await svc.addPage(ctx('t-pg'), app.id, { name: 'Page 1', sections: [{ id: 's1', name: 'S', layout: 'stack', widgets: [] }] });
      const pageId = updated.pages[0]!.id;
      updated = await svc.addWidget(ctx('t-pg'), app.id, pageId, 's1', { type: 'object_table', config: {}, position: { x: 0, y: 0, w: 6, h: 4 } } as never);
      const widgets = updated.pages[0]!.sections[0]!.widgets;
      expect(widgets).toHaveLength(1);
      expect(widgets[0]!.type).toBe('object_table');
      // Version incremented on each structural change (create=1, addPage=2, addWidget=3).
      expect(updated.version).toBe(3);
    });

    it('seeds the default widget catalog and lists by category', async () => {
      const svc = await factory();
      const all = await svc.listWidgetCatalog(ctx('t-wc'));
      expect(all.length).toBeGreaterThan(40);
      const charts = await svc.listWidgetCatalog(ctx('t-wc'), 'chart');
      expect(charts.length).toBeGreaterThan(0);
      expect(charts.every(w => w.category === 'chart')).toBe(true);
    });

    it('creates variables and computes lineage', async () => {
      const svc = await factory();
      const app = await svc.createApp(ctx('t-v'), { name: 'V' });
      await svc.createVariable(ctx('t-v'), { appId: app.id, name: 'base', type: 'number', source: { kind: 'static', value: 1 } as never });
      await svc.createVariable(ctx('t-v'), { appId: app.id, name: 'derived', type: 'number', source: { kind: 'computed', dependencies: ['base'] } as never });
      const lineage = await svc.getVariableLineage(ctx('t-v'), app.id);
      const derived = lineage.find(l => l.variableName === 'derived')!;
      expect(derived.dependsOn).toEqual(['base']);
      const base = lineage.find(l => l.variableName === 'base')!;
      expect(base.dependedBy).toEqual(['derived']);
    });

    it('enforces a single default object view per type', async () => {
      const svc = await factory();
      const v1 = await svc.createObjectView(ctx('t-ov'), { name: 'V1', objectType: 'Patient', columns: [], isDefault: true } as never);
      const v2 = await svc.createObjectView(ctx('t-ov'), { name: 'V2', objectType: 'Patient', columns: [], isDefault: true } as never);
      const def = await svc.getDefaultObjectView(ctx('t-ov'), 'Patient');
      expect(def!.id).toBe(v2.id);
      // v1 was unset when v2 became default.
      expect((await svc.getObjectView(ctx('t-ov'), v1.id))!.isDefault).toBe(false);
    });

    it('round-trips URL state through encode/decode', async () => {
      const svc = await factory();
      const state = { region: 'DE', threshold: 42, note: 'héllo ✓' };
      const encoded = await svc.encodeState(ctx('t-s'), 'app', state);
      expect(encoded.startsWith('s:')).toBe(true);
      expect(await svc.decodeState(ctx('t-s'), encoded)).toEqual(state);
    });
  });
}

runTests('Memory', async () => new InMemoryWorkshopPlatformService());

const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => { if (provider) await provider.close(); });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    for (const stmt of generatePlatformDDL()) await provider.pool.query(stmt);
    return new PostgresWorkshopPlatformService(provider.pool);
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: WorkshopPlatformService', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
