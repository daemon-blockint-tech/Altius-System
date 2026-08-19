/**
 * GET /api/v1/sync/status — is ingestion running, and when did it last succeed?
 *
 * `SyncScheduler.stats()` had exactly one consumer, the Prometheus gauge
 * updater, and those gauges are only registered when a scheduler exists. So on
 * a deployment with the scheduler off — the default — there was no metric, no
 * endpoint, and /health answering `ok` because the gateway itself is fine. The
 * operator could not distinguish "ingesting" from "ingesting nothing".
 *
 * Two properties are pinned: the route reports the DISABLED state rather than
 * disappearing (an absent route cannot say "not running"), and it is admin-only
 * because datasource names and error strings describe the source systems.
 */

import { describe, it, expect } from 'vitest';
import { generateSyncStatusRoutes } from '../rest/sync-status-routes.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

function user(roles: string[]): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'T', email: 't@t.uk', roles, groups: [], tenantId: 't1' };
}

function ctxFor(roles: string[]): ResolverContext {
  return {
    requestContext: { tenantId: 't1', actorId: 'user-1', traceId: 'trace' },
    user: user(roles),
    deps: {} as ApiDependencies,
  };
}

function req(roles: string[]): RestRequest {
  return { method: 'GET', path: '/api/v1/sync/status', params: {}, query: {}, body: {}, user: user(roles) };
}

const RUNNING_STATS = [
  {
    datasource: 'pas',
    mode: 'POLLING',
    intervalMs: 30_000,
    ticks: 12,
    consecutiveFailures: 0,
    lastError: null,
    lastTickAt: '2026-08-19T10:00:00.000Z',
    running: false,
    cdc: { recordsProcessed: 500, recordsFailed: 2, lastProcessedAt: '2026-08-19T09:59:00.000Z' },
  },
];

function route(provider: Parameters<typeof generateSyncStatusRoutes>[0], roles?: readonly string[]) {
  const routes = generateSyncStatusRoutes(provider, roles);
  const r = routes.find(x => x.method === 'GET' && x.pattern === '/api/v1/sync/status');
  if (!r) throw new Error('sync status route not registered');
  return r;
}

describe('GET /api/v1/sync/status', () => {
  it('reports the disabled state instead of 404ing', async () => {
    const res = await route({ enabled: false, datasources: () => [] }).handler(req(['admin']), ctxFor(['admin']));
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['enabled']).toBe(false);
    expect(data['datasourceCount']).toBe(0);
  });

  it('reports per-datasource state when the scheduler is running', async () => {
    const res = await route({ enabled: true, datasources: () => RUNNING_STATS }).handler(req(['admin']), ctxFor(['admin']));
    expect(res.status).toBe(200);
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(data['enabled']).toBe(true);
    expect(data['datasourceCount']).toBe(1);
    expect((data['datasources'] as typeof RUNNING_STATS)[0]!.datasource).toBe('pas');
  });

  it('does not call the provider when the scheduler is disabled', async () => {
    let called = false;
    await route({ enabled: false, datasources: () => { called = true; return []; } }).handler(req(['admin']), ctxFor(['admin']));
    expect(called).toBe(false);
  });

  it('refuses a non-admin caller — datasource names describe the source systems', async () => {
    const res = await route({ enabled: true, datasources: () => RUNNING_STATS }).handler(req(['clinician']), ctxFor(['clinician']));
    expect(res.status).toBe(403);
  });

  it('honours a configured reader-role list, and an empty one denies everyone', async () => {
    const opsOk = await route({ enabled: true, datasources: () => [] }, ['ops']).handler(req(['ops']), ctxFor(['ops']));
    expect(opsOk.status).toBe(200);

    const noneAllowed = await route({ enabled: true, datasources: () => [] }, []).handler(req(['admin']), ctxFor(['admin']));
    expect(noneAllowed.status).toBe(403);
  });

  it('registers no route when no provider is supplied', () => {
    expect(generateSyncStatusRoutes(undefined)).toEqual([]);
  });

  it('surfaces a provider failure as an error response, not a thrown exception', async () => {
    const res = await route({
      enabled: true,
      datasources: () => { throw new Error('scheduler exploded'); },
    }).handler(req(['admin']), ctxFor(['admin']));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
