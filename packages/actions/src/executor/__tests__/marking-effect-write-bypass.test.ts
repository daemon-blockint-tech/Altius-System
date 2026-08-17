/**
 * Composition must not launder a mandatory marking.
 *
 * `marking-denial.test.ts` pins the gate: it asserts the executor returns
 * MARKING_DENIED. That is necessary but not sufficient — its storage stub has
 * no `createObject`, so a bypassed gate surfaces as EFFECT_EXECUTION_ERROR and
 * the test cannot distinguish "the marking was skipped and the write then died
 * on the mock" from "the write actually landed".
 *
 * This file closes that gap. The transaction here CAN create, so the assertion
 * is about the write itself: a caller who holds none of Patient's markings must
 * not get a Patient row into storage.
 *
 * The shape is the bypass in its purest form. An ActionType whose only
 * ObjectType @param is the unmarked Ward, and a manifest whose effect names
 * Patient outright. The param type and the written type are free to differ —
 * nothing in ODL ties them together — so a control that reads only @param sees
 * Ward, waves the call through, and Patient is what hits the disk.
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

type SeedPatient @actionType { ward: Ward! @param }
`);

/** Patient is marked; Ward is not. */
const policy = {
  isEmpty: false,
  requiredFor: (t: string) => (t === 'Patient' ? ['PII'] : []),
  check: (held: readonly string[], required: readonly string[]) => {
    const missing = required.filter((r) => !held.includes(r));
    return { allowed: missing.length === 0, missing };
  },
};

/** The action's only effect writes a type its @param never mentions. */
const manifest = {
  action: 'SeedPatient',
  preconditions: [],
  effects: [{ type: 'createObject', objectType: 'Patient', properties: { id: 'p-9', status: 'new' } }],
  sideEffects: [],
} as unknown as ActionManifest;

/**
 * Holds a marking — just not Patient's. Proves the denial is about the type
 * being written and not about an actor who simply carries nothing.
 */
const wardStaff: ActionActor = {
  id: 'u-1', type: 'user', roles: ['admin'], markings: ['WARD_OPS'],
};

const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

function harness() {
  // Unlike the gate tests, this transaction can actually write — that is the
  // whole point: we need to observe whether a Patient reaches storage.
  const createObject = vi.fn(async (type: string, props: Record<string, unknown>) => ({
    ...props, _id: 'p-9', _type: type, _version: 1,
  }));

  const executor = new ActionExecutor({
    storage: {
      getObject: vi.fn(async () => ({ _id: 'w-1', _type: 'Ward', _version: 1 })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        createObject,
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    // Allows everything, so only the marking can refuse.
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    markingPolicy: policy,
  } as never);

  return { executor, createObject };
}

describe('an effect cannot write a type the caller is not cleared for', () => {
  it('never lets a Patient reach storage for a caller without Patient markings', async () => {
    const { executor, createObject } = harness();

    await executor.execute(manifest, { ward: 'w-1' }, wardStaff, ctx, schema);

    // The load-bearing assertion. Whatever the executor reports, marked data
    // must not have been written.
    expect(createObject).not.toHaveBeenCalled();
  });

  it('reports the refusal as MARKING_DENIED', async () => {
    const { executor } = harness();

    const result = await executor.execute(manifest, { ward: 'w-1' }, wardStaff, ctx, schema);

    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });

  it('writes the Patient once the caller holds the marking', async () => {
    const { executor, createObject } = harness();
    const cleared = { ...wardStaff, markings: ['WARD_OPS', 'PII'] };

    const result = await executor.execute(manifest, { ward: 'w-1' }, cleared, ctx, schema);

    expect(result.errors.some((e) => e.code === 'MARKING_DENIED')).toBe(false);
    expect(createObject).toHaveBeenCalledWith('Patient', expect.objectContaining({ status: 'new' }));
  });
});
