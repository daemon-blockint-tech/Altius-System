/**
 * DesignSystemService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { RequestContext, DesignSystemService, OntologySchema } from '@altius/spi';
import { InMemoryDesignSystemService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresDesignSystemService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

let counter = 0;
const tenant = (label: string) => `t_ds_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<DesignSystemService>): void {
  describe(`[${name}] SPI Conformance: DesignSystemService`, () => {
    it('creates and gets a theme with defaults', async () => {
      const svc = await factory();
      const t = tenant('create');
      const theme = await svc.createTheme(CTX(t), { name: 'Light' });

      expect(theme.id).toBeTruthy();
      expect(theme.tenantId).toBe(t);
      expect(theme.name).toBe('Light');
      expect(theme.isDefault).toBe(false);
      expect(theme.darkMode).toBe(false);
      expect(theme.density).toBe('comfortable');
      expect(theme.palette.primary).toBe('#2563eb');
      expect(theme.typography.baseSizePx).toBe(14);
      expect(theme.createdBy).toBe('u1');
      expect(theme.createdAt).toBe(theme.updatedAt);

      const fetched = await svc.getTheme(CTX(t), theme.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(theme.id);
      expect(fetched!.palette.primary).toBe('#2563eb');
    });

    it('lists themes sorted by updated_at descending', async () => {
      const svc = await factory();
      const t = tenant('list');
      const first = await svc.createTheme(CTX(t), { name: 'first' });
      await new Promise((r) => setTimeout(r, 5));
      const second = await svc.createTheme(CTX(t), { name: 'second' });

      const list = await svc.listThemes(CTX(t));
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe(second.id);
      expect(list[1]!.id).toBe(first.id);
    });

    it('updates a theme', async () => {
      const svc = await factory();
      const t = tenant('update');
      const theme = await svc.createTheme(CTX(t), { name: 'Old' });
      await new Promise((r) => setTimeout(r, 5));
      const updated = await svc.updateTheme(CTX(t), theme.id, {
        name: 'New',
        palette: { primary: '#000000' },
        isDefault: true,
      });

      expect(updated.name).toBe('New');
      expect(updated.palette.primary).toBe('#000000');
      expect(updated.isDefault).toBe(true);
      expect(updated.updatedAt).not.toBe(updated.createdAt);

      const fetched = await svc.getTheme(CTX(t), theme.id);
      expect(fetched!.name).toBe('New');
      expect(fetched!.isDefault).toBe(true);
    });

    it('deletes a theme', async () => {
      const svc = await factory();
      const t = tenant('delete');
      const theme = await svc.createTheme(CTX(t), { name: 'to-delete' });
      await svc.deleteTheme(CTX(t), theme.id);
      expect(await svc.getTheme(CTX(t), theme.id)).toBeNull();
      expect(await svc.listThemes(CTX(t))).toHaveLength(0);
    });

    it('enforces one default per tenant and getDefaultTheme resolves it', async () => {
      const svc = await factory();
      const t = tenant('default');
      const a = await svc.createTheme(CTX(t), { name: 'A' });
      const b = await svc.createTheme(CTX(t), { name: 'B', isDefault: true });

      const aRefetched = await svc.getTheme(CTX(t), a.id);
      expect(aRefetched!.isDefault).toBe(false);
      expect(b.isDefault).toBe(true);

      const defaultTheme = await svc.getDefaultTheme(CTX(t));
      expect(defaultTheme).not.toBeNull();
      expect(defaultTheme!.id).toBe(b.id);

      await svc.updateTheme(CTX(t), a.id, { isDefault: true });
      const aAfter = await svc.getTheme(CTX(t), a.id);
      const bAfter = await svc.getTheme(CTX(t), b.id);
      expect(aAfter!.isDefault).toBe(true);
      expect(bAfter!.isDefault).toBe(false);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      const theme = await svc.createTheme(CTX(t1), { name: 'secret' });

      expect(await svc.getTheme(CTX(t2), theme.id)).toBeNull();
      expect(await svc.listThemes(CTX(t2))).toHaveLength(0);
      await expect(svc.updateTheme(CTX(t2), theme.id, { name: 'hijacked' })).rejects.toThrow(/Theme not found/);
      await svc.deleteTheme(CTX(t2), theme.id);
      expect(await svc.getTheme(CTX(t1), theme.id)).not.toBeNull();
    });

    it('sets and resolves module palettes', async () => {
      const svc = await factory();
      const t = tenant('module');
      const theme = await svc.createTheme(CTX(t), {
        name: 'M',
        isDefault: true,
        palette: { primary: '#111111' },
      });

      const updated = await svc.setModulePalette(CTX(t), {
        themeId: theme.id,
        moduleId: 'mod1',
        palette: { primary: '#abcdef' },
      });
      expect(updated.modulePalettes!['mod1']!.primary).toBe('#abcdef');

      const moduleTheme = await svc.getModuleTheme(CTX(t), 'mod1');
      expect(moduleTheme).not.toBeNull();
      expect(moduleTheme!.palette.primary).toBe('#abcdef');
      expect(moduleTheme!.id).toBe(theme.id);

      const untouched = await svc.getModuleTheme(CTX(t), 'unknown');
      expect(untouched!.palette.primary).toBe('#111111');
    });
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
runTests('InMemoryDesignSystemService', () => Promise.resolve(new InMemoryDesignSystemService()));

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

  const SCHEMA_VERSION = 828288;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'DesignSystemConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_ds_bootstrap', actorId: 'conformance' };

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

  runTests('PostgresDesignSystemService', async () => {
    await ensureSchema();
    return new PostgresDesignSystemService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."design_system_themes" WHERE "tenant_id" LIKE 't_ds_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresDesignSystemService durability', () => {
    it('survives a restart: themes persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_ds_restart';
      let themeId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929300,
            objectTypes: [{ name: 'DesignSystemRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresDesignSystemService(first.pool);
        const theme = await svc.createTheme({ tenantId: TENANT, actorId: 'agent' }, { name: 'Survivor' });
        themeId = theme.id;
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929301,
            objectTypes: [{ name: 'DesignSystemRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const fresh = new PostgresDesignSystemService(second.pool);
        const theme = await fresh.getTheme({ tenantId: TENANT, actorId: 'agent' }, themeId!);
        expect(theme).not.toBeNull();
        expect(theme!.name).toBe('Survivor');
        expect(theme!.palette.primary).toBe('#2563eb');
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."design_system_themes" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
