/**
 * A grant must be written into the *caller's* tenant store.
 *
 * 379e5be added a tenantId parameter to writeRelationship/deleteRelationship
 * because object ids are unique only per tenant, so a tuple minted without one
 * authorised the same id in every tenant. The existing route tests all run as
 * tenantId 'default', which cannot distinguish "the caller's tenant is passed
 * through" from "a literal 'default' is hardcoded" — and those two collapse to
 * the same observation exactly where the security property lives.
 *
 * This pins it with a tenant that is not the fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateRelationshipRoutes, type GrantAllowlist } from '../relationships/router.js';
import type { ApiDependencies, ResolverContext, AuthenticatedUserInfo } from '../graphql/types.js';
import type { RestRoute } from '../rest/types.js';

const ALLOW: GrantAllowlist = new Map([['patient', new Set(['clinician'])]]);

function mockDeps() {
  const writeRelationship = vi.fn().mockResolvedValue(undefined);
  const deleteRelationship = vi.fn().mockResolvedValue(undefined);
  const deps = {
    authorizationService: { writeRelationship, deleteRelationship },
    auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
  } as unknown as ApiDependencies;
  return { deps, writeRelationship, deleteRelationship };
}

function ctxForTenant(tenantId: string): ResolverContext {
  const user: AuthenticatedUserInfo = {
    id: 'caller-1', name: 'Caller', email: 'c@x', roles: ['admin'], groups: [], tenantId,
  };
  return {
    requestContext: { tenantId, actorId: 'caller-1', traceId: 't1' },
    user,
    deps: {} as ApiDependencies,
  };
}

const body = { user: 'alice', relation: 'clinician', objectType: 'Patient', objectId: 'p-1' };
const grantRoute = (routes: RestRoute[]) => routes.find(r => r.method === 'POST')!;
const revokeRoute = (routes: RestRoute[]) => routes.find(r => r.method === 'DELETE')!;

describe('relationship routes are tenant-scoped', () => {
  it('writes the grant into the caller tenant, not the fallback', async () => {
    const d = mockDeps();
    const routes = generateRelationshipRoutes(d.deps, ALLOW);

    await grantRoute(routes).handler({ body } as never, ctxForTenant('tenant-b'));

    expect(d.writeRelationship).toHaveBeenCalledWith('user:alice', 'clinician', 'patient:p-1', 'tenant-b');
  });

  it('revokes from the caller tenant too', async () => {
    const d = mockDeps();
    const routes = generateRelationshipRoutes(d.deps, ALLOW);

    await revokeRoute(routes).handler({ body } as never, ctxForTenant('tenant-b'));

    expect(d.deleteRelationship).toHaveBeenCalledWith('user:alice', 'clinician', 'patient:p-1', 'tenant-b');
  });

  it('keeps grants for two tenants apart', async () => {
    const d = mockDeps();
    const routes = generateRelationshipRoutes(d.deps, ALLOW);

    await grantRoute(routes).handler({ body } as never, ctxForTenant('tenant-a'));
    await grantRoute(routes).handler({ body } as never, ctxForTenant('tenant-b'));

    const tenants = d.writeRelationship.mock.calls.map(c => c[3]);
    expect(tenants).toEqual(['tenant-a', 'tenant-b']);
  });
});
