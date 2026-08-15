/**
 * Tests for client-facing optimistic concurrency (#5).
 *
 * Verifies:
 *   - REST PUT with If-Match: succeeds when version matches, returns 412
 *     with VERSION_CONFLICT when stale.
 *   - REST DELETE with If-Match: succeeds when version matches, returns 412
 *     when stale.
 *   - GraphQL updateFoo with expectedVersion: succeeds when version matches,
 *     returns VERSION_CONFLICT error when stale.
 *   - GraphQL deleteFoo with expectedVersion: succeeds when version matches,
 *     returns VERSION_CONFLICT error when stale.
 *   - If-Match absent → no version check (backward compatible).
 *   - Invalid If-Match (non-integer) → 400 Bad Request.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import { mapErrorToHttpStatus } from '../rest/errors.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestRoute } from '../rest/types.js';

// ─── ODL fixture ───

const VERSION_CONFLICT_ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Item @objectType {
  id: ID! @primary
  name: String!
  quantity: Int!
}
`;

// ─── Mock factories ───

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Tester',
    email: 'tester@test.com',
    roles: ['admin'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function createItemObject(id: string, version: number, overrides: Record<string, unknown> = {}): OntologyObject {
  return {
    _tenantId: 'tenant-1',
    _type: 'Item',
    _id: id,
    _version: version,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name: `Item ${id}`,
    quantity: 10,
    ...overrides,
  };
}

function createMockDeps(schema: ParsedSchema): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn(),
      query: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {
      getLinks: vi.fn(),
    } as unknown as ApiDependencies['linkManager'],
    actionExecutor: {
      execute: vi.fn(),
    } as unknown as ApiDependencies['actionExecutor'],
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
    manifestRegistry: {
      get: (name: string) => ({
        action: name,
        version: 1,
        reversible: false,
        preconditions: [],
        effects: [],
        sideEffects: [],
      }),
    },
    consentService: undefined,
    auditWriter: undefined,
    storage: {
      getObjectAtVersion: vi.fn(),
    } as unknown as ApiDependencies['storage'],
  };
}

function createMockRequest(overrides: Partial<RestRequest> = {}): RestRequest {
  return {
    method: 'PUT',
    path: '/api/v1/items/item-1',
    params: {},
    query: {},
    body: {},
    user: createMockUser(),
    ...overrides,
  };
}

function createResolverContext(deps: ApiDependencies): ResolverContext {
  const u = createMockUser();
  return {
    requestContext: {
      tenantId: u.tenantId,
      actorId: u.id,
      traceId: 'trace-test',
    },
    user: u,
    deps,
  };
}

function findRoute(routes: RestRoute[], method: string, pathPattern: string): RestRoute | undefined {
  return routes.find(r => r.method === method && r.pattern === pathPattern);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBody = any;

/** A PlatformError-shaped error that storage would throw for VERSION_CONFLICT. */
function versionConflictError(expected: number, found: number): Error & { code: string } {
  const err = new Error(`Version conflict: expected ${expected}, found ${found}`) as Error & { code: string };
  err.code = 'VERSION_CONFLICT';
  return err;
}

// ─── Tests ───

