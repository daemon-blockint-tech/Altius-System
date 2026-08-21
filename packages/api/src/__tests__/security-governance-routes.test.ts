/**
 * Integration tests for security governance REST routes.
 *
 * Verifies access explanation (using the real DefaultAccessExplanationService
 * with a mock AuthorizationService), justification capture, and scoped
 * session management — all through the generator-style route layer.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryJustificationStore, InMemoryScopedSessionStore } from '@altius/storage-memory';
import { DefaultAccessExplanationService } from '@altius/security';
import { HoldApprovePolicyGuard } from '@altius/actions';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Widget @objectType {
  id: ID! @primary
  name: String!
}
`;

function mockUser(tenantId: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId };
}

function createDeps(
  schema: ReturnType<typeof parseOdl>,
  opts?: {
    justificationStore?: InMemoryJustificationStore;
    accessExplanationService?: DefaultAccessExplanationService;
    scopedSessionStore?: InMemoryScopedSessionStore;
    agentHoldGuard?: HoldApprovePolicyGuard;
  },
): ApiDependencies {
  return {
    schema,
    objectManager: {} as never,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    ...(opts?.justificationStore ? { justificationStore: opts.justificationStore } : {}),
    ...(opts?.accessExplanationService ? { accessExplanationService: opts.accessExplanationService } : {}),
    ...(opts?.scopedSessionStore ? { scopedSessionStore: opts.scopedSessionStore } : {}),
    ...(opts?.agentHoldGuard ? { agentHoldGuard: opts.agentHoldGuard } : {}),
  } as ApiDependencies;
}

function createCtx(deps: ApiDependencies, tenantId: string): ResolverContext {
  const u = mockUser(tenantId);
  return { requestContext: { tenantId, actorId: u.id, traceId: 'trace-test' }, user: u, deps };
}

function restReq(method: string, path: string, body?: unknown, params?: Record<string, string>, query?: Record<string, string | string[] | undefined>): RestRequest {
  return { method, path, params: params ?? {}, query: query ?? {}, body: body ?? {}, user: mockUser('tenant-1') };
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Security governance REST routes', () => {
  const parsed = parseOdl(ODL);

  // ── Access explanation ──

  describe('access explanation', () => {
    it('explains access using the real DefaultAccessExplanationService', async () => {
      const authz = {
        check: vi.fn().mockResolvedValue(true),
      };
      const svc = new DefaultAccessExplanationService({ authorizationService: authz as never });
      const deps = createDeps(parsed, { accessExplanationService: svc });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const route = findRoute(routes, 'POST', '/api/v1/security/explain');
      const res = await route.handler(
        restReq('POST', '/api/v1/security/explain', { objectType: 'Patient', objectId: 'p1', action: 'read' }),
        ctx,
      );
      expect(res.status).toBe(200);
      const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(data['granted']).toBe(true);
      expect(data['reasons']).toBeDefined();
      expect(authz.check).toHaveBeenCalledWith('user:user-1', 'read', 'Patient:p1', 'tenant-1');
    });

    it('explains denial when authz rejects', async () => {
      const authz = {
        check: vi.fn().mockResolvedValue(false),
      };
      const svc = new DefaultAccessExplanationService({ authorizationService: authz as never });
      const deps = createDeps(parsed, { accessExplanationService: svc });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const route = findRoute(routes, 'POST', '/api/v1/security/explain');
      const res = await route.handler(
        restReq('POST', '/api/v1/security/explain', { objectType: 'Patient' }),
        ctx,
      );
      expect(res.status).toBe(200);
      const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(data['granted']).toBe(false);
    });

    it('returns 400 when objectType is missing', async () => {
      const authz = { check: vi.fn() };
      const svc = new DefaultAccessExplanationService({ authorizationService: authz as never });
      const deps = createDeps(parsed, { accessExplanationService: svc });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const route = findRoute(routes, 'POST', '/api/v1/security/explain');
      const res = await route.handler(restReq('POST', '/api/v1/security/explain', {}), ctx);
      expect(res.status).toBe(400);
    });
  });

  // ── Justifications ──

  describe('justifications', () => {
    it('creates and retrieves a justification', async () => {
      const store = new InMemoryJustificationStore();
      const deps = createDeps(parsed, { justificationStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/justifications');
      const res = await createRoute.handler(
        restReq('POST', '/api/v1/security/justifications', {
          actionName: 'DischargePatient', justification: 'Clinical need', category: 'routine',
        }),
        ctx,
      );
      expect(res.status).toBe(201);
      const record = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(record['actionName']).toBe('DischargePatient');

      const getRoute = findRoute(routes, 'GET', '/api/v1/security/justifications/:id');
      const getRes = await getRoute.handler(
        restReq('GET', `/api/v1/security/justifications/${record['id']}`, {}, { id: record['id'] as string }),
        ctx,
      );
      expect(getRes.status).toBe(200);
    });

    it('lists justifications', async () => {
      const store = new InMemoryJustificationStore();
      const deps = createDeps(parsed, { justificationStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      // Create two justifications
      const createRoute = findRoute(routes, 'POST', '/api/v1/security/justifications');
      await createRoute.handler(restReq('POST', '/api/v1/security/justifications', { actionName: 'A1', justification: 'J1', category: 'routine' }), ctx);
      await createRoute.handler(restReq('POST', '/api/v1/security/justifications', { actionName: 'A2', justification: 'J2', category: 'emergency' }), ctx);

      const listRoute = findRoute(routes, 'GET', '/api/v1/security/justifications');
      const res = await listRoute.handler(restReq('GET', '/api/v1/security/justifications'), ctx);
      expect(res.status).toBe(200);
      const data = (res.body as Record<string, unknown>)['data'] as unknown[];
      expect(data).toHaveLength(2);
    });

    it('approves a justification', async () => {
      const store = new InMemoryJustificationStore();
      const deps = createDeps(parsed, { justificationStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/justifications');
      const createRes = await createRoute.handler(restReq('POST', '/api/v1/security/justifications', { actionName: 'A', justification: 'J', category: 'break-glass' }), ctx);
      const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

      const approveRoute = findRoute(routes, 'POST', '/api/v1/security/justifications/:id/approve');
      const res = await approveRoute.handler(restReq('POST', `/api/v1/security/justifications/${id}/approve`, {}, { id }), ctx);
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown justification', async () => {
      const store = new InMemoryJustificationStore();
      const deps = createDeps(parsed, { justificationStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const getRoute = findRoute(routes, 'GET', '/api/v1/security/justifications/:id');
      const res = await getRoute.handler(restReq('GET', '/api/v1/security/justifications/nonexistent', {}, { id: 'nonexistent' }), ctx);
      expect(res.status).toBe(404);
    });

    it('isolates tenants', async () => {
      const store = new InMemoryJustificationStore();
      const deps = createDeps(parsed, { justificationStore: store });
      const routes = generateRestRoutes(parsed, deps);

      // Tenant A creates a justification
      const ctxA = createCtx(deps, 'tenant-a');
      const createRoute = findRoute(routes, 'POST', '/api/v1/security/justifications');
      const createRes = await createRoute.handler(restReq('POST', '/api/v1/security/justifications', { actionName: 'Secret', justification: 'J', category: 'audit' }), ctxA);
      const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

      // Tenant B cannot see it
      const ctxB = createCtx(deps, 'tenant-b');
      const getRoute = findRoute(routes, 'GET', '/api/v1/security/justifications/:id');
      const res = await getRoute.handler(restReq('GET', `/api/v1/security/justifications/${id}`, {}, { id }), ctxB);
      expect(res.status).toBe(404);
    });
  });

  // ── Scoped sessions ──

  describe('scoped sessions', () => {
    function nonAdminCtx(deps: ApiDependencies, id: string): { user: AuthenticatedUserInfo; ctx: ResolverContext } {
      const user: AuthenticatedUserInfo = { id, name: 'NA', email: 'na@t.uk', roles: ['clinician'], groups: [], tenantId: 'tenant-1' };
      return { user, ctx: { requestContext: { tenantId: 'tenant-1', actorId: id, traceId: 'trace-test' }, user, deps } };
    }

    it('gates cross-user create and non-creator revoke behind admin roles', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const { user: attacker, ctx: attackerCtx } = nonAdminCtx(deps, 'attacker');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/sessions');
      // Cross-user create would strip the victim's markings — denied.
      const crossRes = await createRoute.handler(
        { ...restReq('POST', '/api/v1/security/sessions', { userId: 'victim', allowedMarkings: [], label: 'strip' }), user: attacker },
        attackerCtx,
      );
      expect(crossRes.status).toBe(403);

      // Self-service create stays allowed (Foundry: users pick their own session).
      const selfRes = await createRoute.handler(
        { ...restReq('POST', '/api/v1/security/sessions', { userId: 'attacker', allowedMarkings: ['OFFICIAL'], label: 'own' }), user: attacker },
        attackerCtx,
      );
      expect(selfRes.status).toBe(201);

      // Revoking an admin-imposed session would be the subject's escape hatch — denied.
      const imposed = await store.create('tenant-1', 'admin-1', {
        userId: 'attacker', allowedMarkings: ['OFFICIAL'], label: 'imposed', durationSeconds: 3600,
      });
      const revokeRoute = findRoute(routes, 'POST', '/api/v1/security/sessions/:id/revoke');
      const revokeRes = await revokeRoute.handler(
        { ...restReq('POST', `/api/v1/security/sessions/${imposed.id}/revoke`, {}, { id: imposed.id }), user: attacker },
        attackerCtx,
      );
      expect(revokeRes.status).toBe(403);
    });

    it('scopes reads to own sessions for non-admins', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const { user: reader, ctx: readerCtx } = nonAdminCtx(deps, 'reader');

      const own = await store.create('tenant-1', 'admin-1', { userId: 'reader', allowedMarkings: ['OFFICIAL'], label: 'own', durationSeconds: 3600 });
      const other = await store.create('tenant-1', 'admin-1', { userId: 'someone-else', allowedMarkings: ['SECRET'], label: 'other', durationSeconds: 3600 });

      const listRoute = findRoute(routes, 'GET', '/api/v1/security/sessions');
      const listRes = await listRoute.handler(
        { ...restReq('GET', '/api/v1/security/sessions'), user: reader },
        readerCtx,
      );
      const listed = (listRes.body as Record<string, unknown>)['data'] as { id: string }[];
      expect(listed.map(s => s.id)).toEqual([own.id]);

      const getRoute = findRoute(routes, 'GET', '/api/v1/security/sessions/:id');
      const getRes = await getRoute.handler(
        { ...restReq('GET', `/api/v1/security/sessions/${other.id}`, {}, { id: other.id }), user: reader },
        readerCtx,
      );
      expect(getRes.status).toBe(404);
    });

    it('creates and retrieves a scoped session', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/sessions');
      const res = await createRoute.handler(
        restReq('POST', '/api/v1/security/sessions', {
          userId: 'user-1', allowedMarkings: ['OFFICIAL'], label: 'Test session', durationSeconds: 3600,
        }),
        ctx,
      );
      expect(res.status).toBe(201);
      const session = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(session['label']).toBe('Test session');

      const getRoute = findRoute(routes, 'GET', '/api/v1/security/sessions/:id');
      const getRes = await getRoute.handler(
        restReq('GET', `/api/v1/security/sessions/${session['id']}`, {}, { id: session['id'] as string }),
        ctx,
      );
      expect(getRes.status).toBe(200);
    });

    it('checks if a marking is allowed', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/sessions');
      const createRes = await createRoute.handler(
        restReq('POST', '/api/v1/security/sessions', {
          userId: 'user-1', allowedMarkings: ['OFFICIAL', 'SENSITIVE'], label: 'Test', durationSeconds: 3600,
        }),
        ctx,
      );
      const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

      const checkRoute = findRoute(routes, 'GET', '/api/v1/security/sessions/:id/check');
      const allowedRes = await checkRoute.handler(
        restReq('GET', `/api/v1/security/sessions/${id}/check`, {}, { id }, { marking: 'OFFICIAL' }),
        ctx,
      );
      expect(allowedRes.status).toBe(200);
      const allowedData = (allowedRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(allowedData['allowed']).toBe(true);

      const deniedRes = await checkRoute.handler(
        restReq('GET', `/api/v1/security/sessions/${id}/check`, {}, { id }, { marking: 'SECRET' }),
        ctx,
      );
      const deniedData = (deniedRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(deniedData['allowed']).toBe(false);
    });

    it('revokes a scoped session', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);
      const ctx = createCtx(deps, 'tenant-1');

      const createRoute = findRoute(routes, 'POST', '/api/v1/security/sessions');
      const createRes = await createRoute.handler(
        restReq('POST', '/api/v1/security/sessions', { userId: 'user-1', allowedMarkings: [], label: 'Test', durationSeconds: 3600 }),
        ctx,
      );
      const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

      const revokeRoute = findRoute(routes, 'POST', '/api/v1/security/sessions/:id/revoke');
      const res = await revokeRoute.handler(restReq('POST', `/api/v1/security/sessions/${id}/revoke`, {}, { id }), ctx);
      expect(res.status).toBe(200);
    });

    it('isolates tenants', async () => {
      const store = new InMemoryScopedSessionStore();
      const deps = createDeps(parsed, { scopedSessionStore: store });
      const routes = generateRestRoutes(parsed, deps);

      const ctxA = createCtx(deps, 'tenant-a');
      const createRoute = findRoute(routes, 'POST', '/api/v1/security/sessions');
      const createRes = await createRoute.handler(
        restReq('POST', '/api/v1/security/sessions', { userId: 'user-1', allowedMarkings: ['SECRET'], label: 'A-only', durationSeconds: 3600 }),
        ctxA,
      );
      const id = ((createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>)['id'] as string;

      const ctxB = createCtx(deps, 'tenant-b');
      const getRoute = findRoute(routes, 'GET', '/api/v1/security/sessions/:id');
      const res = await getRoute.handler(restReq('GET', `/api/v1/security/sessions/${id}`, {}, { id }), ctxB);
      expect(res.status).toBe(404);
    });
  });

  // ── Absence ──

  describe('agent holds (human-in-the-loop approvals)', () => {
    async function setupHolds() {
      const guard = new HoldApprovePolicyGuard();
      const deps = createDeps(parsed, { agentHoldGuard: guard });
      const routes = generateRestRoutes(parsed, deps);
      const pending = await guard.evaluate('DischargePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 'tenant-1' });
      const foreign = await guard.evaluate('DischargePatient', 'high', { agentId: 'agent-2', dryRun: false, tenantId: 'tenant-OTHER' });
      return { guard, deps, routes, holdId: pending.holdId!, foreignHoldId: foreign.holdId! };
    }

    it('gates list and approve behind approver roles', async () => {
      const { routes, deps, holdId } = await setupHolds();
      const nonAdmin: AuthenticatedUserInfo = { id: 'peon', name: 'P', email: 'p@t.uk', roles: ['clinician'], groups: [], tenantId: 'tenant-1' };
      const ctx: ResolverContext = { requestContext: { tenantId: 'tenant-1', actorId: 'peon', traceId: 'trace-test' }, user: nonAdmin, deps };

      const listRoute = findRoute(routes, 'GET', '/api/v1/agent-holds');
      const listRes = await listRoute.handler({ ...restReq('GET', '/api/v1/agent-holds'), user: nonAdmin }, ctx);
      expect(listRes.status).toBe(403);

      const approveRoute = findRoute(routes, 'POST', '/api/v1/agent-holds/:id/approve');
      const apprRes = await approveRoute.handler({ ...restReq('POST', `/api/v1/agent-holds/${holdId}/approve`, {}, { id: holdId }), user: nonAdmin }, ctx);
      expect(apprRes.status).toBe(403);
    });

    it('lists only own-tenant holds and approves one so the agent can retry', async () => {
      const { guard, routes, deps, holdId, foreignHoldId } = await setupHolds();
      const ctx = createCtx(deps, 'tenant-1');

      const listRoute = findRoute(routes, 'GET', '/api/v1/agent-holds');
      const listRes = await listRoute.handler(restReq('GET', '/api/v1/agent-holds'), ctx);
      expect(listRes.status).toBe(200);
      const ids = ((listRes.body as Record<string, unknown>)['data'] as { id: string }[]).map(h => h.id);
      expect(ids).toContain(holdId);
      expect(ids).not.toContain(foreignHoldId);

      const approveRoute = findRoute(routes, 'POST', '/api/v1/agent-holds/:id/approve');
      const apprRes = await approveRoute.handler(restReq('POST', `/api/v1/agent-holds/${holdId}/approve`, {}, { id: holdId }), ctx);
      expect(apprRes.status).toBe(200);
      expect(await guard.isApproved(holdId)).toBe(true);
    });

    it('hides other-tenant holds from approve/reject (404), and reject records the reason', async () => {
      const { guard, routes, deps, holdId, foreignHoldId } = await setupHolds();
      const ctx = createCtx(deps, 'tenant-1');

      const approveRoute = findRoute(routes, 'POST', '/api/v1/agent-holds/:id/approve');
      const crossRes = await approveRoute.handler(restReq('POST', `/api/v1/agent-holds/${foreignHoldId}/approve`, {}, { id: foreignHoldId }), ctx);
      expect(crossRes.status).toBe(404);
      expect(await guard.isApproved(foreignHoldId)).toBe(false);

      const rejectRoute = findRoute(routes, 'POST', '/api/v1/agent-holds/:id/reject');
      const rejRes = await rejectRoute.handler(restReq('POST', `/api/v1/agent-holds/${holdId}/reject`, { reason: 'not justified' }, { id: holdId }), ctx);
      expect(rejRes.status).toBe(200);
      expect((await guard.getHold(holdId))!.status).toBe('rejected');
      expect((await guard.getHold(holdId))!.reason).toBe('not justified');
    });
  });

  it('returns no security routes when all services are absent', async () => {
    const deps = createDeps(parsed);
    const routes = generateRestRoutes(parsed, deps);
    const securityRoutes = routes.filter(r => r.pattern.startsWith('/api/v1/security/'));
    expect(securityRoutes).toHaveLength(0);
  });
});
