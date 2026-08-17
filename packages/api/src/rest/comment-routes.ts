/**
 * REST routes for comments and collaboration.
 *
 *   GET    /api/v1/{plural}/:id/comments          — list comments/threads
 *   POST   /api/v1/{plural}/:id/comments          — create comment (thread or reply)
 *   PUT    /api/v1/comments/:commentId             — edit comment body
 *   DELETE /api/v1/comments/:commentId             — delete comment
 *   POST   /api/v1/comments/:commentId/resolve     — resolve thread
 *   POST   /api/v1/comments/:commentId/unresolve   — unresolve thread
 *   GET    /api/v1/notifications                   — list user notifications
 *   POST   /api/v1/notifications/:id/read          — mark notification read
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import { extractUser } from '../config.js';

export function registerCommentRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.commentStore) return;
  const store = deps.commentStore;

  // Build a map of plural -> objectType for route matching
  const typeMap = new Map<string, string>();
  for (const ot of deps.schema.objectTypes) {
    const plural = ot.name.toLowerCase() + 's';
    typeMap.set(plural, ot.name);
  }

  // ── GET /api/v1/{plural}/:id/comments — list comments ──
  app.get('/api/v1/:plural/:id/comments', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const query: { threadsOnly?: boolean; resolved?: boolean; authorId?: string; limit?: number; offset?: number } = {};
      if (req.query['threadsOnly'] === 'true') query.threadsOnly = true;
      if (req.query['resolved'] !== undefined) query.resolved = req.query['resolved'] === 'true';
      if (req.query['authorId']) query.authorId = String(req.query['authorId']);
      if (req.query['limit']) query.limit = parseInt(String(req.query['limit']), 10);
      if (req.query['offset']) query.offset = parseInt(String(req.query['offset']), 10);

      const result = await store.listComments(user.tenantId, typeName, req.params['id']!, query);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/{plural}/:id/comments — create comment ──
  app.post('/api/v1/:plural/:id/comments', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const body = req.body as { body: string; parentCommentId?: string; authorName?: string };
      if (!body.body) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'body is required' });
        return;
      }

      const comment = await store.createComment({
        tenantId: user.tenantId,
        objectType: typeName,
        objectId: req.params['id']!,
        parentCommentId: body.parentCommentId ?? null,
        body: body.body,
        authorId: user.id,
        authorName: body.authorName,
      });
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── PUT /api/v1/comments/:commentId — edit comment ──
  app.put('/api/v1/comments/:commentId', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as { body: string };
      if (!body.body) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'body is required' });
        return;
      }
      const comment = await store.updateComment(user.tenantId, req.params['commentId']!, body.body);
      res.status(200).json(comment);
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/comments/:commentId — delete comment ──
  app.delete('/api/v1/comments/:commentId', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.deleteComment(user.tenantId, req.params['commentId']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/comments/:commentId/resolve — resolve thread ──
  app.post('/api/v1/comments/:commentId/resolve', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.setResolved(user.tenantId, req.params['commentId']!, true);
      res.status(200).json({ resolved: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/comments/:commentId/unresolve — unresolve thread ──
  app.post('/api/v1/comments/:commentId/unresolve', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.setResolved(user.tenantId, req.params['commentId']!, false);
      res.status(200).json({ resolved: false });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/notifications — list user notifications ──
  app.get('/api/v1/notifications', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const unreadOnly = req.query['unreadOnly'] === 'true';
      const notifications = await store.getNotifications(user.tenantId, user.id, unreadOnly);
      res.status(200).json({ notifications });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/notifications/:id/read — mark notification read ──
  app.post('/api/v1/notifications/:id/read', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.markNotificationRead(user.tenantId, req.params['id']!);
      res.status(200).json({ read: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
