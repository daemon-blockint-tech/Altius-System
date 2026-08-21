/**
 * WorkshopUxService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { RequestContext, WorkshopUxService, OntologySchema } from '@altius/spi';
import { InMemoryWorkshopUxService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresWorkshopUxService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

let counter = 0;
const tenant = (label: string) => `t_wux_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<WorkshopUxService>): void {
  describe(`[${name}] SPI Conformance: WorkshopUxService`, () => {
    it('saves and gets app state', async () => {
      const svc = await factory();
      const t = tenant('state_get');
      const saved = await svc.saveState(CTX(t), { appId: 'app1', name: 's1', state: { a: 1 } });
      expect(saved.name).toBe('s1');
      expect(saved.state).toEqual({ a: 1 });
      const got = await svc.getState(CTX(t), saved.id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(saved.id);
    });

    it('lists, updates, shares, forks, and deletes app states', async () => {
      const svc = await factory();
      const t = tenant('state_lifecycle');
      const s1 = await svc.saveState(CTX(t), { appId: 'app1', name: 's1', state: { a: 1 } });
      const s2 = await svc.saveState(CTX(t), { appId: 'app1', name: 's2', state: { b: 2 } });
      const other = await svc.saveState(CTX(t), { appId: 'app2', name: 'other', state: {} });

      const list = await svc.listStates(CTX(t), 'app1');
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.name).sort()).toEqual(['s1', 's2']);

      const updated = await svc.updateState(CTX(t), s1.id, { name: 's1-edited', description: 'd', state: { a: 2 } });
      expect(updated.name).toBe('s1-edited');
      expect(updated.description).toBe('d');
      expect(updated.state).toEqual({ a: 2 });
      expect(updated.version).toBeGreaterThan(s1.version);

      const shared = await svc.shareState(CTX(t), s1.id, ['u2', 'u3']);
      expect(shared.sharedWith).toContain('u2');
      expect(shared.sharedWith).toContain('u3');
      const reshared = await svc.shareState(CTX(t), s1.id, ['u3', 'u4']);
      expect(reshared.sharedWith).toHaveLength(3);

      const forked = await svc.forkState(CTX(t), s1.id, 'fork1');
      expect(forked.name).toBe('fork1');
      expect(forked.state).toEqual(updated.state);
      expect(forked.ownerId).toBe('u1');

      await svc.deleteState(CTX(t), s2.id);
      expect(await svc.getState(CTX(t), s2.id)).toBeNull();
      expect(await svc.listStates(CTX(t), 'app1')).toHaveLength(2);
    });

    it('redact mode defaults and updates', async () => {
      const svc = await factory();
      const t = tenant('redact');
      const def = await svc.getRedactMode(CTX(t));
      expect(def.level).toBe('off');
      expect(def.enabled).toBe(false);

      const updated = await svc.updateRedactMode(CTX(t), {
        enabled: true,
        level: 'partial',
        redactedFields: ['patient.*'],
        allowedFields: ['patient.name'],
      });
      expect(updated.enabled).toBe(true);
      expect(updated.level).toBe('partial');
      expect(updated.redactedFields).toContain('patient.*');

      expect(await svc.shouldRedact(CTX(t), 'patient.ssn')).toBe(true);
      expect(await svc.shouldRedact(CTX(t), 'patient.name')).toBe(false);
      expect(await svc.shouldRedact(CTX(t), 'other.field')).toBe(false);

      await svc.updateRedactMode(CTX(t), { level: 'full' });
      expect(await svc.shouldRedact(CTX(t), 'other.field')).toBe(true);
      expect(await svc.shouldRedact(CTX(t), 'patient.name')).toBe(false);
    });

    it('records, lists, gets, and deletes performance profiles', async () => {
      const svc = await factory();
      const t = tenant('profile');
      const profile = await svc.recordProfile(CTX(t), {
        appId: 'app1',
        name: 'p1',
        durationMs: 1000,
        renderMetrics: { renderCount: 10, avgRenderMs: 5, p95RenderMs: 12 },
        networkMetrics: { requestCount: 5, avgRequestMs: 20, p95RequestMs: 50, failedRequests: 1 },
      });
      expect(profile.name).toBe('p1');
      expect(profile.renderMetrics.renderCount).toBe(10);

      const got = await svc.getProfile(CTX(t), profile.id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(profile.id);

      await svc.recordProfile(CTX(t), {
        appId: 'app2',
        name: 'p2',
        durationMs: 500,
        renderMetrics: { renderCount: 1, avgRenderMs: 1, p95RenderMs: 1 },
        networkMetrics: { requestCount: 1, avgRequestMs: 1, p95RequestMs: 1, failedRequests: 0 },
      });

      const all = await svc.listProfiles(CTX(t));
      expect(all).toHaveLength(2);
      const forApp = await svc.listProfiles(CTX(t), 'app1');
      expect(forApp).toHaveLength(1);

      await svc.deleteProfile(CTX(t), profile.id);
      expect(await svc.getProfile(CTX(t), profile.id)).toBeNull();
    });

    it('sets, gets, bundles, and deletes translations', async () => {
      const svc = await factory();
      const t = tenant('translation');
      await svc.setTranslation(CTX(t), { key: 'greeting', locale: 'en', value: 'Hello', source: 'manual' });
      await svc.setTranslation(CTX(t), { key: 'greeting', locale: 'fr', value: 'Bonjour', source: 'manual' });
      await svc.setTranslation(CTX(t), { key: 'farewell', locale: 'en', value: 'Goodbye' });

      const enHello = await svc.getTranslation(CTX(t), 'greeting', 'en');
      expect(enHello).not.toBeNull();
      expect(enHello!.value).toBe('Hello');

      const frBundle = await svc.getBundle(CTX(t), 'fr');
      expect(frBundle.entries['greeting']).toBe('Bonjour');
      expect(frBundle.missingCount).toBe(1);

      const locales = await svc.listLocales(CTX(t));
      expect(locales).toEqual(['en', 'fr']);

      await svc.deleteTranslation(CTX(t), 'greeting', 'fr');
      expect(await svc.getTranslation(CTX(t), 'greeting', 'fr')).toBeNull();
    });

    it('auto-translates missing keys', async () => {
      const svc = await factory();
      const t = tenant('autotranslate');
      await svc.setTranslation(CTX(t), { key: 'hello', locale: 'en', value: 'Hello' });
      await svc.setTranslation(CTX(t), { key: 'hello', locale: 'fr', value: 'Salut', source: 'aip' });
      const result = await svc.autoTranslate(CTX(t), 'es');
      expect(result.translated).toBe(1);
      expect(result.skipped).toBe(0);

      const es = await svc.getTranslation(CTX(t), 'hello', 'es');
      expect(es).not.toBeNull();
      expect(es!.value).toBe('[es] Hello');
      expect(es!.autoTranslated).toBe(true);

      const frManual = await svc.setTranslation(CTX(t), { key: 'hello', locale: 'fr', value: 'Bonjour', source: 'manual' });
      expect(frManual.autoTranslated).toBe(false);
      const result2 = await svc.autoTranslate(CTX(t), 'fr');
      expect(result2.skipped).toBe(1);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');

      const state = await svc.saveState(CTX(t1), { appId: 'app1', name: 'x', state: {} });
      expect(await svc.getState(CTX(t2), state.id)).toBeNull();
      expect(await svc.listStates(CTX(t2), 'app1')).toHaveLength(0);

      await svc.updateRedactMode(CTX(t1), { enabled: true, redactedFields: ['x'] });
      const t2Redact = await svc.getRedactMode(CTX(t2));
      expect(t2Redact.enabled).toBe(false);

      const profile = await svc.recordProfile(CTX(t1), { appId: 'a', name: 'p', durationMs: 0, renderMetrics: { renderCount: 0, avgRenderMs: 0, p95RenderMs: 0 }, networkMetrics: { requestCount: 0, avgRequestMs: 0, p95RequestMs: 0, failedRequests: 0 } });
      expect(await svc.getProfile(CTX(t2), profile.id)).toBeNull();

      await svc.setTranslation(CTX(t1), { key: 'k', locale: 'en', value: 'v' });
      expect(await svc.getTranslation(CTX(t2), 'k', 'en')).toBeNull();
    });
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
runTests('InMemoryWorkshopUxService', () => Promise.resolve(new InMemoryWorkshopUxService()));

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

  const SCHEMA_VERSION = 828290;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'WorkshopUxConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_wux_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {});
      await provider.applySchema(bootstrapCtx, ontology as unknown as OntologySchema);
    })();
    return ready;
  };

  runTests('PostgresWorkshopUxService', async () => {
    await ensureSchema();
    return new PostgresWorkshopUxService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."workshop_ux_state" WHERE "tenant_id" LIKE 't_wux_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresWorkshopUxService durability', () => {
    it('survives a restart: state and profiles persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_wux_restart';
      let stateId: string;
      let profileId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929402,
            objectTypes: [{ name: 'WorkshopUxRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresWorkshopUxService(first.pool);
        const state = await svc.saveState({ tenantId: TENANT, actorId: 'agent' }, { appId: 'a', name: 'saved', state: { a: 1 } });
        stateId = state.id;
        const profile = await svc.recordProfile({ tenantId: TENANT, actorId: 'agent' }, {
          appId: 'a',
          name: 'p',
          durationMs: 100,
          renderMetrics: { renderCount: 1, avgRenderMs: 1, p95RenderMs: 1 },
          networkMetrics: { requestCount: 1, avgRequestMs: 1, p95RequestMs: 1, failedRequests: 0 },
        });
        profileId = profile.id;
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929403,
            objectTypes: [{ name: 'WorkshopUxRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresWorkshopUxService(second.pool);
        const state = await svc.getState({ tenantId: TENANT, actorId: 'agent' }, stateId!);
        expect(state).not.toBeNull();
        expect(state!.state).toEqual({ a: 1 });
        const profile = await svc.getProfile({ tenantId: TENANT, actorId: 'agent' }, profileId!);
        expect(profile).not.toBeNull();
        expect(profile!.name).toBe('p');
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."workshop_ux_state" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
