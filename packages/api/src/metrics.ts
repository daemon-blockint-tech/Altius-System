/**
 * Prometheus metrics for the API gateway (Section 13.3).
 *
 * Exposes three metrics expected by the Helm PrometheusRule:
 *   - http_requests_total         (Counter)
 *   - http_request_duration_seconds (Histogram)
 *   - altius_storage_healthy   (Gauge)
 *
 * Usage:
 *   import { metricsMiddleware, metricsEndpoint, startStorageHealthGauge } from './metrics.js';
 *   app.use(metricsMiddleware);
 *   app.get('/metrics', metricsEndpoint);
 *   startStorageHealthGauge(storage);
 */

import { Counter, Histogram, Gauge, register, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import type { StorageProvider } from '@altius/spi';
import type { SyncScheduler } from '@altius/sync';

// Collect Node.js default metrics (GC, event loop, memory, etc.)
collectDefaultMetrics();

// ─── Application metrics ───

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const storageHealthy = new Gauge({
  name: 'altius_storage_healthy',
  help: 'Storage backend health: 1 = healthy, 0 = unhealthy',
});

export const packLoaded = new Gauge({
  name: 'altius_pack_loaded',
  help: 'Domain pack loaded: 1 = loaded',
  labelNames: ['name', 'version', 'origin'] as const,
});

// Sync scheduler gauges — mirror SyncScheduler.stats() (cumulative source
// values), so these are Gauges rather than Counters even for monotonic
// fields; rate()/increase() still work correctly on a monotonic Gauge.
export const syncRecordsProcessed = new Gauge({
  name: 'altius_sync_records_processed',
  help: 'Cumulative sync records processed per datasource',
  labelNames: ['datasource'] as const,
});

export const syncRecordsFailed = new Gauge({
  name: 'altius_sync_records_failed',
  help: 'Cumulative sync records failed per datasource',
  labelNames: ['datasource'] as const,
});

export const syncLastProcessedTimestamp = new Gauge({
  name: 'altius_sync_last_processed_timestamp_seconds',
  help: 'Unix timestamp of the last record processed per datasource',
  labelNames: ['datasource'] as const,
});

export const syncConsecutiveFailures = new Gauge({
  name: 'altius_sync_consecutive_failures',
  help: 'Consecutive failed poll ticks per datasource (resets to 0 on success)',
  labelNames: ['datasource'] as const,
});

/**
 * Whether this process runs the sync scheduler (1) or not (0).
 *
 * Every gauge above is per-datasource and only exists once a scheduler has
 * registered one, so a deployment with ingestion switched off produces NO sync
 * series at all — and an alert on a series that is never produced never fires.
 * This one is always exported, which is what makes "ingestion is not running"
 * an alertable condition rather than a silence.
 */
export const syncSchedulerEnabled = new Gauge({
  name: 'altius_sync_scheduler_enabled',
  help: 'Whether the sync scheduler is running in this process (1) or not (0)',
});

// ─── Middleware ───

/**
 * Extract a low-cardinality route label from the Express request.
 *
 * Prefers the Express matched route pattern (req.route.path) which already
 * contains parameterized segments (e.g., /api/v1/patients/:id). Falls back
 * to normalizeRoute() for middleware-mounted paths without route patterns.
 */
function getRouteLabel(req: Request): string {
  // Prefer Express matched route pattern (already parameterized)
  if (req.route?.path) {
    return req.baseUrl + (req.route.path as string);
  }
  // Fallback for middleware-mounted paths (e.g., /graphql via app.use)
  if (req.baseUrl) return req.baseUrl;
  // Last resort: normalize the raw path
  return normalizeRoute(req.path);
}

/**
 * Last-resort route normalizer — only called for paths not matched by any
 * Express route (req.route and req.baseUrl are both absent). This covers
 * 404 scans, probes, and other unmatched paths. Uses bounded labels to
 * prevent cardinality explosion from arbitrary URLs.
 */
function normalizeRoute(path: string): string {
  // Known static health/infra paths
  if (path === '/health' || path === '/healthz') return path;
  if (path.startsWith('/.well-known/')) return '/.well-known/*';
  // API paths — collapse to prefix (the actual route pattern wasn't matched)
  if (path.startsWith('/api/')) return '/api/__unmatched__';
  // FHIR paths
  if (path.startsWith('/fhir/')) return '/fhir/__unmatched__';
  // Everything else — bounded catch-all
  return '__unmatched__';
}

/**
 * Express middleware that records request count and duration.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics for the /metrics endpoint itself
  if (req.path === '/metrics') {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;
    const route = getRouteLabel(req);
    const status = String(res.statusCode);

    httpRequestsTotal.inc({ method: req.method, route, status });
    httpRequestDuration.observe({ method: req.method, route, status }, durationSec);
  });

  next();
}

/**
 * Guard for pod-internal endpoints (/metrics, /admin/packs). Requests that
 * arrive via ingress carry X-Forwarded-For and get 404 in production;
 * direct pod access (Prometheus scrapes, kubectl port-forward) passes.
 */
export function podDirectOnly(isDev: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isDev && req.headers['x-forwarded-for']) {
      res.status(404).end();
      return;
    }
    next();
  };
}

/**
 * Express handler for GET /metrics — returns Prometheus text format.
 */
export async function metricsEndpoint(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch {
    res.status(500).end();
  }
}

/**
 * Start a periodic health check that updates the storage health gauge.
 * Returns a cleanup function to stop the interval.
 */
export function startStorageHealthGauge(
  storage: StorageProvider,
  intervalMs = 15_000,
): () => void {
  // Set initial value optimistically
  storageHealthy.set(1);

  const timer = setInterval(async () => {
    try {
      const health = await storage.healthCheck();
      storageHealthy.set(health.healthy ? 1 : 0);
    } catch {
      storageHealthy.set(0);
    }
  }, intervalMs);

  // Don't prevent process exit
  timer.unref();

  return () => clearInterval(timer);
}

/**
 * Start a periodic reader that mirrors SyncScheduler.stats() onto the
 * sync gauges above. Returns a cleanup function to stop the interval.
 */
export function startSyncMetricsGauge(
  scheduler: SyncScheduler,
  intervalMs = 15_000,
): () => void {
  const tick = () => {
    for (const s of scheduler.stats()) {
      syncRecordsProcessed.set({ datasource: s.datasource }, s.cdc.recordsProcessed);
      syncRecordsFailed.set({ datasource: s.datasource }, s.cdc.recordsFailed);
      syncConsecutiveFailures.set({ datasource: s.datasource }, s.consecutiveFailures);
      if (s.cdc.lastProcessedAt) {
        syncLastProcessedTimestamp.set({ datasource: s.datasource }, Date.parse(s.cdc.lastProcessedAt) / 1000);
      }
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
