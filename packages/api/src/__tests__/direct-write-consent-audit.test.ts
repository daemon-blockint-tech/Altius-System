/**
 * Consent + audit on the direct write surfaces.
 *
 * The action pipeline checks consent before executing effects and audits
 * every outcome. The direct mutations (REST PUT/DELETE, GraphQL
 * update<Type>/delete<Type>) bypassed that pipeline: an editor could update
 * or delete a consent-subject's record after the subject revoked consent,
 * and the REST paths left no audit record at all.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import { ConsentError } from '@altius/security';
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

type Ward @objectType {
  id: ID! @primary
  name: String!
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'u-1', name: 'Test', email: 't@t.io',
  roles: ['clinician'], groups: [], tenantId: 't-1',
};

const REQ_CTX = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' };

function makeDeps(schema: ParsedSchema, opts?: { consentDenied?: boolean }): ApiDependencies {
  const guardAction = vi.fn().mockImplementation(async () => {
    if (opts?.consentDenied) {
      throw new ConsentError('CONSENT_DENIED', 'Consent denied for subject p-1 with purpose DIRECT_CARE');
    }
  });
  return {
    schema,
    objectManager: {
      update: vi.fn().mockResolvedValue({ _id: 'p-1', _type: 'Patient', _version: 2, status: 'ACTIVE', dateOfBirth: '1990-01-01' }),
      query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation((_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] })),
      redactFieldsBatch: vi.fn(),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: { guardAction } as unknown as ApiDependencies['consentService'],
    auditWriter: { write: vi.fn().mockResolvedValue({}) } as unknown as ApiDependencies['auditWriter'],
    storage: {} as unknown as ApiDependencies['storage'],
  } as unknown as ApiDependencies;
}

function restCtx(deps: ApiDependencies): ResolverContext {
  return { user: USER, requestContext: REQ_CTX, deps } as unknown as ResolverContext;
}

function findRoute(schema: ParsedSchema, deps: ApiDependencies, method: string, pattern: string) {
  return generateRestRoutes(schema, deps).find(r => r.method === method && r.pattern === pattern)!;
}

let schema: ParsedSchema;
beforeAll(() => { schema = parseOdl(ODL); });

describe('consent on direct writes — REST', () => {
  it('PUT denies with 403 CONSENT_DENIED and does not update', async () => {
    const deps = makeDeps(schema, { consentDenied: true });
    const route = findRoute(schema, deps, 'PUT', '/api/v1/patients/:id');
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('CONSENT_DENIED');
    expect(deps.objectManager.update).not.toHaveBeenCalled();
  });

  it('DELETE denies with 403 CONSENT_DENIED and does not delete', async () => {
    const deps = makeDeps(schema, { consentDenied: true });
    const route = findRoute(schema, deps, 'DELETE', '/api/v1/patients/:id');
    const res = await route.handler(
      { method: 'DELETE', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: undefined, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(403);
    expect(deps.objectManager.delete).not.toHaveBeenCalled();
  });

  it('PUT proceeds when consent allows, checking the object as subject', async () => {
    const deps = makeDeps(schema);
    const route = findRoute(schema, deps, 'PUT', '/api/v1/patients/:id');
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(200);
    const guardAction = (deps.consentService as unknown as { guardAction: ReturnType<typeof vi.fn> }).guardAction;
    expect(guardAction).toHaveBeenCalledWith('p-1', expect.any(String), 'u-1', 't-1');
  });

  it('does not consent-check a non-subject type', async () => {
    const deps = makeDeps(schema);
    const route = findRoute(schema, deps, 'PUT', '/api/v1/wards/:id');
    await route.handler(
      { method: 'PUT', path: '/api/v1/wards/w-1', params: { id: 'w-1' }, query: {}, body: { name: 'W' }, user: USER } as never,
      restCtx(deps),
    );
    const guardAction = (deps.consentService as unknown as { guardAction: ReturnType<typeof vi.fn> }).guardAction;
    expect(guardAction).not.toHaveBeenCalled();
  });
});

describe('audit on direct writes — REST', () => {
  it('PUT success writes an update audit record with field names, never values', async () => {
    const deps = makeDeps(schema);
    const route = findRoute(schema, deps, 'PUT', '/api/v1/patients/:id');
    await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE', dateOfBirth: '2000-01-01' }, user: USER } as never,
      restCtx(deps),
    );
    const write = (deps.auditWriter as unknown as { write: ReturnType<typeof vi.fn> }).write;
    const record = write.mock.calls.map(c => c[0]).find(
      (r: { operation: { type: string } }) => r.operation.type === 'update',
    );
    expect(record).toBeDefined();
    expect(record.tenantId).toBe('t-1');
    expect(record.operation.objectType).toBe('Patient');
    expect(record.operation.objectId).toBe('p-1');
    expect(record.detail.result).toBe('success');
    // Field names are evidence; values are sensitive egress.
    expect(JSON.stringify(record.detail)).not.toContain('2000-01-01');
  });

  it('DELETE success writes a delete audit record with the mode', async () => {
    const deps = makeDeps(schema);
    const route = findRoute(schema, deps, 'DELETE', '/api/v1/patients/:id');
    await route.handler(
      { method: 'DELETE', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: { mode: 'hard' }, body: undefined, user: USER } as never,
      restCtx(deps),
    );
    const write = (deps.auditWriter as unknown as { write: ReturnType<typeof vi.fn> }).write;
    const record = write.mock.calls.map(c => c[0]).find(
      (r: { operation: { type: string } }) => r.operation.type === 'delete',
    );
    expect(record).toBeDefined();
    expect(record.detail.result).toBe('success');
    expect(record.detail.query).toBe('mode=hard');
  });

  it('PUT authz denial writes a denied audit record', async () => {
    const deps = makeDeps(schema);
    (deps.authorizationService.check as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const route = findRoute(schema, deps, 'PUT', '/api/v1/patients/:id');
    const res = await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE' }, user: USER } as never,
      restCtx(deps),
    );
    expect(res.status).toBe(403);
    const write = (deps.auditWriter as unknown as { write: ReturnType<typeof vi.fn> }).write;
    const record = write.mock.calls.map(c => c[0]).find(
      (r: { operation: { type: string }; detail: { result?: string } }) =>
        r.operation.type === 'update' && r.detail.result === 'denied',
    );
    expect(record).toBeDefined();
  });

  it('consent denial writes a denied audit record naming consent', async () => {
    const deps = makeDeps(schema, { consentDenied: true });
    const route = findRoute(schema, deps, 'PUT', '/api/v1/patients/:id');
    await route.handler(
      { method: 'PUT', path: '/api/v1/patients/p-1', params: { id: 'p-1' }, query: {}, body: { status: 'ACTIVE' }, user: USER } as never,
      restCtx(deps),
    );
    const write = (deps.auditWriter as unknown as { write: ReturnType<typeof vi.fn> }).write;
    const record = write.mock.calls.map(c => c[0]).find(
      (r: { detail: { consentDecision?: string } }) => r.detail.consentDecision === 'denied',
    );
    expect(record).toBeDefined();
  });
});

describe('consent on direct writes — GraphQL', () => {
  function mutation(deps: ApiDependencies, name: string) {
    const { resolvers } = generateResolvers(schema, deps);
    return resolvers['Mutation']![name] as (
      parent: unknown, args: Record<string, unknown>, ctx: ResolverContext,
    ) => Promise<unknown>;
  }

  it('update<Type> denies on revoked consent and does not update', async () => {
    const deps = makeDeps(schema, { consentDenied: true });
    await expect(
      mutation(deps, 'updatePatient')(undefined, { id: 'p-1', input: { status: 'ACTIVE' } }, restCtx(deps)),
    ).rejects.toThrow(/consent/i);
    expect(deps.objectManager.update).not.toHaveBeenCalled();
  });

  it('delete<Type> denies on revoked consent and does not delete', async () => {
    const deps = makeDeps(schema, { consentDenied: true });
    await expect(
      mutation(deps, 'deletePatient')(undefined, { id: 'p-1' }, restCtx(deps)),
    ).rejects.toThrow(/consent/i);
    expect(deps.objectManager.delete).not.toHaveBeenCalled();
  });

  it('update<Type> proceeds when consent allows', async () => {
    const deps = makeDeps(schema);
    await mutation(deps, 'updatePatient')(undefined, { id: 'p-1', input: { status: 'ACTIVE' } }, restCtx(deps));
    expect(deps.objectManager.update).toHaveBeenCalled();
  });
});
