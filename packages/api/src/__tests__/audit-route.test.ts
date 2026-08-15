/**
 * Tests for the REST audit trail read API.
 *
 * Before this route existed, audit records were written by AuditWriter on
 * every operation but unreachable over HTTP — PostgresAuditStore.query() and
 * MemoryAuditStore.query() had zero production callers. These tests verify
 * the read surface, tenant scoping, and filtering.
 */

import { describe, it, expect } from 'vitest';
import type { AuditRecord } from '@altius/spi';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';
import { generateAuditRoutes } from '../rest/audit-routes.js';
import { MemoryAuditStore } from '@altius/security';

// ─── Fixtures ───

function createMockUser(tenantId = 'tenant-1'): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr.smith@nhs.uk',
    roles: ['admin'],
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

function createDeps(store: MemoryAuditStore): ApiDependencies {
  return {
    schema: { objectTypes: [], linkTypes: [], actionTypes: [], functionTypes: [], enums: [], interfaces: [] } as unknown as ApiDependencies['schema'],
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

function createRequest(overrides: Partial<RestRequest> = {}): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/audit',
    params: {},
    query: {},
    body: undefined,
    user: createMockUser(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════

describe('GET /api/v1/audit', () => {
  it('returns audit records scoped to the caller tenant', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({ id: 'a1', tenantId: 'tenant-1' }));
    await store.append(createAuditRecord({ id: 'a2', tenantId: 'tenant-2' }));

    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);
    expect(routes).toHaveLength(1);

    const result = await routes[0]!.handler(createRequest(), createCtx(deps));

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const records = body['data'] as AuditRecord[];
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe('a1');
    expect(records[0]!.tenantId).toBe('tenant-1');
  });

  it('does not return another tenant records even if tenantId is passed as a query param', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({ id: 'a1', tenantId: 'tenant-1' }));
    await store.append(createAuditRecord({ id: 'a2', tenantId: 'tenant-2' }));

    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);

    // A caller in tenant-1 tries to pass tenantId=tenant-2 — must be ignored
    const result = await routes[0]!.handler(
      createRequest({ query: { tenantId: 'tenant-2' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const records = body['data'] as AuditRecord[];
    expect(records).toHaveLength(1);
    expect(records[0]!.tenantId).toBe('tenant-1');
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
    await store.append(createAuditRecord({
      id: 'a3',
      operation: { type: 'action', actionType: 'AdmitPatient' },
    }));

    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);

    const result = await routes[0]!.handler(
      createRequest({ query: { objectType: 'Patient', objectId: 'p-1' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const records = body['data'] as AuditRecord[];
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe('a1');
  });

  it('filters by traceId', async () => {
    const store = new MemoryAuditStore();
    await store.append(createAuditRecord({ id: 'a1', traceId: 'trace-abc' }));
    await store.append(createAuditRecord({ id: 'a2', traceId: 'trace-xyz' }));

    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);

    const result = await routes[0]!.handler(
      createRequest({ query: { traceId: 'trace-abc' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const records = body['data'] as AuditRecord[];
    expect(records).toHaveLength(1);
    expect(records[0]!.traceId).toBe('trace-abc');
  });

  it('paginates with limit and offset', async () => {
    const store = new MemoryAuditStore();
    for (let i = 0; i < 5; i++) {
      await store.append(createAuditRecord({ id: `a${i}` }));
    }

    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);

    const result = await routes[0]!.handler(
      createRequest({ query: { limit: '2', offset: '1' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const records = body['data'] as AuditRecord[];
    expect(records).toHaveLength(2);
    expect(body['totalCount']).toBe(5);
    expect(body['hasMore']).toBe(true);
  });

  it('returns empty array when no records match', async () => {
    const store = new MemoryAuditStore();
    const deps = createDeps(store);
    const routes = generateAuditRoutes(deps);

    const result = await routes[0]!.handler(createRequest(), createCtx(deps));

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body['data']).toEqual([]);
    expect(body['totalCount']).toBe(0);
  });

  it('returns no routes when auditStore is absent', () => {
    const deps = createDeps(new MemoryAuditStore());
    delete (deps as { auditStore?: unknown }).auditStore;

    const routes = generateAuditRoutes(deps);
    expect(routes).toHaveLength(0);
  });
});
