/**
 * `staticTargetType` models the context BEFORE the executor overwrites it.
 *
 * `execute()` builds the effect context in two steps that disagree:
 *
 *   resolveParamObjects()  -> context[<each @param name>] = object loaded from
 *                             storage under the param's DECLARED type
 *   then, unconditionally:  context['params'] = the raw caller params
 *
 * The second assignment clobbers the first whenever an action declares a @param
 * literally named `params`. `staticTargetType` only ever sees the declaration,
 * so for `target: "params.bed"` it walks Ward -> @link bed -> Bed and reports an
 * unmarked type. At runtime `resolveTarget` walks the RAW REQUEST BODY instead,
 * and its first branch (`current[part] !== undefined`) hands back whatever the
 * caller put under `bed` — including a hand-written `{_id, _type: "Patient"}`,
 * which `executeUpdateObject` then writes with `txn.updateObject(target._type,
 * target._id, ...)`.
 *
 * REST feeds `req.body` to `execute()` unfiltered (rest/route-generator.ts
 * :1605 `const input = (req.body ?? {})`), so the extra key needs no schema
 * support at all.
 *
 * Net: an uncleared caller mutates a marked Patient, and `checkMarkings` never
 * hears the name "Patient".
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }

type Bed @objectType { id: ID! @primary  label: String }

type Ward @objectType {
  id: ID! @primary
  name: String
  bed: Bed @link(type: "WardBed", direction: OUTBOUND)
}

type WardBed @linkType(from: "Ward", to: "Bed", cardinality: ONE_TO_ONE) {
  id: ID! @primary
}

type ReserveBed @actionType { params: Ward! @param }
`);

/** Patient is marked; Ward and Bed are not. */
const policy = {
  isEmpty: false,
  requiredFor: (t: string) => (t === 'Patient' ? ['PII'] : []),
  check: (held: readonly string[], required: readonly string[]) => {
    const missing = required.filter((r) => !held.includes(r));
    return { allowed: missing.length === 0, missing };
  },
};

/** Holds a marking — just not Patient's. */
const wardStaff: ActionActor = {
  id: 'u-1', type: 'user', roles: ['admin'], markings: ['WARD_OPS'],
};

const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

const manifest = {
  action: 'ReserveBed',
  preconditions: [],
  effects: [{ type: 'updateObject', target: 'params.bed', set: { status: "'pwned'" } }],
  sideEffects: [],
} as unknown as ActionManifest;

function harness() {
  const updateObject = vi.fn(async (type: string, id: string, props: Record<string, unknown>) => ({
    ...props, _id: id, _type: type, _version: 2,
  }));

  const executor = new ActionExecutor({
    storage: {
      getObject: vi.fn(async (_r: unknown, type: string, id: string) => ({
        _id: id, _type: type, _version: 1, id, name: 'Nightingale',
      })),
      // Ward w-1 has no bed link at all. The exploit never needs one.
      getLinks: vi.fn(async () => ({ items: [] })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        updateObject,
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    // Allows everything, so only the marking can refuse.
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    markingPolicy: policy,
  } as never);

  return { executor, updateObject };
}

describe('effect targets rooted at a clobbered context key', () => {
  /** Exactly what a REST caller POSTs: the declared param, plus one extra key. */
  const body = {
    params: 'w-1',
    bed: { _id: 'p-9', _type: 'Patient', id: 'p-9', status: 'confidential' },
  };

  it('never mutates a marked Patient the caller cannot see', async () => {
    const { executor, updateObject } = harness();

    const result = await executor.execute(manifest, body, wardStaff, ctx, schema);

    // Printed on failure: the exact (type, id) the transaction was handed.
    expect(updateObject.mock.calls.map((c) => [c[0], c[1]])).toEqual([]);
    expect(result.affectedObjects).toEqual([]);
    expect(result.success).toBe(false);
  });

  it('refuses with MARKING_DENIED rather than succeeding', async () => {
    const { executor } = harness();

    const result = await executor.execute(manifest, body, wardStaff, ctx, schema);

    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });

  /**
   * The static side has to land on SOME unmarked type; the runtime side reads
   * the body. So one manifest is a write primitive over every type and id in
   * the ontology, not a bypass for the one type the manifest happens to name.
   */
  it('does not let the body choose the written type and id', async () => {
    const { executor, updateObject } = harness();

    await executor.execute(
      manifest,
      { params: 'w-1', bed: { _id: 'other-1', _type: 'Bed', id: 'other-1' } },
      wardStaff, ctx, schema,
    );

    expect(updateObject.mock.calls.map((c) => [c[0], c[1]])).toEqual([]);
  });
});

describe('the same clobbered root under deleteObject', () => {
  it('never hard-deletes a marked Patient for an uncleared caller', async () => {
    const deleteObject = vi.fn(async () => {});
    const executor = new ActionExecutor({
      storage: {
        getObject: vi.fn(async (_r: unknown, type: string, id: string) => ({
          _id: id, _type: type, _version: 1, id,
        })),
        getLinks: vi.fn(async () => ({ items: [] })),
        capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
        beginTransaction: vi.fn(async () => ({
          deleteObject,
          commit: vi.fn(async () => {}),
          rollback: vi.fn(async () => {}),
        })),
      },
      security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
      cel: { evaluate: vi.fn(async () => ({ value: true })) },
      markingPolicy: policy,
    } as never);

    const result = await executor.execute(
      {
        action: 'ReserveBed',
        preconditions: [],
        effects: [{ type: 'deleteObject', target: 'params.bed', mode: 'hard' }],
        sideEffects: [],
      } as unknown as ActionManifest,
      { params: 'w-1', bed: { _id: 'p-9', _type: 'Patient', id: 'p-9' } },
      wardStaff, ctx, schema,
    );

    expect(deleteObject.mock.calls).toEqual([]);
    expect(result.success).toBe(false);
  });
});
