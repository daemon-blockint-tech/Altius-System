/**
 * Per-object ReBAC authorization for function invocation.
 *
 * Verifies that when a function has an ObjectType-typed @param and a
 * functionAuthzMapping is provided, invokeFunction checks the FGA relation
 * on the target object before allowing execution.
 */
import { describe, it, expect, vi } from 'vitest';
import type { FunctionType } from '@altius/odl';
import type { FunctionAuthzMapping } from '@altius/odl';
import { invokeFunction } from '../functions/invoke-function.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { ParsedSchema } from '@altius/odl';

const fn: FunctionType = {
  kind: 'functionType',
  name: 'ComputeRiskScore',
  fields: [
    { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
  ],
  runtime: 'cel',
  entry: 'patient.risk * 1.5',
  requiredRoles: ['clinician'],
  directives: [{ kind: 'function', runtime: 'cel', entry: 'patient.risk * 1.5' }],
};

const fnAuthzMapping: FunctionAuthzMapping = {
  relation: 'can_compute_risk_score',
  objectType: 'patient',
  objectIdParam: 'patient',
};

const schema = {
  objectTypes: [{ name: 'Patient', kind: 'objectType', fields: [], directives: [] }],
  actionTypes: [],
  functionTypes: [fn],
  enums: [],
  namespaces: [],
} as unknown as ParsedSchema;

function makeDeps(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    schema,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
    } as unknown as ApiDependencies['authorizationService'],
    functionExecutor: {
      execute: vi.fn().mockResolvedValue({ result: { score: 42 }, logs: [], durationMs: 1 }),
    } as unknown as ApiDependencies['functionExecutor'],
    functionAuthzMappings: new Map([['ComputeRiskScore', fnAuthzMapping]]),
    ...overrides,
  } as unknown as ApiDependencies;
}

function makeCtx(): ResolverContext {
  return {
    user: { id: 'user-1', roles: ['clinician'] },
    requestContext: { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' },
  } as unknown as ResolverContext;
}

describe('invokeFunction per-object ReBAC', () => {
  it('checks the FGA relation when a functionAuthzMapping exists', async () => {
    const deps = makeDeps();
    await invokeFunction(fn, deps, makeCtx(), { patient: 'p-123' });

    expect(deps.authorizationService.check).toHaveBeenCalledWith(
      'user:user-1',
      'can_compute_risk_score',
      'patient:p-123',
      'tenant-1',
    );
  });

  it('denies when the FGA check returns false', async () => {
    const deps = makeDeps({
      authorizationService: {
        check: vi.fn().mockResolvedValue(false),
      } as unknown as ApiDependencies['authorizationService'],
    });
    await expect(
      invokeFunction(fn, deps, makeCtx(), { patient: 'p-123' }),
    ).rejects.toThrow(/does not have can_compute_risk_score/);

    expect(deps.functionExecutor!.execute).not.toHaveBeenCalled();
  });

  it('denies when the objectIdParam is missing from input', async () => {
    const deps = makeDeps();
    await expect(
      invokeFunction(fn, deps, makeCtx(), {}),
    ).rejects.toThrow(/requires patient for authorization/);

    expect(deps.authorizationService.check).not.toHaveBeenCalled();
  });

  it('skips ReBAC when no functionAuthzMapping exists for the function', async () => {
    const deps = makeDeps({
      functionAuthzMappings: new Map(),
    });
    await invokeFunction(fn, deps, makeCtx(), { patient: 'p-123' });

    expect(deps.authorizationService.check).not.toHaveBeenCalled();
    expect(deps.functionExecutor!.execute).toHaveBeenCalled();
  });

  it('skips ReBAC when functionAuthzMappings is undefined', async () => {
    const deps = makeDeps({
      functionAuthzMappings: undefined,
    });
    await invokeFunction(fn, deps, makeCtx(), { patient: 'p-123' });

    expect(deps.authorizationService.check).not.toHaveBeenCalled();
    expect(deps.functionExecutor!.execute).toHaveBeenCalled();
  });

  it('still checks requiredRoles after ReBAC passes', async () => {
    const deps = makeDeps();
    const ctx = makeCtx();
    ctx.user.roles = ['viewer']; // not 'clinician'
    await expect(
      invokeFunction(fn, deps, ctx, { patient: 'p-123' }),
    ).rejects.toThrow(/requires one of: clinician/);
  });

  it('allows execution when both ReBAC and role checks pass', async () => {
    const deps = makeDeps();
    const result = await invokeFunction(fn, deps, makeCtx(), { patient: 'p-123' });
    expect(result.result).toEqual({ score: 42 });
  });
});
