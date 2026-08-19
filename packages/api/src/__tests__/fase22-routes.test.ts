/**
 * Fase 22 REST route integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import {
  InMemoryWorkshopPlatformService,
  InMemoryCommandExchangeService,
  InMemoryObjectSetFilterStore,
  InMemoryGraphService,
  InMemoryWorkshopUxService,
  InMemoryValueFormattingService,
  InMemoryDesignSystemService,
  InMemoryOntologyChangeHistoryService,
} from '@altius/storage-memory';
import { InMemoryObjectSetStore } from '@altius/engine';
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
    query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    aggregate: vi.fn().mockResolvedValue({ groups: [], totalCount: 0 }),
    search: vi.fn().mockResolvedValue({ items: [] }),
  } as never;
  const objectSetStore = new InMemoryObjectSetStore();
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
    objectSetManager: objectSetStore as unknown as never,
    workshopPlatformService: new InMemoryWorkshopPlatformService(),
    workshopUxService: new InMemoryWorkshopUxService(),
    valueFormattingService: new InMemoryValueFormattingService(),
    designSystemService: new InMemoryDesignSystemService(),
    ontologyChangeHistoryService: new InMemoryOntologyChangeHistoryService(),
    commandExchangeService: new InMemoryCommandExchangeService(),
    objectSetFilterStore: new InMemoryObjectSetFilterStore(),
    graphService: new InMemoryGraphService(),
  } as ApiDependencies;
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Fase 22 REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = createDeps(parsed);
  const routes = generateRestRoutes(parsed, deps);

  it('registers mobile workshop routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/workshop/mobile/preview')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/workshop/mobile/launch')).toBeTruthy();
  });

  it('registers cross-app command routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/commands')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/commands')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/commands/:id/execute')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/commands/drag-drop')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/commands/pair')).toBeTruthy();
  });

  it('registers object-set filter state routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/object-sets/:id/filter-state')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/object-sets/:id/filter-state')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/object-sets/:id/apply-filter')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/object-sets/:id/extract-variables')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/object-sets/:id/combine')).toBeTruthy();
  });

  it('registers graph visualization routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/patients/:id/graph')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/graph')).toBeTruthy();
    expect(findRoute(routes, 'GET', '/api/v1/ontology/graph/views')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/graph/views')).toBeTruthy();
  });

  it('declares and executes a cross-app command', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const declare = findRoute(routes, 'POST', '/api/v1/commands');
    const dRes = await declare.handler(
      restReq('POST', '/api/v1/commands', { name: 'SelectPatient', sourceAppId: 'app-a', targetAppIds: ['app-b'] }),
      ctx,
    );
    expect(dRes.status).toBe(201);
    const cmd = (dRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    const id = String(cmd['id']);

    const exec = findRoute(routes, 'POST', '/api/v1/commands/:id/execute');
    const eRes = await exec.handler(
      restReq('POST', `/api/v1/commands/${id}/execute`, { targetAppId: 'app-b', payload: { patientId: '1' } }, { id }),
      ctx,
    );
    expect(eRes.status).toBe(200);
  });

  it('saves and applies an object-set filter state', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const save = findRoute(routes, 'POST', '/api/v1/object-sets/:id/filter-state');
    const sRes = await save.handler(
      restReq('POST', '/api/v1/object-sets/1/filter-state', { name: 'Active', chips: [{ id: 'c1', field: 'status', operator: 'eq', value: 'ACTIVE' }] }, { id: '1' }),
      ctx,
    );
    expect(sRes.status).toBe(201);

    const apply = findRoute(routes, 'POST', '/api/v1/object-sets/:id/apply-filter');
    const aRes = await apply.handler(
      restReq('POST', '/api/v1/object-sets/1/apply-filter', { chips: [{ id: 'c1', field: 'status', operator: 'eq', value: 'ACTIVE' }] }, { id: '1' }),
      ctx,
    );
    expect(aRes.status).toBe(200);
  });
});
