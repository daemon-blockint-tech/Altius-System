/**
 * Runs the BlobStore contract against every implementation.
 *
 * Memory always. Postgres when PG_TEST_URL is set (REQUIRE_PG turns a skip
 * into a failure). S3 against a local server speaking enough of the protocol,
 * driven by the real AWS SDK — an object store is the implementation most
 * likely to drift from the other two, and mocking its client would only prove
 * the mock agrees with itself.
 */

import { afterAll, beforeAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BlobStore, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryBlobStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresBlobStore } from '@altius/storage-postgres';
import { S3Client } from '@aws-sdk/client-s3';
import { S3BlobStore } from '@altius/storage-s3';
import { registerBlobStoreTests } from './categories/blob-store.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
registerBlobStoreTests('InMemoryBlobStore', (): BlobStore => new InMemoryBlobStore());

// ── S3 ────────────────────────────────────────────────────────────────────
interface StoredObject { body: Buffer; contentType: string; metadata: Record<string, string> }

const objects = new Map<string, StoredObject>();
let s3Server: Server;
let s3BaseUrl = '';

/** `aws-chunked` bodies arrive when the SDK signs the payload in chunks. */
function decodeAwsChunked(raw: Buffer): Buffer {
  const out: Buffer[] = [];
  let i = 0;
  while (i < raw.length) {
    const headerEnd = raw.indexOf('\r\n', i);
    if (headerEnd === -1) break;
    const size = parseInt(raw.subarray(i, headerEnd).toString('utf8').split(';')[0]!, 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = headerEnd + 2;
    out.push(raw.subarray(start, start + size));
    i = start + size + 2;
  }
  return Buffer.concat(out);
}

beforeAll(async () => {
  s3Server = createServer((req, res) => {
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
        objects.set(key, { body, contentType: (req.headers['content-type'] as string) ?? 'application/octet-stream', metadata });
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
  await new Promise<void>(resolve => s3Server.listen(0, '127.0.0.1', resolve));
  s3BaseUrl = `http://127.0.0.1:${(s3Server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => s3Server.close(err => (err ? reject(err) : resolve())));
});

registerBlobStoreTests('S3BlobStore', (): BlobStore => new S3BlobStore(
  { bucket: 'altius-conformance' },
  new S3Client({
    region: 'us-east-1',
    endpoint: s3BaseUrl,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
));

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

if (PG_TEST_URL) {
  const u = new URL(PG_TEST_URL);
  const provider = new PostgresStorageProvider({
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  });

  const SCHEMA_VERSION = 727272;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'BlobConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't-blob', actorId: 'conformance' };

  // The blob table ships with the platform DDL, which applySchema emits.
  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => { /* fresh database */ });
      await provider.applySchema(bootstrapCtx, ontology);
    })();
    return ready;
  };

  registerBlobStoreTests('PostgresBlobStore', async (): Promise<BlobStore> => {
    await ensureSchema();
    return new PostgresBlobStore(provider.pool);
  });

  afterAll(async () => {
    for (const tenant of ['t-blob', 't-dup', 't-dup2', 't-dup3', 'tenant-a', 'tenant-b', 'tenant-c', 'tenant-d']) {
      await provider.pool.query('DELETE FROM "blob"."blobs" WHERE "tenant_id" = $1', [tenant]).catch(() => {});
    }
    await provider.close();
  });
}
