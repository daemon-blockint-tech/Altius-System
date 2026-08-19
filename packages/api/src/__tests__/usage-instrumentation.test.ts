/**
 * Usage metrics: instrumentation and windowing.
 *
 * `record()` had no caller anywhere in the platform, so every read endpoint
 * reported zeros — an observability surface that looks healthy because it is
 * empty. And the read endpoints defaulted to "all of history", which means the
 * per-type numbers silently changed meaning as the store aged.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { InMemoryOntologyUsageMetricsService } from '@altius/storage-memory';
import { classifyRestUsage, recordRestUsage } from '../rest/usage-recording.js';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestRoute } from '../rest/types.js';
import type { OntologyUsageEvent } from '@altius/spi';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Widget @objectType { id: ID! @primary  name: String }
`;

const TENANT = 't1';

function user(): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'T', email: 't@t.uk', roles: ['admin'], groups: [], tenantId: TENANT };
}

function req(method: string, path: string, params: Record<string, string> = {}, query: Record<string, string> = {}): RestRequest {
  return { method, path, params, query, body: {}, user: user() };
}

function route(over: Partial<RestRoute> = {}): RestRoute {
  return {
    method: 'GET',
    pattern: '/api/v1/widgets',
    handler: async () => ({ status: 200, body: {} }),
    ...over,
  } as RestRoute;
}

describe('classifyRestUsage', () => {
  it.each([
    ['read for a GET by id', route({ method: 'GET', objectType: 'Widget' }), req('GET', '/api/v1/widgets/w-1', { id: 'w-1' }), 'read'],
    ['read for a list', route({ method: 'GET', objectType: 'Widget' }), req('GET', '/api/v1/widgets'), 'read'],
    ['create for a POST', route({ method: 'POST', objectType: 'Widget' }), req('POST', '/api/v1/widgets'), 'create'],
    ['update for a PUT', route({ method: 'PUT', objectType: 'Widget' }), req('PUT', '/api/v1/widgets/w-1'), 'update'],
    ['delete for a DELETE', route({ method: 'DELETE', objectType: 'Widget' }), req('DELETE', '/api/v1/widgets/w-1'), 'delete'],
    ['search on the search path', route({ method: 'GET', objectType: 'Widget' }), req('GET', '/api/v1/widgets/search'), 'search'],
    ['link on the links path', route({ method: 'GET', objectType: 'Widget' }), req('GET', '/api/v1/widgets/w-1/links/Owns'), 'link'],
  ])('classifies %s', (_label, r, request, expected) => {
    expect(classifyRestUsage(r, request).operation).toBe(expected);
  });

  it('classifies a POST aggregate as an aggregate, not a create', () => {
    // The whole reason route.readOperation exists: a read that carries a body.
    const r = route({ method: 'POST', objectType: 'Widget', readOperation: 'query', pattern: '/api/v1/widgets/aggregate' });
    expect(classifyRestUsage(r, req('POST', '/api/v1/widgets/aggregate')).operation).toBe('aggregate');
  });

  it('names the action or function it ran', () => {
    const action = classifyRestUsage(
      route({ method: 'POST', pattern: '/api/v1/actions/AdmitPatient' }),
      req('POST', '/api/v1/actions/AdmitPatient'),
    );
    expect(action).toMatchObject({ operation: 'action', actionOrFunctionName: 'AdmitPatient' });

    const fn = classifyRestUsage(
      route({ method: 'POST', pattern: '/api/v1/functions/ScoreRisk' }),
      req('POST', '/api/v1/functions/ScoreRisk'),
    );
    expect(fn).toMatchObject({ operation: 'function', actionOrFunctionName: 'ScoreRisk' });
  });

  it('files a platform route under a pseudo-type rather than dropping it', () => {
    const r = route({ method: 'GET', pattern: '/api/v1/audit' });
    expect(classifyRestUsage(r, req('GET', '/api/v1/audit')).objectType).toBe('_platform');
  });
});

describe('recordRestUsage', () => {
  function depsWith(service?: unknown): ApiDependencies {
    return { usageMetricsService: service } as unknown as ApiDependencies;
  }

  it('records one event per served request with duration and actor', async () => {
    const recorded: OntologyUsageEvent[] = [];
    const deps = depsWith({ record: async (e: OntologyUsageEvent) => { recorded.push(e); } });

    await recordRestUsage(deps, route({ objectType: 'Widget' }), req('GET', '/api/v1/widgets/w-1', { id: 'w-1' }), 200, 42);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      tenantId: TENANT,
      userId: 'user-1',
      operation: 'read',
      objectType: 'Widget',
      objectId: 'w-1',
      success: true,
      durationMs: 42,
    });
  });

  it('counts a 403 as an error, so an error-rate rule sees a permissions outage', async () => {
    const recorded: OntologyUsageEvent[] = [];
    const deps = depsWith({ record: async (e: OntologyUsageEvent) => { recorded.push(e); } });
    await recordRestUsage(deps, route({ objectType: 'Widget' }), req('GET', '/api/v1/widgets'), 403, 1);
    expect(recorded[0]!.success).toBe(false);
  });

  it('is a no-op when no metrics service is configured', async () => {
    await expect(
      recordRestUsage(depsWith(undefined), route(), req('GET', '/api/v1/widgets'), 200, 1),
    ).resolves.toBeUndefined();
  });

  it('never lets a metrics failure escape into the request', async () => {
    const warn = vi.fn();
    const deps = depsWith({ record: async () => { throw new Error('metrics store down'); } });
    await expect(
      recordRestUsage(deps, route(), req('GET', '/api/v1/widgets'), 200, 1, { warn }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe('GET /api/v1/usage/* windowing', () => {
  function depsWithStore(service: InMemoryOntologyUsageMetricsService): ApiDependencies {
    return {
      schema: parseOdl(ODL),
      objectManager: {} as never,
      linkManager: {} as never,
      actionExecutor: {} as never,
      authorizationService: {
        check: vi.fn().mockResolvedValue(true),
        listObjects: vi.fn().mockResolvedValue(['*']),
        getVisibleFields: vi.fn(),
        redactFields: vi.fn(),
        redactFieldsBatch: vi.fn(),
        clearFieldCache: vi.fn(),
      } as never,
      authenticator: {} as never,
      storage: {} as never,
      usageMetricsService: service,
    } as unknown as ApiDependencies;
  }

  function ctxFor(deps: ApiDependencies): ResolverContext {
    return { requestContext: { tenantId: TENANT, actorId: 'user-1', traceId: 'trace' }, user: user(), deps };
  }

  function routeFor(deps: ApiDependencies, method: string, pattern: string) {
    const r = generateRestRoutes(deps.schema, deps).find(x => x.method === method && x.pattern === pattern);
    if (!r) throw new Error(`Route not found: ${method} ${pattern}`);
    return r;
  }

  async function seeded(): Promise<InMemoryOntologyUsageMetricsService> {
    const svc = new InMemoryOntologyUsageMetricsService();
    const event = (daysAgo: number): OntologyUsageEvent => ({
      tenantId: TENANT,
      userId: 'user-1',
      operation: 'read',
      objectType: 'Widget',
      success: true,
      durationMs: 5,
      timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    });
    await svc.record(event(1));
    await svc.record(event(10));
    await svc.record(event(60)); // outside the default 30-day window
    return svc;
  }

  it('defaults to the trailing 30 days and reports the window it used', async () => {
    const svc = await seeded();
    const deps = depsWithStore(svc);
    const res = await routeFor(deps, 'GET', '/api/v1/usage/object-types').handler(
      req('GET', '/api/v1/usage/object-types'),
      ctxFor(deps),
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { totalReads: number }[]; window: { startTime: string; endTime: string } };
    expect(body.data[0]!.totalReads).toBe(2);
    expect(Date.parse(body.window.startTime)).toBeLessThan(Date.parse(body.window.endTime));
  });

  it('honours ?days= for a shorter window', async () => {
    const svc = await seeded();
    const deps = depsWithStore(svc);
    const res = await routeFor(deps, 'GET', '/api/v1/usage/object-types').handler(
      req('GET', '/api/v1/usage/object-types', {}, { days: '5' }),
      ctxFor(deps),
    );
    const body = res.body as { data: { totalReads: number }[] };
    expect(body.data[0]!.totalReads).toBe(1);
  });

  it('honours ?days= over a longer window', async () => {
    const svc = await seeded();
    const deps = depsWithStore(svc);
    const res = await routeFor(deps, 'GET', '/api/v1/usage/object-types').handler(
      req('GET', '/api/v1/usage/object-types', {}, { days: '90' }),
      ctxFor(deps),
    );
    const body = res.body as { data: { totalReads: number }[] };
    expect(body.data[0]!.totalReads).toBe(3);
  });

  it.each([
    ['days and startTime together', { days: '5', startTime: new Date().toISOString() }],
    ['a non-integer days', { days: '2.5' }],
    ['days beyond the ceiling', { days: '4000' }],
    ['a malformed startTime', { startTime: 'yesterday' }],
    ['an inverted range', { startTime: new Date().toISOString(), endTime: new Date(Date.now() - 86_400_000).toISOString() }],
  ])('rejects %s', async (_label, query) => {
    const svc = await seeded();
    const deps = depsWithStore(svc);
    const res = await routeFor(deps, 'GET', '/api/v1/usage/object-types').handler(
      req('GET', '/api/v1/usage/object-types', {}, query),
      ctxFor(deps),
    );
    expect(res.status).toBe(400);
  });

  it('windows the raw event query too', async () => {
    const svc = await seeded();
    const deps = depsWithStore(svc);
    const res = await routeFor(deps, 'GET', '/api/v1/usage/events').handler(
      req('GET', '/api/v1/usage/events'),
      ctxFor(deps),
    );
    const body = res.body as { data: unknown[]; totalCount: number };
    expect(body.data).toHaveLength(2);
  });
});

describe('in-memory metrics retention', () => {
  it('drops events past the retention window instead of growing for ever', async () => {
    const svc = new InMemoryOntologyUsageMetricsService({ retentionDays: 7, maxEvents: 10 });
    const event = (daysAgo: number): OntologyUsageEvent => ({
      tenantId: TENANT,
      operation: 'read',
      objectType: 'Widget',
      success: true,
      durationMs: 1,
      timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    });
    await svc.record(event(30));
    // The count ceiling forces a prune without waiting for the amortised trigger.
    for (let i = 0; i < 11; i++) await svc.record(event(0));

    const result = await svc.queryEvents(TENANT, {});
    expect(result.events.every(e => Date.parse(e.timestamp) >= Date.now() - 7 * 86_400_000)).toBe(true);
    expect(result.events.length).toBeLessThanOrEqual(11);
  });
});
