/**
 * S3-compatible BlobStore — attachments in an object store rather than a
 * database column.
 *
 * The Postgres implementation keeps bytes in a `bytea` column, which is a hard
 * ceiling: large media (survey imagery, video, scanned document sets) is the
 * modality the platform claims to support, and a row is the wrong place for it.
 * This puts the bytes where object storage belongs and keeps the same contract,
 * so the gateway swaps one for the other with no route or caller change.
 *
 * Works against AWS S3 and the S3-compatible services (MinIO, Cloudflare R2,
 * Ceph) via `endpoint` + `forcePathStyle`.
 *
 * Tenant isolation is structural: every key is `<prefix>/<tenantId>/<blobId>`,
 * and the tenant comes from the caller's request context, never from the blob
 * id. A caller asking for another tenant's blob id builds a key that does not
 * exist and gets `null` — the same answer as a blob that was never uploaded.
 *
 * Credentials are never configured here. The AWS SDK's default provider chain
 * resolves them from the environment, the container/instance role, or the
 * profile — so a deployment grants access without a secret in code or YAML.
 */

import { randomUUID, createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { BlobStore, BlobPutResult, BlobContent, BlobMetadata } from '@altius/spi';

export interface S3BlobStoreConfig {
  bucket: string;
  region?: string;
  /** Non-AWS endpoint (MinIO, R2, Ceph). */
  endpoint?: string;
  /** Path-style addressing — required by most non-AWS implementations. */
  forcePathStyle?: boolean;
  /** Key prefix, so a bucket can be shared with other data. */
  prefix?: string;
}

/** Read config from the environment. Returns null when S3 is not configured. */
export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3BlobStoreConfig | null {
  const bucket = env['ALTIUS_BLOB_S3_BUCKET']?.trim();
  if (!bucket) return null;
  const region = env['ALTIUS_BLOB_S3_REGION']?.trim();
  const endpoint = env['ALTIUS_BLOB_S3_ENDPOINT']?.trim();
  const prefix = env['ALTIUS_BLOB_S3_PREFIX']?.trim();
  return {
    bucket,
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
    // Path style defaults on for a custom endpoint, which is what MinIO, R2 and
    // Ceph need; an explicit value still wins.
    forcePathStyle: env['ALTIUS_BLOB_S3_FORCE_PATH_STYLE']
      ? env['ALTIUS_BLOB_S3_FORCE_PATH_STYLE'] === 'true'
      : Boolean(endpoint),
    ...(prefix ? { prefix } : {}),
  };
}

/** S3 user-metadata keys. Lowercase: S3 lowercases metadata names in transit. */
const META_FILENAME = 'filename';
const META_SHA256 = 'sha256';
const META_UPLOADED_BY = 'uploadedby';
const META_UPLOADED_AT = 'uploadedat';

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3BlobStoreConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.prefix = config.prefix?.replace(/^\/+|\/+$/g, '') ?? 'blobs';
    this.client = client ?? new S3Client({
      ...(config.region ? { region: config.region } : {}),
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
    });
  }

  /**
   * `<prefix>/<tenantId>/<blobId>`.
   *
   * The tenant segment is what keeps one tenant's bytes unreachable through
   * another tenant's context, so neither part may contain a separator or a
   * traversal segment — a blob id shaped like `../other-tenant/x` would
   * otherwise resolve across the boundary.
   */
  private key(tenantId: string, blobId: string): string {
    for (const [label, part] of [['tenant id', tenantId], ['blob id', blobId]] as const) {
      if (!part || part.includes('/') || part.includes('\\') || part === '.' || part === '..') {
        throw new Error(`S3BlobStore: unsafe ${label} "${part}"`);
      }
    }
    return `${this.prefix}/${tenantId}/${blobId}`;
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
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(ctx.tenantId, blobId),
      Body: ctx.data,
      ContentType: ctx.contentType,
      Metadata: {
        [META_FILENAME]: ctx.filename,
        [META_SHA256]: sha256,
        [META_UPLOADED_AT]: new Date().toISOString(),
        ...(ctx.uploadedBy ? { [META_UPLOADED_BY]: ctx.uploadedBy } : {}),
      },
    }));
    return { blobId, size: ctx.data.length, sha256 };
  }

  async get(tenantId: string, blobId: string): Promise<BlobContent | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(tenantId, blobId),
      }));
      const body = res.Body;
      if (!body) return null;
      const data = Buffer.from(await body.transformToByteArray());
      return {
        blobId,
        contentType: res.ContentType ?? 'application/octet-stream',
        // The stored length is authoritative over ContentLength, which a
        // ranged or re-encoded response can disagree with.
        size: data.length,
        data,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async getMetadata(tenantId: string, blobId: string): Promise<BlobMetadata | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key(tenantId, blobId),
      }));
      const meta = res.Metadata ?? {};
      return {
        blobId,
        filename: meta[META_FILENAME] ?? blobId,
        contentType: res.ContentType ?? 'application/octet-stream',
        size: Number(res.ContentLength ?? 0),
        ...(meta[META_SHA256] ? { sha256: meta[META_SHA256] } : {}),
        ...(meta[META_UPLOADED_BY] ? { uploadedBy: meta[META_UPLOADED_BY] } : {}),
        uploadedAt: meta[META_UPLOADED_AT] ?? res.LastModified?.toISOString() ?? new Date(0).toISOString(),
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(tenantId: string, blobId: string): Promise<void> {
    // S3 delete is idempotent: a missing key is a success, which is the no-op
    // the contract asks for.
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.key(tenantId, blobId),
    }));
  }

  async exists(tenantId: string, blobId: string): Promise<boolean> {
    return (await this.getMetadata(tenantId, blobId)) !== null;
  }
}
