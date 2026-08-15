/**
 * Functions must be callable over REST, not only GraphQL.
 *
 * generateRestRoutes iterated objectTypes and actionTypes only —
 * route-generator.ts had no reference to functionTypes at all. A deployment
 * whose clients speak REST could not invoke a declared function, so packs had
 * to ship the same computation twice or expose it as an action it isn't.
 *
 * The route delegates to invokeFunction, the same entry point the GraphQL
 * resolver uses, so the role gate and the audit record are identical on both
 * transports rather than reimplemented per protocol.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { AuditWriteInput } from '@altius/security';

import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
type ScoreRisk @function(runtime: "cel", entry: "amount * 2", requiredRoles: "bsa_officer") {
  amount: Float! @param
}
`;

function makeDeps(execute = vi.fn(async () => ({ result: 42, logs: [], durationMs: 3 }))) {
  const written: AuditWriteInput[] = [];
  const deps = {
    functionExecutor: { execute },
    auditWriter: { write: async (r: AuditWriteInput) => { written.push(r); } },
    authorizationService: {
      clearFieldCache: () => {},
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn((_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] })),
      redactFieldsBatch: vi.fn((_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] }))),
    },
    objectManager: { get: vi.fn(), query: vi.fn() },
    linkManager: {},
    actionExecutor: {},
  } as unknown as ApiDependencies;
  return { deps, written, execute };
}

function ctxWithRoles(roles: string[]): ResolverContext {
  return {
    user: { id: 'u1', tenantId: 't1', roles, groups: [] },
    requestContext: { tenantId: 't1', actorId: 'u1', traceId: 'tr-rest' },
  } as unknown as ResolverContext;
}

function functionRoute(deps: ApiDependencies) {
  return generateRestRoutes(parseOdl(ODL), deps)
    .find(r => r.pattern === '/api/v1/functions/ScoreRisk');
}

const req = (body: Record<string, unknown>): RestRequest =>
  ({ body, params: {}, query: {}, headers: {} } as unknown as RestRequest);

describe('function REST route', () => {
  it('is generated for every declared FunctionType', () => {
    const { deps } = makeDeps();

    const route = functionRoute(deps);

    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('invokes the function and returns its result', async () => {
    const { deps, execute } = makeDeps();

    const res = await functionRoute(deps)!.handler(req({ amount: 21 }), ctxWithRoles(['bsa_officer']));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { result: 42, logs: null, durationMs: 3 } });
    expect(execute).toHaveBeenCalledWith('ScoreRisk', { amount: 21 });
  });

  it('applies the same role gate as GraphQL, without executing', async () => {
    const { deps, execute } = makeDeps();

    const res = await functionRoute(deps)!.handler(req({ amount: 21 }), ctxWithRoles(['viewer']));

    expect(res.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it('audits the invocation on this transport too', async () => {
    const { deps, written } = makeDeps();

    await functionRoute(deps)!.handler(req({ amount: 21 }), ctxWithRoles(['bsa_officer']));

    expect(written).toHaveLength(1);
    expect(written[0]!.operation.functionName).toBe('ScoreRisk');
    expect(written[0]!.detail.result).toBe('success');
  });
});
