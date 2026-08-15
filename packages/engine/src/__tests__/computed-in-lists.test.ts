/**
 * @computed fields on the list paths.
 *
 * Derived properties used to resolve only on get(), so every table, list and
 * search result showed them as null — the one place a user is most likely to
 * look at them. These drive ObjectManager.query()/search() end to end.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  currentOccupancy: Int @computed(fn: "countLinks", args: { type: "AdmittedTo" })
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

let storage: MemoryStorageProvider;
let manager: ObjectManager;
let schema: ParsedSchema;
let getLinksCalls: number;

/** Create a ward with `occupancy` patients admitted to it. */
async function addWard(name: string, occupancy: number): Promise<string> {
  const ward = await storage.createObject(ctx, 'Ward', { name });
  for (let i = 0; i < occupancy; i++) {
    const patient = await storage.createObject(ctx, 'Patient', { name: `${name}-p${i}` });
    await storage.createLink(ctx, 'AdmittedTo', patient._id, ward._id);
  }
  return ward._id;
}

beforeEach(async () => {
  schema = parseOdl(ODL);
  storage = new MemoryStorageProvider();
  await storage.applySchema(ctx, spiSchema);

  getLinksCalls = 0;
  const realGetLinks = storage.getLinks.bind(storage);
  storage.getLinks = (...args: Parameters<typeof realGetLinks>) => {
    getLinksCalls++;
    return realGetLinks(...args);
  };

  manager = new ObjectManager({
    storage,
    schema,
    eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
    computedFieldEvaluator: new ComputedFieldEvaluator({ storage, schema }),
  });
});

describe('@computed fields on list paths', () => {
  it('resolves computed fields on every row of query()', async () => {
    await addWard('Alpha', 3);
    await addWard('Bravo', 0);
    await addWard('Charlie', 2);

    const page = await manager.query('Ward', { and: [] }, undefined, ctx);

    expect(page.items).toHaveLength(3);
    const occupancy = Object.fromEntries(
      page.items.map((o) => [o.name as string, o.currentOccupancy]),
    );
    expect(occupancy).toEqual({ Alpha: 3, Bravo: 0, Charlie: 2 });
  });

  it('resolves computed fields on every hit of search()', async () => {
    await addWard('Alpha ward', 4);
    await addWard('Bravo ward', 1);

    const result = await manager.search('Ward', { query: 'ward' }, ctx);

    expect(result.hits).toHaveLength(2);
    const occupancy = Object.fromEntries(
      result.hits.map((h) => [h.object.name as string, h.object.currentOccupancy]),
    );
    expect(occupancy).toEqual({ 'Alpha ward': 4, 'Bravo ward': 1 });
  });

  it('matches what get() returns for the same object', async () => {
    const wardId = await addWard('Alpha', 2);

    const single = await manager.get('Ward', wardId, ctx);
    const page = await manager.query('Ward', { and: [] }, undefined, ctx);

    expect(page.items[0]!.currentOccupancy).toBe(single!.currentOccupancy);
  });

  it('does no evaluation work for a type that declares no computed fields', async () => {
    await addWard('Alpha', 2);
    getLinksCalls = 0;

    const page = await manager.query('Patient', { and: [] }, undefined, ctx);

    expect(page.items).toHaveLength(2);
    expect(getLinksCalls).toBe(0);
  });
});
