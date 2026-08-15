/**
 * Tests for pagination on GraphQL @link list fields.
 *
 * Before this change, link field resolvers hardcoded `limit: isList ? 1000 : 1`
 * with no client-supplied arguments. A link with more than 1000 rows was
 * silently truncated — no pagination, no filter, no way for the client to know.
 *
 * These tests verify that:
 *   - List link fields accept `first`/`after` arguments in the SDL
 *   - List link fields return a Relay Connection (edges/pageInfo/totalCount)
 *   - The resolver forwards `first`/`after` to linkManager.getLinks
 *   - The `after` cursor is decoded and used to compute the offset
 *   - hasNextPage and endCursor are populated so a client can page
 *   - Single-valued link fields stay as plain object references
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyLink } from '@altius/spi';
import { encodePageCursor, MAX_LINK_QUERY_LIMIT } from '@altius/spi';
import { generateResolvers } from '../graphql/resolver-generator.js';
import { encodeCursor } from '../graphql/pagination.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

// ─── ODL fixture with a list link field ───

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType {
  id: ID! @primary
  name: String
  beds: [Bed] @link(type: "HasBed", direction: "OUTBOUND")
}

type Bed @objectType {
  id: ID! @primary
  number: String
}

type HasBed @linkType(from: "Ward", to: "Bed", cardinality: ONE_TO_MANY) {
  id: ID! @primary
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

function createLink(id: string, fromId: string, toId: string): OntologyLink {
  return {
    _tenantId: 'tenant-1',
    _type: 'HasBed',
    _id: id,
    _fromType: 'Ward',
    _fromId: fromId,
    _toType: 'Bed',
    _toId: toId,
    _version: 1,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
  };
}

function createMockDeps(
  schema: ParsedSchema,
  links: OntologyLink[],
  getLinksImpl?: ReturnType<typeof vi.fn>,
): ApiDependencies {
  const defaultGetLinks = vi.fn(async () => ({
    items: links,
    totalCount: links.length,
    hasNextPage: false,
  }));
  return {
    schema,
    objectManager: {
      get: vi.fn(async (_type: string, id: string) => ({
        _id: id,
        _type: 'Bed',
        _tenantId: 'tenant-1',
        _version: 1,
        _createdAt: '2025-01-01T00:00:00Z',
        _updatedAt: '2025-01-01T00:00:00Z',
        number: `bed-${id}`,
      })),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {
      getLinks: getLinksImpl ?? defaultGetLinks,
    } as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, obj: Record<string, unknown>) => ({
          data: obj,
          _redactedFields: [],
        }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map(obj => ({ data: obj, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    storage: {} as unknown as ApiDependencies['storage'],
  };
}

function createCtx(deps: ApiDependencies): ResolverContext {
  const u = createMockUser();
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps,
  };
}

/** Type helper for Connection-shaped resolver results. */
interface ConnectionResult {
  edges: { node: Record<string, unknown>; cursor: string }[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  totalCount: number;
}

// ════════════════════════════════════════════════════════════════════

describe('GraphQL @link list field pagination', () => {
  const schema = parseOdl(ODL);

  it('emits first/after arguments on list link fields in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    // The beds field should accept pagination arguments
    expect(sdl).toMatch(/beds\s*\(\s*first:\s*Int.*after:\s*String/);
  });

  it('emits a Connection return type for list link fields in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    // The beds field should return BedConnection, not [Bed]
    expect(sdl).toMatch(/beds\s*\(.*\):\s*BedConnection!/);
    // BedConnection must have edges, pageInfo, totalCount
    expect(sdl).toMatch(/type BedConnection\s*\{/);
    expect(sdl).toMatch(/BedConnection[\s\S]*edges:\s*\[BedEdge!\]!/);
    expect(sdl).toMatch(/BedConnection[\s\S]*pageInfo:\s*PageInfo!/);
    expect(sdl).toMatch(/BedConnection[\s\S]*totalCount:\s*Int!/);
  });

  it('does not emit pagination arguments on single-valued link fields', () => {
    const singleLinkOdl = `
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType {
  id: ID! @primary
  name: String
  bed: Bed @link(type: "HasBed", direction: "OUTBOUND")
}

type Bed @objectType {
  id: ID! @primary
  number: String
}

type HasBed @linkType(from: "Ward", to: "Bed", cardinality: ONE_TO_ONE) {
  id: ID! @primary
}
`;
    const singleSchema = parseOdl(singleLinkOdl);
    const sdl = generateGraphQLSchema(singleSchema);
    // Single-valued: no pagination args, no Connection type
    expect(sdl).not.toMatch(/bed\s*\(\s*first/);
  });

  it('forwards first as limit and decodes after to offset in getLinks', async () => {
    const links = [
      createLink('l-1', 'ward-1', 'bed-1'),
      createLink('l-2', 'ward-1', 'bed-2'),
    ];
    const getLinks = vi.fn(async () => ({
      items: links,
      totalCount: 2,
      hasNextPage: false,
    }));
    const deps = createMockDeps(schema, links, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    // The cursor encodes item index 0, so +1 = offset 1
    const validCursor = encodeCursor(0);
    await bedsResolver({ id: 'ward-1' }, { first: 50, after: validCursor }, createCtx(deps));

    expect(getLinks).toHaveBeenCalledTimes(1);
    const callArgs = getLinks.mock.calls[0] as unknown as unknown[];
    const options = callArgs[3] as { limit: number; offset: number; after?: string };
    expect(options.limit).toBe(50);
    // The resolver decodes the cursor to an offset; the provider receives
    // a plain offset, not the raw cursor.
    expect(options.offset).toBe(1);
    expect(options.after).toBeUndefined();
  });

  it('defaults to a reasonable limit when no args are provided', async () => {
    const links = [createLink('l-1', 'ward-1', 'bed-1')];
    const getLinks = vi.fn(async () => ({
      items: links,
      totalCount: 1,
      hasNextPage: false,
    }));
    const deps = createMockDeps(schema, links, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    await bedsResolver({ id: 'ward-1' }, {}, createCtx(deps));

    const callArgs = getLinks.mock.calls[0] as unknown as unknown[];
    const options = callArgs[3] as { limit: number };
    // Default should be the platform default page size, not a hardcoded 1000
    expect(options.limit).toBeLessThanOrEqual(100);
    expect(options.limit).toBeGreaterThan(0);
  });

  it('returns a Connection with edges, pageInfo, and totalCount', async () => {
    const links = [
      createLink('l-1', 'ward-1', 'bed-1'),
      createLink('l-2', 'ward-1', 'bed-2'),
    ];
    const getLinks = vi.fn(async () => ({
      items: links,
      totalCount: 2,
      hasNextPage: false,
    }));
    const deps = createMockDeps(schema, links, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<ConnectionResult>;

    const result = await bedsResolver({ id: 'ward-1' }, {}, createCtx(deps));

    // Must be a Connection, not a bare array
    expect(Array.isArray(result)).toBe(false);
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('pageInfo');
    expect(result).toHaveProperty('totalCount');
    expect(result.totalCount).toBe(2);
    expect(result.edges).toHaveLength(2);
    // Each edge has a node and a cursor
    expect(result.edges[0]).toHaveProperty('node');
    expect(result.edges[0]).toHaveProperty('cursor');
  });

  it('populates hasNextPage and endCursor so a client can page forward', async () => {
    // Simulate a provider that returns the first page of a larger set.
    const pageLinks = [
      createLink('l-1', 'ward-1', 'bed-1'),
      createLink('l-2', 'ward-1', 'bed-2'),
    ];
    const getLinks = vi.fn(async () => ({
      items: pageLinks,
      totalCount: 10,
      hasNextPage: true,
      cursor: encodePageCursor(2),
    }));
    const deps = createMockDeps(schema, pageLinks, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<ConnectionResult>;

    const result = await bedsResolver({ id: 'ward-1' }, { first: 2 }, createCtx(deps));

    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).not.toBeNull();
    // The endCursor encodes the offset of the last item in this page
    expect(result.pageInfo.endCursor).toBe(result.edges[1]!.cursor);
  });

  it('decodes the after cursor to compute the offset for the next page', async () => {
    // The client passes the endCursor from the previous page. The endCursor
    // from buildConnection encodes the index of the last item on the page.
    // encodeCursor(1) = item index 1, so +1 = offset 2 for the next page.
    const afterCursor = encodeCursor(1);
    const pageLinks = [
      createLink('l-3', 'ward-1', 'bed-3'),
      createLink('l-4', 'ward-1', 'bed-4'),
    ];
    const getLinks = vi.fn(async () => ({
      items: pageLinks,
      totalCount: 10,
      hasNextPage: true,
      cursor: encodePageCursor(4),
    }));
    const deps = createMockDeps(schema, pageLinks, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<ConnectionResult>;

    const result = await bedsResolver(
      { id: 'ward-1' },
      { first: 2, after: afterCursor },
      createCtx(deps),
    );

    // The resolver decoded the cursor to offset 2 and passed it to the provider
    const callArgs = getLinks.mock.calls[0] as unknown as unknown[];
    const options = callArgs[3] as { offset: number; after?: string };
    expect(options.offset).toBe(2);
    expect(options.after).toBeUndefined();

    // hasPreviousPage is true because we are on page 2+
    expect(result.pageInfo.hasPreviousPage).toBe(true);
    expect(result.edges).toHaveLength(2);
  });

  it('returns an empty Connection when the parent has no links', async () => {
    const getLinks = vi.fn(async () => ({
      items: [],
      totalCount: 0,
      hasNextPage: false,
    }));
    const deps = createMockDeps(schema, [], getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<ConnectionResult>;

    const result = await bedsResolver({ id: 'ward-1' }, {}, createCtx(deps));

    expect(result.edges).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.pageInfo.endCursor).toBeNull();
  });

  it('caps limit at MAX_LINK_QUERY_LIMIT instead of forwarding oversized requests', async () => {
    // The resolver caps at MAX_LINK_QUERY_LIMIT so the provider never sees
    // an oversized request. The client pages with cursors instead.
    const links = Array.from({ length: 5 }, (_, i) =>
      createLink(`l-${i}`, 'ward-1', `bed-${i}`),
    );
    const getLinks = vi.fn(async () => ({
      items: links,
      totalCount: 5,
      hasNextPage: false,
    }));
    const deps = createMockDeps(schema, links, getLinks);
    const { resolvers } = generateResolvers(schema, deps);
    const wardResolvers = resolvers['Ward'] as Record<string, unknown>;
    const bedsResolver = wardResolvers['beds'] as (
      parent: Record<string, unknown>,
      args: unknown,
      ctx: ResolverContext,
    ) => Promise<unknown>;

    await bedsResolver({ id: 'ward-1' }, { first: 5000 }, createCtx(deps));

    const callArgs = getLinks.mock.calls[0] as unknown as unknown[];
    const options = callArgs[3] as { limit: number };
    expect(options.limit).toBe(MAX_LINK_QUERY_LIMIT);
  });
});
