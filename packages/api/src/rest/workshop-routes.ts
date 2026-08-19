/**
 * REST routes for the Workshop platform service — app definitions, pages,
 * widgets, variables, modules, templates, and URL state encoding.
 *
 *   POST   /api/v1/workshop/apps                — create app
 *   GET    /api/v1/workshop/apps                — list apps
 *   GET    /api/v1/workshop/apps/:id            — get app
 *   PATCH  /api/v1/workshop/apps/:id            — update app
 *   DELETE /api/v1/workshop/apps/:id            — delete app
 *   POST   /api/v1/workshop/apps/:id/share      — share app
 *   POST   /api/v1/workshop/apps/:id/duplicate  — duplicate app
 *   POST   /api/v1/workshop/apps/:id/pages      — add page
 *   PATCH  /api/v1/workshop/apps/:id/pages/:pid — update page
 *   DELETE /api/v1/workshop/apps/:id/pages/:pid — remove page
 *   POST   /api/v1/workshop/apps/:id/widgets    — add widget
 *   PATCH  /api/v1/workshop/apps/:id/widgets/:wid — update widget
 *   DELETE /api/v1/workshop/apps/:id/widgets/:wid — remove widget
 *   GET    /api/v1/workshop/apps/:id/variables  — list variables
 *   POST   /api/v1/workshop/apps/:id/variables  — create variable
 *   POST   /api/v1/workshop/variables/:vid/evaluate — evaluate variable
 *   GET    /api/v1/workshop/apps/:id/lineage    — get variable lineage
 *   GET    /api/v1/workshop/modules             — list modules
 *   POST   /api/v1/workshop/modules             — create module
 *   GET    /api/v1/workshop/templates           — list templates
 *   POST   /api/v1/workshop/templates/:tid/instantiate — create from template
 *   POST   /api/v1/workshop/state/encode        — encode state to URL
 *   POST   /api/v1/workshop/state/decode        — decode state from URL
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerWorkshopRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.workshopPlatformService) return;
  const svc = deps.workshopPlatformService;

  // ── App CRUD ──

  app.post('/api/v1/workshop/apps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { name, description, header, theme } = req.body as { name: string; description?: string; header?: unknown; theme?: unknown };
      if (!name) { res.status(400).json({ error: 'INVALID', message: 'name required' }); return; }
      const result = await svc.createApp(ctx, { name, description, header: header as never, theme: theme as never });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/workshop/apps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const apps = await svc.listApps(ctx);
      res.status(200).json({ apps });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/workshop/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.getApp(ctx, req.params['id']!);
      if (!result) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/workshop/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.updateApp(ctx, req.params['id']!, req.body as never);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/workshop/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await svc.deleteApp(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/apps/:id/share', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { userIds } = req.body as { userIds: string[] };
      if (!userIds || !Array.isArray(userIds)) { res.status(400).json({ error: 'INVALID', message: 'userIds required' }); return; }
      const result = await svc.shareApp(ctx, req.params['id']!, userIds);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/apps/:id/duplicate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { newName } = req.body as { newName: string };
      if (!newName) { res.status(400).json({ error: 'INVALID', message: 'newName required' }); return; }
      const result = await svc.duplicateApp(ctx, req.params['id']!, newName);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Pages ──

  app.post('/api/v1/workshop/apps/:id/pages', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.addPage(ctx, req.params['id']!, req.body as never);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/workshop/apps/:id/pages/:pid', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.updatePage(ctx, req.params['id']!, req.params['pid']!, req.body as never);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/workshop/apps/:id/pages/:pid', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.removePage(ctx, req.params['id']!, req.params['pid']!);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Widgets ──

  app.post('/api/v1/workshop/apps/:id/widgets', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { pageId, sectionId, widget } = req.body as { pageId: string; sectionId: string; widget: never };
      if (!pageId || !sectionId || !widget) { res.status(400).json({ error: 'INVALID', message: 'pageId, sectionId, widget required' }); return; }
      const result = await svc.addWidget(ctx, req.params['id']!, pageId, sectionId, widget);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/workshop/apps/:id/widgets/:wid', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { pageId, sectionId, updates } = req.body as { pageId: string; sectionId: string; updates: never };
      if (!pageId || !sectionId) { res.status(400).json({ error: 'INVALID', message: 'pageId, sectionId required' }); return; }
      const result = await svc.updateWidget(ctx, req.params['id']!, pageId, sectionId, req.params['wid']!, updates);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/workshop/apps/:id/widgets/:wid', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { pageId, sectionId } = req.query as { pageId?: string; sectionId?: string };
      if (!pageId || !sectionId) { res.status(400).json({ error: 'INVALID', message: 'pageId, sectionId query params required' }); return; }
      const result = await svc.removeWidget(ctx, req.params['id']!, pageId, sectionId, req.params['wid']!);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Variables ──

  app.get('/api/v1/workshop/apps/:id/variables', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const variables = await svc.listVariables(ctx, req.params['id']!);
      res.status(200).json({ variables });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/apps/:id/variables', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const result = await svc.createVariable(ctx, { appId: req.params['id']!, ...(req.body as object) } as never);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/variables/:vid/evaluate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const value = await svc.evaluateVariable(ctx, req.params['vid']!);
      res.status(200).json({ value });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/workshop/apps/:id/lineage', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const lineage = await svc.getVariableLineage(ctx, req.params['id']!);
      res.status(200).json({ lineage });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Modules ──

  app.get('/api/v1/workshop/modules', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const modules = await svc.listModules(ctx);
      res.status(200).json({ modules });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/modules', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { name, description, interface: iface, sections } = req.body as { name: string; description?: string; interface: never; sections: never[] };
      if (!name) { res.status(400).json({ error: 'INVALID', message: 'name required' }); return; }
      const result = await svc.createModule(ctx, { name, description, interface: iface, sections });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Templates ──

  app.get('/api/v1/workshop/templates', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const category = req.query['category'] as string | undefined;
      const templates = await svc.listTemplates(ctx, category);
      res.status(200).json({ templates });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/templates/:tid/instantiate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { name } = req.body as { name: string };
      if (!name) { res.status(400).json({ error: 'INVALID', message: 'name required' }); return; }
      const result = await svc.createAppFromTemplate(ctx, req.params['tid']!, name);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── URL state encoding ──

  app.post('/api/v1/workshop/state/encode', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { appId, variables } = req.body as { appId: string; variables: Record<string, unknown> };
      if (!appId || !variables) { res.status(400).json({ error: 'INVALID', message: 'appId, variables required' }); return; }
      const encoded = await svc.encodeState(ctx, appId, variables);
      res.status(200).json({ encoded });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/workshop/state/decode', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { encoded } = req.body as { encoded: string };
      if (!encoded) { res.status(400).json({ error: 'INVALID', message: 'encoded required' }); return; }
      const variables = await svc.decodeState(ctx, encoded);
      res.status(200).json({ variables });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
