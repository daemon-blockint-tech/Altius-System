import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { ObjectManager } from '../objects/object-manager.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Fixtures — an ObjectType whose @primary field is NOT named `id`.
//
// `accessionId` is an alias for the system `_id` column: storage never creates
// a column for it (the Postgres DDL skips @primary, and the memory provider
// only ever holds what create() stored). But codegen still advertises
// `accessionId: IDFilter` and `accessionId: SortDirection`, so a client using
// the published schema filters and sorts on a name storage has never heard of.
// ---------------------------------------------------------------------------

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

const parsedSchema: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Specimen',
      fields: [
        {
          name: 'accessionId',
          type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false },
          directives: [{ kind: 'primary' }],
        },
        {
          name: 'label',
          type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
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
      name: 'Specimen',
      properties: [{ name: 'label', type: 'string', required: true }],
    },
  ],
  linkTypes: [],
};

let storage: MemoryStorageProvider;
let manager: ObjectManager;

describe('@primary field filtering and sorting', () => {
  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    manager = new ObjectManager({
      storage,
      schema: parsedSchema,
      eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
    });
    await storage.applySchema(ctx, spiSchema);
  });

  it('filters by the @primary field name', async () => {
    const a = await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);

    const page = await manager.query(
      'Specimen',
      { field: 'accessionId', operator: 'eq', value: a._id },
      undefined,
      ctx,
    );

    expect(page.items.map((i) => i.label)).toEqual(['alpha']);
  });

  it('filters by the @primary field with the `in` operator', async () => {
    const a = await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);
    const c = await manager.create('Specimen', { label: 'gamma' }, ctx);

    const page = await manager.query(
      'Specimen',
      { field: 'accessionId', operator: 'in', value: [a._id, c._id] },
      undefined,
      ctx,
    );

    expect(page.items.map((i) => i.label).sort()).toEqual(['alpha', 'gamma']);
  });

  it('sorts by the @primary field', async () => {
    const created = [
      await manager.create('Specimen', { label: 'alpha' }, ctx),
      await manager.create('Specimen', { label: 'beta' }, ctx),
      await manager.create('Specimen', { label: 'gamma' }, ctx),
    ];
    const expected = [...created]
      .sort((x, y) => (x._id < y._id ? 1 : -1))
      .map((o) => o.label);

    const page = await manager.query(
      'Specimen',
      { and: [] },
      { orderBy: [{ field: 'accessionId', direction: 'desc' }] },
      ctx,
    );

    expect(page.items.map((i) => i.label)).toEqual(expected);
  });

  it('leaves a non-primary field name alone', async () => {
    await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);

    const page = await manager.query(
      'Specimen',
      { field: 'label', operator: 'eq', value: 'beta' },
      undefined,
      ctx,
    );

    expect(page.items.map((i) => i.label)).toEqual(['beta']);
  });
});

/**
 * query() was fixed first; aggregate() and search() were left as bare
 * pass-throughs to storage, so the same declared @primary name still reached
 * a provider as a column that does not exist — Postgres raises, memory
 * silently matches nothing. A silent empty result is the worse half: it looks
 * like data.
 */
describe('@primary on aggregate and search', () => {
  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    manager = new ObjectManager({
      storage,
      schema: parsedSchema,
      eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
    });
    await storage.applySchema(ctx, spiSchema);
  });

  it('filters an aggregate on the declared @primary name', async () => {
    const alpha = await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);

    const result = await manager.aggregate(
      'Specimen',
      {
        fields: [{ field: '*', fn: 'count', alias: 'n' }],
        filter: { field: 'accessionId', operator: 'eq', value: alpha._id },
      },
      ctx,
    );

    expect(result.groups[0]?.values['n']).toBe(1);
  });

  it('groups by the declared @primary name', async () => {
    await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);

    const result = await manager.aggregate(
      'Specimen',
      { fields: [{ field: '*', fn: 'count' }], groupBy: ['accessionId'] },
      ctx,
    );

    // One group per object, keyed by the id — not one empty group.
    expect(result.groups).toHaveLength(2);
  });

  it('filters a search on the declared @primary name', async () => {
    const alpha = await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'alphabet' }, ctx);

    const result = await manager.search(
      'Specimen',
      { query: 'alpha', filter: { field: 'accessionId', operator: 'eq', value: alpha._id } },
      ctx,
    );

    expect(result.hits.map((h) => h.object['label'])).toEqual(['alpha']);
  });

  it('leaves a non-primary field alone on aggregate', async () => {
    await manager.create('Specimen', { label: 'alpha' }, ctx);
    await manager.create('Specimen', { label: 'beta' }, ctx);

    const result = await manager.aggregate(
      'Specimen',
      {
        fields: [{ field: '*', fn: 'count', alias: 'n' }],
        filter: { field: 'label', operator: 'eq', value: 'beta' },
      },
      ctx,
    );

    expect(result.groups[0]?.values['n']).toBe(1);
  });
});
