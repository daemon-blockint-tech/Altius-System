/**
 * Write-side field permissions: a caller who cannot READ a field must not be
 * able to OVERWRITE it.
 *
 * The REST PUT and GraphQL update<Type> mutations checked the FGA 'editor'
 * relation and then passed req.body / args.input straight to
 * objectManager.update. A caller whose field-permission config redacts
 * @sensitive fields (so they never see them on reads) could still overwrite
 * them — bypassing the column policy that redaction enforces on reads.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import { generateResolvers } from '../graphql/resolver-generator.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  status: String!
  dateOfBirth: Date @sensitive
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'u-1', name: 'Test', email: 't@t.io',
  roles: ['clinician'], groups: [], tenantId: 't-1',
};

const REQ_CTX = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' };

function makeDeps(schema: ParsedSchema): ApiDependencies {
  return {
    schema,
    objectManager: {
      update: vi.fn().mockResolvedValue({ _id: 'p-1', _type: 'Patient', _version: 2, status: 'ACTIVE', dateOfBirth: '1990-01-01' }),
      query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true), // FGA 'editor' check passes
      listObjects: vi.fn().mockResolvedValue(['*']),
      // dateOfBirth is redacted; status and id are visible
      getVisibleFields: vi.fn().mockReturnValue(new Set(['id', 'status'])),
      redactFields: vi.fn().mockImplementation((_u: string, _r: string[], _t: string, o: Record<string, unknown>) => {
        const { dateOfBirth, ...rest } = o;
        return { data: rest, _redactedFields: dateOfBirth !== undefined ? ['dateOfBirth'] : [] };
      }),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: undefined,
    auditWriter: undefined,
    storage: {} as unknown as ApiDependencies['storage'],
  } as unknown as ApiDependencies;
}

function restCtx(deps: ApiDependencies): ResolverContext {
  return { user: USER, requestContext: REQ_CTX, deps } as unknown as ResolverContext;
}

describe('write-side field permissions — REST PUT', () => {
  let schema: ParsedSchema;
  beforeAll(() => { schema = parseOdl(ODL); });

  it('rejects an update that touches a redacted field', async () => {
    const deps = makeDeps(schema);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'PUT' && r.pattern === '/api/v1/patients/:id',
    )!;
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { dateOfBirth: '2000-01-01' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('dateOfBirth');
    expect(deps.objectManager.update).not.toHaveBeenCalled();
  });

  it('allows an update that only touches visible fields', async () => {
    const deps = makeDeps(schema);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'PUT' && r.pattern === '/api/v1/patients/:id',
    )!;
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    expect(deps.objectManager.update).toHaveBeenCalled();
  });

  it('rejects a mixed update that includes a redacted field', async () => {
    const deps = makeDeps(schema);
    const route = generateRestRoutes(schema, deps).find(
      r => r.method === 'PUT' && r.pattern === '/api/v1/patients/:id',
    )!;
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE', dateOfBirth: '2000-01-01' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(403);
    expect(deps.objectManager.update).not.toHaveBeenCalled();
  });
});

describe('write-side field permissions — GraphQL update<Type>', () => {
  let schema: ParsedSchema;
  beforeAll(() => { schema = parseOdl(ODL); });

  async function callUpdateMutation(deps: ApiDependencies, input: Record<string, unknown>) {
    const { resolvers } = generateResolvers(schema, deps);
    const resolver = resolvers['Mutation']!['updatePatient'] as (
      parent: unknown, args: { id: string; input: Record<string, unknown> }, ctx: ResolverContext,
    ) => Promise<unknown>;
    return resolver(undefined, { id: 'p-1', input }, restCtx(deps));
  }

  it('rejects an update that touches a redacted field', async () => {
    const deps = makeDeps(schema);
    await expect(callUpdateMutation(deps, { dateOfBirth: '2000-01-01' })).rejects.toThrow();
    expect(deps.objectManager.update).not.toHaveBeenCalled();
  });

  it('allows an update that only touches visible fields', async () => {
    const deps = makeDeps(schema);
    await callUpdateMutation(deps, { status: 'ACTIVE' });
    expect(deps.objectManager.update).toHaveBeenCalled();
  });
});
