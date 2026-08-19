/**
 * Fase 23 REST route integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import {
  InMemoryTransformExpressionService,
  InMemoryOntologyChangeHistoryService,
} from '@altius/storage-memory';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

scalar GeoShape
scalar Marking
scalar Cipher

type Patient @objectType {
  id: ID! @primary
  name: String!
  shape: GeoShape
  tags: [String!]
  marking: Marking
}

type Admit @actionType {
  patientId: ID! @param
  note: String @param
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
    transformExpressionService: new InMemoryTransformExpressionService(),
    ontologyChangeHistoryService: new InMemoryOntologyChangeHistoryService(),
  } as ApiDependencies;
}

function findRoute(routes: ReturnType<typeof generateRestRoutes>, method: string, pattern: string) {
  const route = routes.find(r => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`Route not found: ${method} ${pattern}`);
  return route;
}

describe('Fase 23 REST routes', () => {
  const parsed = parseOdl(ODL);
  const deps = createDeps(parsed);
  const routes = generateRestRoutes(parsed, deps);

  it('registers action form config routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/actions/Admit/form')).toBeTruthy();
  });

  it('registers ontology rich property routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/ontology/types/:type/property-types')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/validate-property')).toBeTruthy();
  });

  it('registers ontology change management routes', () => {
    expect(findRoute(routes, 'POST', '/api/v1/ontology/changes')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/validate')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/apply')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/save')).toBeTruthy();
  });

  it('registers transform expression routes', () => {
    expect(findRoute(routes, 'GET', '/api/v1/transform/functions')).toBeTruthy();
    expect(findRoute(routes, 'POST', '/api/v1/transform/evaluate')).toBeTruthy();
  });

  it('returns an action form config with fields', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/actions/Admit/form');
    const res = await route.handler(restReq('POST', '/api/v1/actions/Admit/form', {}), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['name']).toBe('Admit');
    expect(Array.isArray(data['fields'])).toBe(true);
    expect((data['fields'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('introspects rich property types', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'GET', '/api/v1/ontology/types/:type/property-types');
    const res = await route.handler(restReq('GET', '/api/v1/ontology/types/Patient/property-types', undefined, { type: 'Patient' }), ctx);
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['type']).toBe('Patient');
    const properties = data['properties'] as Array<Record<string, unknown>>;
    expect(properties.some(p => p['name'] === 'shape' && p['kind'] === 'geoshape')).toBe(true);
    expect(properties.some(p => p['name'] === 'marking' && p['kind'] === 'marking')).toBe(true);
    expect(properties.some(p => p['name'] === 'tags' && p['kind'] === 'array')).toBe(true);
  });

  it('validates a rich property value', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const route = findRoute(routes, 'POST', '/api/v1/ontology/validate-property');
    const res = await route.handler(
      restReq('POST', '/api/v1/ontology/validate-property', { kind: 'marking', value: [' Restricted'] }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['valid']).toBe(true);
  });

  it('lists and evaluates transform functions', async () => {
    const ctx = createCtx(deps, 'tenant-1');
    const list = findRoute(routes, 'GET', '/api/v1/transform/functions');
    const lRes = await list.handler(restReq('GET', '/api/v1/transform/functions'), ctx);
    expect(lRes.status).toBe(200);
    const data = (lRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    expect(data.some(f => f['name'] === 'toUpper')).toBe(true);

    const evalRoute = findRoute(routes, 'POST', '/api/v1/transform/evaluate');
    const eRes = await evalRoute.handler(
      restReq('POST', '/api/v1/transform/evaluate', { function: 'toUpper', inputType: 'String', arguments: { value: 'hello' } }),
      ctx,
    );
    expect(eRes.status).toBe(200);
    const eData = (eRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(eData['result']).toBe('HELLO');
  });

  it('saves, validates and applies an ontology change', async () => {
    const ctx = createCtx(deps, 'tenant-1');

    const create = findRoute(routes, 'POST', '/api/v1/ontology/changes');
    const cRes = await create.handler(
      restReq('POST', '/api/v1/ontology/changes', { migrationClass: 'add-field', snapshot: { objectTypes: [] } }),
      ctx,
    );
    expect(cRes.status).toBe(201);
    const record = (cRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    const id = String(record['id']);

    const validate = findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/validate');
    const vRes = await validate.handler(restReq('POST', `/api/v1/ontology/changes/${id}/validate`, {}, { id }), ctx);
    expect(vRes.status).toBe(200);

    const apply = findRoute(routes, 'POST', '/api/v1/ontology/changes/:id/apply');
    const aRes = await apply.handler(restReq('POST', `/api/v1/ontology/changes/${id}/apply`, {}, { id }), ctx);
    expect(aRes.status).toBe(200);
    const aData = (aRes.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(aData['applied']).toBe(true);
  });
});
