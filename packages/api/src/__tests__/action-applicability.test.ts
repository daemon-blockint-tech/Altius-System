/**
 * Tests for per-object action applicability.
 *
 * Before this change, `availableTools` returned every action to every caller
 * — there was no way to ask "which actions apply to this specific row?"
 * without executing them. A right-click menu had to show all actions or none.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import { generateGraphQLSchema } from '@altius/odl';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

// ─── ODL fixture ───

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String!
  status: String
}

type Ward @objectType {
  id: ID! @primary
  name: String!
}

type DischargePatient @actionType {
  patient: Patient @param
  reason: String @param
}

type TransferPatient @actionType {
  patient: Patient @param
  targetWard: Ward @param
}

type CloseWard @actionType {
  ward: Ward @param
}
`;

// ─── Mock factories ───

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr.smith@test.uk',
    roles: ['clinician'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function createMockDeps(schema: ParsedSchema, allowed: boolean): ApiDependencies {
  return {
    schema,
    objectManager: {} as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(allowed),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation((_u, _r, _t, obj) => ({ data: obj, _redactedFields: [] })),
      redactFieldsBatch: vi.fn().mockImplementation((_u, _r, _t, objs) => objs.map((o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }))),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: {
      get: vi.fn().mockReturnValue({
        action: 'test', version: 1, reversible: false,
        preconditions: [], effects: [], sideEffects: [], rollback: [], undo: [],
      }),
    },
    consentService: undefined,
    auditWriter: undefined,
    storage: {
      getObjectHistory: vi.fn().mockResolvedValue([]),
    } as unknown as ApiDependencies['storage'],
  };
}

function createCtx(deps: ApiDependencies): ResolverContext {
  const u = createMockUser();
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps,
  };
}

function createRestRequest(overrides: Partial<RestRequest> = {}): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/actions',
    params: {},
    query: {},
    body: undefined,
    user: createMockUser(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════

describe('Per-object action applicability', () => {
  const schema = parseOdl(ODL);

  it('emits applicableActions query in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('applicableActions(objectType: String!, objectId: ID!): [String!]!');
  });

  it('returns actions that target Patient when caller has access', async () => {
    const deps = createMockDeps(schema, true);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Query'] as Record<string, unknown>)['applicableActions'] as (parent: unknown, args: { objectType: string; objectId: string }, ctx: ResolverContext) => Promise<string[]>;

    const result = await resolver(undefined, { objectType: 'Patient', objectId: 'p-1' }, createCtx(deps));

    // DischargePatient and TransferPatient both target Patient
    expect(result).toContain('DischargePatient');
    expect(result).toContain('TransferPatient');
    expect(result).not.toContain('CloseWard');
  });

  it('returns actions that target Ward when caller has access', async () => {
    const deps = createMockDeps(schema, true);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Query'] as Record<string, unknown>)['applicableActions'] as (parent: unknown, args: { objectType: string; objectId: string }, ctx: ResolverContext) => Promise<string[]>;

    const result = await resolver(undefined, { objectType: 'Ward', objectId: 'w-1' }, createCtx(deps));

    expect(result).toEqual(['CloseWard']);
  });

  it('returns empty array when caller has no FGA access to the object', async () => {
    const deps = createMockDeps(schema, false);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Query'] as Record<string, unknown>)['applicableActions'] as (parent: unknown, args: { objectType: string; objectId: string }, ctx: ResolverContext) => Promise<string[]>;

    const result = await resolver(undefined, { objectType: 'Patient', objectId: 'p-1' }, createCtx(deps));
    expect(result).toEqual([]);
  });

  it('returns empty array for an object type with no targeting actions', async () => {
    const deps = createMockDeps(schema, true);
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = (resolvers['Query'] as Record<string, unknown>)['applicableActions'] as (parent: unknown, args: { objectType: string; objectId: string }, ctx: ResolverContext) => Promise<string[]>;

    const result = await resolver(undefined, { objectType: 'NonExistent', objectId: 'x' }, createCtx(deps));
    expect(result).toEqual([]);
  });

  it('REST route returns actions for a valid request', async () => {
    const deps = createMockDeps(schema, true);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/actions' && r.method === 'GET')!;

    const result = await route.handler(
      createRestRequest({ query: { objectType: 'Patient', objectId: 'p-1' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const data = body['data'] as string[];
    expect(data).toContain('DischargePatient');
    expect(data).toContain('TransferPatient');
  });

  it('REST route returns 400 when objectType or objectId is missing', async () => {
    const deps = createMockDeps(schema, true);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/actions' && r.method === 'GET')!;

    const result = await route.handler(
      createRestRequest({ query: { objectType: 'Patient' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(400);
  });

  it('REST route returns empty array when caller has no access', async () => {
    const deps = createMockDeps(schema, false);
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/actions' && r.method === 'GET')!;

    const result = await route.handler(
      createRestRequest({ query: { objectType: 'Patient', objectId: 'p-1' } }),
      createCtx(deps),
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body['data']).toEqual([]);
  });
});
