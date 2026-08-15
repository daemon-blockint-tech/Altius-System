/**
 * Regression: the default search field set must contain only columns that
 * exist and can be matched with ILIKE.
 *
 * When a caller omits `fields`, both search surfaces fall back to "every
 * visible field" (SEC-14b, so a hidden field cannot be probed through search).
 * That set comes from the column policy, which legitimately lists fields that
 * are not text columns:
 *
 *   - the @primary field is an alias for the storage-minted `_id` and has no
 *     column of its own (schema-loader drops it), so it becomes `"id"` in SQL
 *     and Postgres raises undefined_column (42703);
 *   - a Date/Int/Boolean field is a real column of a type ILIKE does not
 *     accept, so Postgres raises undefined_function.
 *
 * Both are 500s on an ordinary search request. The memory provider instead
 * skips non-string values silently, so the same call returns 0 hits there —
 * a provider divergence on top of the defect.
 *
 * The fix intersects the visible set with the type's stored text fields, so
 * only matchable columns ever reach a provider.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { SearchQuery } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { RestRequest, RestRoute } from '../rest/types.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  nhsNumber: String @unique @indexed
  name: String! @sensitive @searchable(weight: 2.0)
  dateOfBirth: Date! @sensitive
  admittedCount: Int
  isPriority: Boolean
  status: PatientStatus!
}

enum PatientStatus {
  ACTIVE
  DISCHARGED
}
`;

/**
 * The column policy for Patient in the reference pack lists `id` in
 * alwaysVisible and `dateOfBirth` under the clinician relation, which is what
 * puts both into the default search set.
 */
const VISIBLE_FIELDS = new Set([
  'id',
  'name',
  'nhsNumber',
  'dateOfBirth',
  'admittedCount',
  'isPriority',
  'status',
]);

/** Stored text columns — the only fields ILIKE can be applied to. */
const MATCHABLE = ['name', 'nhsNumber', 'status'];

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'dr-smith',
    name: 'Dr Smith',
    email: 'dr-smith@nhs.example',
    roles: ['clinician'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function createMockDeps(schema: ParsedSchema, searchSpy: ReturnType<typeof vi.fn>): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn(),
      query: vi.fn(),
      aggregate: vi.fn(),
      search: searchSpy,
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      // '*' is the "all objects authorized" sentinel both search paths accept.
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(VISIBLE_FIELDS),
      redactFields: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, obj: Record<string, unknown>) => ({
          data: obj,
          _redactedFields: [],
        }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, objects: Record<string, unknown>[]) =>
          objects.map(obj => ({ data: obj, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: undefined,
    auditWriter: undefined,
    storage: {} as unknown as ApiDependencies['storage'],
  };
}

function createCtx(deps: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: 'tenant-1', actorId: 'dr-smith', traceId: 'trace-1' },
    user: createMockUser(),
    deps,
  };
}

function emptyResult() {
  return { hits: [], totalCount: 0, hasNextPage: false };
}

describe('default search fields', () => {
  it('REST omits fields that have no text column', async () => {
    const schema = parseOdl(ODL);
    const search = vi.fn().mockResolvedValue(emptyResult());
    const deps = createMockDeps(schema, search);

    const routes: RestRoute[] = generateRestRoutes(schema, deps);
    const route = routes.find(
      r => r.method === 'GET' && r.pattern === '/api/v1/patients/search',
    );
    expect(route).toBeDefined();

    const req: RestRequest = {
      method: 'GET',
      path: '/api/v1/patients/search',
      params: {},
      query: { q: 'smith' },
      body: undefined,
      user: createMockUser(),
    };

    const res = await route!.handler(req, createCtx(deps));
    expect(res.status).toBe(200);

    expect(search).toHaveBeenCalledTimes(1);
    const query = search.mock.calls[0]![1] as SearchQuery;

    // `id` has no column of its own — it is an alias for `_id`.
    expect(query.fields).not.toContain('id');
    // Non-text columns cannot be matched with ILIKE.
    expect(query.fields).not.toContain('dateOfBirth');
    expect(query.fields).not.toContain('admittedCount');
    expect(query.fields).not.toContain('isPriority');
    // The matchable text columns survive.
    expect([...(query.fields ?? [])].sort()).toEqual([...MATCHABLE].sort());
  });

  it('GraphQL omits fields that have no text column', async () => {
    const schema = parseOdl(ODL);
    const search = vi.fn().mockResolvedValue(emptyResult());
    const deps = createMockDeps(schema, search);

    const { resolvers } = generateResolvers(schema, deps);
    const searchPatients = resolvers['Query']!['searchPatients'] as (
      p: unknown,
      a: { query: string },
      c: ResolverContext,
    ) => Promise<unknown>;
    expect(typeof searchPatients).toBe('function');

    await searchPatients(null, { query: 'smith' }, createCtx(deps));

    expect(search).toHaveBeenCalledTimes(1);
    const query = search.mock.calls[0]![1] as SearchQuery;

    expect(query.fields).not.toContain('id');
    expect(query.fields).not.toContain('dateOfBirth');
    expect(query.fields).not.toContain('admittedCount');
    expect(query.fields).not.toContain('isPriority');
    expect([...(query.fields ?? [])].sort()).toEqual([...MATCHABLE].sort());
  });

  it('an explicit field list is passed through untouched', async () => {
    const schema = parseOdl(ODL);
    const search = vi.fn().mockResolvedValue(emptyResult());
    const deps = createMockDeps(schema, search);

    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(
      r => r.method === 'GET' && r.pattern === '/api/v1/patients/search',
    )!;

    const res = await route.handler(
      {
        method: 'GET',
        path: '/api/v1/patients/search',
        params: {},
        query: { q: 'smith', fields: 'name' },
        body: undefined,
        user: createMockUser(),
      },
      createCtx(deps),
    );

    expect(res.status).toBe(200);
    const query = search.mock.calls[0]![1] as SearchQuery;
    expect(query.fields).toEqual(['name']);
  });
});
