/**
 * UserDirectoryService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { DirectoryUser, ListUsersResult, RequestContext, UserDirectoryService, OntologySchema } from '@altius/spi';
import { InMemoryUserDirectoryService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresUserDirectoryService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

interface CreateUserInput {
  id: string;
  name: string;
  email: string;
  roles?: string[];
  groups?: string[];
  attributes?: Record<string, unknown>;
  active?: boolean;
}

interface UpdateUserInput {
  name?: string;
  email?: string;
  roles?: string[];
  groups?: string[];
  attributes?: Record<string, unknown>;
  active?: boolean;
}

interface UserDirectoryAdminService extends UserDirectoryService {
  createUser(ctx: RequestContext, input: CreateUserInput): Promise<DirectoryUser>;
  updateUser(ctx: RequestContext, id: string, input: UpdateUserInput): Promise<DirectoryUser | null>;
  deactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null>;
  reactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null>;
  addGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null>;
  removeGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null>;
}

let counter = 0;
const tenant = (label: string) => `t_ud_${label}_${counter++}`;

function assertList(result: ListUsersResult, expectedIds: string[]): void {
  expect(result.users.map((u) => u.id)).toEqual(expectedIds);
}

function runTests(name: string, factory: () => Promise<UserDirectoryAdminService>): void {
  describe(`[${name}] SPI Conformance: UserDirectoryService`, () => {
    it('creates and gets a user', async () => {
      const svc = await factory();
      const t = tenant('create');
      const user = await svc.createUser(CTX(t, 'admin'), {
        id: 'u-create',
        name: 'Alice',
        email: 'alice@example.com',
        roles: ['viewer'],
        groups: ['a-team'],
      });
      expect(user.id).toBe('u-create');
      expect(user.tenantId).toBe(t);
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@example.com');
      expect(user.roles).toEqual(['viewer']);
      expect(user.groups).toEqual(['a-team']);
      expect(user.active).toBe(true);

      const fetched = await svc.get(CTX(t), 'u-create');
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe('u-create');
      expect(fetched!.name).toBe('Alice');
    });

    it('lists and searches users', async () => {
      const svc = await factory();
      const t = tenant('list');
      await svc.createUser(CTX(t), { id: 'u-1', name: 'Alice One', email: 'a@example.com', roles: ['admin'], groups: ['g1'] });
      await svc.createUser(CTX(t), { id: 'u-2', name: 'Bob Two', email: 'b@example.com', roles: ['viewer'], groups: ['g2'] });
      await svc.createUser(CTX(t), { id: 'u-3', name: 'inactive', email: 'c@example.com', active: false });

      const all = await svc.list(CTX(t));
      expect(all.totalCount).toBe(2);
      assertList(all, ['u-1', 'u-2']);

      const search = await svc.list(CTX(t), { q: 'alice' });
      expect(search.totalCount).toBe(1);
      expect(search.users[0]!.id).toBe('u-1');

      const byRole = await svc.list(CTX(t), { role: 'admin' });
      expect(byRole.totalCount).toBe(1);
      expect(byRole.users[0]!.id).toBe('u-1');

      const byGroup = await svc.list(CTX(t), { group: 'g2' });
      expect(byGroup.totalCount).toBe(1);
      expect(byGroup.users[0]!.id).toBe('u-2');

      const withInactive = await svc.list(CTX(t), { includeInactive: true });
      expect(withInactive.totalCount).toBe(3);

      const paged = await svc.list(CTX(t), { limit: 1, offset: 1 });
      expect(paged.totalCount).toBe(2);
      expect(paged.users).toHaveLength(1);
    });

    it('gets many users in input order', async () => {
      const svc = await factory();
      const t = tenant('many');
      await svc.createUser(CTX(t), { id: 'm-2', name: 'Two', email: 'two@example.com' });
      await svc.createUser(CTX(t), { id: 'm-1', name: 'One', email: 'one@example.com' });
      const users = await svc.getMany(CTX(t), ['m-1', 'm-2', 'missing']);
      expect(users).toHaveLength(2);
      expect(users[0]!.id).toBe('m-1');
      expect(users[1]!.id).toBe('m-2');
    });

    it('updates a user', async () => {
      const svc = await factory();
      const t = tenant('update');
      await svc.createUser(CTX(t), { id: 'u-up', name: 'Old', email: 'old@example.com', roles: ['viewer'] });
      const updated = await svc.updateUser(CTX(t), 'u-up', { name: 'New', email: 'new@example.com', roles: ['admin'] });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New');
      expect(updated!.email).toBe('new@example.com');
      expect(updated!.roles).toEqual(['admin']);

      const fetched = await svc.get(CTX(t), 'u-up');
      expect(fetched!.name).toBe('New');
    });

    it('deactivates and reactivates a user', async () => {
      const svc = await factory();
      const t = tenant('toggle');
      await svc.createUser(CTX(t), { id: 'u-toggle', name: 'Tog', email: 't@example.com' });
      const deactivated = await svc.deactivateUser(CTX(t), 'u-toggle');
      expect(deactivated!.active).toBe(false);
      expect(await svc.get(CTX(t), 'u-toggle')).not.toBeNull();
      expect((await svc.list(CTX(t))).totalCount).toBe(0);

      const reactivated = await svc.reactivateUser(CTX(t), 'u-toggle');
      expect(reactivated!.active).toBe(true);
      expect((await svc.list(CTX(t))).totalCount).toBe(1);
    });

    it('adds and removes group membership', async () => {
      const svc = await factory();
      const t = tenant('groups');
      await svc.createUser(CTX(t), { id: 'u-g', name: 'G', email: 'g@example.com', groups: ['a'] });
      const added = await svc.addGroupMembership(CTX(t), 'u-g', 'b');
      expect(added!.groups).toEqual(['a', 'b']);
      const idempotent = await svc.addGroupMembership(CTX(t), 'u-g', 'b');
      expect(idempotent!.groups).toEqual(['a', 'b']);
      const removed = await svc.removeGroupMembership(CTX(t), 'u-g', 'a');
      expect(removed!.groups).toEqual(['b']);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      await svc.createUser(CTX(t1), { id: 'u-iso', name: 'Iso', email: 'iso@example.com' });

      expect(await svc.get(CTX(t2), 'u-iso')).toBeNull();
      expect((await svc.list(CTX(t2))).totalCount).toBe(0);
      expect(await svc.getMany(CTX(t2), ['u-iso'])).toHaveLength(0);
      expect(await svc.updateUser(CTX(t2), 'u-iso', { name: 'Hijack' })).toBeNull();
      expect(await svc.deactivateUser(CTX(t2), 'u-iso')).toBeNull();
      expect(await svc.addGroupMembership(CTX(t2), 'u-iso', 'x')).toBeNull();
    });
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
runTests('InMemoryUserDirectoryService', () => Promise.resolve(new InMemoryUserDirectoryService() as unknown as UserDirectoryAdminService));

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

  const SCHEMA_VERSION = 828287;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'UserDirectoryConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_ud_bootstrap', actorId: 'conformance' };

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

  runTests('PostgresUserDirectoryService', async () => {
    await ensureSchema();
    return new PostgresUserDirectoryService(provider.pool) as unknown as UserDirectoryAdminService;
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."user_directory" WHERE "tenant_id" LIKE 't_ud_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresUserDirectoryService durability', () => {
    it('survives a restart: users persist', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_ud_restart';
      let userId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929298,
            objectTypes: [{ name: 'UserDirectoryRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const svc = new PostgresUserDirectoryService(first.pool);
        const user = await svc.createUser({ tenantId: TENANT, actorId: 'agent' }, {
          id: 'u-restart',
          name: 'Restart',
          email: 'r@example.com',
          groups: ['g1'],
        });
        userId = user.id;
        await svc.addGroupMembership({ tenantId: TENANT, actorId: 'agent' }, userId, 'g2');
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929299,
            objectTypes: [{ name: 'UserDirectoryRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as unknown as OntologySchema,
        );
        const fresh = new PostgresUserDirectoryService(second.pool);
        const user = await fresh.get({ tenantId: TENANT, actorId: 'agent' }, userId!);
        expect(user).not.toBeNull();
        expect(user!.name).toBe('Restart');
        expect(user!.groups).toEqual(['g1', 'g2']);
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."user_directory" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
