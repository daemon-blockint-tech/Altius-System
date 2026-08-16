import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyConsentRecord, generateConsentRoutes, assertConsentConfig } from '../consent/router.js';
import type { ApiDependencies } from '../graphql/types.js';
import { resolveDefaultConsentPurpose } from '../graphql/types.js';

function mockDeps(withConsent = true, recorderRoles?: readonly string[], consentPurposes?: readonly string[]) {
  const recordConsent = vi.fn().mockResolvedValue(undefined);
  // A DENY is a revocation, not just a record: it must also close the
  // subject's live subscriptions, so it routes through revokeConsent.
  const revokeConsent = vi.fn().mockResolvedValue({
    subjectId: 'p-1', purpose: 'RESEARCH', revokedAt: '2026-08-16T00:00:00Z',
    activeSessions: 0, subscriptionsTerminated: 2,
  });
  const auditWrite = vi.fn().mockResolvedValue(undefined);
  const deps = {
    consentService: withConsent ? { recordConsent, revokeConsent } : undefined,
    auditWriter: { write: auditWrite },
    ...(recorderRoles ? { consentRecorderRoles: recorderRoles } : {}),
    ...(consentPurposes ? { consentPurposes } : {}),
  } as unknown as ApiDependencies;
  return { deps, recordConsent, revokeConsent, auditWrite };
}

const ADMIN = { id: 'u1', roles: ['admin'] };
const CLERK = { id: 'u2', roles: ['receptionist'] };
const NURSE = { id: 'u3', roles: ['nurse_in_charge'] };

