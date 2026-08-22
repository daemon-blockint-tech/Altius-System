/**
 * The wrapper has to do two things: answer reads for an external dataset from
 * its file, and stay invisible for every ordinary one. The second is the part
 * that broke in the first cut — spreading a class instance dropped every method
 * onto the floor, and only a running gateway noticed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { InMemoryDatasetService, InMemoryBlobStore } from '@altius/storage-memory';
import type { RequestContext } from '@altius/spi';
import { withExternalDatasets } from '../datasets/external-dataset-service.js';

const ctx = { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } as RequestContext;

function shipmentsParquet(): Buffer {
  return Buffer.from(parquetWriteBuffer({
    columnData: [
      { name: 'shipment_id', data: ['SHP-1', 'SHP-2', 'SHP-3'], type: 'STRING' },
      { name: 'pallets', data: [3n, 6n, 9n], type: 'INT64' },
    ],
  }));
}

let blobStore: InMemoryBlobStore;
let inner: InMemoryDatasetService;

beforeEach(() => {
  blobStore = new InMemoryBlobStore();
  inner = new InMemoryDatasetService();
});

async function registerExternal(name = 'lake_shipments') {
  const svc = withExternalDatasets(inner, blobStore);
  const blob = await blobStore.put({
    tenantId: ctx.tenantId, filename: 'shipments.parquet',
    contentType: 'application/vnd.apache.parquet', data: shipmentsParquet(),
  });
  await svc.create(ctx, {
    name,
    schema: { columns: [], version: 1 },
    externalSource: { format: 'parquet', blobId: blob.blobId },
  });
  return svc;
}

describe('external datasets', () => {
  it('reads rows out of the registered file', async () => {
    const svc = await registerExternal();
    const result = await svc.read(ctx, 'lake_shipments');

    expect(result.total).toBe(3);
    expect(result.rows).toEqual([
      { shipment_id: 'SHP-1', pallets: 3 },
      { shipment_id: 'SHP-2', pallets: 6 },
      { shipment_id: 'SHP-3', pallets: 9 },
    ]);
    // No rows were copied into the platform: the dataset holds none of its own.
    expect(result.transactionId).toBe('external');
  });

  it('honours projection and paging against the file', async () => {
    const svc = await registerExternal();
    const page = await svc.read(ctx, 'lake_shipments', { columns: ['shipment_id'], offset: 1, limit: 1 });
    expect(page.rows).toEqual([{ shipment_id: 'SHP-2' }]);
    expect(page.total).toBe(3);
  });

  it('refuses every write with an actionable error, not a silent success', async () => {
    const svc = await registerExternal();
    for (const write of [
      () => svc.insert(ctx, 'lake_shipments', { rows: [{ shipment_id: 'SHP-4' }] }),
      () => svc.update(ctx, 'lake_shipments', {}, { pallets: 1 }),
      () => svc.delete(ctx, 'lake_shipments', {}),
      () => svc.truncate(ctx, 'lake_shipments'),
      () => svc.updateSchema(ctx, 'lake_shipments', { columns: [], version: 2 }),
    ]) {
      await expect(write()).rejects.toThrow(/reads an external source in place and cannot be written to/);
    }
    // And the source is untouched.
    expect((await svc.read(ctx, 'lake_shipments')).total).toBe(3);
  });

  it('says which blob is missing when the registration outlives the file', async () => {
    const svc = await registerExternal('doomed');
    const blobId = (await svc.get(ctx, 'doomed'))!.externalSource!.blobId;

    // The file goes away after registration — a lifecycle the platform does not
    // control, since the source is somebody else's to delete.
    await blobStore.delete(ctx.tenantId, blobId);

    await expect(svc.read(ctx, 'doomed'))
      .rejects.toThrow(new RegExp(`points at blob ${blobId}, which is not in the blob store`));
  });

  it('leaves ordinary datasets completely alone', async () => {
    const svc = withExternalDatasets(inner, blobStore);

    // Every delegated method must still be callable — this is the regression
    // that a spread of the inner instance silently broke.
    const created = await svc.create(ctx, { name: 'ingested', schema: { columns: [{ name: 'a', type: 'string', nullable: true }], version: 1 } });
    expect(created.name).toBe('ingested');
    expect(await svc.get(ctx, 'ingested')).not.toBeNull();
    expect((await svc.list(ctx)).map(d => d.name)).toContain('ingested');

    await svc.insert(ctx, 'ingested', { rows: [{ a: 'x' }] });
    expect((await svc.read(ctx, 'ingested')).rows).toEqual([{ a: 'x' }]);

    await svc.truncate(ctx, 'ingested');
    expect((await svc.read(ctx, 'ingested')).rows).toEqual([]);
    expect(await svc.listTransactions(ctx, 'ingested')).toBeInstanceOf(Array);
    await svc.drop(ctx, 'ingested');
    expect(await svc.get(ctx, 'ingested')).toBeNull();
  });

  it('takes the schema from the file, not from what the caller posted', async () => {
    const svc = await registerExternal();
    const dataset = await svc.get(ctx, 'lake_shipments');

    // Registered with `{ columns: [], version: 1 }` — the footer wins, which is
    // what makes a later projection validate against real columns.
    expect(dataset!.schema.columns).toEqual([
      { name: 'shipment_id', type: 'string', nullable: true },
      { name: 'pallets', type: 'integer', nullable: true },
    ]);
  });

  it('refuses to register a source that is not in the blob store', async () => {
    const svc = withExternalDatasets(inner, blobStore);
    await expect(svc.create(ctx, {
      name: 'ghost-reg',
      schema: { columns: [], version: 1 },
      externalSource: { format: 'parquet', blobId: 'missing' },
    })).rejects.toThrow(/blob missing is not in the blob store/);
    expect(await svc.get(ctx, 'ghost-reg')).toBeNull();
  });

  it('is a no-op when no blob store is configured', async () => {
    const svc = withExternalDatasets(inner, undefined);
    expect(svc).toBe(inner);
  });
});
