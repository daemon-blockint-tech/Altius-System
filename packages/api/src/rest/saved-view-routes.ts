/**
 * REST routes for saved views — per-user and shared widget view configurations.
 *
 *   POST   /api/v1/saved-views          — create a saved view
 *   GET    /api/v1/saved-views          — list saved views (optional ?objectType=&widgetType=&appId=)
 *   GET    /api/v1/saved-views/:id      — get a saved view
 *   PATCH  /api/v1/saved-views/:id      — update a saved view
 *   DELETE /api/v1/saved-views/:id      — delete a saved view
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { CreateSavedViewInput } from '@altius/spi';

import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): { tenantId: string; actorId: string } {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerSavedViewRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.savedViewStore) return;
  const store = deps.savedViewStore;

  app.post('/api/v1/saved-views', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateSavedViewInput;
      if (!body.name) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required field: name' });
        return;
      }
      const view = await store.create(ctx, body);
      res.status(201).json(view);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/saved-views', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const filter: { objectType?: string; widgetType?: string; appId?: string } = {};
      if (typeof req.query['objectType'] === 'string') filter.objectType = req.query['objectType'];
      if (typeof req.query['widgetType'] === 'string') filter.widgetType = req.query['widgetType'];
      if (typeof req.query['appId'] === 'string') filter.appId = req.query['appId'];
      const views = await store.list(ctx, filter);
      res.status(200).json({ views });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/saved-views/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const view = await store.get(ctx, req.params['id']!);
      if (!view) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(view);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/saved-views/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateSavedViewInput>;
      const view = await store.update(ctx, req.params['id']!, updates);
      res.status(200).json(view);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      const status = msg.includes('not found') ? 404 : msg.includes('owner') ? 403 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL', message: msg });
    }
  });

  app.delete('/api/v1/saved-views/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await store.delete(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      const status = msg.includes('not found') ? 404 : msg.includes('owner') ? 403 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL', message: msg });
    }
  });
}
