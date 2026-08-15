/**
 * Tests for pagination on GraphQL @link list fields.
 *
 * Before this change, link field resolvers hardcoded `limit: isList ? 1000 : 1`
 * with no client-supplied arguments. A link with more than 1000 rows was
 * silently truncated — no pagination, no filter, no way for the client to know.
 *
 * These tests verify that list link fields accept `first`/`after` arguments in
 * the SDL and that the resolver forwards them to linkManager.getLinks.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyLink } from '@altius/spi';
import { generateResolvers } from '../graphql/resolver-generator.js';
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

// ════════════════════════════════════════════════════════════════════

describe('GraphQL @link list field pagination', () => {
  const schema = parseOdl(ODL);

  it('emits first/after arguments on list link fields in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    // The beds field should accept pagination arguments
    expect(sdl).toMatch(/beds\s*\(\s*first:\s*Int.*after:\s*String/);
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
    // Single-valued: no pagination args
    expect(sdl).not.toMatch(/bed\s*\(\s*first/);
  });

  it('forwards first/after to linkManager.getLinks', async () => {
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

    await bedsResolver({ id: 'ward-1' }, { first: 50, after: 'cursor-1' }, createCtx(deps));

    expect(getLinks).toHaveBeenCalledTimes(1);
    const callArgs = getLinks.mock.calls[0]!;
    // The 4th argument is the options object
    const options = callArgs[3] as { limit: number; offset: number; after?: string };
    expect(options.limit).toBe(50);
    expect(options.after).toBe('cursor-1');
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

    const callArgs = getLinks.mock.calls[0]!;
    const options = callArgs[3] as { limit: number };
    // Default should be the platform default page size, not a hardcoded 1000
    expect(options.limit).toBeLessThanOrEqual(100);
    expect(options.limit).toBeGreaterThan(0);
  });

  it('allows a client to request more than 1000 items', async () => {
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

    const callArgs = getLinks.mock.calls[0]!;
    const options = callArgs[3] as { limit: number };
    // The client asked for 5000 — the resolver must not silently cap at 1000
    expect(options.limit).toBe(5000);
  });
});
