/**
 * The store is exercised against a real HTTP server speaking enough S3 for the
 * five operations, driven by the real AWS SDK client. A hand-mocked client
 * would assert that this file calls the functions this file calls; the failures
 * worth catching — a key built without the tenant segment, metadata that does
 * not survive the round trip, a 404 raised instead of returning null — only
 * appear when something answers on the wire.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { S3Client } from '@aws-sdk/client-s3';
import { S3BlobStore, s3ConfigFromEnv } from '../s3-blob-store.js';

interface StoredObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

const objects = new Map<string, StoredObject>();

/**
 * Undo `aws-chunked` transfer encoding, which the SDK uses when it signs the
 * payload in chunks. Each chunk is `<hex length>;chunk-signature=…\r\n<bytes>\r\n`.
 */
function decodeAwsChunked(raw: Buffer): Buffer {
  const out: Buffer[] = [];
  let i = 0;
  while (i < raw.length) {
    const headerEnd = raw.indexOf('\r\n', i);
    if (headerEnd === -1) break;
    const header = raw.subarray(i, headerEnd).toString('utf8');
    const size = parseInt(header.split(';')[0]!, 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = headerEnd + 2;
    out.push(raw.subarray(start, start + size));
    i = start + size + 2;
  }
  return Buffer.concat(out);
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? '/').split('?')[0]!.replace(/^\/+/, ''));
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      const method = req.method ?? 'GET';

      if (method === 'PUT') {
        const raw = Buffer.concat(chunks);
        const body = req.headers['x-amz-decoded-content-length'] ? decodeAwsChunked(raw) : raw;
        const metadata: Record<string, string> = {};
        for (const [name, value] of Object.entries(req.headers)) {
          if (name.startsWith('x-amz-meta-') && typeof value === 'string') {
            metadata[name.slice('x-amz-meta-'.length)] = value;
          }
        }
        objects.set(key, {
          body,
          contentType: (req.headers['content-type'] as string) ?? 'application/octet-stream',
          metadata,
        });
        res.writeHead(200, { ETag: '"stub"' }).end();
        return;
      }

      const found = objects.get(key);

      if (method === 'GET' || method === 'HEAD') {
        if (!found) {
          res.writeHead(404, { 'Content-Type': 'application/xml' })
            .end(method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>');
          return;
        }
        const headers: Record<string, string> = {
          'Content-Type': found.contentType,
          'Content-Length': String(found.body.length),
          'Last-Modified': new Date(0).toUTCString(),
          ETag: '"stub"',
        };
        for (const [k, v] of Object.entries(found.metadata)) headers[`x-amz-meta-${k}`] = v;
        res.writeHead(200, headers).end(method === 'HEAD' ? undefined : found.body);
        return;
      }

      if (method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204).end();
        return;
      }

      res.writeHead(405).end();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
});

function storeFor(prefix?: string): S3BlobStore {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: baseUrl,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  return new S3BlobStore({ bucket: 'altius-test', ...(prefix ? { prefix } : {}) }, client);
}