describe('Client-facing optimistic concurrency (#5)', () => {
  let parsed: ParsedSchema;

  beforeEach(() => {
    parsed = parseOdl(VERSION_CONFLICT_ODL);
  });

  describe('REST error mapping', () => {
    it('maps precondition category to 412', () => {
      expect(mapErrorToHttpStatus('precondition')).toBe(412);
    });

    it('maps VERSION_CONFLICT code to precondition category (via wrapErrorToRest)', async () => {
      // The error mapper should map VERSION_CONFLICT → precondition → 412
      const { wrapErrorToRest } = await import('../rest/errors.js');
      const err = versionConflictError(1, 2);
      const res = wrapErrorToRest(err, 'trace-1');
      expect(res.status).toBe(412);
      expect((res.body as AnyBody).error.code).toBe('VERSION_CONFLICT');
      expect((res.body as AnyBody).error.category).toBe('precondition');
    });
  });

  describe('REST PUT /api/v1/items/:id with If-Match', () => {
    it('succeeds (200) when If-Match version matches', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockResolvedValue(createItemObject('item-1', 2, { name: 'Updated' }));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'PUT', '/api/v1/items/:id')!;

      const req = createMockRequest({
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        body: { name: 'Updated' },
        headers: { 'if-match': '1' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);

      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        'Item',
        'item-1',
        { name: 'Updated' },
        ctx.requestContext,
        undefined,
        1, // expectedVersion forwarded
      );
    });

    it('returns 412 with VERSION_CONFLICT when If-Match is stale', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockRejectedValue(versionConflictError(1, 2));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'PUT', '/api/v1/items/:id')!;

      const req = createMockRequest({
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        body: { name: 'Updated' },
        headers: { 'if-match': '1' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);
      const body = res.body as AnyBody;

      expect(res.status).toBe(412);
      expect(body.error.code).toBe('VERSION_CONFLICT');
      expect(body.error.category).toBe('precondition');
    });

    it('succeeds without version check when If-Match is absent', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockResolvedValue(createItemObject('item-1', 2, { name: 'Updated' }));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'PUT', '/api/v1/items/:id')!;

      const req = createMockRequest({
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        body: { name: 'Updated' },
        // No headers → no If-Match
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);

      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        'Item',
        'item-1',
        { name: 'Updated' },
        ctx.requestContext,
        undefined,
        undefined, // expectedVersion not forwarded
      );
    });

    it('returns 400 when If-Match is not a valid integer', async () => {
      const deps = createMockDeps(parsed);
      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'PUT', '/api/v1/items/:id')!;

      const req = createMockRequest({
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        body: { name: 'Updated' },
        headers: { 'if-match': 'abc' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);
      const body = res.body as AnyBody;

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('REST DELETE /api/v1/items/:id with If-Match', () => {
    it('succeeds (204) when If-Match version matches', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createItemObject('item-1', 3));
      const deleteMock = deps.objectManager.delete as ReturnType<typeof vi.fn>;
      deleteMock.mockResolvedValue(undefined);

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'DELETE', '/api/v1/items/:id')!;

      const req = createMockRequest({
        method: 'DELETE',
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        headers: { 'if-match': '3' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);

      expect(res.status).toBe(204);
      expect(deleteMock).toHaveBeenCalled();
    });

    it('returns 412 with VERSION_CONFLICT when If-Match is stale', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createItemObject('item-1', 5));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'DELETE', '/api/v1/items/:id')!;

      const req = createMockRequest({
        method: 'DELETE',
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
        headers: { 'if-match': '3' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);
      const body = res.body as AnyBody;

      expect(res.status).toBe(412);
      expect(body.error.code).toBe('VERSION_CONFLICT');
      expect(body.error.category).toBe('precondition');
    });

    it('succeeds without version check when If-Match is absent', async () => {
      const deps = createMockDeps(parsed);
      const deleteMock = deps.objectManager.delete as ReturnType<typeof vi.fn>;
      deleteMock.mockResolvedValue(undefined);

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'DELETE', '/api/v1/items/:id')!;

      const req = createMockRequest({
        method: 'DELETE',
        path: '/api/v1/items/item-1',
        params: { id: 'item-1' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);

      expect(res.status).toBe(204);
    });
  });

  describe('GraphQL updateItem with expectedVersion', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function M(resolvers: Record<string, Record<string, any>>, name: string): (...args: any[]) => any {
      return resolvers['Mutation']![name] as (...args: unknown[]) => unknown;
    }

    it('succeeds when expectedVersion matches', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockResolvedValue(createItemObject('item-1', 2, { name: 'Updated' }));

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      const result = await M(resolvers, 'updateItem')(null, {
        id: 'item-1',
        input: { name: 'Updated' },
        expectedVersion: 1,
      }, ctx);

      expect(result).toBeDefined();
      expect(result.id).toBe('item-1');
      expect(result.name).toBe('Updated');
      expect(updateMock).toHaveBeenCalledWith(
        'Item',
        'item-1',
        { name: 'Updated' },
        ctx.requestContext,
        undefined,
        1,
      );
    });

    it('returns VERSION_CONFLICT error when expectedVersion is stale', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockRejectedValue(versionConflictError(1, 2));

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      await expect(
        M(resolvers, 'updateItem')(null, {
          id: 'item-1',
          input: { name: 'Updated' },
          expectedVersion: 1,
        }, ctx),
      ).rejects.toThrow();

      try {
        await M(resolvers, 'updateItem')(null, {
          id: 'item-1',
          input: { name: 'Updated' },
          expectedVersion: 1,
        }, ctx);
      } catch (err) {
        // Should be a GraphQLError with VERSION_CONFLICT in extensions
        const gqlErr = err as { extensions?: { altius?: { code?: string } } };
        expect(gqlErr.extensions?.altius?.code).toBe('VERSION_CONFLICT');
      }
    });

    it('succeeds without version check when expectedVersion is absent', async () => {
      const deps = createMockDeps(parsed);
      const updateMock = deps.objectManager.update as ReturnType<typeof vi.fn>;
      updateMock.mockResolvedValue(createItemObject('item-1', 2, { name: 'Updated' }));

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      const result = await M(resolvers, 'updateItem')(null, {
        id: 'item-1',
        input: { name: 'Updated' },
      }, ctx);

      expect(result).toBeDefined();
      expect(result.name).toBe('Updated');
      expect(updateMock).toHaveBeenCalledWith(
        'Item',
        'item-1',
        { name: 'Updated' },
        ctx.requestContext,
        undefined,
        undefined,
      );
    });
  });

  describe('GraphQL deleteItem with expectedVersion', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function M(resolvers: Record<string, Record<string, any>>, name: string): (...args: any[]) => any {
      return resolvers['Mutation']![name] as (...args: unknown[]) => unknown;
    }

    it('succeeds when expectedVersion matches', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createItemObject('item-1', 3));
      const deleteMock = deps.objectManager.delete as ReturnType<typeof vi.fn>;
      deleteMock.mockResolvedValue(undefined);

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      const result = await M(resolvers, 'deleteItem')(null, {
        id: 'item-1',
        expectedVersion: 3,
      }, ctx);

      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalled();
    });

    it('returns VERSION_CONFLICT error when expectedVersion is stale', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createItemObject('item-1', 5));

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      await expect(
        M(resolvers, 'deleteItem')(null, {
          id: 'item-1',
          expectedVersion: 3,
        }, ctx),
      ).rejects.toThrow();
    });
  });
});
