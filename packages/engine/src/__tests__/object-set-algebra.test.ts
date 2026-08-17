/**
 * Object set algebra — UNION, INTERSECT, DIFFERENCE.
 *
 * Two saved object sets of the same type can be combined into a new set
 * whose filter is the boolean combination of the two input filters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { ObjectManager } from '../objects/object-manager.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';
import { InMemoryObjectSetStore } from '../object-sets/in-memory-object-set-store.js';
import { ObjectSetManager } from '../object-sets/object-set-manager.js';

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

const parsedSchema: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Patient',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'ward', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

const spiSchema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Patient',
      properties: [
        { name: 'name', type: 'string', required: true },
        { name: 'status', type: 'string', required: true },
        { name: 'ward', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

let storage: MemoryStorageProvider;
let objectManager: ObjectManager;
let manager: ObjectSetManager;

beforeEach(async () => {
  storage = new MemoryStorageProvider();
  const eventBus = new InMemoryEventBus();
  const emitter = new EngineEventEmitter(eventBus);
  objectManager = new ObjectManager({ storage, schema: parsedSchema, eventEmitter: emitter });
  const store = new InMemoryObjectSetStore();
  manager = new ObjectSetManager(store, objectManager);
  await storage.applySchema(ctx, spiSchema);

  // Seed patients
  await storage.createObject(ctx, 'Patient', { name: 'Alice', status: 'ACTIVE', ward: 'A' });
  await storage.createObject(ctx, 'Patient', { name: 'Bob', status: 'ACTIVE', ward: 'B' });
  await storage.createObject(ctx, 'Patient', { name: 'Carol', status: 'DISCHARGED', ward: 'A' });
  await storage.createObject(ctx, 'Patient', { name: 'Dave', status: 'ACTIVE', ward: 'C' });
  await storage.createObject(ctx, 'Patient', { name: 'Eve', status: 'DISCHARGED', ward: 'B' });
});

describe('Object set algebra', () => {
  it('UNION combines two sets with OR', async () => {
    const active = await manager.create(
      { name: 'Active', objectType: 'Patient', filter: { field: 'status', operator: 'eq', value: 'ACTIVE' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );
    const wardA = await manager.create(
      { name: 'WardA', objectType: 'Patient', filter: { field: 'ward', operator: 'eq', value: 'A' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );

    const combined = await manager.combine(
      { op: 'UNION', leftSetId: active.id, rightSetId: wardA.id, name: 'Active or Ward A', isPublic: true },
      ctx,
    );

    const page = await manager.execute(combined.id, ctx);
    const names = page.items.map((o) => o.name).sort();
    // Active: Alice, Bob, Dave; Ward A: Alice, Carol → union: Alice, Bob, Carol, Dave
    expect(names).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  it('INTERSECT combines two sets with AND', async () => {
    const active = await manager.create(
      { name: 'Active', objectType: 'Patient', filter: { field: 'status', operator: 'eq', value: 'ACTIVE' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );
    const wardA = await manager.create(
      { name: 'WardA', objectType: 'Patient', filter: { field: 'ward', operator: 'eq', value: 'A' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );

    const combined = await manager.combine(
      { op: 'INTERSECT', leftSetId: active.id, rightSetId: wardA.id, name: 'Active and Ward A', isPublic: true },
      ctx,
    );

    const page = await manager.execute(combined.id, ctx);
    const names = page.items.map((o) => o.name).sort();
    // Active: Alice, Bob, Dave; Ward A: Alice, Carol → intersect: Alice
    expect(names).toEqual(['Alice']);
  });

  it('DIFFERENCE subtracts the right set from the left', async () => {
    const active = await manager.create(
      { name: 'Active', objectType: 'Patient', filter: { field: 'status', operator: 'eq', value: 'ACTIVE' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );
    const wardA = await manager.create(
      { name: 'WardA', objectType: 'Patient', filter: { field: 'ward', operator: 'eq', value: 'A' }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );

    const combined = await manager.combine(
      { op: 'DIFFERENCE', leftSetId: active.id, rightSetId: wardA.id, name: 'Active not Ward A', isPublic: true },
      ctx,
    );

    const page = await manager.execute(combined.id, ctx);
    const names = page.items.map((o) => o.name).sort();
    // Active: Alice, Bob, Dave; Ward A: Alice, Carol → difference: Bob, Dave
    expect(names).toEqual(['Bob', 'Dave']);
  });

  it('rejects combining sets of different object types', async () => {
    const patientSet = await manager.create(
      { name: 'Patients', objectType: 'Patient', filter: { and: [] }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );
    // Create a set with a different objectType by using the store directly
    const wardSet = await manager.create(
      { name: 'Wards', objectType: 'Patient', filter: { and: [] }, isPublic: true, createdBy: 'user-1', tenantId: 'tenant-1' },
      ctx,
    );
    // Manually patch the objectType to simulate a type mismatch
    (wardSet as unknown as Record<string, unknown>).objectType = 'Ward';

    await expect(
      manager.combine(
        { op: 'UNION', leftSetId: patientSet.id, rightSetId: wardSet.id, name: 'Invalid', isPublic: true },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'TYPE_MISMATCH' });
  });
});
