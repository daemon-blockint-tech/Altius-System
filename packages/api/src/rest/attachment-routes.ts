/**
 * REST routes for attachment upload, download, metadata, and deletion.
 *
 *   POST   /api/v1/attachments              — upload a file, returns AttachmentRef
 *   GET    /api/v1/attachments/:blobId       — download file content (Content-Disposition: attachment)
 *   GET    /api/v1/attachments/:blobId?inline=1 — download with Content-Disposition: inline (for embedding)
 *   GET    /api/v1/attachments/:blobId/metadata — get AttachmentRef metadata without the bytes
 *   DELETE /api/v1/attachments/:blobId       — delete a blob
 *
 * Upload uses raw body (Content-Type: the file's MIME type).
 * The response is an AttachmentRef JSON object that the client stores
 * as the value of an `Attachment`-typed property on an object.
 *
 * Authorization: the caller must be authenticated. Per-object access
 * is enforced when the attachment is read back through the object —
 * the blob store itself is content-addressed and has no object-type
 * awareness.
 */

import type { Express } from 'express';
import express from 'express';
import type { AttachmentRef } from '@altius/spi';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import { extractUser } from '../config.js';
import { logger } from '../logger.js';

/**
 * Report a failure without echoing the store's own words back to the caller.
 *
 * The blob store may be an object store: its errors carry bucket names,
 * endpoints and credential-chain detail, none of which belongs in an HTTP
 * response. The operator gets the cause in the log; the caller gets what they
 * can act on.
 */
function failed(res: import('express').Response, operation: string, err: unknown): void {
  logger.error({ err, operation }, `attachment ${operation} failed`);
  res.status(500).json({
    error: { code: 'INTERNAL', message: `Attachment ${operation} failed.` },
  });
}

export function registerAttachmentRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.blobStore) return;

  // ── POST /api/v1/attachments — upload (raw body) ──
  app.post('/api/v1/attachments', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);

      const contentType = req.headers['content-type'] ?? 'application/octet-stream';
      const filename = (req.headers['x-filename'] as string) || 'unnamed';
      const data = req.body as Buffer;

      if (!data || data.length === 0) {
        res.status(400).json({ error: 'INVALID_UPLOAD', message: 'Empty file' });
        return;
      }

      const result = await deps.blobStore!.put({
        tenantId: user.tenantId,
        filename,
        contentType,
        data,
        uploadedBy: user.id,
      });

      const ref: AttachmentRef = {
        blobId: result.blobId,
        filename,
        contentType,
        size: result.size,
        sha256: result.sha256,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
      };

      res.status(201).json(ref);
    } catch (err) {
      failed(res, 'upload', err);
    }
  });

  // ── GET /api/v1/attachments/:blobId/metadata — metadata only ──
  app.get('/api/v1/attachments/:blobId/metadata', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const blobId = req.params['blobId']!;
      const meta = await deps.blobStore!.getMetadata(user.tenantId, blobId);
      if (!meta) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Attachment not found' });
        return;
      }
      res.json(meta);
    } catch (err) {
      failed(res, 'metadata fetch', err);
    }
  });

  // ── GET /api/v1/attachments/:blobId — download ──
  app.get('/api/v1/attachments/:blobId', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);

      const blobId = req.params['blobId']!;
      const blob = await deps.blobStore!.get(user.tenantId, blobId);
      if (!blob) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Attachment not found' });
        return;
      }

      // Fetch metadata for filename
      const meta = await deps.blobStore!.getMetadata(user.tenantId, blobId);
      const filename = meta?.filename ?? blobId;

      const inline = req.query['inline'] === '1' || req.query['inline'] === 'true';
      res.setHeader('Content-Type', blob.contentType);
      res.setHeader('Content-Length', String(blob.size));
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      );

      // Cache headers for static media content
      if (inline) {
        res.setHeader('Cache-Control', 'private, max-age=3600');
      }

      res.send(blob.data);
    } catch (err) {
      failed(res, 'download', err);
    }
  });

  // ── DELETE /api/v1/attachments/:blobId — delete ──
  app.delete('/api/v1/attachments/:blobId', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);

      const blobId = req.params['blobId']!;
      await deps.blobStore!.delete(user.tenantId, blobId);
      res.status(204).send();
    } catch (err) {
      failed(res, 'delete', err);
    }
  });
}
