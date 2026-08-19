/**
 * Usage metrics REST routes — ontology observability.
 *
 *   GET    /api/v1/usage/object-types       — per-type metrics
 *   GET    /api/v1/usage/actions             — per-action/function metrics
 *   GET    /api/v1/usage/summary             — full usage summary
 *   GET    /api/v1/usage/events              — query raw events
 *   GET    /api/v1/usage/active-users        — active user count
 *   POST   /api/v1/usage/rules               — create monitoring rule
 *   GET    /api/v1/usage/rules               — list monitoring rules
 *   DELETE /api/v1/usage/rules/:id           — delete monitoring rule
 *   POST   /api/v1/usage/rules/evaluate      — evaluate monitoring rules
 *
 * Note: the record() method is NOT exposed as a REST endpoint — it is an
 * instrumentation hook called internally by the API layer (dispatch loop,
 * resolvers, action executor). Exposing a manual write endpoint would
 * allow callers to forge usage data.
 */

import type { ApiDependencies } from '../graphql/types.js';
import type { RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateUsageMetricsRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.usageMetricsService) return [];
  const svc = deps.usageMetricsService;
  const routes: RestRoute[] = [];

  // GET /api/v1/usage/object-types
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/object-types', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const startTime = typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined;
        const endTime = typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined;
        const metrics = await svc.getObjectTypeMetrics(ctx.requestContext.tenantId, startTime, endTime);
        return { status: 200, body: { data: metrics } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/actions
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/actions', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const startTime = typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined;
        const endTime = typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined;
        const metrics = await svc.getActionFunctionMetrics(ctx.requestContext.tenantId, startTime, endTime);
        return { status: 200, body: { data: metrics } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/summary
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/summary', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const startTime = typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined;
        const endTime = typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined;
        const summary = await svc.getSummary(ctx.requestContext.tenantId, startTime, endTime);
        return { status: 200, body: { data: summary } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/events
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/events', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const query: Record<string, unknown> = {};
        if (typeof req.query['startTime'] === 'string') query['startTime'] = req.query['startTime'];
        if (typeof req.query['endTime'] === 'string') query['endTime'] = req.query['endTime'];
        if (typeof req.query['objectType'] === 'string') query['objectType'] = req.query['objectType'];
        if (typeof req.query['operation'] === 'string') query['operation'] = req.query['operation'];
        if (typeof req.query['userId'] === 'string') query['userId'] = req.query['userId'];
        const result = await svc.queryEvents(ctx.requestContext.tenantId, query);
        return { status: 200, body: { data: result.events, totalCount: result.totalCount } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/active-users
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/active-users', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const startTime = typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined;
        const endTime = typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined;
        const count = await svc.getActiveUserCount(ctx.requestContext.tenantId, startTime, endTime);
        return { status: 200, body: { data: { activeUsers: count } } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/usage/rules — create monitoring rule
  routes.push({
    method: 'POST', pattern: '/api/v1/usage/rules',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = body['name'] as string | undefined;
        if (!name) {
          return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        }
        const rule = await svc.createMonitoringRule(ctx.requestContext, {
          name,
          metric: body['metric'] as 'error_rate' | 'avg_duration' | 'p95_duration' | 'request_count',
          objectType: body['objectType'] as string,
          operation: body['operation'] as never,
          threshold: typeof body['threshold'] === 'number' ? body['threshold'] : 0,
          operator: body['operator'] as 'gt' | 'gte' | 'lt' | 'lte',
          windowSeconds: typeof body['windowSeconds'] === 'number' ? body['windowSeconds'] : 300,
          enabled: body['enabled'] !== false,
        });
        return { status: 201, body: { data: rule } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/rules — list monitoring rules
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/rules', readOperation: 'query',
    handler: async (_req, ctx) => {
      try {
        const rules = await svc.listMonitoringRules(ctx.requestContext);
        return { status: 200, body: { data: rules } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // DELETE /api/v1/usage/rules/:id — delete monitoring rule
  routes.push({
    method: 'DELETE', pattern: '/api/v1/usage/rules/:id',
    handler: async (req, ctx) => {
      try {
        await svc.deleteMonitoringRule(ctx.requestContext, req.params['id'] ?? '');
        return { status: 204, body: {} };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/usage/rules/evaluate — evaluate monitoring rules
  routes.push({
    method: 'POST', pattern: '/api/v1/usage/rules/evaluate',
    handler: async (_req, ctx) => {
      try {
        const results = await svc.evaluateMonitoringRules(ctx.requestContext);
        return { status: 200, body: { data: results } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  return routes;
}
