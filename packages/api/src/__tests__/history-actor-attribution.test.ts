/**
 * Tests for actor attribution in edit history.
 *
 * Before this change, OntologyObject had no _actorId field. History snapshots
 * showed what changed and when but never who made the change. These tests
 * verify that every write (create, update, delete) records the actor from
 * RequestContext.actorId, and that both REST and GraphQL history surfaces
 * expose it.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { RequestContext } from '@altius/spi';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

// ─── Minimal ODL fixture ───

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String! @sensitive
  status: String
}
`;

// ─── Mock factories ───

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr.smith@test.uk',
    roles: ['clinician'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function createCtx(deps: ApiDependencies, user?: AuthenticatedUserInfo): ResolverContext {
  const u = user ?? createMockUser();
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps,
  };
}

function createMockDeps(schema: ParsedSchema, storage: MemoryStorageProvider): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(
        (_userId: string, _roles: string[], _type: string, obj: Record<string, unknown>) => ({
          data: obj,
          _redactedFields: [],
        }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_userId: string, _roles: string[], _type: string, objects: Record<string, unknown>[]) =>
          objects.map(obj => ({ data: obj, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    storage,
  };
}

// ════════════════════════════════════════════════════════════════════

describe('Actor attribution in edit history', () => {
  const schema = parseOdl(ODL);

  it('exposes _actorId in the GraphQL SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('_actorId: String');
  });

  it('records _actorId on create', async () => {
    const storage = new MemoryStorageProvider();
    const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 't-1' };
    const obj = await storage.createObject(ctx, 'Patient', { name: 'John', status: 'ACTIVE' });
    expect(obj._actorId).toBe('user-1');
  });

  it('records _actorId on update', async () => {
    const storage = new MemoryStorageProvider();
    const ctx1: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 't-1' };
    const created = await storage.createObject(ctx1, 'Patient', { name: 'John', status: 'ACTIVE' });

    const ctx2: RequestContext = { tenantId: 'tenant-1', actorId: 'user-2', traceId: 't-2' };
    const updated = await storage.updateObject(ctx2, 'Patient', created._id, { status: 'DISCHARGED' });
    expect(updated._actorId).toBe('user-2');
  });

  it('records _actorId on soft delete', async () => {
    const storage = new MemoryStorageProvider();
    const ctx1: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 't-1' };
    const created = await storage.createObject(ctx1, 'Patient', { name: 'John', status: 'ACTIVE' });

    const ctx2: RequestContext = { tenantId: 'tenant-1', actorId: 'user-2', traceId: 't-2' };
    await storage.deleteObject(ctx2, 'Patient', created._id, 'soft');
    // getObject returns null for soft-deleted objects, so verify via history
    // — the delete event produced a new version with the deleter's actorId.
    const history = await storage.getObjectHistory(ctx2, 'Patient', created._id);
    expect(history).toHaveLength(2);
    expect(history[1]?._actorId).toBe('user-2');
    expect(history[1]?._deletedAt).toBeDefined();
  });

  it('history snapshots carry _actorId for each version', async () => {
    const storage = new MemoryStorageProvider();
    const ctx1: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 't-1' };
    const created = await storage.createObject(ctx1, 'Patient', { name: 'John', status: 'ACTIVE' });

    const ctx2: RequestContext = { tenantId: 'tenant-1', actorId: 'user-2', traceId: 't-2' };
    await storage.updateObject(ctx2, 'Patient', created._id, { status: 'DISCHARGED' });

    const ctx3: RequestContext = { tenantId: 'tenant-1', actorId: 'user-3', traceId: 't-3' };
    await storage.updateObject(ctx3, 'Patient', created._id, { status: 'READMITTED' });

    const history = await storage.getObjectHistory(ctx3, 'Patient', created._id);
    expect(history).toHaveLength(3);
    expect(history[0]?._actorId).toBe('user-1');
    expect(history[1]?._actorId).toBe('user-2');
    expect(history[2]?._actorId).toBe('user-3');
  });

  it('GraphQL history field exposes _actorId', async () => {
    const storage = new MemoryStorageProvider();
    const ctx1: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 't-1' };
    const created = await storage.createObject(ctx1, 'Patient', { name: 'John', status: 'ACTIVE' });

    const ctx2: RequestContext = { tenantId: 'tenant-1', actorId: 'user-2', traceId: 't-2' };
    await storage.updateObject(ctx2, 'Patient', created._id, { status: 'DISCHARGED' });

    const history = await storage.getObjectHistory(ctx2, 'Patient', created._id);
    const deps = createMockDeps(schema, storage);
    (deps.storage as MemoryStorageProvider).getObjectHistory = vi.fn().mockResolvedValue(history);

    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    const result = await historyResolver(
      { id: created._id },
      undefined,
      createCtx(deps),
    );
    const items = result as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]?._actorId).toBe('user-1');
    expect(items[1]?._actorId).toBe('user-2');
  });
});
