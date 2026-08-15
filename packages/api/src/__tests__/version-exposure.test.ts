/**
 * Tests that the record `_version` is readable by clients (#5 read side).
 *
 * The optimistic-concurrency contract asks callers for a version they must
 * have read somewhere: REST `If-Match` and GraphQL `expectedVersion`. These
 * tests pin the read half — both surfaces return `_version`, and it moves
 * when the record is updated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestRoute } from '../rest/types.js';

// ─── ODL fixture ───

const VERSION_EXPOSURE_ODL = `
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
    method: 'GET',
    path: '/api/v1/items/item-1',
    params: {},
    query: {},
    body: undefined,
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

// ─── Tests ───

describe('_version is readable by clients', () => {
  let parsed: ParsedSchema;

  beforeEach(() => {
    parsed = parseOdl(VERSION_EXPOSURE_ODL);
  });

  describe('REST', () => {
    it('GET /api/v1/items/:id returns the stored _version', async () => {
      const deps = createMockDeps(parsed);
      (deps.objectManager.get as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createItemObject('item-1', 3));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'GET', '/api/v1/items/:id')!;

      const res = await route.handler(
        createMockRequest({ params: { id: 'item-1' } }),
        createResolverContext(deps),
      );

      expect(res.status).toBe(200);
      expect((res.body as AnyBody).data._version).toBe(3);
    });

    it('GET /api/v1/items returns _version on every item', async () => {
      const deps = createMockDeps(parsed);
      (deps.authorizationService.listObjects as ReturnType<typeof vi.fn>)
        .mockResolvedValue(['item:item-1', 'item:item-2']);
      (deps.objectManager.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [createItemObject('item-1', 3), createItemObject('item-2', 7)],
        totalCount: 2,
        hasNextPage: false,
      });

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'GET', '/api/v1/items')!;

      const res = await route.handler(
        createMockRequest({ path: '/api/v1/items' }),
        createResolverContext(deps),
      );

      expect(res.status).toBe(200);
      expect((res.body as AnyBody).data.map((d: AnyBody) => d._version)).toEqual([3, 7]);
    });

    it('PUT /api/v1/items/:id returns the incremented _version', async () => {
      const deps = createMockDeps(parsed);
      (deps.objectManager.update as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createItemObject('item-1', 4, { name: 'Updated' }));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'PUT', '/api/v1/items/:id')!;

      const res = await route.handler(
        createMockRequest({
          method: 'PUT',
          params: { id: 'item-1' },
          body: { name: 'Updated' },
          headers: { 'if-match': '3' },
        }),
        createResolverContext(deps),
      );

      expect(res.status).toBe(200);
      expect((res.body as AnyBody).data._version).toBe(4);
    });
  });

  describe('GraphQL', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function Q(resolvers: Record<string, Record<string, any>>, name: string): (...args: any[]) => any {
      return resolvers['Query']![name] as (...args: unknown[]) => unknown;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function M(resolvers: Record<string, Record<string, any>>, name: string): (...args: any[]) => any {
      return resolvers['Mutation']![name] as (...args: unknown[]) => unknown;
    }

    it('item(id) returns the stored _version', async () => {
      const deps = createMockDeps(parsed);
      (deps.objectManager.get as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createItemObject('item-1', 3));

      const { resolvers } = generateResolvers(parsed, deps);
      const result = await Q(resolvers, 'item')(null, { id: 'item-1' }, createResolverContext(deps));

      expect(result._version).toBe(3);
    });

    it('updateItem returns the incremented _version', async () => {
      const deps = createMockDeps(parsed);
      (deps.objectManager.update as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createItemObject('item-1', 4, { name: 'Updated' }));

      const { resolvers } = generateResolvers(parsed, deps);
      const result = await M(resolvers, 'updateItem')(
        null,
        { id: 'item-1', input: { name: 'Updated' }, expectedVersion: 3 },
        createResolverContext(deps),
      );

      expect(result._version).toBe(4);
    });
  });
});
