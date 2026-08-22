/**
 * BlobStore contract, run against every implementation.
 *
 * Three of them exist now — memory, Postgres and S3 — and until this file none
 * proved they behave the same. They did not: the memory store deduplicated by
 * content hash while the other two mint a fresh id per upload, so the same
 * upload sequence produced one attachment on a dev box and two in production.
 *
 * The contract settled here is the safe one: a put returns a new blob, always.
 * Deduplication at this layer needs reference counting that nothing implements
 * — without it, deleting one attachment takes the bytes out from under every
 * other attachment that happened to have identical content, and the second
 * upload's filename is silently replaced by the first one's.
 */

import { describe, it, expect } from 'vitest';
import type { BlobStore } from '@altius/spi';

export type BlobStoreFactory = () => Promise<BlobStore> | BlobStore;

const TEXT = 'signed on arrival, 2 pallets short';

export function registerBlobStoreTests(providerName: string, factory: BlobStoreFactory): void {
  describe(`[${providerName}] SPI Conformance: BlobStore contract`, () => {
    const put = async (store: BlobStore, tenantId: string, filename: string, body: string, uploadedBy?: string) =>
      store.put({
        tenantId,
        filename,
        contentType: 'text/plain',
        data: Buffer.from(body),
        ...(uploadedBy ? { uploadedBy } : {}),
      });

    describe('round trip', () => {
      it('returns the bytes, content type and size it stored', async () => {
        const store = await factory();
        const result = await put(store, 't-blob', 'note.txt', TEXT);

        expect(result.size).toBe(Buffer.byteLength(TEXT));
        expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

        const got = await store.get('t-blob', result.blobId);
        expect(got?.data.toString()).toBe(TEXT);
        expect(got?.contentType).toBe('text/plain');
        expect(got?.size).toBe(Buffer.byteLength(TEXT));
      });

      it('reports the same content hash for the same bytes', async () => {
        const store = await factory();
        const a = await put(store, 't-blob', 'a.txt', TEXT);
        const b = await put(store, 't-blob', 'b.txt', TEXT);
        expect(a.sha256).toBe(b.sha256);
      });

      it('carries filename and uploader in the metadata', async () => {
        const store = await factory();
        const result = await put(store, 't-blob', 'invoice.pdf', TEXT, 'user-9');

        const meta = await store.getMetadata('t-blob', result.blobId);
        expect(meta).toMatchObject({
          blobId: result.blobId,
          filename: 'invoice.pdf',
          uploadedBy: 'user-9',
          size: Buffer.byteLength(TEXT),
        });
        expect(Date.parse(meta!.uploadedAt)).not.toBeNaN();
      });
    });

    describe('each upload is its own blob', () => {
      it('gives identical content uploaded twice two independent ids', async () => {
        const store = await factory();
        const first = await put(store, 't-dup', 'a.txt', TEXT);
        const second = await put(store, 't-dup', 'b.txt', TEXT);

        expect(second.blobId).not.toBe(first.blobId);
      });

      it('keeps each upload under its own filename', async () => {
        const store = await factory();
        const first = await put(store, 't-dup2', 'a.txt', TEXT);
        const second = await put(store, 't-dup2', 'b.txt', TEXT);

        expect((await store.getMetadata('t-dup2', first.blobId))!.filename).toBe('a.txt');
        expect((await store.getMetadata('t-dup2', second.blobId))!.filename).toBe('b.txt');
      });

      it('does not take one upload away when an identical one is deleted', async () => {
        const store = await factory();
        const kept = await put(store, 't-dup3', 'keep.txt', TEXT);
        const removed = await put(store, 't-dup3', 'remove.txt', TEXT);

        await store.delete('t-dup3', removed.blobId);

        expect(await store.exists('t-dup3', removed.blobId)).toBe(false);
        // The surviving attachment still resolves — the failure this guards
        // against is one delete silently emptying another reference.
        expect((await store.get('t-dup3', kept.blobId))?.data.toString()).toBe(TEXT);
      });
    });

    describe('tenant isolation', () => {
      it('does not serve one tenant a blob another uploaded', async () => {
        const store = await factory();
        const mine = await put(store, 'tenant-a', 'secret.txt', TEXT);

        expect(await store.get('tenant-b', mine.blobId)).toBeNull();
        expect(await store.getMetadata('tenant-b', mine.blobId)).toBeNull();
        expect(await store.exists('tenant-b', mine.blobId)).toBe(false);
        expect(await store.exists('tenant-a', mine.blobId)).toBe(true);
      });

      it('does not let one tenant delete another tenant s blob', async () => {
        const store = await factory();
        const mine = await put(store, 'tenant-c', 'keep.txt', TEXT);

        await store.delete('tenant-d', mine.blobId);

        expect(await store.exists('tenant-c', mine.blobId)).toBe(true);
      });
    });

    describe('absent blobs', () => {
      it('answers null rather than throwing', async () => {
        const store = await factory();
        expect(await store.get('t-blob', 'no-such-blob')).toBeNull();
        expect(await store.getMetadata('t-blob', 'no-such-blob')).toBeNull();
        expect(await store.exists('t-blob', 'no-such-blob')).toBe(false);
      });

      it('treats deleting one as a no-op', async () => {
        const store = await factory();
        await expect(store.delete('t-blob', 'no-such-blob')).resolves.toBeUndefined();
      });
    });
  });
}
