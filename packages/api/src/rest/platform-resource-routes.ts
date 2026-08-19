/**
 * REST routes for platform-resource widgets — resource catalog,
 * resource-to-object links, browse, search, and upload-and-link.
 *
 *   POST   /api/v1/resources                       — create a resource
 *   GET    /api/v1/resources                       — list resources (optional ?parentId=&kind=)
 *   GET    /api/v1/resources/:id                   — get resource
 *   PATCH  /api/v1/resources/:id                   — update resource
 *   DELETE /api/v1/resources/:id                   — delete resource
 *   GET    /api/v1/resources/browse                — browse by path (optional ?path=)
 *   GET    /api/v1/resources/search                — search by name/tag (?q=)
 *   POST   /api/v1/resources/:id/links             — link resource to object
 *   GET    /api/v1/resources/:id/links             — get links for a resource
 *   DELETE /api/v1/resources/links/:linkId         — unlink resource from object
 *   GET    /api/v1/resources/links                 — get links for an object (?objectType=&objectId=)
 *   POST   /api/v1/resources/upload-and-link       — upload a file and link to object
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { CreateResourceInput, LinkResourceInput, UploadAndLinkInput } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): { tenantId: string; actorId: string } {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerPlatformResourceRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.platformResourceService) return;
  const service = deps.platformResourceService;

  // ── Resource catalog ──

  app.post('/api/v1/resources', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateResourceInput;
      if (!body.name || !body.kind) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: name, kind' });
        return;
      }
      const resource = await service.createResource(ctx, body);
      res.status(201).json(resource);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const parentId = req.query['parentId'] as string | undefined;
      const kind = req.query['kind'] as CreateResourceInput['kind'] | undefined;
      const resources = await service.listResources(ctx, parentId, kind);
      res.status(200).json({ resources });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources/browse', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const path = req.query['path'] as string | undefined;
      const resources = await service.browse(ctx, path);
      res.status(200).json({ resources });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources/search', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const q = req.query['q'] as string | undefined;
      if (!q) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required query parameter: q' });
        return;
      }
      const resources = await service.search(ctx, q);
      res.status(200).json({ resources });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const resource = await service.getResource(ctx, req.params['id']!);
      if (!resource) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(resource);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/resources/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateResourceInput>;
      const updated = await service.updateResource(ctx, req.params['id']!, updates);
      res.status(200).json(updated);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/resources/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteResource(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Resource-to-object links ──

  app.post('/api/v1/resources/:id/links', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as Omit<LinkResourceInput, 'resourceId'>;
      if (!body.objectType || !body.objectId) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: objectType, objectId' });
        return;
      }
      const link = await service.linkToObject(ctx, { ...body, resourceId: req.params['id']! });
      res.status(201).json(link);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources/:id/links', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const links = await service.getLinksForResource(ctx, req.params['id']!);
      res.status(200).json({ links });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/resources/links', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const objectType = req.query['objectType'] as string | undefined;
      const objectId = req.query['objectId'] as string | undefined;
      if (!objectType || !objectId) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required query parameters: objectType, objectId' });
        return;
      }
      const links = await service.getLinksForObject(ctx, objectType, objectId);
      res.status(200).json({ links });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/resources/links/:linkId', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.unlinkFromObject(ctx, req.params['linkId']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Upload-and-link ──

  app.post('/api/v1/resources/upload-and-link', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as UploadAndLinkInput;
      if (!body.name || !body.objectType || !body.objectId || !body.mimeType || !body.storageRef) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: name, objectType, objectId, mimeType, storageRef' });
        return;
      }
      const result = await service.uploadAndLink(ctx, body);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
