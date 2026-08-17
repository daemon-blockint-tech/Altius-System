/**
 * A search that names no fields defaults to the type's declared @searchable
 * fields.
 *
 * Before this, "no fields" meant "every text field", resolved independently by
 * each provider and by neither from the schema: Postgres queried
 * information_schema on every call and searched every text/varchar column, and
 * the memory provider searched whichever string keys happened to be PRESENT on
 * each candidate object. Both ignore @searchable — the declaration that
 * decides this, and the only one storage can serve, since @searchable is what
 * emits the pg_trgm GIN index (schema-loader FULLTEXT -> ddl-objects). So the
 * unindexed columns forced a full scan on exactly the queries meant to be fast,
 * and a field nobody declared searchable was searched anyway.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { ObjectManager } from '../objects/object-manager.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

const str = { name: 'String', nonNull: false, isList: false, listElementNonNull: false };

/** Ward declares `name` searchable and `internalNote` not. */
const parsedSchema: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Ward',
      fields: [
        { name: 'name', type: str, directives: [{ kind: 'searchable' }] },
        { name: 'internalNote', type: str, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
    {
      kind: 'objectType',
      name: 'Bed',
      fields: [
        { name: 'label', type: str, directives: [] },
        { name: 'internalNote', type: str, directives: [] },
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
      name: 'Ward',
      properties: [
        { name: 'name', type: 'string', required: false },
        { name: 'internalNote', type: 'string', required: false },
      ],
      indexes: [{ field: 'name', indexType: 'FULLTEXT' }],
    },
    {
      name: 'Bed',
      properties: [
        { name: 'label', type: 'string', required: false },
        { name: 'internalNote', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

let storage: MemoryStorageProvider;
let manager: ObjectManager;

beforeEach(async () => {
  storage = new MemoryStorageProvider();
  manager = new ObjectManager({
    storage,
    schema: parsedSchema,
    eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
  });
  await storage.applySchema(ctx, spiSchema);
});

describe('search defaults to declared @searchable fields', () => {
  it('does not match a term that only appears in an undeclared field', async () => {
    await manager.create('Ward', { name: 'Recovery', internalNote: 'gastro' }, ctx);

    const result = await manager.search('Ward', { query: 'gastro' }, ctx);

    // 'gastro' is in internalNote, which is not @searchable. Previously the
    // provider fallback searched it anyway and this returned the ward.
    expect(result.hits).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it('matches a term in the declared field', async () => {
    await manager.create('Ward', { name: 'Gastro Ward', internalNote: 'x' }, ctx);

    const result = await manager.search('Ward', { query: 'gastro' }, ctx);

    expect(result.hits.map((h) => h.object['name'])).toEqual(['Gastro Ward']);
    // Prefix match on the declared field: exact 3, prefix 2, substring 1.
    expect(result.hits[0]?.score).toBe(2);
  });

  it('still honours an explicit field list that names an undeclared field', async () => {
    // The default applies only when the caller names nothing. Asking for a
    // field explicitly is a different request, and refusing it here would
    // break the callers that already pass `fields`.
    await manager.create('Ward', { name: 'Recovery', internalNote: 'gastro' }, ctx);

    const result = await manager.search(
      'Ward',
      { query: 'gastro', fields: ['internalNote'] },
      ctx,
    );

    expect(result.hits).toHaveLength(1);
  });

  it('falls back to searching everything when the type declares nothing searchable', async () => {
    // Narrowing an undeclared type to zero fields would turn "no @searchable
    // directives yet" into "search returns nothing" — a silent empty result
    // that looks like real data.
    await manager.create('Bed', { label: 'B1', internalNote: 'gastro' }, ctx);

    const result = await manager.search('Bed', { query: 'gastro' }, ctx);

    expect(result.hits).toHaveLength(1);
  });
});
