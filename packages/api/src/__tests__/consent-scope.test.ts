/**
 * Consent must gate only the types that actually have data subjects.
 *
 * checkConsent default-denies when no record exists, so applying it to every
 * ObjectType empties the read paths for every non-subject type (Ward, Bed,
 * Supplier, Transaction...). The REST tests never caught this because they all
 * run with consentService: undefined.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import { ConsentService, MemoryConsentStore } from '@altius/security';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  nhsNumber: String @unique
  status: String!
}

type Ward @objectType {
  id: ID! @primary
  name: String!
  speciality: String
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'user-1', name: 'Dr Smith', email: 'd@nhs.uk',
  roles: ['clinician'], groups: [], tenantId: 'tenant-1',
};

function wardObject(id: string) {
  return {
    _tenantId: 'tenant-1', _type: 'Ward', _id: id, _version: 1,
    _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z',
    name: `Ward ${id}`, speciality: 'General',
  };
}

/** Deps with a real, empty consent store — every checkConsent default-denies. */
function depsWithConsent(schema: ParsedSchema): ApiDependencies {
  const wards = [wardObject('w1'), wardObject('w2')];
  return {
    schema,
    objectManager: {
      query: vi.fn().mockResolvedValue({ items: wards, totalCount: wards.length }),
      get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation((_u, _r, _t, obj) => ({ data: obj, _redactedFields: [] })),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map(o => ({ data: o, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: new ConsentService(new MemoryConsentStore(), {
      check: vi.fn().mockResolvedValue(false),
    } as never, { directCareExemptionEnabled: false }),
    auditWriter: undefined,
    storage: { getObjectAtVersion: vi.fn() } as unknown as ApiDependencies['storage'],
  } as unknown as ApiDependencies;
}

describe('consent scoping on read paths', () => {
  let parsed: ParsedSchema;
  beforeAll(() => { parsed = parseOdl(ODL); });

  it('does not consent-filter a type that has no data subject', async () => {
    const deps = depsWithConsent(parsed);
    const routes = generateRestRoutes(parsed, deps);
    const wardList = routes.find(r => r.method === 'GET' && r.pattern === '/api/v1/wards')!;

    const res = await wardList.handler(
      { method: 'GET', path: '/api/v1/wards', params: {}, query: {}, body: undefined, user: USER },
      {
        requestContext: { tenantId: 'tenant-1', actorId: USER.id, traceId: 't' },
        user: USER,
        deps,
      } as never,
    );

    // A Ward is not a patient: an empty consent store must not hide it.
    const body = res.body as { data?: unknown[] };
    expect(body.data).toHaveLength(2);
  });

  it('still consent-filters the configured subject type', async () => {
    // The counterpart to the test above: narrowing the scope must not turn the
    // consent gate off for the type that actually has subjects.
    const deps = depsWithConsent(parsed);
    (deps.objectManager.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{
        _tenantId: 'tenant-1', _type: 'Patient', _id: 'p1', _version: 1,
        _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z',
        nhsNumber: 'NHS-1', status: 'ACTIVE',
      }],
      totalCount: 1,
    });
    const routes = generateRestRoutes(parsed, deps);
    const patientList = routes.find(r => r.method === 'GET' && r.pattern === '/api/v1/patients')!;

    const res = await patientList.handler(
      { method: 'GET', path: '/api/v1/patients', params: {}, query: {}, body: undefined, user: USER },
      {
        requestContext: { tenantId: 'tenant-1', actorId: USER.id, traceId: 't' },
        user: USER,
        deps,
      } as never,
    );

    // No consent record for p1 => default deny => withheld.
    const body = res.body as { data?: unknown[] };
    expect(body.data).toHaveLength(0);
  });
});
