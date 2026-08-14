import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { ObjectManager, InMemoryEventBus, EngineEventEmitter } from '@altius/engine';
import type { RequestContext } from '@altius/spi';
import type { MappedObject } from '@altius/sync';
import { createEngineChangeApplier, resolveEnvPlaceholders, startSyncScheduler } from '../sync-boot.js';
import type { ConnectorManifest } from '../schema-loader.js';

const schema = parseOdl(`
  extend schema @namespace(name: "test.sync", version: "1.0.0")
  type Widget @objectType {
    id: ID! @primary
    serial: String! @unique
    code: String @indexed
    name: String
  }
`);

const ctx: RequestContext = { tenantId: 'sync-test', actorId: 'sync:TestSource' };

function makeManager() {
  const storage = new MemoryStorageProvider();
  const emitter = new EngineEventEmitter(new InMemoryEventBus());
  return { storage, objectManager: new ObjectManager({ storage, schema, eventEmitter: emitter }) };
}

function mapped(overrides: Partial<MappedObject> = {}): MappedObject {
  return {
    objectType: 'Widget',
    id: 'W-001',
    properties: { name: 'First' },
    operation: 'INSERT',
    links: [],
    ...overrides,
  };
}

describe('resolveEnvPlaceholders', () => {
  it('substitutes ${VAR} from env', () => {
    expect(resolveEnvPlaceholders('postgres://u@${SYNC_TEST_HOST}/db', { SYNC_TEST_HOST: 'h:5432' }))
      .toBe('postgres://u@h:5432/db');
  });

  it('throws on unset variables', () => {
    expect(() => resolveEnvPlaceholders('${SYNC_TEST_MISSING}/db', {})).toThrow(/SYNC_TEST_MISSING/);
  });

  it('passes through literals untouched', () => {
    expect(resolveEnvPlaceholders('postgres://localhost/db', {})).toBe('postgres://localhost/db');
  });
});

describe('createEngineChangeApplier', () => {
  it('rejects system key fields at build time', () => {
    const { objectManager } = makeManager();
    expect(() => createEngineChangeApplier({ objectManager, keyField: 'id', ctx })).toThrow(/storage-minted/);
    expect(() => createEngineChangeApplier({ objectManager, keyField: '_id', ctx })).toThrow(/storage-minted/);
  });

  it('creates, updates, and soft-deletes by natural key', async () => {
    const { objectManager } = makeManager();
    const apply = createEngineChangeApplier({ objectManager, keyField: 'serial', ctx });

    // INSERT → object created with the natural key stored
    await apply(mapped(), 'TestSource');
    let page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-001' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    expect(page.items[0]!).toMatchObject({ serial: 'W-001', name: 'First' });
    const storageId = page.items[0]!._id;

    // UPDATE with same natural key → same object updated, no duplicate
    await apply(mapped({ operation: 'UPDATE', properties: { name: 'Renamed' } }), 'TestSource');
    page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-001' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    expect(page.items[0]!._id).toBe(storageId);
    expect(page.items[0]!.name).toBe('Renamed');

    // DELETE → soft-deleted, invisible to queries
    await apply(mapped({ operation: 'DELETE' }), 'TestSource');
    page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-001' }, undefined, ctx);
    expect(page.totalCount).toBe(0);

    // DELETE of a nonexistent key is a no-op, not an error
    await expect(apply(mapped({ id: 'W-404', operation: 'DELETE' }), 'TestSource')).resolves.toBeUndefined();
  });

  it('fails loudly on an ambiguous natural key (non-unique key field)', async () => {
    const { objectManager } = makeManager();
    await objectManager.create('Widget', { serial: 'S1', code: 'DUP', name: 'a' }, ctx);
    await objectManager.create('Widget', { serial: 'S2', code: 'DUP', name: 'b' }, ctx);
    const apply = createEngineChangeApplier({ objectManager, keyField: 'code', ctx });
    await expect(apply(mapped({ id: 'DUP' }), 'TestSource')).rejects.toThrow(/ambiguous/);
  });
});

describe('startSyncScheduler', () => {
  function manifest(config: Record<string, unknown>): ConnectorManifest {
    return { connector: 'jdbc', config, packName: 'test-pack' };
  }

  const baseConfig = {
    datasource: 'Src',
    connector: 'jdbc',
    connection: { url: 'postgres://x/y', table: 't' },
    mapping: { objectType: 'Widget', primaryKey: { source: 'sid', target: 'serial' }, properties: {} },
  };

  it('schedules nothing when manifests are OVERLAY, unparseable, or missing env', async () => {
    const { createDefaultRegistry } = await import('@altius/sync');
    const { objectManager } = makeManager();
    const result = await startSyncScheduler({
      connectorManifests: [
        manifest({ ...baseConfig, sync: { mode: 'OVERLAY' } }),
        manifest({ ...baseConfig, datasource: 'NoEnv', connection: { url: '${SYNC_TEST_UNSET_VAR}', table: 't' }, sync: { mode: 'POLLING' } }),
        manifest({ broken: true }),
      ],
      registry: createDefaultRegistry(),
      objectManager,
      tenantId: 'sync-test',
    });
    expect(result.scheduler).toBeNull();
    expect(result.scheduled).toEqual([]);
    await result.stop(); // no-op must not throw
  });

  it('rejects target:"id" datasources loudly (skipped, not fatal)', async () => {
    const { createDefaultRegistry } = await import('@altius/sync');
    const { objectManager } = makeManager();
    const result = await startSyncScheduler({
      connectorManifests: [
        manifest({ ...baseConfig, mapping: { ...baseConfig.mapping, primaryKey: { source: 'sid', target: 'id' } }, sync: { mode: 'POLLING' } }),
      ],
      registry: createDefaultRegistry(),
      objectManager,
      tenantId: 'sync-test',
    });
    expect(result.scheduled).toEqual([]);
  });
});
