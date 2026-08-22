/**
 * Audit detail.before/after must not hand back the field values redaction
 * exists to withhold. Role-gated reads (audit-route-authz.test.ts) bound WHO
 * can read the trail; this bounds WHAT they read: @sensitive-bearing snapshots
 * are redacted with the caller's own field policy, unless the caller holds a
 * role in AUDIT_UNREDACTED_ROLES (default: nobody — fail closed).
 */
import { describe, it, expect } from 'vitest';
import type { AuditRecord } from '@altius/spi';
import { MemoryAuditStore } from '@altius/security';
import { generateAuditRoutes } from '../rest/audit-routes.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const RECORD: AuditRecord = {
  id: 'audit-1',
  timestamp: '2026-01-01T00:00:00Z',
  traceId: 'trace-1',
  tenantId: 'tenant-1',
  actor: { type: 'user', id: 'other-user', roles: ['clinician'] },
  operation: { type: 'action', actionType: 'AdmitPatient', objectType: 'Patient', objectId: 'p-1' },
  detail: { result: 'success', after: { id: 'p-1', nhsNumber: '943-476-5919', diagnosis: 'HIV' } },
};

const fakeAuthz = {
  redactFields: (_uid: string, _roles: string[], _type: string, obj: Record<string, unknown>) => ({
    data: { id: obj['id'] },
    _redactedFields: ['nhsNumber', 'diagnosis'],
  }),
};

async function run(depsExtra: Record<string, unknown>, roles: string[]) {
  const store = new MemoryAuditStore();
  await store.append(RECORD);
  const deps = { auditStore: store, auditReaderRoles: ['admin'], ...depsExtra } as unknown as ApiDependencies;
  const user: AuthenticatedUserInfo = { id: 'u1', name: 'A', email: 'a@x', roles, groups: [], tenantId: 'tenant-1' };
  const ctx = { user, deps, requestContext: { tenantId: 'tenant-1', traceId: 't' } } as unknown as ResolverContext;
  const route = generateAuditRoutes(deps).find(r => r.pattern === '/api/v1/audit')!;
  const res = await route.handler({ params: {}, query: {}, body: undefined } as unknown as RestRequest, ctx);
  return res;
}

describe('audit detail redaction', () => {
  it('redacts before/after snapshots with the caller field policy by default', async () => {
    const res = await run({ authorizationService: fakeAuthz }, ['admin']);
    const rec = (res.body as { data: AuditRecord[] }).data[0]!;
    expect(rec.detail?.after).not.toHaveProperty('nhsNumber');
    expect(rec.detail?.after).not.toHaveProperty('diagnosis');
    expect((rec.detail?.after as Record<string, unknown>)['_redactedFields']).toEqual(['nhsNumber', 'diagnosis']);
  });

  it('a role listed in auditUnredactedRoles reads raw snapshots', async () => {
    const res = await run({ authorizationService: fakeAuthz, auditUnredactedRoles: ['compliance-officer'] }, ['admin', 'compliance-officer']);
    const rec = (res.body as { data: AuditRecord[] }).data[0]!;
    expect((rec.detail?.after as Record<string, unknown>)['nhsNumber']).toBe('943-476-5919');
  });

  it('no authorizationService → snapshots withheld wholesale (fail closed)', async () => {
    const res = await run({}, ['admin']);
    const rec = (res.body as { data: AuditRecord[] }).data[0]!;
    expect(rec.detail?.after).toEqual({ _redacted: true });
  });
});
