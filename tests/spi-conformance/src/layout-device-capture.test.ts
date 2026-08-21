/**
 * LayoutDeviceCaptureService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { RequestContext, LayoutDeviceCaptureService, OntologySchema } from '@altius/spi';
import { InMemoryLayoutDeviceCaptureService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresLayoutDeviceCaptureService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

let counter = 0;
const tenant = (label: string) => `t_ldc_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<LayoutDeviceCaptureService>): void {
  describe(`[${name}] SPI Conformance: LayoutDeviceCaptureService`, () => {
    it('sets and gets UI state', async () => {
      const svc = await factory();
      const t = tenant('state_get');
      await svc.setState(CTX(t), { key: 'layout:table1', value: { columns: ['name', 'age'] } });
      const state = await svc.getState(CTX(t), 'layout:table1');
      expect(state).not.toBeNull();
      expect(state!.value).toEqual({ columns: ['name', 'age'] });
      expect(state!.key).toBe('layout:table1');
      expect(state!.userId).toBe('u1');
    });

    it('lists and filters UI state', async () => {
      const svc = await factory();
      const t = tenant('state_list');
      await svc.setState(CTX(t, 'u1'), { key: 'k1', value: 'v1' });
      await svc.setState(CTX(t, 'u1'), { key: 'k2', value: 'v2' });
      await new Promise((r) => setTimeout(r, 5));
      await svc.setState(CTX(t, 'u2'), { key: 'k3', value: 'v3', scope: 'user', appContext: 'appA' });

      const list1 = await svc.listState(CTX(t), 'u1');
      expect(list1).toHaveLength(2);
      expect(list1.map((s) => s.key)).toContain('k1');
      expect(list1.map((s) => s.key)).toContain('k2');

      const list2 = await svc.listState(CTX(t), 'u2', 'appA');
      expect(list2).toHaveLength(1);
      expect(list2[0]!.key).toBe('k3');

      const listAll = await svc.listState(CTX(t));
      expect(listAll).toHaveLength(3);
      expect(listAll[0]!.key).toBe('k3');
    });

    it('updates UI state in place', async () => {
      const svc = await factory();
      const t = tenant('state_update');
      const first = await svc.setState(CTX(t), { key: 'k', value: 'v1' });
      await new Promise((r) => setTimeout(r, 5));
      const second = await svc.setState(CTX(t), { key: 'k', value: 'v2' });
      expect(second.id).toBe(first.id);
      expect(second.value).toBe('v2');
      expect(second.updatedAt).not.toBe(second.createdAt);
      const got = await svc.getState(CTX(t), 'k');
      expect(got!.value).toBe('v2');
    });

    it('deletes UI state', async () => {
      const svc = await factory();
      const t = tenant('state_delete');
      await svc.setState(CTX(t), { key: 'k1', value: 'v1' });
      await svc.deleteState(CTX(t), 'k1');
      expect(await svc.getState(CTX(t), 'k1')).toBeNull();
      expect(await svc.listState(CTX(t))).toHaveLength(0);
    });

    it('records and gets captures', async () => {
      const svc = await factory();
      const t = tenant('capture');
      const cap = await svc.recordCapture(CTX(t), { kind: 'qr_code', data: { decodedValue: 'PAT-001' } });
      expect(cap.kind).toBe('qr_code');
      expect(cap.data.decodedValue).toBe('PAT-001');
      expect(cap.userId).toBe('u1');
      const got = await svc.getCapture(CTX(t), cap.id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(cap.id);
    });

    it('lists captures by kind', async () => {
      const svc = await factory();
      const t = tenant('capture_list');
      await svc.recordCapture(CTX(t), { kind: 'qr_code', data: { decodedValue: 'A' } });
      await svc.recordCapture(CTX(t), { kind: 'geolocation', data: { coordinates: { lat: 0, lng: 0 } } });
      const qr = await svc.listCaptures(CTX(t), 'qr_code');
      expect(qr).toHaveLength(1);
      const all = await svc.listCaptures(CTX(t));
      expect(all).toHaveLength(2);
    });

    it('deletes captures', async () => {
      const svc = await factory();
      const t = tenant('capture_delete');
      const cap = await svc.recordCapture(CTX(t), { kind: 'qr_code', data: { decodedValue: 'A' } });
      await svc.deleteCapture(CTX(t), cap.id);
      expect(await svc.getCapture(CTX(t), cap.id)).toBeNull();
    });

    it('registers and resolves deep links', async () => {
      const svc = await factory();
      const t = tenant('deeplink');
      await svc.registerDeepLinkPattern(CTX(t), 'app1', '/app/{name}/view/{id}', 'object_detail');
      const resolved = await svc.resolveDeepLink(CTX(t), '/app/patient/view/p1');
      expect(resolved.valid).toBe(true);
      expect(resolved.appId).toBe('app1');
      expect(resolved.screen).toBe('object_detail');
      expect(resolved.params.name).toBe('patient');
      expect(resolved.params.id).toBe('p1');
      const invalid = await svc.resolveDeepLink(CTX(t), '/unknown/path');
      expect(invalid.valid).toBe(false);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');

      await svc.setState(CTX(t1), { key: 'k', value: 'v' });
      expect(await svc.getState(CTX(t2), 'k')).toBeNull();
      expect(await svc.listState(CTX(t2))).toHaveLength(0);

      const cap = await svc.recordCapture(CTX(t1), { kind: 'qr_code', data: { decodedValue: 'A' } });
      expect(await svc.getCapture(CTX(t2), cap.id)).toBeNull();
      expect(await svc.listCaptures(CTX(t2))).toHaveLength(0);
      await svc.deleteCapture(CTX(t2), cap.id);

      await svc.registerDeepLinkPattern(CTX(t1), 'a', '/x/{id}', 's');
      const r = await svc.resolveDeepLink(CTX(t2), '/x/1');
      expect(r.valid).toBe(false);

      await svc.deleteState(CTX(t2), 'k');
      expect(await svc.getState(CTX(t1), 'k')).not.toBeNull();
    });
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
runTests('InMemoryLayoutDeviceCaptureService', () => Promise.resolve(new InMemoryLayoutDeviceCaptureService()));

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

  const SCHEMA_VERSION = 828289;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'LayoutDeviceConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_ldc_bootstrap', actorId: 'conformance' };

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

  runTests('PostgresLayoutDeviceCaptureService', async () => {
    await ensureSchema();
    return new PostgresLayoutDeviceCaptureService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."layout_device_state" WHERE "tenant_id" LIKE 't_ldc_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresLayoutDeviceCaptureService durability', () => {
    it('survives a restart: state and captures persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_ldc_restart';
      let captureId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929400,
            objectTypes: [{ name: 'LayoutDeviceRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresLayoutDeviceCaptureService(first.pool);
        await svc.setState({ tenantId: TENANT, actorId: 'agent' }, { key: 'saved', value: { a: 1 } });
        const cap = await svc.recordCapture({ tenantId: TENANT, actorId: 'agent' }, { kind: 'qr_code', data: { decodedValue: 'R' } });
        captureId = cap.id;
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929401,
            objectTypes: [{ name: 'LayoutDeviceRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresLayoutDeviceCaptureService(second.pool);
        const state = await svc.getState({ tenantId: TENANT, actorId: 'agent' }, 'saved');
        expect(state).not.toBeNull();
        expect(state!.value).toEqual({ a: 1 });
        const cap = await svc.getCapture({ tenantId: TENANT, actorId: 'agent' }, captureId!);
        expect(cap).not.toBeNull();
        expect(cap!.data.decodedValue).toBe('R');
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."layout_device_state" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });

  describe('PostgresLayoutDeviceCaptureService expiry', () => {
    it('excludes expired state and captures from reads and lists', async () => {
      const svc = new PostgresLayoutDeviceCaptureService(provider.pool);
      const t = tenant('expiry');
      const ctx = CTX(t);
      const freshState = await svc.setState(ctx, { key: 'fresh', value: 'yes' });
      const freshCap = await svc.recordCapture(ctx, { kind: 'qr_code', data: { decodedValue: 'fresh' } });

      await provider.pool.query(
        `INSERT INTO "governance"."layout_device_state"
           ("id","tenant_id","device_id","session_id","kind","payload","created_at","updated_at","created_by","expires_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)`,
        [
          `${t}:expired-state`,
          t,
          'u1',
          'user:',
          'ui_state',
          JSON.stringify({ key: 'expired', value: 'gone', scope: 'user' }),
          new Date().toISOString(),
          'u1',
          new Date(Date.now() - 60_000).toISOString(),
        ],
      );
      await provider.pool.query(
        `INSERT INTO "governance"."layout_device_state"
           ("id","tenant_id","device_id","session_id","kind","payload","created_at","updated_at","created_by","expires_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)`,
        [
          `${t}:expired-capture`,
          t,
          'qr_code',
          null,
          'capture',
          JSON.stringify({ kind: 'qr_code', data: { decodedValue: 'expired' }, userId: 'u1', timestamp: new Date().toISOString() }),
          new Date().toISOString(),
          'u1',
          new Date(Date.now() - 60_000).toISOString(),
        ],
      );

      expect(await svc.getState(ctx, 'expired')).toBeNull();
      const states = await svc.listState(ctx);
      expect(states).toHaveLength(1);
      expect(states[0]!.id).toBe(freshState.id);

      expect(await svc.getCapture(ctx, `${t}:expired-capture`)).toBeNull();
      const caps = await svc.listCaptures(ctx, 'qr_code');
      expect(caps).toHaveLength(1);
      expect(caps[0]!.id).toBe(freshCap.id);
    });
  });
}
