/**
 * Tests for the webhook ingest handler (T6).
 *
 * Validates authentication, datasource lookup, mapping, and upsert behavior
 * using a mock ObjectManager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseOdl } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { ObjectManager, InMemoryEventBus, EngineEventEmitter } from '@altius/engine';
import { createIngestHandler } from '../ingest-handler.js';

const schema = parseOdl(`
  extend schema @namespace(name: "test.ingest", version: "1.0.0")
  type Widget @objectType {
    id: ID! @primary
    serial: String! @unique
    name: String
  }
`);

const ctx = { tenantId: 'ingest-test', actorId: 'ingest:TestSource' };

function makeManager() {
  const storage = new MemoryStorageProvider();
  const emitter = new EngineEventEmitter(new InMemoryEventBus());
  return { storage, objectManager: new ObjectManager({ storage, schema, eventEmitter: emitter }) };
}

const datasourceMappings = new Map<string, Record<string, unknown>>([
  ['TestSource', {
    datasource: 'TestSource',
    connector: 'webhook',
    connection: { url: 'n/a', table: 'widgets' },
    mapping: {
      objectType: 'Widget',
      primaryKey: { source: 'serial', target: 'serial' },
      properties: {
        serial: { source: 'serial' },
        name: { source: 'name' },
      },
    },
    sync: { mode: 'POLLING' },
  }],
]);

describe('createIngestHandler', () => {
  let handler: ReturnType<typeof createIngestHandler>;
  let objectManager: ObjectManager;

  beforeEach(() => {
    const mgr = makeManager();
    objectManager = mgr.objectManager;
    handler = createIngestHandler({
      objectManager,
      datasourceMappings,
      ingestSecret: 'secret-123',
      tenantId: 'ingest-test',
    });
  });

  it('rejects requests without X-Ingest-Secret', async () => {
    const res = await handler({ datasource: 'TestSource', body: { serial: 'W-1', name: 'Foo' } });
    expect(res.status).toBe(401);
    expect(res.body.accepted).toBe(0);
  });

  it('rejects requests with wrong secret', async () => {
    const res = await handler({ datasource: 'TestSource', body: { serial: 'W-1' }, secret: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown datasource', async () => {
    const res = await handler({ datasource: 'Unknown', body: {}, secret: 'secret-123' });
    expect(res.status).toBe(404);
  });

  it('upserts a single record', async () => {
    const res = await handler({
      datasource: 'TestSource',
      body: { serial: 'W-1', name: 'First' },
      secret: 'secret-123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(0);

    const page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-1' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    expect(page.items[0]!.name).toBe('First');
  });

  it('upserts a batch of records', async () => {
    const res = await handler({
      datasource: 'TestSource',
      body: [
        { serial: 'W-1', name: 'First' },
        { serial: 'W-2', name: 'Second' },
      ],
      secret: 'secret-123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected).toBe(0);

    const page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-1' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    const page2 = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-2' }, undefined, ctx);
    expect(page2.totalCount).toBe(1);
  });

  it('updates an existing record on duplicate natural key', async () => {
    // First insert
    await handler({ datasource: 'TestSource', body: { serial: 'W-1', name: 'First' }, secret: 'secret-123' });
    // Second insert with same key → update
    const res = await handler({
      datasource: 'TestSource',
      body: { serial: 'W-1', name: 'Renamed' },
      secret: 'secret-123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);

    const page = await objectManager.query('Widget', { field: 'serial', operator: 'eq', value: 'W-1' }, undefined, ctx);
    expect(page.totalCount).toBe(1);
    expect(page.items[0]!.name).toBe('Renamed');
  });

  it('rejects invalid records and reports errors', async () => {
    const res = await handler({
      datasource: 'TestSource',
      body: 'not an object',
      secret: 'secret-123',
    });
    expect(res.body.rejected).toBe(1);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});
