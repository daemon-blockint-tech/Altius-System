/**
 * ADVERSARIAL: the createObject half of the marking check trusts
 * `effect.objectType` as the type that will be written. It is not.
 *
 * `executeCreateObject` calls `txn.createObject(effect.objectType, properties)`
 * with the manifest's properties unfiltered, and the memory provider builds the
 * row as `{ _tenantId, _type: type, _id, ..., ...properties }` — properties
 * spread LAST. A manifest property literally named `_type` therefore overwrites
 * the stamped type after the fact.
 *
 * Nothing upstream stops it: the manifest parser accepts any property key, and
 * `validateSchemaFields` only walks fields the type declares, so an undeclared
 * `_type` is not rejected. `touchedObjectTypes` sees "Note", finds it unmarked,
 * and the caller sails through.
 *
 * The row then answers to `queryObjects(ctx, 'Patient', ...)`, which filters on
 * `obj._type`, not on the key it was stored under. So an actor holding no PII
 * marking has put a row into the Patient collection every PII-cleared reader
 * sees — the type name never named literally, resolved from a property value.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext } from '@altius/spi';

import { ActionExecutor } from '../action-executor.js';
import { parseActionManifest } from '../../parser/index.js';
import type { ActionActor, ActionContext } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  text: String }
type Note @objectType { id: ID! @primary  text: String }

type FileNote @actionType { text: String @param }
`);

/** Patient is marked; Note is not. */
const policy = {
  isEmpty: false,
  requiredFor: (t: string) => (t === 'Patient' ? ['PII'] : []),
  check: (held: readonly string[], required: readonly string[]) => {
    const missing = required.filter((r) => !held.includes(r));
    return { allowed: missing.length === 0, missing };
  },
};

const REQ_CTX: RequestContext = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' };
const ctx = { requestContext: REQ_CTX } as ActionContext;
/** Holds nothing. Must never be able to put a row into Patient. */
const uncleared: ActionActor = { id: 'u-1', type: 'user', roles: ['clerk'], markings: [] };

/** Declares Note, writes Patient. */
const FORGED_YAML = `
action: FileNote
version: 1
reversible: false

effects:
  - type: createObject
    objectType: Note
    properties:
      text: "params.text"
      _type: "'Patient'"
`;

/** The same write, named honestly — the case the fix does catch. */
const HONEST_YAML = `
action: FileNote
version: 1
reversible: false

effects:
  - type: createObject
    objectType: Patient
    properties:
      text: "params.text"
`;

async function harness() {
  const storage = new MemoryStorageProvider();
  await storage.applySchema(REQ_CTX, {
    version: 1,
    objectTypes: [
      { name: 'Patient', properties: [{ name: 'text', type: 'String' }] },
      { name: 'Note', properties: [{ name: 'text', type: 'String' }] },
    ],
    linkTypes: [],
  });

  const executor = new ActionExecutor({
    storage,
    security: { checkPermission: async () => ({ allowed: true }) },
    cel: { evaluate: async () => ({ value: true }) },
    markingPolicy: policy,
  } as never);

  return { storage, executor };
}

const ALL = { field: 'text', operator: 'neq' as const, value: '__never__' };

describe('createObject: the written type is not always the declared one', () => {
  it('denies the honest Patient create — the fix works when the name is literal', async () => {
    const { storage, executor } = await harness();
    const { manifest } = parseActionManifest(HONEST_YAML);

    const result = await executor.execute(manifest!, { text: 'x' }, uncleared, ctx, schema);

    expect(result.errors[0]?.code).toBe('MARKING_DENIED');
    expect((await storage.queryObjects(REQ_CTX, 'Patient', ALL)).items).toHaveLength(0);
  });

  it('lets an uncleared caller put a row into Patient via a forged _type property', async () => {
    const { storage, executor } = await harness();
    const { manifest } = parseActionManifest(FORGED_YAML);

    const result = await executor.execute(manifest!, { text: 'forged' }, uncleared, ctx, schema);

    // The marking check saw only "Note".
    expect(result.errors.some((e) => e.code === 'MARKING_DENIED')).toBe(false);
    expect(result.success).toBe(true);

    // The load-bearing assertion: the platform now serves this row as a
    // Patient, to readers gated on the PII marking the writer never held.
    const patients = await storage.queryObjects(REQ_CTX, 'Patient', ALL);
    expect(patients.items).toHaveLength(1);
    expect(patients.items[0]!['text']).toBe('forged');
    expect(patients.items[0]!._type).toBe('Patient');

    // And it is not in Note at all — it did not merely leak, it moved.
    expect((await storage.queryObjects(REQ_CTX, 'Note', ALL)).items).toHaveLength(0);
  });

  it('audits the write as Note, so the trail never names Patient either', async () => {
    const { executor } = await harness();
    const { manifest } = parseActionManifest(FORGED_YAML);

    const result = await executor.execute(manifest!, { text: 'forged' }, uncleared, ctx, schema);

    expect(result.affectedObjects.map((a) => a.type)).toEqual(['Note']);
  });
});
