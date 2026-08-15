/**
 * Tests for the GraphQL `auditRecords` query field.
 *
 * Before this field existed, the audit trail was REST-only (GET /api/v1/audit).
 * GraphQL clients had no way to read audit records — the SDL contained no
 * audit types and the resolver-generator registered no audit query resolver.
 *
 * These tests verify the GraphQL read surface mirrors the REST route: tenant
 * scoping, role-gating, filtering, and pagination.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { AuditRecord } from '@altius/spi';
import { MemoryAuditStore } from '@altius/security';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

// ─── Minimal ODL fixture ───

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String! @sensitive
}
`;

// ─── Fixtures ───

function createMockUser(roles: string[] = ['admin'], tenantId = 'tenant-1'): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr.smith@test.uk',
    roles,
    groups: [],
    tenantId,
  };
}

function createAuditRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 'audit-1',
    timestamp: '2025-01-01T00:00:00Z',
    traceId: 'trace-1',
    tenantId: 'tenant-1',
    actor: { type: 'user', id: 'user-1', roles: ['clinician'] },
    operation: { type: 'action', actionType: 'AdmitPatient' },
    detail: { result: 'success' },
    ...overrides,
  };
}

function createMockDeps(schema: ParsedSchema, store: MemoryAuditStore): ApiDependencies {
  return {
    schema,
    objectManager: {} as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {} as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    storage: {} as unknown as ApiDependencies['storage'],
    auditStore: store,
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

// ════════════════════════════════════════════════════════════════════

describe('GraphQL auditRecords query', () => {
  const schema = parseOdl(ODL);

  it('emits audit types and the auditRecords query field in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('type AuditRecord');
    expect(sdl).toContain('input AuditFilter');
    expect(sdl).toContain('type AuditPage');
    expect(sdl).toContain('auditRecords(');
  });

  it('returns audit records scoped to the caller tenant', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({ id: 'a1', tenantId: 'tenant-1' }));
    await store.append(createAuditRecord({ id: 'a2', tenantId: 'tenant-2' }));

    const deps = createMockDeps(schema, store);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    const result = await auditResolver(undefined, {}, createCtx(deps));
    const page = result as { records: AuditRecord[]; totalCount: number; hasMore: boolean };
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.id).toBe('a1');
    expect(page.records[0]!.tenantId).toBe('tenant-1');
  });

  it('filters by objectType and objectId', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({
      id: 'a1',
      operation: { type: 'update', objectType: 'Patient', objectId: 'p-1' },
    }));
    await store.append(createAuditRecord({
      id: 'a2',
      operation: { type: 'update', objectType: 'Patient', objectId: 'p-2' },
    }));

    const deps = createMockDeps(schema, store);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    const result = await auditResolver(
      undefined,
      { filter: { objectType: 'Patient', objectId: 'p-1' } },
      createCtx(deps),
    );
    const page = result as { records: AuditRecord[]; totalCount: number; hasMore: boolean };
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.id).toBe('a1');
  });

  it('paginates with limit and offset', async () => {
    const store = new MemoryAuditStore();
    for (let i = 0; i < 5; i++) {
      await store.append(createAuditRecord({ id: `a${i}` }));
    }

    const deps = createMockDeps(schema, store);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    const result = await auditResolver(
      undefined,
      { limit: 2, offset: 1 },
      createCtx(deps),
    );
    const page = result as { records: AuditRecord[]; totalCount: number; hasMore: boolean };
    expect(page.records).toHaveLength(2);
    expect(page.totalCount).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  it('passes limit and offset to the store, not slicing client-side', async () => {
    // A store that records what options it was called with.
    const store = new MemoryAuditStore();
    for (let i = 0; i < 10; i++) {
      await store.append(createAuditRecord({ id: `a${i}` }));
    }

    // Wrap the store to spy on query calls.
    const queryCalls: { limit?: number; offset?: number }[] = [];
    const wrappedStore = {
      append: (r: AuditRecord) => store.append(r),
      query: async (filter: unknown, options?: { limit?: number; offset?: number }) => {
        queryCalls.push(options ?? {});
        return store.query(filter as never, options);
      },
      count: (filter: unknown) => store.count(filter as never),
      all: () => store.all(),
      size: store.size,
    } as unknown as MemoryAuditStore;

    const deps = createMockDeps(schema, wrappedStore);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    await auditResolver(undefined, { limit: 3, offset: 5 }, createCtx(deps));

    // The store must have received limit=3, offset=5 — not the full set.
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]!.limit).toBe(3);
    expect(queryCalls[0]!.offset).toBe(5);
  });

  it('does not truncate totalCount at the store default when the page is small', async () => {
    // The old resolver fetched all records then sliced, so totalCount was
    // always the full count. The new resolver calls count() separately,
    // so totalCount stays honest even when the store applies its own
    // internal limit on query().
    const store = new MemoryAuditStore();
    for (let i = 0; i < 50; i++) {
      await store.append(createAuditRecord({ id: `a${i}` }));
    }

    const deps = createMockDeps(schema, store);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    const result = await auditResolver(
      undefined,
      { limit: 10, offset: 0 },
      createCtx(deps),
    );
    const page = result as { records: AuditRecord[]; totalCount: number; hasMore: boolean };
    expect(page.records).toHaveLength(10);
    expect(page.totalCount).toBe(50);
    expect(page.hasMore).toBe(true);
  });

  it('denies a caller without an audit-reader role', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({ id: 'a1' }));

    const deps = createMockDeps(schema, store);
    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    await expect(
      auditResolver(undefined, {}, createCtx(deps, createMockUser(['clinician']))),
    ).rejects.toThrow();
  });

  it('errors when auditStore is not configured', async () => {
    const deps = createMockDeps(schema, new MemoryAuditStore());
    delete (deps as { auditStore?: unknown }).auditStore;

    const { resolvers } = generateResolvers(schema, deps);
    const queryResolvers = resolvers['Query'] as Record<string, unknown>;
    const auditResolver = queryResolvers['auditRecords'] as (
      parent: unknown,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    await expect(
      auditResolver(undefined, {}, createCtx(deps)),
    ).rejects.toThrow();
  });
});
