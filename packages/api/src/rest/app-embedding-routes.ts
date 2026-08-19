/**
 * REST routes for app embedding & cross-app widgets — app registry,
 * embedding manifests, cross-app commands, and app pairing.
 *
 *   POST   /api/v1/embedding/apps                — register an app
 *   GET    /api/v1/embedding/apps                — list apps (optional ?kind=)
 *   GET    /api/v1/embedding/apps/:id            — get app
 *   GET    /api/v1/embedding/apps/by-name/:name  — get app by name
 *   PATCH  /api/v1/embedding/apps/:id            — update app
 *   DELETE /api/v1/embedding/apps/:id            — delete app
 *   GET    /api/v1/embedding/apps/:id/manifest   — get embedding manifest
 *   POST   /api/v1/embedding/commands            — send a cross-app command
 *   GET    /api/v1/embedding/commands            — list commands (optional ?appId=)
 *   GET    /api/v1/embedding/commands/:id        — get command
 *   PATCH  /api/v1/embedding/commands/:id        — update command status
 *   POST   /api/v1/embedding/pairings            — create app pairing
 *   GET    /api/v1/embedding/pairings            — list pairings (optional ?appId=)
 *   GET    /api/v1/embedding/pairings/:id        — get pairing
 *   DELETE /api/v1/embedding/pairings/:id        — delete pairing
 *   POST   /api/v1/embedding/pairings/:id/sync   — sync shared state
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RegisterAppInput, CreateAppPairingInput, SendCommandInput } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): { tenantId: string; actorId: string } {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerAppEmbeddingRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.embeddingService) return;
  const service = deps.embeddingService;

  // ── App registry ──

  app.post('/api/v1/embedding/apps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as RegisterAppInput;
      if (!body.name || !body.kind || !body.url) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: name, kind, url' });
        return;
      }
      const created = await service.registerApp(ctx, body);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/apps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const kind = req.query['kind'] as RegisterAppInput['kind'] | undefined;
      const apps = await service.listApps(ctx, kind);
      res.status(200).json({ apps });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/apps/by-name/:name', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const found = await service.getAppByName(ctx, req.params['name']!);
      if (!found) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(found);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const found = await service.getApp(ctx, req.params['id']!);
      if (!found) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(found);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/embedding/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<RegisterAppInput>;
      const updated = await service.updateApp(ctx, req.params['id']!, updates);
      res.status(200).json(updated);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/embedding/apps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteApp(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Embedding manifests ──

  app.get('/api/v1/embedding/apps/:id/manifest', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const manifest = await service.getEmbeddingManifest(ctx, req.params['id']!);
      if (!manifest) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(manifest);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Cross-app commands ──

  app.post('/api/v1/embedding/commands', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { sourceAppId: string } & SendCommandInput;
      if (!body.sourceAppId || !body.targetAppId || !body.command) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: sourceAppId, targetAppId, command' });
        return;
      }
      const cmd = await service.sendCommand(ctx, body.sourceAppId, { targetAppId: body.targetAppId, command: body.command, payload: body.payload });
      res.status(201).json(cmd);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/commands', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const appId = req.query['appId'] as string | undefined;
      const cmds = await service.listCommands(ctx, appId);
      res.status(200).json({ commands: cmds });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/commands/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const cmd = await service.getCommand(ctx, req.params['id']!);
      if (!cmd) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(cmd);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/embedding/commands/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { status: 'pending' | 'delivered' | 'processed' | 'failed'; result?: unknown; error?: string };
      if (!body.status) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required field: status' });
        return;
      }
      const updated = await service.updateCommandStatus(ctx, req.params['id']!, body.status, body.result, body.error);
      res.status(200).json(updated);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── App pairing ──

  app.post('/api/v1/embedding/pairings', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateAppPairingInput;
      if (!body.appAId || !body.appBId) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: appAId, appBId' });
        return;
      }
      const pairing = await service.createPairing(ctx, body);
      res.status(201).json(pairing);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/pairings', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const appId = req.query['appId'] as string | undefined;
      const pairings = await service.listPairings(ctx, appId);
      res.status(200).json({ pairings });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/embedding/pairings/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const pairing = await service.getPairing(ctx, req.params['id']!);
      if (!pairing) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(pairing);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/embedding/pairings/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deletePairing(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/embedding/pairings/:id/sync', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { key: string; value: unknown };
      if (!body.key) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required field: key' });
        return;
      }
      const result = await service.syncSharedState(ctx, req.params['id']!, body.key, body.value);
      res.status(200).json(result);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
