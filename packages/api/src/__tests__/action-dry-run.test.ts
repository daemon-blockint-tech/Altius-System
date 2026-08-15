/**
 * Tests for dry-run action execution over HTTP.
 *
 * Before this change, `dryRunSupported` was hardcoded false on the HTTP
 * surface and neither REST nor GraphQL action routes accepted a dryRun flag.
 * A Stepper could not preview a step without committing it.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { ActionResult } from '@altius/actions';
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

type DischargePatient @actionType {
  patient: Patient @param
  reason: String @param
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

function createMockDeps(schema: ParsedSchema, executeResult: ActionResult): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn().mockResolvedValue({
        _type: 'Patient', _id: 'p-1', _version: 1,
        _tenantId: 'tenant-1',
        _createdAt: '2025-01-01T00:00:00Z',
        _updatedAt: '2025-01-01T00:00:00Z',
        name: 'Test Patient', status: 'ACTIVE',
      }),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {
      execute: vi.fn().mockResolvedValue(executeResult),
    } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation((_u, _r, _t, obj) => ({ data: obj, _redactedFields: [] })),
      redactFieldsBatch: vi.fn().mockImplementation((_u, _r, _t, objs) => objs.map((o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }))),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: {
      get: vi.fn().mockReturnValue({
        action: 'DischargePatient',
        version: 1,
        reversible: false,
        preconditions: [{ expr: "patient.status == 'ACTIVE'", error: 'Patient is not active' }],
        effects: [{ type: 'updateObject', objectType: 'Patient', set: { status: 'DISCHARGED' } }],
        sideEffects: [],
        rollback: [],
        undo: [],
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
    method: 'POST',
    path: '/api/v1/actions/DischargePatient',
    params: {},
    query: {},
    body: { patient: 'p-1', reason: 'Recovered' },
    user: createMockUser(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════

describe('Action dry-run over HTTP', () => {
  const schema = parseOdl(ODL);

  it('emits dryRun field in the GraphQL mutation input SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('dryRun: Boolean');
  });

  it('REST passes dryRun=true to the executor', async () => {
    const deps = createMockDeps(schema, {
      success: true,
      actionId: 'dryrun_test',
      errors: [],
      affectedObjects: [],
      warnings: ['Dry-run: validation passed.'],
    });
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/actions/DischargePatient')!;

    await route.handler(
      createRestRequest({ query: { dryRun: 'true' } }),
      createCtx(deps),
    );

    expect(deps.actionExecutor.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { dryRun: true },
    );
  });

  it('REST passes dryRun=false when not specified', async () => {
    const deps = createMockDeps(schema, {
      success: true,
      actionId: 'test',
      errors: [],
      affectedObjects: [],
    });
    const routes = generateRestRoutes(schema, deps);
    const route = routes.find(r => r.pattern === '/api/v1/actions/DischargePatient')!;

    await route.handler(createRestRequest(), createCtx(deps));

    expect(deps.actionExecutor.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { dryRun: false },
    );
  });

  it('GraphQL resolver passes dryRun from input', async () => {
    const deps = createMockDeps(schema, {
      success: true,
      actionId: 'dryrun_test',
      errors: [],
      affectedObjects: [],
      warnings: ['Dry-run: validation passed.'],
    });
    const { resolvers } = generateResolvers(schema, deps);
    const mutationResolver = (resolvers['Mutation'] as Record<string, unknown>)['dischargePatient'] as (parent: unknown, args: { input: Record<string, unknown> }, ctx: ResolverContext) => Promise<unknown>;

    await mutationResolver(undefined, { input: { patient: 'p-1', reason: 'Recovered', dryRun: true } }, createCtx(deps));

    expect(deps.actionExecutor.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: true }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { dryRun: true },
    );
  });

  it('availableTools reports dryRunSupported: true', async () => {
    const deps = createMockDeps(schema, {
      success: true,
      actionId: 'test',
      errors: [],
      affectedObjects: [],
    });
    const { resolvers } = generateResolvers(schema, deps);
    const toolsResolver = (resolvers['Query'] as Record<string, unknown>)['availableTools'] as (parent: unknown, args: unknown, ctx: ResolverContext) => unknown[];

    const tools = toolsResolver(undefined, {}, createCtx(deps)) as Array<{ dryRunSupported: boolean }>;
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.dryRunSupported).toBe(true);
    }
  });
});
