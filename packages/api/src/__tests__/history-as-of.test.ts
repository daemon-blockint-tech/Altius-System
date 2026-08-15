/**
 * Point-in-time reads must be reachable from the API.
 *
 * `getObjectAtTime` is implemented by both storage providers and covered by the
 * SPI conformance suite, but nothing above the SPI ever called it — a repo-wide
 * grep for it in packages/api returns nothing. "What did this record look like
 * on the 3rd?" — the question temporal storage exists to answer — had no route.
 *
 * Exposed on the route that already answers historical questions:
 *
 *   GET /api/v1/{plural}/:id/history            → every version (unchanged)
 *   GET /api/v1/{plural}/:id/history?asOf=<ts>  → the one version live at <ts>
 *
 * Same authorization, redaction and consent path as the version list, because
 * an older version of a record is still that record.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { RestRequest, RestRoute } from '../rest/types.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String!
  status: PatientStatus!
}

enum PatientStatus { ACTIVE DISCHARGED }
`;

const AT_V2: OntologyObject = {
  _tenantId: 'tenant-1',
  _type: 'Patient',
  _id: 'p-1',
  _version: 2,
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-03T00:00:00Z',
  name: 'Alice Smithson',
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

function deps(schema: ParsedSchema, atTime: ReturnType<typeof vi.fn>): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn().mockResolvedValue({ ...AT_V2, _version: 3 }),
      query: vi.fn(),
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
    storage: {
      getObjectAtVersion: vi.fn().mockResolvedValue(AT_V2),
      getObjectHistory: vi.fn().mockResolvedValue([
        { ...AT_V2, _version: 1 },
        { ...AT_V2, _version: 2 },
      ]),
      getObjectAtTime: atTime,
    } as unknown as ApiDependencies['storage'],
  };
}

function ctx(d: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: 'tenant-1', actorId: 'dr-smith', traceId: 't-1' },
    user: user(),
    deps: d,
  };
}

function historyRoute(routes: RestRoute[]): RestRoute {
  const r = routes.find(x => x.method === 'GET' && x.pattern === '/api/v1/patients/:id/history');
  expect(r).toBeDefined();
  return r!;
}

function req(query: Record<string, string>): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/patients/p-1/history',
    params: { id: 'p-1' },
    query,
    body: undefined,
    user: user(),
  };
}

describe('GET /history?asOf', () => {
  it('returns the version that was live at the given instant', async () => {
    const schema = parseOdl(ODL);
    const atTime = vi.fn().mockResolvedValue(AT_V2);
    const d = deps(schema, atTime);

    const res = await historyRoute(generateRestRoutes(schema, d)).handler(
      req({ asOf: '2026-01-04T00:00:00Z' }),
      ctx(d),
    );

    expect(res.status).toBe(200);
    expect(atTime).toHaveBeenCalledTimes(1);
    // (ctx, type, id, timestamp)
    expect(atTime.mock.calls[0]![1]).toBe('Patient');
    expect(atTime.mock.calls[0]![2]).toBe('p-1');
    expect(atTime.mock.calls[0]![3]).toBe('2026-01-04T00:00:00Z');

    const body = res.body as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.name).toBe('Alice Smithson');
    expect(body.data[0]!._version).toBe(2);
  });

  it('404s when the record did not exist yet at that instant', async () => {
    const schema = parseOdl(ODL);
    const d = deps(schema, vi.fn().mockResolvedValue(null));

    const res = await historyRoute(generateRestRoutes(schema, d)).handler(
      req({ asOf: '2020-01-01T00:00:00Z' }),
      ctx(d),
    );

    expect(res.status).toBe(404);
  });

  it('rejects a timestamp it cannot parse rather than guessing', async () => {
    const schema = parseOdl(ODL);
    const atTime = vi.fn();
    const d = deps(schema, atTime);

    const res = await historyRoute(generateRestRoutes(schema, d)).handler(
      req({ asOf: 'last tuesday' }),
      ctx(d),
    );

    expect(res.status).toBe(400);
    expect(atTime).not.toHaveBeenCalled();
  });

  it('still lists every version when asOf is absent', async () => {
    const schema = parseOdl(ODL);
    const atTime = vi.fn();
    const d = deps(schema, atTime);
    const res = await historyRoute(generateRestRoutes(schema, d)).handler(req({}), ctx(d));

    expect(res.status).toBe(200);
    // The point of the regression: the untouched path must not reach the
    // point-in-time read.
    expect(atTime).not.toHaveBeenCalled();
    expect(d.storage.getObjectHistory).toHaveBeenCalled();
    expect((res.body as { data: unknown[] }).data).toHaveLength(2);
  });
});