describe('S3BlobStore', () => {
  it('round-trips bytes, content type and the content hash', async () => {
    const store = storeFor();
    const data = Buffer.from('scan of a delivery note');

    const put = await store.put({
      tenantId: 't-1',
      filename: 'note.txt',
      contentType: 'text/plain',
      data,
      uploadedBy: 'user-9',
    });
    expect(put.size).toBe(data.length);
    expect(put.sha256).toMatch(/^[0-9a-f]{64}$/);

    const got = await store.get('t-1', put.blobId);
    expect(got?.data.equals(data)).toBe(true);
    expect(got?.contentType).toBe('text/plain');
    expect(got?.size).toBe(data.length);
  });

  it('keeps filename, uploader and hash in object metadata', async () => {
    const store = storeFor();
    const put = await store.put({
      tenantId: 't-1', filename: 'invoice.pdf', contentType: 'application/pdf',
      data: Buffer.from('%PDF-1.7'), uploadedBy: 'user-9',
    });

    const meta = await store.getMetadata('t-1', put.blobId);
    expect(meta).toMatchObject({
      blobId: put.blobId,
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      sha256: put.sha256,
      uploadedBy: 'user-9',
    });
    expect(meta!.uploadedAt).not.toBe('');
  });

  it('does not serve one tenant a blob uploaded by another', async () => {
    const store = storeFor();
    const put = await store.put({
      tenantId: 'tenant-a', filename: 'secret.txt', contentType: 'text/plain',
      data: Buffer.from('confidential'),
    });

    expect(await store.get('tenant-b', put.blobId)).toBeNull();
    expect(await store.getMetadata('tenant-b', put.blobId)).toBeNull();
    expect(await store.exists('tenant-b', put.blobId)).toBe(false);
    // Still readable by its own tenant — the isolation is the key, not a delete.
    expect(await store.exists('tenant-a', put.blobId)).toBe(true);
  });

  it('refuses a blob id that would climb out of its tenant prefix', async () => {
    const store = storeFor();
    await expect(store.get('tenant-a', '../tenant-b/leak')).rejects.toThrow(/unsafe blob id/);
    await expect(store.get('../other', 'blob-1')).rejects.toThrow(/unsafe tenant id/);
  });

  it('returns null for a missing blob rather than throwing', async () => {
    const store = storeFor();
    expect(await store.get('t-1', 'does-not-exist')).toBeNull();
    expect(await store.getMetadata('t-1', 'does-not-exist')).toBeNull();
    expect(await store.exists('t-1', 'does-not-exist')).toBe(false);
  });

  it('deletes, and deleting a missing blob is a no-op', async () => {
    const store = storeFor();
    const put = await store.put({
      tenantId: 't-1', filename: 'tmp.bin', contentType: 'application/octet-stream',
      data: Buffer.from([1, 2, 3]),
    });

    await store.delete('t-1', put.blobId);
    expect(await store.exists('t-1', put.blobId)).toBe(false);
    await expect(store.delete('t-1', put.blobId)).resolves.toBeUndefined();
  });

  it('places objects under the configured prefix', async () => {
    const store = storeFor('media/uploads');
    const put = await store.put({
      tenantId: 't-7', filename: 'a.bin', contentType: 'application/octet-stream',
      data: Buffer.from('x'),
    });

    expect([...objects.keys()]).toContain(`altius-test/media/uploads/t-7/${put.blobId}`);
  });
});

describe('s3ConfigFromEnv', () => {
  it('is not configured without a bucket', () => {
    expect(s3ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('defaults to path-style addressing for a custom endpoint', () => {
    const cfg = s3ConfigFromEnv({
      ALTIUS_BLOB_S3_BUCKET: 'b',
      ALTIUS_BLOB_S3_ENDPOINT: 'http://minio:9000',
    } as NodeJS.ProcessEnv);
    expect(cfg).toMatchObject({ bucket: 'b', endpoint: 'http://minio:9000', forcePathStyle: true });
  });

  it('leaves path style off for plain AWS, and honours an explicit value', () => {
    expect(s3ConfigFromEnv({ ALTIUS_BLOB_S3_BUCKET: 'b', ALTIUS_BLOB_S3_REGION: 'eu-west-2' } as NodeJS.ProcessEnv))
      .toMatchObject({ forcePathStyle: false, region: 'eu-west-2' });
    expect(s3ConfigFromEnv({
      ALTIUS_BLOB_S3_BUCKET: 'b',
      ALTIUS_BLOB_S3_ENDPOINT: 'http://minio:9000',
      ALTIUS_BLOB_S3_FORCE_PATH_STYLE: 'false',
    } as NodeJS.ProcessEnv)).toMatchObject({ forcePathStyle: false });
  });
});
