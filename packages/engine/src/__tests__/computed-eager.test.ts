/**
 * @computed fields declared with cache: EAGER must be evaluated on read,
 * not silently dropped.
 *
 * The evaluator's getComputedFields filtered to LAZY-or-absent, so a field
 * declared `@computed(fn: "countLinks", cache: EAGER)` was emitted into the
 * SDL/REST shape but never evaluated — silently null, no warning. EAGER
 * should be treated the same as LAZY until a write-time pre-computation
 * pipeline exists.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { ObjectManager } from '../objects/object-manager.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';
import { ComputedFieldEvaluator } from '../computed/computed-field-evaluator.js';

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType {
  id: ID! @primary
  name: String
  eagerOccupancy: Int @computed(fn: "countLinks", args: { type: "AdmittedTo" }, cache: EAGER)
  lazyOccupancy: Int @computed(fn: "countLinks", args: { type: "AdmittedTo" })
}

type Patient @objectType {
  id: ID! @primary
  name: String
}

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}
`;

const spiSchema: OntologySchema = {
  version: 1,
  objectTypes: [
    { name: 'Ward', properties: [{ name: 'name', type: 'String' }] },
    { name: 'Patient', properties: [{ name: 'name', type: 'String' }] },
  ],
  linkTypes: [
    { name: 'AdmittedTo', fromType: 'Patient', toType: 'Ward', cardinality: 'MANY_TO_ONE' },
  ],
};

describe('EAGER computed fields are evaluated on read', () => {
  let schema: ParsedSchema;
  let storage: MemoryStorageProvider;
  let manager: ObjectManager;

  beforeAll(async () => {
    schema = parseOdl(ODL);
    storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, spiSchema);

    manager = new ObjectManager({
      storage,
      schema,
      eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
      computedFieldEvaluator: new ComputedFieldEvaluator({ storage, schema }),
    });

    // Create a ward and two patients linked to it
    const ward = await storage.createObject(ctx, 'Ward', { name: 'A' });
    const p1 = await storage.createObject(ctx, 'Patient', { name: 'Alice' });
    const p2 = await storage.createObject(ctx, 'Patient', { name: 'Bob' });
    await storage.createLink(ctx, 'AdmittedTo', p1._id, ward._id);
    await storage.createLink(ctx, 'AdmittedTo', p2._id, ward._id);
  });

  it('evaluates an EAGER computed field on get', async () => {
    const wards = await manager.query('Ward', { and: [] }, undefined, ctx);
    const ward = wards.items[0]!;
    const fetched = await manager.get('Ward', ward._id, ctx);
    expect(fetched).not.toBeNull();
    expect(fetched!['eagerOccupancy']).toBe(2);
  });

  it('evaluates an EAGER computed field on query (list path)', async () => {
    const page = await manager.query('Ward', { and: [] }, undefined, ctx);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!['eagerOccupancy']).toBe(2);
  });

  it('evaluates both EAGER and LAZY computed fields on the same object', async () => {
    const page = await manager.query('Ward', { and: [] }, undefined, ctx);
    const ward = page.items[0]!;
    expect(ward['eagerOccupancy']).toBe(2);
    expect(ward['lazyOccupancy']).toBe(2);
  });
});
