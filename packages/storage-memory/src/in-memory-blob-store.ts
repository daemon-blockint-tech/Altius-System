/**
 * In-memory blob store for development and testing.
 *
 * Stores blob content in a per-tenant Map keyed by a UUID blobId.
 * Content-addressed deduplication via SHA-256 is supported: if the
 * same hash is put twice, the original blobId is returned.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { BlobStore, BlobPutResult, BlobContent } from '@altius/spi';

interface StoredBlob {
  blobId: string;
  contentType: string;
  size: number;
  data: Buffer;
  sha256: string;
  filename: string;
  uploadedBy?: string;
}

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Map<string, StoredBlob>>();
  private readonly hashIndex = new Map<string, Map<string, string>>(); // tenant -> sha256 -> blobId

  async put(ctx: {
    tenantId: string;
    filename: string;
    contentType: string;
    data: Buffer;
    uploadedBy?: string;
  }): Promise<BlobPutResult> {
    const sha256 = createHash('sha256').update(ctx.data).digest('hex');

    // Deduplicate by hash within the same tenant
    const tenantHashes = this.getOrCreate(this.hashIndex, ctx.tenantId);
    const existing = tenantHashes.get(sha256);
    if (existing) {
      return { blobId: existing, size: ctx.data.length, sha256 };
    }

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
    });
    tenantHashes.set(sha256, blobId);

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

  async delete(tenantId: string, blobId: string): Promise<void> {
    const tenantBlobs = this.blobs.get(tenantId);
    if (!tenantBlobs) return;
    const blob = tenantBlobs.get(blobId);
    if (blob) {
      this.hashIndex.get(tenantId)?.delete(blob.sha256);
    }
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
