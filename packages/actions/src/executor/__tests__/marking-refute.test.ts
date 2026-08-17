/**
 * ADVERSARIAL: does the effect-target marking check still have a hole?
 *
 * Case 1 — structural-only mode. When the manifest's action is absent from
 * schema.actionTypes, resolveParamObjects does `Object.assign(resolved, params)`
 * and every caller-supplied param becomes a TOP-LEVEL context key, unvalidated.
 * executeCreateObject binds its result only `if (!(contextKey in context))`, so
 * a caller param named `note` WINS over a `createObject "Note"`. staticTargetType
 * has no actionTypeDef to consult, falls back to the createObject binding, and
 * reports "Note". The runtime writes whatever `_type` the caller fabricated.
 *
 * Case 2 — the stored link row's `_toType` vs the schema's declared endpoint.
 * staticTargetType uses linkDef.to; resolveTarget uses link._toType off the row.
 *
 * Case 3 — resolveTarget takes `current[part]` and only falls back to the @link
 * hop when that is undefined. staticTargetType models the hop and nothing else,
 * so a stored property named after a @link field is a write the check cannot see.
 *
 * All three end with `success: true`, `errors: []`, and
 * txn.updateObject('Patient', 'p-9', …) for an actor holding ['WARD_OPS'].
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

/** Patient is marked; nothing else is. */
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

function harness(opts: {
  getObject?: unknown;
  getLinks?: unknown;
}) {
  const updateObject = vi.fn(async (type: string, id: string, props: Record<string, unknown>) => ({
    ...props, _id: id, _type: type, _version: 2,
  }));
  const deleteObject = vi.fn(async () => {});
  const createObject = vi.fn(async (type: string, props: Record<string, unknown>) => ({
    ...props, _id: `${type.toLowerCase()}-new`, _type: type, _version: 1,
  }));

  const executor = new ActionExecutor({
    storage: {
      getObject: opts.getObject ?? vi.fn(async () => null),
      getLinks: opts.getLinks ?? vi.fn(async () => ({ items: [] })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        createObject, updateObject, deleteObject,
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    markingPolicy: policy,
  } as never);

  return { executor, updateObject, deleteObject, createObject };
}

// ───────────────────────── Case 1 ─────────────────────────

describe('structural-only mode: caller param shadows the createObject binding', () => {
  // NOTE: no @actionType is declared. The executor explicitly supports this
  // ("If no schema definition, skip validation (structural-only mode)").
  const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }
type Note    @objectType { id: ID! @primary  body: String }
`);

  const manifest = {
    action: 'FileNote',
    preconditions: [],
    effects: [
      // Static binding: "note" -> Note (unmarked). Never actually reached at
      // runtime as the context key, because the caller already owns "note".
      { type: 'createObject', objectType: 'Note', properties: { id: "'n-1'", body: "'x'" } },
      { type: 'updateObject', target: 'note', set: { status: "'seen'" } },
    ],
    sideEffects: [],
  } as unknown as ActionManifest;

  it('does not let an uncleared caller mutate a marked Patient', async () => {
    const { executor, updateObject } = harness({});

    const result = await executor.execute(
      manifest,
      // Undeclared, unvalidated, caller-controlled — lands in the context verbatim.
      { note: { _id: 'p-9', _type: 'Patient', id: 'p-9', status: 'old', _version: 1 } },
      wardStaff,
      ctx,
      schema,
    );


    expect(updateObject).not.toHaveBeenCalled();
    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
  });
});

// ───────────────────────── Case 2 ─────────────────────────

describe('link hop: stored _toType vs the schema-declared endpoint', () => {
  const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }
type Bed     @objectType { id: ID! @primary  label: String }

type Ward @objectType {
  id: ID! @primary
  name: String
  slot: Bed @link(type: "WardSlot", direction: OUTBOUND)
}

type WardSlot @linkType(from: "Ward", to: "Bed", cardinality: ONE_TO_ONE) { id: ID! @primary }

type TouchSlot @actionType { ward: Ward! @param }
`);

  const manifest = {
    action: 'TouchSlot',
    preconditions: [],
    effects: [{ type: 'updateObject', target: 'ward.slot', set: { status: "'seen'" } }],
    sideEffects: [],
  } as unknown as ActionManifest;

  it('does not let a mistyped link row route the write to a marked Patient', async () => {
    const { executor, updateObject } = harness({
      getObject: vi.fn(async (_r: unknown, type: string, id: string) =>
        type === 'Ward'
          ? { _id: id, _type: 'Ward', _version: 1, id, name: 'Nightingale' }
          : { _id: id, _type: type, _version: 1, id, status: 'old' },
      ),
      // Declared to: "Bed" — the row says Patient.
      getLinks: vi.fn(async () => ({
        items: [{ _id: 'l-1', _fromId: 'w-1', _fromType: 'Ward', _toId: 'p-9', _toType: 'Patient' }],
      })),
    });

    await executor.execute(manifest, { ward: 'w-1' }, wardStaff, ctx, schema);


    expect(updateObject).not.toHaveBeenCalled();
  });

  // Case 3: resolveTarget takes `current[part]` BEFORE trying the @link hop.
  // staticTargetType only ever models the hop. A stored row carrying a
  // property named like a @link field routes the write past the check.
  it('does not let a stored property shadow the @link field it is named after', async () => {
    const { executor, updateObject } = harness({
      getObject: vi.fn(async (_r: unknown, type: string, id: string) =>
        type === 'Ward'
          ? {
              _id: id, _type: 'Ward', _version: 1, id, name: 'Nightingale',
              // Undeclared property. validateSchemaFields ignores extras, so
              // nothing on the write path strips or rejects it.
              slot: { _id: 'p-9', _type: 'Patient', _version: 1, id: 'p-9', status: 'old' },
            }
          : { _id: id, _type: type, _version: 1, id, status: 'old' },
      ),
      // The declared link is honest: WardSlot -> Bed. It is never consulted.
      getLinks: vi.fn(async () => ({
        items: [{ _id: 'l-1', _fromId: 'w-1', _fromType: 'Ward', _toId: 'b-1', _toType: 'Bed' }],
      })),
    });

    await executor.execute(manifest, { ward: 'w-1' }, wardStaff, ctx, schema);


    expect(updateObject).not.toHaveBeenCalled();
  });
});
