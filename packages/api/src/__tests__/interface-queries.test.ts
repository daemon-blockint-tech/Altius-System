/**
 * Interfaces are only operational if something returns one.
 *
 * The schema declared interfaces, ObjectTypes carried `implements`, the
 * validator checked conformance and `__resolveType` resolvers were generated —
 * but no field in the schema was ever typed as an interface, so the polymorphic
 * half existed as unreachable code and a caller had to name every concrete type
 * itself.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';

import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';

const ODL = `
interface Locatable {
  id: ID!
  site: String!
}

type Ward implements Locatable @objectType {
  id: ID! @primary
  site: String!
  beds: Int!
}

type Clinic implements Locatable @objectType {
  id: ID! @primary
  site: String!
  openDays: Int!
}

type Supplier @objectType {
  id: ID! @primary
  name: String!
}
`;

/** Rows returned per type, keyed by ObjectType name. */
function depsReturning(rows: Record<string, Record<string, unknown>[]>, schema: ParsedSchema): ApiDependencies {
  return {
    schema,
    objectManager: {
      query: vi.fn(async (type: string) => ({
        items: rows[type] ?? [],
        totalCount: (rows[type] ?? []).length,
      })),
      get: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, obj: Record<string, unknown>) => ({ data: obj, _redactedFields: [] }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map(data => ({ data, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
  } as unknown as ApiDependencies;
}

/** Query resolvers are the callable member of the ResolverValue union. */
type QueryFn = (parent: unknown, args: Record<string, unknown>, ctx: ResolverContext) => Promise<unknown>;

function ctx(): ResolverContext {
  return {
    user: { id: 'u1', tenantId: 't1', roles: ['viewer'], groups: [] },
    requestContext: { tenantId: 't1', actorId: 'u1', traceId: 'tr-1' },
  } as unknown as ResolverContext;
}

describe('interface-typed queries', () => {
  it('emits a Query field typed as the interface', () => {
    const sdl = generateGraphQLSchema(parseOdl(ODL));

    expect(sdl).toContain('interface Locatable {');
    expect(sdl).toContain('type Ward implements Locatable');
    // The piece that was missing: something that RETURNS the interface.
    expect(sdl).toContain('locatables(first: Int): [Locatable!]!');
  });

  it('returns objects from every implementing type, each tagged with its concrete type', async () => {
    const schema = parseOdl(ODL);
    const deps = depsReturning({
      Ward: [{ _id: 'w1', _type: 'Ward', site: 'North', beds: 12 }],
      Clinic: [{ _id: 'c1', _type: 'Clinic', site: 'South', openDays: 5 }],
    }, schema);

    const { resolvers } = generateResolvers(schema, deps);
    const locatables = resolvers['Query']!['locatables'] as unknown as QueryFn;
    const result = await locatables(null, {}, ctx()) as Record<string, unknown>[];

    expect(result).toHaveLength(2);
    // __resolveType reads __typename; without it the interface cannot resolve.
    expect(result.map(r => r['__typename']).sort()).toEqual(['Clinic', 'Ward']);
    expect(result.map(r => r['site']).sort()).toEqual(['North', 'South']);
  });

  it('does not include types that do not implement the interface', async () => {
    const schema = parseOdl(ODL);
    const deps = depsReturning({
      Ward: [{ _id: 'w1', _type: 'Ward', site: 'North', beds: 12 }],
      Supplier: [{ _id: 's1', _type: 'Supplier', name: 'Acme' }],
    }, schema);

    const { resolvers } = generateResolvers(schema, deps);
    const locatables = resolvers['Query']!['locatables'] as unknown as QueryFn;
    const result = await locatables(null, {}, ctx()) as Record<string, unknown>[];

    expect(result.map(r => r['__typename'])).toEqual(['Ward']);
  });

  it('bounds `first` across the whole result, not per implementing type', async () => {
    const schema = parseOdl(ODL);
    const deps = depsReturning({
      Ward: [
        { _id: 'w1', _type: 'Ward', site: 'A', beds: 1 },
        { _id: 'w2', _type: 'Ward', site: 'B', beds: 2 },
      ],
      Clinic: [{ _id: 'c1', _type: 'Clinic', site: 'C', openDays: 5 }],
    }, schema);

    const { resolvers } = generateResolvers(schema, deps);
    const locatables = resolvers['Query']!['locatables'] as unknown as QueryFn;
    const result = await locatables(null, { first: 2 }, ctx()) as Record<string, unknown>[];

    expect(result).toHaveLength(2);
  });
});
