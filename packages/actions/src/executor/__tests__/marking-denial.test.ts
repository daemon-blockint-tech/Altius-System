/**
 * Markings must stop writes, not just reads.
 *
 * The read surfaces hide a marked type; if an action could still mutate it,
 * the control would be decorative — a caller who cannot see Patient could
 * still discharge one. Enforced inside the executor rather than at each
 * surface because four call sites already reach `execute` (REST, GraphQL,
 * MCP, functions) and a fifth added later would silently miss it.
 *
 * The check sits BEFORE authorisation on purpose: markings restrict where
 * roles and relations expand, so holding the action's ReBAC permission must
 * not get a caller past one.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }
type Ward @objectType { id: ID! @primary  name: String }

type DischargePatient @actionType { patient: Patient! @param }
type RenameWard @actionType { ward: Ward! @param }
`);

const manifest = (action: string): ActionManifest => ({
  action,
  preconditions: [],
  effects: [],
  sideEffects: [],
} as unknown as ActionManifest);

const policy = {
  isEmpty: false,
  requiredFor: (t: string) => (t === 'Patient' ? ['PII'] : []),
  check: (held: readonly string[], required: readonly string[]) => {
    const missing = required.filter(r => !held.includes(r));
    return { allowed: missing.length === 0, missing };
  },
};

/** A security layer that ALLOWS everything, so only markings can refuse. */
const permissiveSecurity = {
  checkPermission: vi.fn(async () => ({ allowed: true })),
};

function executor(withPolicy = true) {
  return new ActionExecutor({
    storage: {
      // Enough of the provider for an allowed action to get past param
      // resolution; the point of these tests is what happens BEFORE that.
      getObject: vi.fn(async () => ({ _id: 'p-1', _type: 'Patient', _version: 1 })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}),
      })),
    },
    security: permissiveSecurity,
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    ...(withPolicy ? { markingPolicy: policy } : {}),
  } as never);
}

const actor = (markings: string[]): ActionActor => ({
  id: 'u-1', type: 'user', roles: ['admin'], markings,
});

const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

describe('markings on the write path', () => {
  it('refuses an action on a marked type when the caller lacks the marking', async () => {
    const result = await executor().execute(
      manifest('DischargePatient'), { patient: 'p-1' }, actor([]), ctx, schema,
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });

  it('refuses even an admin holding the action permission — mandatory beats discretionary', async () => {
    const result = await executor().execute(
      manifest('DischargePatient'), { patient: 'p-1' }, actor([]), ctx, schema,
    );

    expect(result.success).toBe(false);
    // The authorisation step must not even have been consulted: the marking
    // decides first, so a permissive security layer cannot rescue the call.
    expect(permissiveSecurity.checkPermission).not.toHaveBeenCalled();
  });

  it('allows the action once the caller holds the marking', async () => {
    const result = await executor().execute(
      manifest('DischargePatient'), { patient: 'p-1' }, actor(['PII']), ctx, schema,
    );

    expect(result.errors.some(e => e.code === 'MARKING_DENIED')).toBe(false);
  });

  it('leaves an action on an unmarked type alone', async () => {
    const result = await executor().execute(
      manifest('RenameWard'), { ward: 'w-1' }, actor([]), ctx, schema,
    );

    expect(result.errors.some(e => e.code === 'MARKING_DENIED')).toBe(false);
  });

  it('treats an actor with no markings field as holding none', async () => {
    const noField = { id: 'u-1', type: 'user', roles: ['admin'] } as ActionActor;
    const result = await executor().execute(
      manifest('DischargePatient'), { patient: 'p-1' }, noField, ctx, schema,
    );

    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });

  it('is inert when no policy is configured', async () => {
    const result = await executor(false).execute(
      manifest('DischargePatient'), { patient: 'p-1' }, actor([]), ctx, schema,
    );

    expect(result.errors.some(e => e.code === 'MARKING_DENIED')).toBe(false);
  });
});
