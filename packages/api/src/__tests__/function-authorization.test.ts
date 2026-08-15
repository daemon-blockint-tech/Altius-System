/**
 * Invoking a FunctionType must be authorized.
 *
 * Before this, generateFunctionResolver went straight from "is an executor
 * configured?" to executor.execute() — the resolver's own comment said any
 * authenticated user could invoke any declared function. That made every
 * control on the action pipeline (ReBAC, consent, preconditions) bypassable by
 * shipping the same logic as a function instead of an action.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';

import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';

const ODL = `
type ScoreRisk @function(runtime: "cel", entry: "amount * 2", requiredRoles: "compliance_officer, bsa_officer") {
  amount: Float! @param
}

type OpenFn @function(runtime: "cel", entry: "1") {
  amount: Float! @param
}
`;

type QueryFn = (parent: unknown, args: Record<string, unknown>, ctx: ResolverContext) => Promise<unknown>;

function depsWithExecutor() {
  const execute = vi.fn(async () => ({ result: 42, logs: [], durationMs: 1 }));
  const deps = {
    functionExecutor: { execute },
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
  return { deps, execute };
}

function ctxWithRoles(roles: string[]): ResolverContext {
  return {
    user: { id: 'u1', tenantId: 't1', roles, groups: [] },
    requestContext: { tenantId: 't1', actorId: 'u1', traceId: 'tr-1' },
  } as unknown as ResolverContext;
}

function invoke(deps: ApiDependencies, field: string, ctx: ResolverContext) {
  const { resolvers } = generateResolvers(parseOdl(ODL), deps);
  const fn = resolvers['Mutation']![field] as unknown as QueryFn;
  return fn(null, { input: { amount: 21 } }, ctx);
}

describe('function invocation authorization', () => {
  it('allows a caller holding one of the declared roles', async () => {
    const { deps, execute } = depsWithExecutor();

    const result = await invoke(deps, 'scoreRiskFunction', ctxWithRoles(['bsa_officer'])) as { result: unknown };

    expect(result.result).toBe(42);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('denies a caller holding none of them, without executing', async () => {
    const { deps, execute } = depsWithExecutor();

    await expect(invoke(deps, 'scoreRiskFunction', ctxWithRoles(['viewer'])))
      .rejects.toThrow(/requires one of: compliance_officer, bsa_officer/);
    // The point of authorizing before execute: pack code must not run first.
    expect(execute).not.toHaveBeenCalled();
  });

  it('denies a function that declares no roles rather than allowing everyone', async () => {
    const { deps, execute } = depsWithExecutor();

    await expect(invoke(deps, 'openFnFunction', ctxWithRoles(['compliance_officer', 'admin'])))
      .rejects.toThrow(/declares no requiredRoles/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('parses requiredRoles off the @function directive', () => {
    const schema = parseOdl(ODL);

    expect(schema.functionTypes.find(f => f.name === 'ScoreRisk')!.requiredRoles)
      .toEqual(['compliance_officer', 'bsa_officer']);
    expect(schema.functionTypes.find(f => f.name === 'OpenFn')!.requiredRoles).toEqual([]);
  });
});
