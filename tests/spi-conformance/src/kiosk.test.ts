/**
 * KioskService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { KioskService, KioskSession, RequestContext } from '@altius/spi';
import { InMemoryKioskService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresKioskService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

const PERMS = { readOnly: true as const, objectTypes: ['Patient', 'Observation'] };

const INPUT = {
  name: 'lobby-kiosk',
  location: 'lobby-screen-1',
  kioskUserId: 'kiosk-1',
  permissions: PERMS,
  durationSeconds: 3600,
};

let counter = 0;
const tenant = (label: string) => `t_k_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<KioskService>): void {
  describe(`[${name}] SPI Conformance: KioskService`, () => {
    it('creates and gets a session', async () => {
      const svc = await factory();
      const t = tenant('create');
      const session = await svc.createSession(CTX(t), INPUT);
      expect(session.id).toBeTruthy();
      expect(session.tenantId).toBe(t);
      expect(session.name).toBe(INPUT.name);
      expect(session.location).toBe(INPUT.location);
      expect(session.kioskUserId).toBe(INPUT.kioskUserId);
      expect(session.state).toBe('active');
      expect(session.permissions.readOnly).toBe(true);
      expect(session.launchHistory).toHaveLength(1);
      expect(session.launchHistory[0]!.action).toBe('started');
      expect(session.adminAllowlisted).toBe(true);

      const fetched = await svc.getSession(CTX(t), session.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(session.id);
    });

    it('auto-expires sessions on get', async () => {
      const svc = await factory();
      const t = tenant('autoexpire');
      const session = await svc.createSession(CTX(t), { ...INPUT, durationSeconds: -1 });
      expect(session.state).toBe('active');

      const fetched = await svc.getSession(CTX(t), session.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.state).toBe('expired');
      expect(fetched!.launchHistory.length).toBeGreaterThanOrEqual(2);
      expect(fetched!.launchHistory.some((h) => h.action === 'expired')).toBe(true);
    });

    it('lists sessions and filters by state', async () => {
      const svc = await factory();
      const t = tenant('list');
      const active1 = await svc.createSession(CTX(t), INPUT);
      await new Promise((r) => setTimeout(r, 5));
      const active2 = await svc.createSession(CTX(t), { ...INPUT, name: 'second' });
      await svc.revokeSession(CTX(t), active2.id);

      const all = await svc.listSessions(CTX(t));
      expect(all).toHaveLength(2);
      expect(all[0]!.id).toBe(active2.id); // newer started last

      const actives = await svc.listSessions(CTX(t), 'active');
      expect(actives).toHaveLength(1);
      expect(actives[0]!.id).toBe(active1.id);

      const revoked = await svc.listSessions(CTX(t), 'revoked');
      expect(revoked).toHaveLength(1);
      expect(revoked[0]!.id).toBe(active2.id);
    });

    it('revokes a session', async () => {
      const svc = await factory();
      const t = tenant('revoke');
      const session = await svc.createSession(CTX(t), INPUT);
      await svc.revokeSession(CTX(t), session.id);

      const fetched = await svc.getSession(CTX(t), session.id);
      expect(fetched!.state).toBe('revoked');
      expect(fetched!.launchHistory.some((h) => h.action === 'revoked')).toBe(true);
    });

    it('refreshes an active session', async () => {
      const svc = await factory();
      const t = tenant('refresh');
      const session = await svc.createSession(CTX(t), INPUT);
      await new Promise((r) => setTimeout(r, 5));
      const refreshed = await svc.refreshSession(CTX(t), session.id);
      expect(refreshed.launchHistory.some((h) => h.action === 'refreshed')).toBe(true);
      expect(refreshed.lastActivityAt).not.toBe(session.lastActivityAt);
    });

    it('refuses to refresh revoked sessions', async () => {
      const svc = await factory();
      const t = tenant('refresh_guard');
      const active = await svc.createSession(CTX(t), INPUT);
      await svc.revokeSession(CTX(t), active.id);
      await expect(svc.refreshSession(CTX(t), active.id)).rejects.toThrow(/revoked/);
    });

    it('checks canAccess', async () => {
      const svc = await factory();
      const t = tenant('access');
      const session = await svc.createSession(CTX(t), INPUT);
      expect(await svc.canAccess(CTX(t), session.id, 'Patient')).toBe(true);
      expect(await svc.canAccess(CTX(t), session.id, 'Medication')).toBe(false);

      await svc.revokeSession(CTX(t), session.id);
      expect(await svc.canAccess(CTX(t), session.id, 'Patient')).toBe(false);
    });

    it('expires stale sessions', async () => {
      const svc = await factory();
      const t = tenant('stale');
      await svc.createSession(CTX(t), { ...INPUT, durationSeconds: -1 });
      const active = await svc.createSession(CTX(t), INPUT);

      const count = await svc.expireStale(CTX(t));
      expect(count).toBe(1);

      const expired = await svc.getSession(CTX(t), (await svc.listSessions(CTX(t), 'expired'))[0]!.id);
      expect(expired).not.toBeNull();
      expect(await svc.listSessions(CTX(t), 'active')).toHaveLength(1);
      expect((await svc.listSessions(CTX(t), 'active'))[0]!.id).toBe(active.id);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      const session = await svc.createSession(CTX(t1), INPUT);

      expect(await svc.getSession(CTX(t2), session.id)).toBeNull();
      expect(await svc.listSessions(CTX(t2))).toHaveLength(0);
      await expect(svc.refreshSession(CTX(t2), session.id)).rejects.toThrow(/Session not found/);
      expect(await svc.expireStale(CTX(t2))).toBe(0);
    });
  });
}

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryKioskService();
runTests('InMemoryKioskService', () => Promise.resolve(memory));

// ── Postgres ──────────────────────────────────────────────────────────────
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
    objectTypes: [{ name: 'KioskConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_k_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology as any);
    })();
    return ready;
  };

  runTests('PostgresKioskService', async () => {
    await ensureSchema();
    return new PostgresKioskService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."kiosk_sessions" WHERE "tenant_id" LIKE 't_k_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresKioskService durability', () => {
    it('survives a restart: sessions and state persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_k_restart';
      let sessionId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929296,
            objectTypes: [{ name: 'KioskRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as any,
        );
        const svc = new PostgresKioskService(first.pool);
        const session = await svc.createSession({ tenantId: TENANT, actorId: 'agent' }, INPUT);
        sessionId = session.id;
        await svc.revokeSession({ tenantId: TENANT, actorId: 'agent' }, sessionId);
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929297,
            objectTypes: [{ name: 'KioskRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as any,
        );
        const fresh = new PostgresKioskService(second.pool);
        const session = await fresh.getSession({ tenantId: TENANT, actorId: 'restart' }, sessionId!);
        expect(session).not.toBeNull();
        expect(session!.name).toBe(INPUT.name);
        expect(session!.state).toBe('revoked');
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."kiosk_sessions" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
