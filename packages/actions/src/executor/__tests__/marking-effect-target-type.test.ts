/**
 * An update/delete target is not always the @param's own type.
 *
 * `marking-effect-write-bypass.test.ts` covers the createObject half of the
 * composition bypass: the effect names a type outright. This file covers the
 * half that hides behind an expression.
 *
 * `resolveTarget` walks dotted paths and follows `@link` fields, so
 * `target: "ward.occupant"` writes a Patient while the action's only @param is
 * a Ward. Deriving the checked type from @param alone — or from the comment's
 * old claim that "targets are expressions naming a param" — sees Ward, finds it
 * unmarked, and lets an uncleared caller mutate a marked Patient.
 *
 * The last two cases pin the conservative rule in both directions: a target
 * whose type cannot be derived is refused, and one that can be is not.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }

type Ward @objectType {
  id: ID! @primary
  name: String
  occupant: Patient @link(type: "WardOccupancy", direction: OUTBOUND)
}

type WardOccupancy @linkType(from: "Ward", to: "Patient", cardinality: ONE_TO_ONE) {
  id: ID! @primary
}

type TouchOccupant @actionType { ward: Ward! @param }
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

function manifestWith(effects: unknown[]): ActionManifest {
  return {
    action: 'TouchOccupant',
    preconditions: [],
    effects,
    sideEffects: [],
  } as unknown as ActionManifest;
}

/** Holds a marking — just not Patient's. */
const wardStaff: ActionActor = {
  id: 'u-1', type: 'user', roles: ['admin'], markings: ['WARD_OPS'],
};

const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

function harness() {
  const updateObject = vi.fn(async (type: string, id: string, props: Record<string, unknown>) => ({
    ...props, _id: id, _type: type, _version: 2,
  }));
  const deleteObject = vi.fn(async () => {});

  const executor = new ActionExecutor({
    storage: {
      // The link hop is real: Ward w-1 occupies Patient p-9.
      getObject: vi.fn(async (_r: unknown, type: string, id: string) =>
        type === 'Patient'
          ? { _id: id, _type: 'Patient', _version: 1, status: 'old' }
          : { _id: id, _type: 'Ward', _version: 1, name: 'Nightingale' },
      ),
      getLinks: vi.fn(async () => ({
        items: [{ _id: 'l-1', _fromId: 'w-1', _fromType: 'Ward', _toId: 'p-9', _toType: 'Patient' }],
      })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        updateObject,
        deleteObject,
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    // Allows everything, so only the marking can refuse.
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    markingPolicy: policy,
  } as never);

  return { executor, updateObject, deleteObject };
}

describe('markings follow the effect target through a link hop', () => {
  const update = manifestWith([
    { type: 'updateObject', target: 'ward.occupant', set: { status: "'seen'" } },
  ]);

  it('never mutates the linked Patient for a caller without Patient markings', async () => {
    const { executor, updateObject } = harness();

    const result = await executor.execute(update, { ward: 'w-1' }, wardStaff, ctx, schema);

    expect(updateObject).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('names Patient — not Ward — as the type that blocked it', async () => {
    const { executor } = harness();

    const result = await executor.execute(update, { ward: 'w-1' }, wardStaff, ctx, schema);

    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
    expect(result.errors[0]?.message).toContain('Patient');
  });

  it('mutates the Patient once the caller holds the marking', async () => {
    const { executor, updateObject } = harness();
    const cleared = { ...wardStaff, markings: ['WARD_OPS', 'PII'] };

    const result = await executor.execute(update, { ward: 'w-1' }, cleared, ctx, schema);

    expect(result.errors.some((e) => e.code === 'MARKING_DENIED')).toBe(false);
    expect(updateObject).toHaveBeenCalledWith(
      'Patient', 'p-9', expect.objectContaining({ status: 'seen' }), 1,
    );
  });

  it('applies the same rule to deleteObject', async () => {
    const { executor, deleteObject } = harness();

    const result = await executor.execute(
      manifestWith([{ type: 'deleteObject', target: 'ward.occupant' }]),
      { ward: 'w-1' }, wardStaff, ctx, schema,
    );

    expect(deleteObject).not.toHaveBeenCalled();
    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });
});

describe('a target whose type cannot be derived is refused, not skipped', () => {
  it('denies an effect target that resolves to no schema object type', async () => {
    const { executor, updateObject } = harness();

    const result = await executor.execute(
      manifestWith([{ type: 'updateObject', target: 'params.patientId', set: { status: "'x'" } }]),
      { ward: 'w-1' }, wardStaff, ctx, schema,
    );

    expect(updateObject).not.toHaveBeenCalled();
    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
    expect(result.errors[0]?.message).toContain('params.patientId');
  });

  it('does not deny a derivable target on an unmarked type', async () => {
    const { executor, updateObject } = harness();

    const result = await executor.execute(
      manifestWith([{ type: 'updateObject', target: 'ward', set: { name: "'Renamed'" } }]),
      { ward: 'w-1' }, wardStaff, ctx, schema,
    );

    expect(result.errors.some((e) => e.code === 'MARKING_DENIED')).toBe(false);
    expect(updateObject).toHaveBeenCalledWith(
      'Ward', 'w-1', expect.objectContaining({ name: 'Renamed' }), 1,
    );
  });
});
