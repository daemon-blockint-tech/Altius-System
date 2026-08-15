/**
 * Consent filtering over the REAL ConsentService (no filterList mock).
 *
 * The list path shapes rows with `objectToGraphQL` before handing them to
 * `filterList`, and identifies the consent subject by `item._id`. If shaping
 * drops `_id`, every row is checked as subject '' — which default-denies — and
 * a consent-gated list silently returns zero rows.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ConsentService, MemoryConsentStore } from '@altius/security';
import type { OntologyObject } from '@altius/spi';
import { generateResolvers } from '../graphql/resolver-generator.js';
import { DEFAULT_CONSENT_PURPOSE } from '../graphql/types.js';
import type { ApiDependencies, ResolverContext, AuthenticatedUserInfo } from '../graphql/types.js';

// Patient is a default consent-subject type; its @primary field is named `mrn`,
// not `id`, so nothing in the shaped row happens to carry the storage id.
const ODL = `
extend schema @namespace(name: "test.consent", version: "0.1.0")

type Patient @objectType {
  mrn: ID! @primary
  name: String!
}
`;

function patient(id: string): OntologyObject {
  return {
    _tenantId: 'tenant-1',
    _type: 'Patient',
    _id: id,
    _version: 1,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name: `Patient ${id}`,
  };
}

const user: AuthenticatedUserInfo = {
  id: 'user-1',
  name: 'Dr Smith',
  email: 'dr.smith@nhs.uk',
  roles: ['clinician'],
  groups: [],
  tenantId: 'tenant-1',
};

describe('consent filtering with a non-`id` primary field', () => {
  it('keeps rows whose subject has granted consent', async () => {
    const schema = parseOdl(ODL);

    const authorizationService = {
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
        (_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map(obj => ({ data: obj, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'];

    // Real consent service, real store — the exemption path is off, so every
    // row is decided by an explicit record (or default-denied).
    const store = new MemoryConsentStore();
    const consentService = new ConsentService(
      store,
      authorizationService as never,
      { directCareExemptionEnabled: false },
    );
    await consentService.recordConsent('p-1', DEFAULT_CONSENT_PURPOSE, 'GRANT', undefined, 'tenant-1');
    await consentService.recordConsent('p-3', DEFAULT_CONSENT_PURPOSE, 'GRANT', undefined, 'tenant-1');

    const deps = {
      schema,
      objectManager: {
        get: vi.fn(),
        query: vi.fn().mockResolvedValue({
          items: [patient('p-1'), patient('p-2'), patient('p-3')],
          totalCount: 3,
          hasNextPage: false,
        }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiDependencies['objectManager'],
      linkManager: {} as unknown as ApiDependencies['linkManager'],
      actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
      authorizationService,
      authenticator: {} as unknown as ApiDependencies['authenticator'],
      consentService: consentService as unknown as ApiDependencies['consentService'],
      auditWriter: undefined,
      storage: {} as unknown as ApiDependencies['storage'],
    } as ApiDependencies;

    const ctx: ResolverContext = {
      requestContext: { tenantId: 'tenant-1', actorId: user.id, traceId: 'trace-test' },
      user,
      deps,
    };

    const { resolvers } = generateResolvers(schema, deps);
    const patients = resolvers['Query']!['patients'] as (
      ...args: unknown[]
    ) => Promise<{ totalCount: number; edges: { node: Record<string, unknown> }[] }>;

    const result = await patients(null, { first: 10 }, ctx);

    expect(result.edges.map(e => e.node['mrn'])).toEqual(['p-1', 'p-3']);
    expect(result.totalCount).toBe(2);
  });
});