describe('applyConsentRecord', () => {
  let d: ReturnType<typeof mockDeps>;
  beforeEach(() => { d = mockDeps(); });

  it('records a GRANT for a recorder role and audits it', async () => {
    const r = await applyConsentRecord(d.deps, { subject: 'p-1' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ subject: 'p-1', purpose: 'DIRECT_CARE', decision: 'GRANT', recorded: true });
    expect(d.recordConsent).toHaveBeenCalledWith('p-1', 'DIRECT_CARE', 'GRANT', undefined, 'default');
    expect(d.auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ result: 'success', consentDecision: 'granted' }),
    }));
  });

  it('routes a DENY through revokeConsent and reports the streams it closed', async () => {
    const r = await applyConsentRecord(
      d.deps, { subject: 'p-1', purpose: 'RESEARCH', decision: 'deny', evidence: 'verbal' }, ADMIN, 'default', 't1',
    );
    expect(r.ok).toBe(true);
    // revokeConsent writes the same DENY record AND tears down live streams;
    // recordConsent alone would leave a connected client on a silent socket.
    expect(d.revokeConsent).toHaveBeenCalledWith('p-1', 'RESEARCH', 'verbal', 'default');
    expect(d.recordConsent).not.toHaveBeenCalled();
    expect(r.data).toMatchObject({ decision: 'DENY', subscriptionsTerminated: 2 });
  });

  it('denies a non-recorder role (403) and audits the denial', async () => {
    const r = await applyConsentRecord(d.deps, { subject: 'p-1' }, CLERK, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.category).toBe('authorization');
    expect(d.recordConsent).not.toHaveBeenCalled();
    expect(d.auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ result: 'denied' }),
    }));
  });

  it('defaults to admin-only: a clinical role (nurse_in_charge) is denied without config', async () => {
    const r = await applyConsentRecord(d.deps, { subject: 'p-1' }, NURSE, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.category).toBe('authorization');
    expect(d.recordConsent).not.toHaveBeenCalled();
  });

  it('honours configured consentRecorderRoles (deps.consentRecorderRoles)', async () => {
    const nd = mockDeps(true, ['admin', 'nurse_in_charge', 'clinician']);
    const r = await applyConsentRecord(nd.deps, { subject: 'p-1' }, NURSE, 'default', 't1');
    expect(r.ok).toBe(true);
    expect(nd.recordConsent).toHaveBeenCalledWith('p-1', 'DIRECT_CARE', 'GRANT', undefined, 'default');
  });

  it('audits consent as a pack-agnostic "consent" object, not "patient"', async () => {
    await applyConsentRecord(d.deps, { subject: 'cust-1' }, ADMIN, 'default', 't1');
    expect(d.auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({ objectType: 'consent', objectId: 'cust-1' }),
    }));
  });

  it('rejects a missing subject', async () => {
    const r = await applyConsentRecord(d.deps, {}, ADMIN, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown purpose (default = standard NHS preset)', async () => {
    const r = await applyConsentRecord(d.deps, { subject: 'p-1', purpose: 'MARKETING' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_PURPOSE');
  });

  it('accepts a deployment-defined purpose from deps.consentPurposes (non-NHS vocabulary)', async () => {
    const nd = mockDeps(true, undefined, ['KYC', 'AML_MONITORING']);
    const r = await applyConsentRecord(nd.deps, { subject: 'cust-1', purpose: 'KYC' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(true);
    expect(nd.recordConsent).toHaveBeenCalledWith('cust-1', 'KYC', 'GRANT', undefined, 'default');
  });

  it('rejects an NHS purpose when the configured vocabulary excludes it', async () => {
    const nd = mockDeps(true, undefined, ['KYC', 'AML_MONITORING']);
    const r = await applyConsentRecord(nd.deps, { subject: 'cust-1', purpose: 'DIRECT_CARE' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_PURPOSE');
    expect(r.message).toContain('KYC');
  });

  it('rejects an invalid decision', async () => {
    const r = await applyConsentRecord(d.deps, { subject: 'p-1', decision: 'MAYBE' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_DECISION');
  });

  it('fails when consent service is not configured', async () => {
    const nd = mockDeps(false);
    const r = await applyConsentRecord(nd.deps, { subject: 'p-1' }, ADMIN, 'default', 't1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CONSENT_NOT_CONFIGURED');
  });
});

describe('resolveDefaultConsentPurpose (open string model)', () => {
  it('accepts any non-empty purpose — a non-NHS default is honoured, not coerced to DIRECT_CARE', () => {
    expect(resolveDefaultConsentPurpose('KYC')).toBe('KYC');
    expect(resolveDefaultConsentPurpose('  AML_MONITORING  ')).toBe('AML_MONITORING');
  });

  it('falls back to DIRECT_CARE when unset or blank', () => {
    expect(resolveDefaultConsentPurpose(undefined)).toBe('DIRECT_CARE');
    expect(resolveDefaultConsentPurpose('')).toBe('DIRECT_CARE');
    expect(resolveDefaultConsentPurpose('   ')).toBe('DIRECT_CARE');
  });
});

describe('generateConsentRoutes', () => {
  it('maps the core result onto a REST response', async () => {
    const { deps } = mockDeps();
    const routes = generateConsentRoutes(deps);
    const route = routes.find((r) => r.method === 'POST')!;
    const ctx = { user: { id: 'u1', roles: ['admin'] }, requestContext: { tenantId: 'default', traceId: 't1' } } as never;
    const ok = await route.handler({ body: { subject: 'p-1' } } as never, ctx);
    expect(ok.status).toBe(200);
    const denied = await route.handler(
      { body: { subject: 'p-1' } } as never,
      { user: { id: 'u2', roles: ['receptionist'] }, requestContext: { tenantId: 'default', traceId: 't1' } } as never,
    );
    expect(denied.status).toBe(403);
  });
});

describe('assertConsentConfig (boot fail-fast)', () => {
  it('accepts the NHS default (no CONSENT_PURPOSES → standard preset)', () => {
    expect(() => assertConsentConfig({
      consentPurposes: undefined, defaultPurpose: 'DIRECT_CARE', exemptionEnabled: true, consentSubjectTypes: undefined,
    })).not.toThrow();
  });

  it('accepts a coherent non-NHS config', () => {
    expect(() => assertConsentConfig({
      consentPurposes: ['KYC', 'AML_MONITORING'], defaultPurpose: 'KYC', exemptionEnabled: false, consentSubjectTypes: ['Customer'],
    })).not.toThrow();
  });

  it('throws when DEFAULT_CONSENT_PURPOSE is outside the configured vocabulary', () => {
    expect(() => assertConsentConfig({
      consentPurposes: ['KYC', 'AML_MONITORING'], defaultPurpose: 'DIRECT_CARE', exemptionEnabled: false,
    })).toThrow(/DEFAULT_CONSENT_PURPOSE.*not in.*CONSENT_PURPOSES/);
  });

  it('throws when the exemption is enabled with more than one consent-subject type', () => {
    expect(() => assertConsentConfig({
      defaultPurpose: 'DIRECT_CARE', exemptionEnabled: true, consentSubjectTypes: ['Patient', 'Customer'],
    })).toThrow(/exemption.*single CONSENT_SUBJECT_TYPES/);
  });

  it('allows multiple subject types when the exemption is OFF', () => {
    expect(() => assertConsentConfig({
      defaultPurpose: 'DIRECT_CARE', exemptionEnabled: false, consentSubjectTypes: ['Patient', 'Customer'],
    })).not.toThrow();
  });
});
