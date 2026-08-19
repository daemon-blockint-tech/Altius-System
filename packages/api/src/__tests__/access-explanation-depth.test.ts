/**
 * Access explanation must agree with the enforcement path, and simulating
 * another principal must be privileged.
 *
 * Four things are pinned here, each of which the previous implementation got
 * wrong in the direction that misleads rather than errors:
 *
 *  1. Marking checks were a hardcoded `passed: true` placeholder, so a caller
 *     lacking a mandatory marking was told GRANTED while the read path
 *     withheld the row.
 *  2. Consent was likewise a placeholder.
 *  3. There was no way to ask about anyone but yourself, so an admin could not
 *     answer "why can't this user see that record?".
 *  4. A redacted read carried `_redactedFields` with no reason anywhere; there
 *     was no surface that said which policy withheld a field.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { DefaultAccessExplanationService } from '@altius/security';
import { MarkingPolicy } from '@altius/security';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary name: String! secret: String @sensitive }
`;

const TENANT = 'tenant-1';

function user(roles: string[], markings?: string[], id = 'user-1'): AuthenticatedUserInfo {
  return { id, name: 'Test', email: 't@t.uk', roles, groups: [], tenantId: TENANT, ...(markings ? { markings } : {}) };
}

function deps(
  svc: DefaultAccessExplanationService,
  visibleFields?: Set<string>,
): ApiDependencies {
  return {
    schema: parseOdl(ODL),
    objectManager: {} as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(visibleFields),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    accessExplanationService: svc,
  } as ApiDependencies;
}

function ctx(d: ApiDependencies, u: AuthenticatedUserInfo): ResolverContext {
  return { requestContext: { tenantId: TENANT, actorId: u.id, traceId: 'trace-test' }, user: u, deps: d };
}

function req(body: unknown, u: AuthenticatedUserInfo): RestRequest {
  return { method: 'POST', path: '/api/v1/security/explain', params: {}, query: {}, body, user: u };
}

function explainRoute(d: ApiDependencies) {
  const route = generateRestRoutes(d.schema, d).find(
    r => r.method === 'POST' && r.pattern === '/api/v1/security/explain',
  );
  if (!route) throw new Error('explain route not registered');
  return route;
}

function authzStub(allowed = true) {
  return {
    check: vi.fn().mockResolvedValue(allowed),
    getVisibleFields: vi.fn().mockReturnValue(undefined),
  } as never;
}

describe('marking checks are real, not a placeholder', () => {
  const policy = new MarkingPolicy({
    markings: [{ name: 'PII' }],
    byObjectType: { Widget: ['PII'] },
  });

  it('denies a principal who lacks a required marking', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      markingPolicy: policy,
    });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget', markings: [] });
    expect(result.granted).toBe(false);
    const marking = result.reasons.find(r => r.check === 'marking');
    expect(marking?.passed).toBe(false);
    expect(marking?.detail).toContain('PII');
  });

  it('grants when the principal holds it', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      markingPolicy: policy,
    });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget', markings: ['PII'] });
    expect(result.granted).toBe(true);
    expect(result.reasons.find(r => r.check === 'marking')?.passed).toBe(true);
  });

  it('says markings are unconfigured rather than claiming a pass, when there is no policy', async () => {
    const svc = new DefaultAccessExplanationService({ authorizationService: authzStub(true) });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget' });
    expect(result.reasons.find(r => r.check === 'marking')?.detail).toContain('No marking policy');
  });
});

describe('consent checks are real for consent-gated types', () => {
  it('denies when consent is withheld', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      consentSubjectTypes: ['Widget'],
      consent: { checkConsent: vi.fn().mockResolvedValue({ allowed: false, basis: 'explicit_consent' }) },
    });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget', objectId: 'w-1' });
    expect(result.granted).toBe(false);
    const consent = result.reasons.find(r => r.check === 'consent');
    expect(consent?.passed).toBe(false);
    expect(consent?.detail).toContain('explicit_consent');
  });

  it('fails the check when the consent service errors rather than assuming consent', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      consentSubjectTypes: ['Widget'],
      consent: { checkConsent: vi.fn().mockRejectedValue(new Error('consent store down')) },
    });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget', objectId: 'w-1' });
    expect(result.granted).toBe(false);
    expect(result.reasons.find(r => r.check === 'consent')?.detail).toContain('consent store down');
  });

  it('marks a non-gated type as not applicable', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      consentSubjectTypes: ['Patient'],
      consent: { checkConsent: vi.fn() },
    });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget', objectId: 'w-1' });
    expect(result.reasons.find(r => r.check === 'consent')?.detail).toContain('not a consent-gated type');
  });
});

describe('field-level denial reasons', () => {
  it('explains which requested fields are withheld and why', async () => {
    const svc = new DefaultAccessExplanationService({
      authorizationService: {
        check: vi.fn().mockResolvedValue(true),
        getVisibleFields: vi.fn().mockReturnValue(new Set(['id', 'name'])),
      } as never,
    });
    const result = await svc.explain({
      tenantId: TENANT,
      userId: 'user-1',
      objectType: 'Widget',
      roles: ['clinician'],
      fields: ['name', 'secret'],
    });
    expect(result.fields).toEqual([
      { field: 'name', visible: true, detail: expect.stringContaining('Visible') },
      { field: 'secret', visible: false, detail: expect.stringContaining('Withheld') },
    ]);
    // A withheld field masks a value; it does not deny the read.
    expect(result.granted).toBe(true);
    expect(result.reasons.find(r => r.check === 'field_policy')?.detail).toContain('secret');
  });

  it('omits the field block when no fields were asked about', async () => {
    const svc = new DefaultAccessExplanationService({ authorizationService: authzStub(true) });
    const result = await svc.explain({ tenantId: TENANT, userId: 'user-1', objectType: 'Widget' });
    expect(result.fields).toBeUndefined();
  });
});

describe('POST /api/v1/security/explain — principal simulation', () => {
  const svc = () => new DefaultAccessExplanationService({ authorizationService: authzStub(true) });

  it('explains the caller by default and does not mark it simulated', async () => {
    const d = deps(svc());
    const caller = user(['clinician']);
    const res = await explainRoute(d).handler(req({ objectType: 'Widget' }, caller), ctx(d, caller));
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['userId']).toBe('user-1');
    expect(data['simulatedFor']).toBeUndefined();
  });

  it('lets an admin explain another principal and flags it as simulated', async () => {
    const d = deps(svc());
    const admin = user(['admin']);
    const res = await explainRoute(d).handler(
      req({ objectType: 'Widget', subjectUserId: 'user-2', roles: ['clinician'] }, admin),
      ctx(d, admin),
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['userId']).toBe('user-2');
    expect(data['simulatedFor']).toBe('user-2');
    expect(String(data['summary'])).toContain('simulated for user-2');
  });

  it('refuses simulation for a non-admin — another principal\'s permissions are not public', async () => {
    const d = deps(svc());
    const caller = user(['clinician']);
    const res = await explainRoute(d).handler(
      req({ objectType: 'Widget', subjectUserId: 'user-2' }, caller),
      ctx(d, caller),
    );
    expect(res.status).toBe(403);
  });

  it('ignores caller-supplied markings when explaining the caller, so a self-answer cannot be inflated', async () => {
    const explainer = new DefaultAccessExplanationService({
      authorizationService: authzStub(true),
      markingPolicy: new MarkingPolicy({ markings: [{ name: 'PII' }], byObjectType: { Widget: ['PII'] } }),
    });
    const d = deps(explainer);
    const caller = user(['clinician'], []);
    const res = await explainRoute(d).handler(
      // Claiming to hold PII in the body must not change the answer.
      req({ objectType: 'Widget', markings: ['PII'] }, caller),
      ctx(d, caller),
    );
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['granted']).toBe(false);
  });
});
