/**
 * as-of collection queries must be reachable from the API.
 *
 * `QueryOptions.asOfTime` is honoured by both storage providers at the SPI
 * level — "who was DISCHARGED last Tuesday" evaluates the filter against
 * Tuesday's values, not today's. But no REST route or GraphQL resolver
 * passed it through, so the capability was reachable from platform code
 * only. A competent user cannot write platform code.
 *
 * Exposed on the surfaces that already answer collection questions:
 *
 *   GET /api/v1/{plural}?asOf=<ISO-8601>  → rows live at that instant
 *   { patients(asOf: "2026-01-04T00:00:00Z") }  → same, over GraphQL
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject, ObjectPage } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { RestRequest, RestRoute } from '../rest/types.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import { generateResolvers } from '../graphql/resolver-generator.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String!
  status: PatientStatus!
}

enum PatientStatus { ACTIVE DISCHARGED }
`;

const AT_TUESDAY: OntologyObject = {
  _tenantId: 'tenant-1',
  _type: 'Patient',
  _id: 'p-1',
  _version: 1,
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-02T00:00:00Z',
  name: 'Alice (old name)',
  status: 'ACTIVE',
};

function user(): AuthenticatedUserInfo {
  return {
    id: 'dr-smith',
    name: 'Dr Smith',
    email: 'dr-smith@nhs.example',
    roles: ['clinician'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function deps(schema: ParsedSchema, queryFn: ReturnType<typeof vi.fn>): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn().mockResolvedValue(AT_TUESDAY),
      query: queryFn,
      search: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map(o => ({ data: o, _redactedFields: [] })),
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

function ctx(d: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: 'tenant-1', actorId: 'dr-smith', traceId: 't-1' },
    user: user(),
    deps: d,
  };
}

function listRoute(routes: RestRoute[]): RestRoute {
  const r = routes.find(x => x.method === 'GET' && x.pattern === '/api/v1/patients');
  expect(r).toBeDefined();
  return r!;
}

function listReq(query: Record<string, string>): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/patients',
    params: {},
    query,
    body: undefined,
    user: user(),
  };
}

describe('GET /api/v1/patients?asOf', () => {
  it('passes asOfTime to objectManager.query', async () => {
    const schema = parseOdl(ODL);
    const page: ObjectPage = {
      items: [AT_TUESDAY],
      totalCount: 1,
      hasNextPage: false,
    };
    const queryFn = vi.fn().mockResolvedValue(page);
    const d = deps(schema, queryFn);

    const res = await listRoute(generateRestRoutes(schema, d)).handler(
      listReq({ asOf: '2026-01-04T00:00:00Z' }),
      ctx(d),
    );

    expect(res.status).toBe(200);
    expect(queryFn).toHaveBeenCalledTimes(1);
    // query(type, filter, options, ctx) — options is the 3rd argument (index 2).
    const queryOpts = queryFn.mock.calls[0]![2] as Record<string, unknown>;
    expect(queryOpts.asOfTime).toBe('2026-01-04T00:00:00Z');

    const body = res.body as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.name).toBe('Alice (old name)');
  });

  it('rejects a non-ISO asOf with VALIDATION_ERROR', async () => {
    const schema = parseOdl(ODL);
    const queryFn = vi.fn();
    const d = deps(schema, queryFn);

    const res = await listRoute(generateRestRoutes(schema, d)).handler(
      listReq({ asOf: 'last tuesday' }),
      ctx(d),
    );

    expect(res.status).toBe(400);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('does not pass asOfTime when asOf is absent', async () => {
    const schema = parseOdl(ODL);
    const page: ObjectPage = {
      items: [AT_TUESDAY],
      totalCount: 1,
      hasNextPage: false,
    };
    const queryFn = vi.fn().mockResolvedValue(page);
    const d = deps(schema, queryFn);

    await listRoute(generateRestRoutes(schema, d)).handler(
      listReq({}),
      ctx(d),
    );

    expect(queryFn).toHaveBeenCalledTimes(1);
    const queryOpts = queryFn.mock.calls[0]![2] as Record<string, unknown>;
    expect(queryOpts.asOfTime).toBeUndefined();
  });
});

describe('GraphQL patients(asOf:)', () => {
  it('SDL includes asOf: DateTime on the list query', () => {
    const schema = parseOdl(ODL);
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('asOf: DateTime');
  });

  it('passes asOfTime to objectManager.query', async () => {
    const schema = parseOdl(ODL);
    const page: ObjectPage = {
      items: [AT_TUESDAY],
      totalCount: 1,
      hasNextPage: false,
    };
    const queryFn = vi.fn().mockResolvedValue(page);
    const d = deps(schema, queryFn);

    const { resolvers } = generateResolvers(schema, d);

    // Find the patients resolver on the Query type.
    const queryResolver = resolvers.Query as Record<string, unknown>;
    const patientsResolver = queryResolver['patients'] as (parent: unknown, args: Record<string, unknown>, ctx: ResolverContext) => Promise<unknown>;
    expect(patientsResolver).toBeDefined();

    await patientsResolver(
      {},
      { asOf: '2026-01-04T00:00:00Z' },
      ctx(d),
    );

    expect(queryFn).toHaveBeenCalledTimes(1);
    const queryOpts = queryFn.mock.calls[0]![2] as Record<string, unknown>;
    expect(queryOpts.asOfTime).toBe('2026-01-04T00:00:00Z');
  });

  it('does not pass asOfTime when asOf is absent', async () => {
    const schema = parseOdl(ODL);
    const page: ObjectPage = {
      items: [AT_TUESDAY],
      totalCount: 1,
      hasNextPage: false,
    };
    const queryFn = vi.fn().mockResolvedValue(page);
    const d = deps(schema, queryFn);

    const { resolvers } = generateResolvers(schema, d);
    const queryResolver = resolvers.Query as Record<string, unknown>;
    const patientsResolver = queryResolver['patients'] as (parent: unknown, args: Record<string, unknown>, ctx: ResolverContext) => Promise<unknown>;

    await patientsResolver({}, {}, ctx(d));

    expect(queryFn).toHaveBeenCalledTimes(1);
    const queryOpts = queryFn.mock.calls[0]![2] as Record<string, unknown>;
    expect(queryOpts.asOfTime).toBeUndefined();
  });
});
