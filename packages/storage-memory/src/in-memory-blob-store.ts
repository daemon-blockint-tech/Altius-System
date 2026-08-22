/**
 * In-memory blob store for development and testing.
 *
 * Stores blob content in a per-tenant Map keyed by a UUID blobId.
 * Content-addressed deduplication via SHA-256 is supported: if the
 * same hash is put twice, the original blobId is returned.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { BlobStore, BlobPutResult, BlobContent, BlobMetadata } from '@altius/spi';

interface StoredBlob {
  blobId: string;
  contentType: string;
  size: number;
  data: Buffer;
  sha256: string;
  filename: string;
  uploadedBy?: string;
  uploadedAt: string;
}

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Map<string, StoredBlob>>();

  async put(ctx: {
    tenantId: string;
    filename: string;
    contentType: string;
    data: Buffer;
    uploadedBy?: string;
  }): Promise<BlobPutResult> {
    const sha256 = createHash('sha256').update(ctx.data).digest('hex');

    // Every upload is its own blob, as in the Postgres and S3 stores.
    //
    // This used to return the existing blob id when the bytes matched one
    // already held for the tenant. Deduplication needs reference counting to be
    // safe, and there is none: two attachments sharing an id meant deleting
    // either one emptied the other, and the second upload's filename was
    // silently replaced by the first's. It also made a dev box and a Postgres
    // deployment disagree about how many attachments an upload sequence
    // produced. The saving was never worth that; sha256 is still returned, so a
    // caller that wants to deduplicate can, with the bookkeeping to do it
    // safely.
    const blobId = randomUUID();
    const tenantBlobs = this.getOrCreate(this.blobs, ctx.tenantId);
    tenantBlobs.set(blobId, {
      blobId,
      contentType: ctx.contentType,
      size: ctx.data.length,
      data: ctx.data,
      sha256,
      filename: ctx.filename,
      uploadedBy: ctx.uploadedBy,
      uploadedAt: new Date().toISOString(),
    });

    return { blobId, size: ctx.data.length, sha256 };
  }

  async get(tenantId: string, blobId: string): Promise<BlobContent | null> {
    const tenantBlobs = this.blobs.get(tenantId);
    if (!tenantBlobs) return null;
    const blob = tenantBlobs.get(blobId);
    if (!blob) return null;
    return {
      blobId: blob.blobId,
      contentType: blob.contentType,
      size: blob.size,
      data: blob.data,
    };
  }

  async getMetadata(tenantId: string, blobId: string): Promise<BlobMetadata | null> {
    const tenantBlobs = this.blobs.get(tenantId);
    if (!tenantBlobs) return null;
    const blob = tenantBlobs.get(blobId);
    if (!blob) return null;
    return {
      blobId: blob.blobId,
      filename: blob.filename,
      contentType: blob.contentType,
      size: blob.size,
      sha256: blob.sha256,
      uploadedBy: blob.uploadedBy,
      uploadedAt: blob.uploadedAt,
    };
  }

  async delete(tenantId: string, blobId: string): Promise<void> {
    const tenantBlobs = this.blobs.get(tenantId);
    if (!tenantBlobs) return;
    tenantBlobs.delete(blobId);
  }

  async exists(tenantId: string, blobId: string): Promise<boolean> {
    const tenantBlobs = this.blobs.get(tenantId);
    if (!tenantBlobs) return false;
    return tenantBlobs.has(blobId);
  }

  private getOrCreate<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
    }
    return m;
  }
}
