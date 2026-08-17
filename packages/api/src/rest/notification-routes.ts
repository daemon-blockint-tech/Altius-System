/**
 * REST routes for platform notifications.
 *
 *   GET    /api/v1/notifications                — list user notifications
 *   POST   /api/v1/notifications/:id/read       — mark one as read
 *   POST   /api/v1/notifications/read-all       — mark all as read
 *   DELETE /api/v1/notifications/:id             — delete notification
 *   GET    /api/v1/notifications/preferences     — get user preferences
 *   PUT    /api/v1/notifications/preferences     — set user preferences
 */

import type { Express } from 'express';
import type { NotificationPreferences, NotificationType } from '@altius/spi';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import { extractUser } from '../config.js';

export function registerNotificationRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.notificationStore) return;
  const store = deps.notificationStore;

  // ── GET /api/v1/notifications — list ──
  app.get('/api/v1/notifications', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const query: { unreadOnly?: boolean; type?: NotificationType; limit?: number; offset?: number } = {};
      if (req.query['unreadOnly'] === 'true') query.unreadOnly = true;
      if (req.query['type']) query.type = String(req.query['type']) as NotificationType;
      if (req.query['limit']) query.limit = parseInt(String(req.query['limit']), 10);
      if (req.query['offset']) query.offset = parseInt(String(req.query['offset']), 10);

      const result = await store.list(user.tenantId, user.id, query);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/notifications/:id/read — mark one read ──
  app.post('/api/v1/notifications/:id/read', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.markRead(user.tenantId, req.params['id']!);
      res.status(200).json({ read: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/notifications/read-all — mark all read ──
  app.post('/api/v1/notifications/read-all', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.markAllRead(user.tenantId, user.id);
      res.status(200).json({ markedAllRead: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/notifications/:id — delete ──
  app.delete('/api/v1/notifications/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      await store.delete(user.tenantId, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/notifications/preferences — get preferences ──
  app.get('/api/v1/notifications/preferences', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const prefs = await store.getPreferences(user.tenantId, user.id);
      res.status(200).json(prefs);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── PUT /api/v1/notifications/preferences — set preferences ──
  app.put('/api/v1/notifications/preferences', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as Partial<NotificationPreferences>;
      const prefs: NotificationPreferences = {
        tenantId: user.tenantId,
        userId: user.id,
        perType: body.perType ?? {},
        defaultChannels: body.defaultChannels ?? ['platform'],
        emailEnabled: body.emailEnabled ?? false,
        pushEnabled: body.pushEnabled ?? false,
        mutedTypes: body.mutedTypes ?? [],
      };
      await store.setPreferences(prefs);
      res.status(200).json(prefs);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
