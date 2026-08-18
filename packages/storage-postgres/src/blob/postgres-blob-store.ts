/**
 * PostgreSQL BlobStore — content-addressed blob storage.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { BlobStore, BlobPutResult, BlobContent } from '@altius/spi';

export class PostgresBlobStore implements BlobStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async put(ctx: {
    tenantId: string;
    filename: string;
    contentType: string;
    data: Buffer;
    uploadedBy?: string;
  }): Promise<BlobPutResult> {
    const sha256 = createHash('sha256').update(ctx.data).digest('hex');
    const blobId = randomUUID();
    await this.pool.query(
      `INSERT INTO "blob"."blobs" ("id", "tenant_id", "filename", "content_type", "size", "data", "sha256", "uploaded_by", "created_at")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [blobId, ctx.tenantId, ctx.filename, ctx.contentType, ctx.data.length, ctx.data, sha256, ctx.uploadedBy ?? null],
    );
    return { blobId, size: ctx.data.length, sha256 };
  }

  async get(tenantId: string, blobId: string): Promise<BlobContent | null> {
    const result = await this.pool.query(
      `SELECT "content_type", "size", "data" FROM "blob"."blobs" WHERE "id" = $1 AND "tenant_id" = $2`,
      [blobId, tenantId],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0]!;
    return {
      blobId,
      contentType: r['content_type'],
      size: Number(r['size']),
      data: Buffer.from(r['data']),
    };
  }

  async delete(tenantId: string, blobId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "blob"."blobs" WHERE "id" = $1 AND "tenant_id" = $2`,
      [blobId, tenantId],
    );
  }

  async exists(tenantId: string, blobId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM "blob"."blobs" WHERE "id" = $1 AND "tenant_id" = $2`,
      [blobId, tenantId],
    );
    return result.rows.length > 0;
  }
}
