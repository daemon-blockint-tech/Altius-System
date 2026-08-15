/**
 * Regression: REST collection reads must identify the consent subject by the
 * object's id, not by an absent field.
 *
 * Found by running the gateway. `POST /api/v1/actions/RegisterPatient` created
 * a patient, `GET /api/v1/patients/{id}` returned it, and both
 * `GET /api/v1/patients` and `GET /api/v1/patients/search` returned zero rows —
 * while the equivalent GraphQL queries returned the patient.
 *
 * The consent filter resolves the subject with `String(item._id ?? '')`, but
 * `objectToRest` maps the @primary field to its DECLARED name (`id`) and never
 * carries `_id` through. Every row was therefore consent-checked as subject
 * `''`, matched no record, and was default-denied — so a consent-subject type
 * read as an empty collection over REST with no error anywhere.
 *
 * `objectToGraphQL` sets `_id` for exactly this reason and says so in a
 * comment; the REST shaper was missing the same line.
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

const PATIENT: OntologyObject = {
  _tenantId: 'tenant-1',
  _type: 'Patient',
  _id: 'mem_patient_1',
  _version: 1,
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  name: 'Alice Smithson',
  status: 'ACTIVE',
};

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

/**
 * Records the subject id the consent layer was asked about, and grants
 * everything — so a row can only go missing because it was identified wrongly.
 */
function createRecordingConsentService(seen: string[]) {
  return {
    filterList: vi.fn().mockImplementation(
      async (
        items: Record<string, unknown>[],
        getSubjectId: (item: Record<string, unknown>) => string,
      ) => {
        for (const item of items) seen.push(getSubjectId(item));
        return { edges: items, totalCount: items.length };
      },
    ),
    checkSingleObject: vi.fn().mockImplementation(async (item: unknown) => ({
      data: item,
      _consentRestricted: false,
    })),
  } as unknown as ApiDependencies['consentService'];
}

function createMockDeps(
  schema: ParsedSchema,
  consentService: ApiDependencies['consentService'],
): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn().mockResolvedValue(PATIENT),
      query: vi.fn().mockResolvedValue({
        items: [PATIENT],
        totalCount: 1,
        hasNextPage: false,
      }),
      search: vi.fn().mockResolvedValue({
        hits: [{ object: PATIENT, score: 1 }],
        totalCount: 1,
        hasNextPage: false,
      }),
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
    consentService,
    auditWriter: undefined,
    storage: {} as unknown as ApiDependencies['storage'],
    consentSubjectTypes: ['Patient'],
  };
}

function ctx(deps: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: 'tenant-1', actorId: 'dr-smith', traceId: 't-1' },
    user: createMockUser(),
    deps,
  };
}

function request(path: string, query: Record<string, string> = {}): RestRequest {
  return {
    method: 'GET',
    path,
    params: {},
    query,
    body: undefined,
    user: createMockUser(),
  };
}

function routeFor(routes: RestRoute[], pattern: string): RestRoute {
  const route = routes.find(r => r.method === 'GET' && r.pattern === pattern);
  expect(route).toBeDefined();
  return route!;
}

describe('REST consent subject identification', () => {
  it('identifies the list subject by the object id', async () => {
    const schema = parseOdl(ODL);
    const seen: string[] = [];
    const deps = createMockDeps(schema, createRecordingConsentService(seen));

    const routes = generateRestRoutes(schema, deps);
    const res = await routeFor(routes, '/api/v1/patients').handler(
      request('/api/v1/patients'),
      ctx(deps),
    );

    expect(res.status).toBe(200);
    expect(seen).toEqual(['mem_patient_1']);
  });

  it('returns the row rather than silently dropping it', async () => {
    const schema = parseOdl(ODL);
    const deps = createMockDeps(schema, createRecordingConsentService([]));

    const routes = generateRestRoutes(schema, deps);
    const res = await routeFor(routes, '/api/v1/patients').handler(
      request('/api/v1/patients'),
      ctx(deps),
    );

    const body = res.body as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('identifies the search subject by the object id', async () => {
    const schema = parseOdl(ODL);
    const seen: string[] = [];
    const deps = createMockDeps(schema, createRecordingConsentService(seen));

    const routes = generateRestRoutes(schema, deps);
    const res = await routeFor(routes, '/api/v1/patients/search').handler(
      request('/api/v1/patients/search', { q: 'Smithson' }),
      ctx(deps),
    );

    expect(res.status).toBe(200);
    expect(seen).toEqual(['mem_patient_1']);
  });
});
