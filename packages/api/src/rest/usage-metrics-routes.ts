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
 * instrumentation hook called internally by the API layer (see
 * rest/usage-recording.ts, called from the REST dispatcher). Exposing a manual
 * write endpoint would allow callers to forge usage data.
 *
 * Every metric route is windowed. A caller may pass explicit
 * ?startTime=&endTime= ISO instants, or ?days=N for the trailing N days;
 * with neither, the window is the trailing 30 days rather than all of history.
 * An unbounded default is the wrong one for an observability surface: "reads
 * of this type" means nothing without a period, and the answer silently
 * changes shape as the store ages.
 */

import type { ApiDependencies } from '../graphql/types.js';
import type { RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

/** Longest window a caller may request, and the default when none is given. */
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

/** Resolved time window for a metrics query. */
interface UsageWindow {
  startTime: string;
  endTime: string;
}

/**
 * Resolve the query window: explicit start/end, else ?days=N, else the
 * trailing DEFAULT_WINDOW_DAYS. Returns a message instead when the request is
 * malformed, so the route answers 400 rather than quietly widening the window.
 */
function resolveWindow(query: Record<string, string | string[] | undefined>): UsageWindow | { error: string } {
  const rawStart = typeof query['startTime'] === 'string' ? query['startTime'] : undefined;
  const rawEnd = typeof query['endTime'] === 'string' ? query['endTime'] : undefined;
  const rawDays = typeof query['days'] === 'string' ? query['days'] : undefined;

  if (rawDays !== undefined && (rawStart !== undefined || rawEnd !== undefined)) {
    return { error: 'Pass either days or startTime/endTime, not both' };
  }

  const now = Date.now();
  const isoOrError = (value: string, name: string): number | { error: string } => {
    const parsed = Date.parse(value);
    if (isNaN(parsed)) return { error: `${name} must be an ISO 8601 instant` };
    return parsed;
  };

  if (rawStart !== undefined || rawEnd !== undefined) {
    const start = rawStart !== undefined ? isoOrError(rawStart, 'startTime') : now - DEFAULT_WINDOW_DAYS * 86_400_000;
    if (typeof start === 'object') return start;
    const end = rawEnd !== undefined ? isoOrError(rawEnd, 'endTime') : now;
    if (typeof end === 'object') return end;
    if (start > end) return { error: 'startTime must not be after endTime' };
    return { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
  }

  let days = DEFAULT_WINDOW_DAYS;
  if (rawDays !== undefined) {
    const parsed = Number(rawDays);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_WINDOW_DAYS) {
      return { error: `days must be an integer between 1 and ${MAX_WINDOW_DAYS}` };
    }
    days = parsed;
  }
  return {
    startTime: new Date(now - days * 86_400_000).toISOString(),
    endTime: new Date(now).toISOString(),
  };
}

export function generateUsageMetricsRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.usageMetricsService) return [];
  const svc = deps.usageMetricsService;
  const routes: RestRoute[] = [];

  // GET /api/v1/usage/object-types
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/object-types', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const window = resolveWindow(req.query);
        if ('error' in window) {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: window.error, retryable: false, traceId: ctx.requestContext.traceId });
        }
        const metrics = await svc.getObjectTypeMetrics(ctx.requestContext.tenantId, window.startTime, window.endTime);
        return { status: 200, body: { data: metrics, window } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/actions
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/actions', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const window = resolveWindow(req.query);
        if ('error' in window) {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: window.error, retryable: false, traceId: ctx.requestContext.traceId });
        }
        const metrics = await svc.getActionFunctionMetrics(ctx.requestContext.tenantId, window.startTime, window.endTime);
        return { status: 200, body: { data: metrics, window } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/summary
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/summary', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const window = resolveWindow(req.query);
        if ('error' in window) {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: window.error, retryable: false, traceId: ctx.requestContext.traceId });
        }
        const summary = await svc.getSummary(ctx.requestContext.tenantId, window.startTime, window.endTime);
        return { status: 200, body: { data: summary } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/usage/events
  routes.push({
    method: 'GET', pattern: '/api/v1/usage/events', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const window = resolveWindow(req.query);
        if ('error' in window) {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: window.error, retryable: false, traceId: ctx.requestContext.traceId });
        }
        const query: Record<string, unknown> = { startTime: window.startTime, endTime: window.endTime };
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
        const window = resolveWindow(req.query);
        if ('error' in window) {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: window.error, retryable: false, traceId: ctx.requestContext.traceId });
        }
        const count = await svc.getActiveUserCount(ctx.requestContext.tenantId, window.startTime, window.endTime);
        return { status: 200, body: { data: { activeUsers: count }, window } };
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
