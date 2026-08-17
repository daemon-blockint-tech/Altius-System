/**
 * REST routes for attachment upload, download, and deletion.
 *
 *   POST   /api/v1/attachments          — upload a file, returns AttachmentRef
 *   GET    /api/v1/attachments/:blobId   — download file content
 *   DELETE /api/v1/attachments/:blobId   — delete a blob
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
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
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

      res.setHeader('Content-Type', blob.contentType);
      res.setHeader('Content-Length', String(blob.size));
      res.setHeader('Content-Disposition', `attachment; filename="${blobId}"`);
      res.send(blob.data);
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Download failed',
      });
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
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  });
}
