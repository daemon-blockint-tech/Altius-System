/**
 * API Tooling REST route integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import { InMemoryKioskService, InMemoryLayoutDeviceCaptureService, InMemoryOntologyManagerService, InMemoryWorkshopUxService, InMemoryValueFormattingService, InMemoryDesignSystemService, InMemoryOntologyChangeHistoryService } from '@altius/storage-memory';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String!
  status: String!
}

enum Status { ACTIVE DISCHARGED }
`;

function mockUser(tenantId: string): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'Test', email: 't@t.uk', roles: ['admin'], groups: [], tenantId };
}

function createCtx(deps: ApiDependencies, tenantId: string): ResolverContext {
  const u = mockUser(tenantId);
  return { requestContext: { tenantId, actorId: u.id, traceId: 'trace-test' }, user: u, deps };
}

function restReq(method: string, path: string, body?: unknown, params?: Record<string, string>, query?: Record<string, string | string[] | undefined>): RestRequest {
  return { method, path, params: params ?? {}, query: query ?? {}, body: body ?? {}, user: mockUser('tenant-1') };
}

function createDeps(schema: ReturnType<typeof parseOdl>): ApiDependencies {
  const objectManager = {
    get: vi.fn().mockResolvedValue(null),
    query: vi.fn().mockResolvedValue({ items: [] }),
    aggregate: vi.fn().mockResolvedValue({ groups: [], totalCount: 0 }),
    search: vi.fn().mockResolvedValue({ items: [] }),
  } as never;
  return {
    schema,
    objectManager,
    linkManager: {} as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
    dataFreshnessService: {
      recordSync: vi.fn().mockResolvedValue({}),
      getFreshnessForType: vi.fn().mockResolvedValue({}),
      getFreshnessForDatasource: vi.fn().mockResolvedValue(null),
      queryFreshness: vi.fn().mockResolvedValue([]),
      getSummary: vi.fn().mockResolvedValue({}),
      deleteFreshness: vi.fn().mockResolvedValue(undefined),
    } as never,
    functionExecutor: {} as never,
    kioskService: new InMemoryKioskService(),
    layoutDeviceCaptureService: new InMemoryLayoutDeviceCaptureService(),
    ontologyManagerService: new InMemoryOntologyManagerService(),
    workshopUxService: new InMemoryWorkshopUxService(),
    valueFormattingService: new InMemoryValueFormattingService(),
    designSystemService: new InMemoryDesignSystemService(),
    ontologyChangeHistoryService: new InMemoryOntologyChangeHistoryService(),
  } as ApiDependencies;
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('API Tooling REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = createDeps(parsed);
  const routes = generateRestRoutes(parsed, deps);

  it('registers per-object data freshness routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/patients/freshness')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/patients/sync')).toBeTruthy();
  });

  it('registers ontology change history routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/ontology/changes')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/changes/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/restore')).toBeTruthy();
  });

  it('registers value formatting routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/patients/format')).toBeTruthy();
  });

  it('registers design system theme routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/theme')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/theme')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/theme/:id')).toBeTruthy();
    expect(findRoute(routes, 'PATCH', '/api/v1/theme/:id')).toBeTruthy();
    expect(findRoute(routes, 'DELETE', '/api/v1/theme/:id')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/modules/:id/theme')).toBeTruthy();
    expect(findRoute(routes, 'PUT', '/api/v1/modules/:id/theme')).toBeTruthy();
  });

  it('registers live data polling routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/patients/aggregate/poll')).toBeTruthy();
  });

  it('registers device capture routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/captures')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/captures')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/captures/:id')).toBeTruthy();
    expect(findRoute(routes, 'DELETE', '/api/v1/captures/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/deep-links/resolve')).toBeTruthy();
  });

  it('registers ontology manager and metadata routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/ontology/manager/types')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/manager/types/:name')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/manager/actions')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/manager/functions')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/manager/proposals')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/manager/proposals')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/manager/proposals/:id/apply')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/metadata/catalog')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/metadata/search')).toBeTruthy();
  });

  it('registers kiosk mode routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/kiosk/sessions')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/kiosk/sessions')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/kiosk/sessions/:id')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/kiosk/sessions/:id/refresh')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/kiosk/sessions/:id/revoke')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/kiosk/sessions/:id/access/:objectType')).toBeTruthy();
  });

  it('creates a kiosk session and reads it back', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const create = findRoute(routes, 'POST', '/api/v1/kiosk/sessions');
    const createRes = await create.handler(
      restReq('POST', '/api/v1/kiosk/sessions', { name: 'Front desk', location: 'lobby', permissions: { objectTypes: ['Patient'], readOnly: true }, durationSeconds: 3600 }),
      ctx,
    );
    expect(createRes.status).toBe(201);
    const session = (createRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    const id = String(session['id']);

    const get = findRoute(routes, 'GET', '/api/v1/kiosk/sessions/:id');
    const getRes = await get.handler(restReq('GET', `/api/v1/kiosk/sessions/${id}`, {}, { id }), ctx);
    expect(getRes.status).toBe(200);
  });

  it('creates and retrieves a design system theme', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const create = findRoute(routes, 'POST', '/api/v1/theme');
    const res = await create.handler(restReq('POST', '/api/v1/theme', { name: 'Clinical', isDefault: true, palette: { primary: '#2563eb' } }), ctx);
    expect(res.status).toBe(201);
    const theme = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(theme['name']).toBe('Clinical');
  });
});
