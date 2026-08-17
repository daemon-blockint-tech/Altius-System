/**
 * REST routes for time-series threshold rules and alerts.
 *
 *   POST   /api/v1/alerting/rules              — create rule
 *   GET    /api/v1/alerting/rules              — list rules
 *   GET    /api/v1/alerting/rules/:id          — get rule
 *   PATCH  /api/v1/alerting/rules/:id          — update rule
 *   DELETE /api/v1/alerting/rules/:id          — delete rule
 *   GET    /api/v1/alerting/alerts             — list alerts
 *   POST   /api/v1/alerting/alerts/:id/acknowledge — acknowledge alert
 *   POST   /api/v1/alerting/alerts/:id/resolve     — resolve alert
 *   POST   /api/v1/alerting/evaluate           — evaluate rules for a series
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext, CreateThresholdRuleInput, AlertQuery, TimeSeriesPoint } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerAlertingRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.alertingService) return;
  const service = deps.alertingService;

  // ── POST /api/v1/alerting/rules — create ──
  app.post('/api/v1/alerting/rules', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateThresholdRuleInput;
      if (!body.name || !body.objectType || !body.objectId || !body.property || !body.operator || body.threshold === undefined) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields' });
        return;
      }
      const rule = await service.createRule(ctx, body);
      res.status(201).json(rule);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/alerting/rules — list ──
  app.get('/api/v1/alerting/rules', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const objectType = req.query['objectType'] as string | undefined;
      const objectId = req.query['objectId'] as string | undefined;
      const rules = await service.listRules(ctx, objectType, objectId);
      res.status(200).json({ rules });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/alerting/rules/:id — get ──
  app.get('/api/v1/alerting/rules/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const rule = await service.getRule(ctx, req.params['id']!);
      if (!rule) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Rule not found' });
        return;
      }
      res.status(200).json(rule);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── PATCH /api/v1/alerting/rules/:id — update ──
  app.patch('/api/v1/alerting/rules/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateThresholdRuleInput & { enabled: boolean }>;
      const rule = await service.updateRule(ctx, req.params['id']!, updates);
      if (!rule) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Rule not found' });
        return;
      }
      res.status(200).json(rule);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── DELETE /api/v1/alerting/rules/:id — delete ──
  app.delete('/api/v1/alerting/rules/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteRule(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/alerting/alerts — list ──
  app.get('/api/v1/alerting/alerts', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const query: AlertQuery = {};
      if (req.query['status']) query.status = req.query['status'] as AlertQuery['status'];
      if (req.query['ruleId']) query.ruleId = String(req.query['ruleId']);
      if (req.query['objectType']) query.objectType = String(req.query['objectType']);
      if (req.query['objectId']) query.objectId = String(req.query['objectId']);
      if (req.query['limit']) query.limit = parseInt(String(req.query['limit']), 10);
      if (req.query['offset']) query.offset = parseInt(String(req.query['offset']), 10);
      const result = await service.listAlerts(ctx, query);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/alerting/alerts/:id/acknowledge ──
  app.post('/api/v1/alerting/alerts/:id/acknowledge', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.acknowledgeAlert(ctx, req.params['id']!, user.id);
      res.status(200).json({ acknowledged: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/alerting/alerts/:id/resolve ──
  app.post('/api/v1/alerting/alerts/:id/resolve', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.resolveAlert(ctx, req.params['id']!, user.id);
      res.status(200).json({ resolved: true });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/alerting/evaluate — evaluate rules for a series ──
  app.post('/api/v1/alerting/evaluate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as { objectType: string; objectId: string; property: string; points: TimeSeriesPoint[] };
      if (!body.objectType || !body.objectId || !body.property || !Array.isArray(body.points)) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields' });
        return;
      }
      const results = await service.evaluateForSeries(ctx, body.objectType, body.objectId, body.property, body.points);
      res.status(200).json({ results });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
