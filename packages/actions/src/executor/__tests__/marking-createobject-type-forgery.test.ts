/**
 * REGRESSION (was ADVERSARIAL): the createObject half of the marking check
 * trusts `effect.objectType` as the type that will be written.
 *
 * The exploit: `executeCreateObject` calls
 * `txn.createObject(effect.objectType, properties)` with the manifest's
 * properties unfiltered, and the memory provider built the row as
 * `{ _tenantId, _type: type, _id, ..., ...properties }` — properties spread
 * LAST, so a manifest property literally named `_type` overwrote the stamped
 * type after the fact. `touchedObjectTypes` saw "Note", found it unmarked, and
 * the caller sailed through; the row then answered to
 * `queryObjects(ctx, 'Patient', ...)`, which filters on `obj._type`, not on the
 * key it was stored under.
 *
 * Closed at three layers, each independently sufficient:
 *   1. storage-memory `_doCreateObject` spreads caller properties FIRST, so the
 *      computed `_type`/`_tenantId` win.
 *   2. storage-postgres `createObject` drops `_`-prefixed keys before building
 *      the INSERT (it used to refuse them only by accident — `snakeCase`
 *      stripped the underscore and the column did not exist).
 *   3. `executeCreateObject` now throws on a `_`-prefixed manifest property
 *      rather than letting the provider drop it silently, so a manifest that
 *      asks for this is named, not quietly reinterpreted.
 *
 * The assertions below are inverted from the original exploit on purpose: they
 * pin the write to the type the manifest declared and the marking check saw.
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

  it('refuses a manifest that sets a system field rather than dropping it', async () => {
    const { storage, executor } = await harness();
    const { manifest } = parseActionManifest(FORGED_YAML);

    const result = await executor.execute(manifest!, { text: 'forged' }, uncleared, ctx, schema);

    expect(result.success).toBe(false);
    expect(result.errors[0]?.message).toContain('_type');

    // Nothing written under either name.
    expect((await storage.queryObjects(REQ_CTX, 'Patient', ALL)).items).toHaveLength(0);
    expect((await storage.queryObjects(REQ_CTX, 'Note', ALL)).items).toHaveLength(0);
  });

  it('stamps the declared type even if the provider is handed a forged _type', async () => {
    // Straight at the provider, bypassing the executor guard above: the
    // storage layer must fail closed on its own, because the executor is not
    // the only writer (sync, bulk load, and the ingest path all reach it).
    const { storage } = await harness();

    const created = await storage.createObject(REQ_CTX, 'Note', {
      text: 'forged',
      _type: 'Patient',
      _tenantId: 'other-tenant',
    } as never);

    expect(created._type).toBe('Note');
    expect(created._tenantId).toBe(REQ_CTX.tenantId);
    expect((await storage.queryObjects(REQ_CTX, 'Patient', ALL)).items).toHaveLength(0);
    expect((await storage.queryObjects(REQ_CTX, 'Note', ALL)).items).toHaveLength(1);
  });
});
