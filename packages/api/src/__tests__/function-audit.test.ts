/**
 * Invoking a FunctionType must leave an audit record.
 *
 * Every action execution — including a denied one — writes to the append-only
 * audit store. Function invocation wrote nothing: resolver-generator.ts had no
 * reference to deps.auditWriter at all. A function runs pack-authored code
 * under the caller's identity, so "who ran what, and did it succeed" is
 * exactly the evidence the audit trail exists to hold; without it, moving
 * logic from an action to a function erased it from the record.
 *
 * This matters more now that functions are role-gated: a denied invocation is
 * a refused access attempt, and refusals are the records compliance reads.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { AuditRecord } from '@altius/spi';

import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';

const ODL = `
type ScoreRisk @function(runtime: "cel", entry: "amount * 2", requiredRoles: "bsa_officer") {
  amount: Float! @param
}
`;

type QueryFn = (parent: unknown, args: Record<string, unknown>, ctx: ResolverContext) => Promise<unknown>;

function depsWithAudit(execute: () => Promise<unknown>) {
  const written: AuditRecord[] = [];
  const deps = {
    functionExecutor: { execute },
    auditWriter: { write: vi.fn(async (r: AuditRecord) => { written.push(r); }) },
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
  return { deps, written };
}

function ctxWithRoles(roles: string[]): ResolverContext {
  return {
    user: { id: 'u1', tenantId: 't1', roles, groups: [] },
    requestContext: { tenantId: 't1', actorId: 'u1', traceId: 'tr-1' },
  } as unknown as ResolverContext;
}

function invoke(deps: ApiDependencies, ctx: ResolverContext) {
  const { resolvers } = generateResolvers(parseOdl(ODL), deps);
  const fn = resolvers['Mutation']!['scoreRiskFunction'] as unknown as QueryFn;
  return fn(null, { input: { amount: 21 } }, ctx);
}

const ok = async () => ({ result: 42, logs: [], durationMs: 1 });

describe('function invocation audit', () => {
  it('records a successful invocation', async () => {
    const { deps, written } = depsWithAudit(ok);

    await invoke(deps, ctxWithRoles(['bsa_officer']));

    expect(written).toHaveLength(1);
    const rec = written[0]!;
    expect(rec.operation.type).toBe('function');
    expect(rec.operation.functionName).toBe('ScoreRisk');
    expect(rec.detail.result).toBe('success');
    expect(rec.actor.id).toBe('u1');
    expect(rec.actor.roles).toEqual(['bsa_officer']);
    expect(rec.traceId).toBe('tr-1');
  });

  it('records a role denial, which is the record compliance reads', async () => {
    const execute = vi.fn(ok);
    const { deps, written } = depsWithAudit(execute);

    await expect(invoke(deps, ctxWithRoles(['viewer']))).rejects.toThrow(/requires one of/);

    expect(execute).not.toHaveBeenCalled();
    expect(written).toHaveLength(1);
    expect(written[0]!.detail.result).toBe('denied');
    expect(written[0]!.detail.denialReason).toMatch(/bsa_officer/);
    expect(written[0]!.operation.functionName).toBe('ScoreRisk');
  });

  it('records an invocation that threw inside the pack code', async () => {
    const { deps, written } = depsWithAudit(async () => { throw new Error('boom'); });

    // The thrown message is deliberately masked by wrapError; the audit record
    // is where the failure is actually recorded.
    await expect(invoke(deps, ctxWithRoles(['bsa_officer']))).rejects.toThrow();

    expect(written).toHaveLength(1);
    expect(written[0]!.detail.result).toBe('error');
  });

  it('does not let an audit-store outage swallow a successful result', async () => {
    const { deps } = depsWithAudit(ok);
    (deps.auditWriter!.write as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('audit down'));

    const result = await invoke(deps, ctxWithRoles(['bsa_officer'])) as { result: unknown };

    expect(result.result).toBe(42);
  });

  it('still runs when no audit writer is configured', async () => {
    const { deps } = depsWithAudit(ok);
    delete (deps as { auditWriter?: unknown }).auditWriter;

    const result = await invoke(deps, ctxWithRoles(['bsa_officer'])) as { result: unknown };

    expect(result.result).toBe(42);
  });
});
