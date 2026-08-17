/**
 * @computed fields in filter, orderBy, and aggregate paths.
 *
 * Computed fields are resolved AFTER the storage query returns, so the
 * storage provider cannot filter, sort, or aggregate on them. The
 * ObjectManager bridges this by fetching all rows, evaluating computed
 * fields, and applying the filter/sort/aggregate in memory.
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
  manager = new ObjectManager({
    storage,
    schema,
    eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
    computedFieldEvaluator: new ComputedFieldEvaluator({ storage, schema }),
  });
});

describe('computed field filtering', () => {
  beforeEach(async () => {
    await addWard('Alpha', 3);
    await addWard('Bravo', 0);
    await addWard('Charlie', 2);
    await addWard('Delta', 5);
  });

  it('filters by a computed field with eq', async () => {
    const page = await manager.query(
      'Ward',
      { field: 'currentOccupancy', operator: 'eq', value: 0 },
      undefined,
      ctx,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.name).toBe('Bravo');
  });

  it('filters by a computed field with gt', async () => {
    const page = await manager.query(
      'Ward',
      { field: 'currentOccupancy', operator: 'gt', value: 2 },
      undefined,
      ctx,
    );
    expect(page.items).toHaveLength(2);
    const names = page.items.map((o) => o.name).sort();
    expect(names).toEqual(['Alpha', 'Delta']);
  });

  it('filters by a computed field with gte', async () => {
    const page = await manager.query(
      'Ward',
      { field: 'currentOccupancy', operator: 'gte', value: 3 },
      undefined,
      ctx,
    );
    expect(page.items).toHaveLength(2);
    const names = page.items.map((o) => o.name).sort();
    expect(names).toEqual(['Alpha', 'Delta']);
  });

  it('combines a computed filter with a storage filter via AND', async () => {
    const page = await manager.query(
      'Ward',
      {
        and: [
          { field: 'currentOccupancy', operator: 'gt', value: 1 },
          { field: 'name', operator: 'startsWith', value: 'A' },
        ],
      },
      undefined,
      ctx,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.name).toBe('Alpha');
  });
});

describe('computed field ordering', () => {
  beforeEach(async () => {
    await addWard('Alpha', 3);
    await addWard('Bravo', 0);
    await addWard('Charlie', 2);
    await addWard('Delta', 5);
  });

  it('orders by a computed field ascending', async () => {
    const page = await manager.query(
      'Ward',
      { and: [] },
      { orderBy: [{ field: 'currentOccupancy', direction: 'asc' }] },
      ctx,
    );
    const occupancies = page.items.map((o) => o.currentOccupancy);
    expect(occupancies).toEqual([0, 2, 3, 5]);
  });

  it('orders by a computed field descending', async () => {
    const page = await manager.query(
      'Ward',
      { and: [] },
      { orderBy: [{ field: 'currentOccupancy', direction: 'desc' }] },
      ctx,
    );
    const occupancies = page.items.map((o) => o.currentOccupancy);
    expect(occupancies).toEqual([5, 3, 2, 0]);
  });

  it('combines computed orderBy with a storage filter', async () => {
    const page = await manager.query(
      'Ward',
      { field: 'currentOccupancy', operator: 'gte', value: 2 },
      { orderBy: [{ field: 'currentOccupancy', direction: 'desc' }] },
      ctx,
    );
    const occupancies = page.items.map((o) => o.currentOccupancy);
    expect(occupancies).toEqual([5, 3, 2]);
  });
});

describe('computed field aggregation', () => {
  beforeEach(async () => {
    await addWard('Alpha', 3);
    await addWard('Bravo', 0);
    await addWard('Charlie', 2);
    await addWard('Delta', 5);
  });

  it('aggregates a computed field with sum', async () => {
    const result = await manager.aggregate(
      'Ward',
      {
        fields: [{ field: 'currentOccupancy', fn: 'sum', alias: 'totalOccupancy' }],
      },
      ctx,
    );
    expect(result.totalGroups).toBe(1);
    expect(result.groups[0]!.values.totalOccupancy).toBe(10);
  });

  it('aggregates a computed field with max', async () => {
    const result = await manager.aggregate(
      'Ward',
      {
        fields: [{ field: 'currentOccupancy', fn: 'max', alias: 'maxOccupancy' }],
      },
      ctx,
    );
    expect(result.groups[0]!.values.maxOccupancy).toBe(5);
  });

  it('aggregates a computed field with count', async () => {
    const result = await manager.aggregate(
      'Ward',
      {
        fields: [{ field: 'currentOccupancy', fn: 'count', alias: 'wardCount' }],
      },
      ctx,
    );
    expect(result.groups[0]!.values.wardCount).toBe(4);
  });

  it('groups by a computed field', async () => {
    // Group wards by whether occupancy > 0 (we can't express that in a
    // groupBy directly, but we can group by the computed value itself).
    const result = await manager.aggregate(
      'Ward',
      {
        fields: [{ field: '*', fn: 'count', alias: 'wardCount' }],
        groupBy: ['currentOccupancy'],
      },
      ctx,
    );
    expect(result.totalGroups).toBe(4); // 0, 2, 3, 5
    const byOccupancy = Object.fromEntries(
      result.groups.map((g) => [g.keys.currentOccupancy, g.values.wardCount]),
    );
    expect(byOccupancy).toEqual({ 0: 1, 2: 1, 3: 1, 5: 1 });
  });
});
