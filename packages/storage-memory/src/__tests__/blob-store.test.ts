/**
 * Tests for the InMemoryBlobStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBlobStore } from '../in-memory-blob-store.js';

describe('InMemoryBlobStore', () => {
  let store: InMemoryBlobStore;

  beforeEach(() => {
    store = new InMemoryBlobStore();
  });

  it('stores and retrieves a blob', async () => {
    const data = Buffer.from('hello world');
    const result = await store.put({
      tenantId: 'tenant-1',
      filename: 'test.txt',
      contentType: 'text/plain',
      data,
      uploadedBy: 'user-1',
    });

    expect(result.blobId).toBeTruthy();
    expect(result.size).toBe(11);
    expect(result.sha256).toHaveLength(64);

    const blob = await store.get('tenant-1', result.blobId);
    expect(blob).not.toBeNull();
    expect(blob!.contentType).toBe('text/plain');
    expect(blob!.size).toBe(11);
    expect(blob!.data.toString()).toBe('hello world');
  });

  it('gives each upload its own blob, sharing only the content hash', async () => {
    // Deduplicating by hash needs reference counting that no store implements:
    // two attachments sharing an id meant deleting one emptied the other, and
    // the Postgres and S3 stores never did it. The contract is now "one upload,
    // one blob" for all three (tests/spi-conformance/src/categories/blob-store).
    const data = Buffer.from('same content');
    const r1 = await store.put({
      tenantId: 'tenant-1',
      filename: 'a.txt',
      contentType: 'text/plain',
      data,
    });
    const r2 = await store.put({
      tenantId: 'tenant-1',
      filename: 'b.txt',
      contentType: 'text/plain',
      data,
    });

    expect(r1.blobId).not.toBe(r2.blobId);
    expect(r1.sha256).toBe(r2.sha256);
    expect((await store.getMetadata('tenant-1', r1.blobId))!.filename).toBe('a.txt');
    expect((await store.getMetadata('tenant-1', r2.blobId))!.filename).toBe('b.txt');

    await store.delete('tenant-1', r2.blobId);
    expect(await store.exists('tenant-1', r1.blobId)).toBe(true);
  });

  it('keeps identical content in separate tenants separate', async () => {
    const data = Buffer.from('same content');
    const r1 = await store.put({
      tenantId: 'tenant-1',
      filename: 'a.txt',
      contentType: 'text/plain',
      data,
    });
    const r2 = await store.put({
      tenantId: 'tenant-2',
      filename: 'a.txt',
      contentType: 'text/plain',
      data,
    });

    expect(r1.blobId).not.toBe(r2.blobId);
  });

  it('returns null for non-existent blob', async () => {
    const blob = await store.get('tenant-1', 'nonexistent');
    expect(blob).toBeNull();
  });

  it('deletes a blob', async () => {
    const result = await store.put({
      tenantId: 'tenant-1',
      filename: 'test.txt',
      contentType: 'text/plain',
      data: Buffer.from('delete me'),
    });

    await store.delete('tenant-1', result.blobId);
    const blob = await store.get('tenant-1', result.blobId);
    expect(blob).toBeNull();
  });

  it('checks existence', async () => {
    const result = await store.put({
      tenantId: 'tenant-1',
      filename: 'test.txt',
      contentType: 'text/plain',
      data: Buffer.from('exists'),
    });

    expect(await store.exists('tenant-1', result.blobId)).toBe(true);
    expect(await store.exists('tenant-1', 'nonexistent')).toBe(false);
    expect(await store.exists('other-tenant', result.blobId)).toBe(false);
  });

  it('handles binary data', async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await store.put({
      tenantId: 'tenant-1',
      filename: 'image.png',
      contentType: 'image/png',
      data,
    });

    const blob = await store.get('tenant-1', result.blobId);
    expect(blob).not.toBeNull();
    expect(blob!.data).toEqual(data);
  });
});
