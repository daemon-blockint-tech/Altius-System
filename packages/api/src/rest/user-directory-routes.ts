/**
 * REST routes for the user directory — user lookup for User Select widgets.
 *
 *   GET    /api/v1/users              — list users (optional ?q=&role=&group=&limit=&offset=)
 *   GET    /api/v1/users/:id          — get a single user
 *   POST   /api/v1/users/batch        — get multiple users by ID
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { ListUsersOptions } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): { tenantId: string; actorId: string } {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerUserDirectoryRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.userDirectoryService) return;
  const service = deps.userDirectoryService;

  app.get('/api/v1/users', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const options: ListUsersOptions = {};
      if (typeof req.query['q'] === 'string') options.q = req.query['q'];
      if (typeof req.query['role'] === 'string') options.role = req.query['role'];
      if (typeof req.query['group'] === 'string') options.group = req.query['group'];
      if (typeof req.query['limit'] === 'string') options.limit = parseInt(req.query['limit'], 10);
      if (typeof req.query['offset'] === 'string') options.offset = parseInt(req.query['offset'], 10);
      if (req.query['includeInactive'] === 'true') options.includeInactive = true;
      const result = await service.list(ctx, options);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/users/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const found = await service.get(ctx, req.params['id']!);
      if (!found) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(found);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/users/batch', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { ids: string[] };
      if (!Array.isArray(body.ids)) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required field: ids (string[])' });
        return;
      }
      const users = await service.getMany(ctx, body.ids);
      res.status(200).json({ users });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
