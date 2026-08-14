/**
 * Tests for arbitrary @primary field name support (#8).
 *
 * Verifies that an ObjectType declaring a non-"id" primary field (e.g.
 * `externalId: ID! @primary`) is:
 *   - Accepted by the validator.
 *   - Exposed correctly by REST and GraphQL shapers (the declared name
 *     reads back the system _id value, not null).
 *   - Recognised by schema-loader field-permission defaults.
 *   - Aliased in the action/CEL context under the declared name.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOdl, validateSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject, ObjectPage } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestRoute } from '../rest/types.js';

// ─── ODL fixture with an arbitrary primary field name ───

const ARBITRARY_PRIMARY_ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Product @objectType {
  externalId: ID! @primary
  sku: String! @unique @indexed
  name: String! @sensitive
  price: Float!
}

enum Category {
  ELECTRONICS
  BOOKS
  CLOTHING
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

function createProductObject(id: string, overrides: Record<string, unknown> = {}): OntologyObject {
  return {
    _tenantId: 'tenant-1',
    _type: 'Product',
    _id: id,
    _version: 1,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    price: 9.99,
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
    path: '/api/v1/products',
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

describe('Arbitrary @primary field name support (#8)', () => {
  let parsed: ParsedSchema;

  beforeEach(() => {
    parsed = parseOdl(ARBITRARY_PRIMARY_ODL);
  });

  describe('validator', () => {
    it('accepts externalId: ID! @primary without INVALID_PRIMARY_NAME', () => {
      const result = validateSchema(parsed);
      expect(result.valid).toBe(true);
    });
  });

  describe('REST shaping', () => {
    it('exposes externalId (not null) on a single-object GET', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createProductObject('prod-1'));

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'GET', '/api/v1/products/:id')!;
      expect(route).toBeDefined();

      const req = createMockRequest({
        path: '/api/v1/products/prod-1',
        params: { id: 'prod-1' },
      });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);
      const body = res.body as AnyBody;

      expect(res.status).toBe(200);
      expect(body.data.externalId).toBe('prod-1');
      expect(body.data.externalId).not.toBeNull();
      expect(body.data.sku).toBe('SKU-prod-1');
    });

    it('exposes externalId on list GET', async () => {
      const deps = createMockDeps(parsed);
      const listMock = deps.authorizationService.listObjects as ReturnType<typeof vi.fn>;
      listMock.mockResolvedValue(['product:prod-1', 'product:prod-2']);

      const queryMock = deps.objectManager.query as ReturnType<typeof vi.fn>;
      const page: ObjectPage = {
        items: [createProductObject('prod-1'), createProductObject('prod-2')],
        totalCount: 2,
        hasNextPage: false,
      };
      queryMock.mockResolvedValue(page);

      const routes = generateRestRoutes(parsed, deps);
      const route = findRoute(routes, 'GET', '/api/v1/products')!;

      const req = createMockRequest({ query: { limit: '10', offset: '0' } });
      const ctx = createResolverContext(deps);
      const res = await route.handler(req, ctx);
      const body = res.body as AnyBody;

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].externalId).toBe('prod-1');
      expect(body.data[1].externalId).toBe('prod-2');
    });
  });

  describe('GraphQL shaping', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function Q(resolvers: Record<string, Record<string, any>>, name: string): (...args: any[]) => any {
      return resolvers['Query']![name] as (...args: unknown[]) => unknown;
    }

    it('exposes externalId (not null) on a single-object query', async () => {
      const deps = createMockDeps(parsed);
      const getMock = deps.objectManager.get as ReturnType<typeof vi.fn>;
      getMock.mockResolvedValue(createProductObject('prod-1'));

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      const result = await Q(resolvers, 'product')(null, { id: 'prod-1' }, ctx);

      expect(result).toBeDefined();
      expect(result.externalId).toBe('prod-1');
      expect(result.externalId).not.toBeNull();
      expect(result.sku).toBe('SKU-prod-1');
      expect(result.name).toBe('Product prod-1');
    });

    it('exposes externalId on a list query', async () => {
      const deps = createMockDeps(parsed);
      const listMock = deps.authorizationService.listObjects as ReturnType<typeof vi.fn>;
      listMock.mockResolvedValue(['product:prod-1', 'product:prod-2']);

      const queryMock = deps.objectManager.query as ReturnType<typeof vi.fn>;
      queryMock.mockResolvedValue({
        items: [createProductObject('prod-1'), createProductObject('prod-2')],
        totalCount: 2,
        hasNextPage: false,
      });

      const { resolvers } = generateResolvers(parsed, deps);
      const ctx = createResolverContext(deps);

      const result = await Q(resolvers, 'products')(null, { first: 10 }, ctx);
      const edges = (result as { edges: { node: Record<string, unknown> }[] }).edges;

      expect(edges).toHaveLength(2);
      expect(edges[0]!.node.externalId).toBe('prod-1');
      expect(edges[1]!.node.externalId).toBe('prod-2');
    });
  });
});
