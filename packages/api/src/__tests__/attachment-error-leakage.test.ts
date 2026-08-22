/**
 * A failing blob store must not narrate itself to the caller.
 *
 * With object storage behind the attachment routes, the store's errors carry
 * bucket names, endpoints and credential-chain detail. Echoing `err.message`
 * into the HTTP response hands that to anyone who can make an upload fail.
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { registerAttachmentRoutes } from '../rest/attachment-routes.js';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';

/** A blob store that fails the way a misconfigured bucket does. */
const SECRET = 'AccessDenied: bucket "altius-prod-media" at https://minio.internal:9000 (credential AKIAINTERNAL)';

function appWithFailingStore(): { app: express.Express; deps: ApiDependencies } {
  const app = express();
  const deps = {
    blobStore: {
      put: vi.fn(async () => { throw new Error(SECRET); }),
      get: vi.fn(async () => { throw new Error(SECRET); }),
      getMetadata: vi.fn(async () => { throw new Error(SECRET); }),
      delete: vi.fn(async () => { throw new Error(SECRET); }),
      exists: vi.fn(async () => false),
    },
  } as unknown as ApiDependencies;

  // A real authenticator stub: with a broken one the 500 comes from auth and
  // the test passes without the blob store ever being called.
  const authenticator = {
    authenticate: async () => ({ id: 'u1', tenantId: 't1', roles: ['admin'], name: 'U', email: 'u@x' }),
  } as unknown as OidcAuthenticator;

  registerAttachmentRoutes(app, deps, authenticator, false);
  return { app, deps };
}

/** Drive the route over a real socket, as the other route tests do. */
async function hit(
  app: express.Express,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string }> {
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: { authorization: 'Bearer x', ...(init.headers ?? {}) },
    });
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

describe('attachment routes error handling', () => {
  it('does not leak the blob store error into the upload response', async () => {
    const { app, deps } = appWithFailingStore();
    const res = await hit(app, '/api/v1/attachments', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'some bytes',
    });

    expect(res.status).toBe(500);
    expect(res.body).not.toContain('altius-prod-media');
    expect(res.body).not.toContain('minio.internal');
    expect(res.body).not.toContain('AKIAINTERNAL');
    expect(JSON.parse(res.body).error.code).toBe('INTERNAL');
    // The store was actually reached — otherwise this asserts nothing about it.
    expect(deps.blobStore!.put).toHaveBeenCalledTimes(1);
  });

  it('does not leak it on download, metadata or delete either', async () => {
    const { app, deps } = appWithFailingStore();
    const calls: Array<[string, RequestInit]> = [
      ['/api/v1/attachments/blob-1', {}],
      ['/api/v1/attachments/blob-1/metadata', {}],
      ['/api/v1/attachments/blob-1', { method: 'DELETE' }],
    ];
    for (const [path, init] of calls) {
      const res = await hit(app, path, init);
      expect(res.status).toBe(500);
      expect(res.body).not.toContain('minio.internal');
    }
    expect(deps.blobStore!.get).toHaveBeenCalled();
    expect(deps.blobStore!.getMetadata).toHaveBeenCalled();
    expect(deps.blobStore!.delete).toHaveBeenCalled();
  });
});
