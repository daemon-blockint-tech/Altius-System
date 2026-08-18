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

  it('returns no security routes when all services are absent', async () => {
    const deps = createDeps(parsed);
    const routes = generateRestRoutes(parsed, deps);
    const securityRoutes = routes.filter(r => r.pattern.startsWith('/api/v1/security/'));
    expect(securityRoutes).toHaveLength(0);
  });
});
