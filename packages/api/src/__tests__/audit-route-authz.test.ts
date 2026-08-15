/**
 * Reading the audit trail must require a role.
 *
 * GET /api/v1/audit scopes every query to the caller's tenant, but applies no
 * authorization beyond authentication — there is no role check in
 * audit-routes.ts and none in the REST dispatcher either. So any authenticated
 * user could read their whole tenant's trail.
 *
 * That is not merely a metadata leak. action-executor.ts writes
 * `before: Object.fromEntries(beforeStates)` and `after: ...` into
 * AuditDetail, i.e. complete object snapshots. Object reads go through ReBAC
 * scoping, field redaction and a consent gate; the audit trail goes through
 * none of them, so a clinician who is denied a patient's fields on
 * GET /api/v1/patients/:id can read those same values back out of
 * GET /api/v1/audit?objectType=Patient.
 *
 * Gated by role rather than ReBAC to match the platform's existing
 * administrative gates (DEFAULT_GRANTER_ROLES, DEFAULT_CONSENT_RECORDER_ROLES):
 * the trail spans every object, so there is no single object for OpenFGA to
 * resolve a relation against.
 */

import { describe, it, expect } from 'vitest';
import type { AuditRecord } from '@altius/spi';
import { MemoryAuditStore } from '@altius/security';

import { generateAuditRoutes } from '../rest/audit-routes.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const SNAPSHOT: AuditRecord = {
  id: 'audit-1',
  timestamp: '2026-01-01T00:00:00Z',
  traceId: 'trace-1',
  tenantId: 'tenant-1',
  actor: { type: 'user', id: 'other-user', roles: ['clinician'] },
  operation: { type: 'action', actionType: 'AdmitPatient', objectType: 'Patient', objectId: 'p-1' },
  // The field values redaction exists to withhold, sitting in the audit row.
  detail: { result: 'success', after: { nhsNumber: '943-476-5919', diagnosis: 'HIV' } },
};

async function storeWith(record: AuditRecord): Promise<MemoryAuditStore> {
  const store = new MemoryAuditStore();
  await store.append(record);
  return store;
}

function deps(store: MemoryAuditStore, auditReaderRoles?: readonly string[]): ApiDependencies {
  return {
    auditStore: store,
    ...(auditReaderRoles ? { auditReaderRoles } : {}),
  } as unknown as ApiDependencies;
}

function ctx(roles: string[]): ResolverContext {
  const user: AuthenticatedUserInfo = {
    id: 'user-1', name: 'Dr Smith', email: 'd@x', roles, groups: [], tenantId: 'tenant-1',
  };
  return {
    user,
    requestContext: { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'tr-1' },
    deps: {} as ApiDependencies,
  } as unknown as ResolverContext;
}

const req = { query: {}, params: {}, headers: {}, body: {} } as unknown as RestRequest;

const call = (d: ApiDependencies, c: ResolverContext) =>
  generateAuditRoutes(d)[0]!.handler(req, c);

describe('audit read authorization', () => {
  it('denies a caller without an audit-reader role, returning no records', async () => {
    const store = await storeWith(SNAPSHOT);

    const res = await call(deps(store), ctx(['clinician']));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('943-476-5919');
  });

  it('allows the default admin role when none is configured', async () => {
    const store = await storeWith(SNAPSHOT);

    const res = await call(deps(store), ctx(['admin']));

    expect(res.status).toBe(200);
    expect((res.body as { data: AuditRecord[] }).data).toHaveLength(1);
  });

  it('honours a configured reader role', async () => {
    const store = await storeWith(SNAPSHOT);

    const res = await call(deps(store, ['compliance_officer']), ctx(['compliance_officer']));

    expect(res.status).toBe(200);
  });

  it('denies admin once a deployment narrows the reader roles', async () => {
    const store = await storeWith(SNAPSHOT);

    const res = await call(deps(store, ['compliance_officer']), ctx(['admin']));

    expect(res.status).toBe(403);
  });

  it('denies everyone when a deployment configures an empty reader set', async () => {
    const store = await storeWith(SNAPSHOT);

    // Fail-closed: an explicitly empty set means nobody, not everybody.
    const res = await call(deps(store, []), ctx(['admin']));

    expect(res.status).toBe(403);
  });
});
