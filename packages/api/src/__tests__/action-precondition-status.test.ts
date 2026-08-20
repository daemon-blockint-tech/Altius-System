/**
 * A stale `If-Match` on an action must answer 412, not 200.
 *
 * The action route accepts `If-Match`, the executor detects the conflict, the
 * error keeps its VERSION_CONFLICT code, and errors.ts already maps that code
 * to 412 — but the route hard-coded `status: 200` and put the failure in the
 * body. So a client using standard conditional-request semantics saw success
 * and had to parse the payload to discover its write was refused, which is
 * exactly what the precondition header exists to avoid.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { RestRoute } from '../rest/types.js';
import type { ResolverContext } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String
}

type UpdateName @actionType {
  patient: Patient! @param
  name: String! @param
}
`;

const schema = parseOdl(ODL);

/** Executor that reports the outcome the pipeline would produce. */
function depsReturning(errors: { code: string; message: string }[]): ResolverContext['deps'] {
  return {
    schema,
    actionExecutor: {
      execute: vi.fn(async () => ({
        success: errors.length === 0,
        actionId: 'act-1',
        errors,
        affectedObjects: [],
      })),
    },
    manifestRegistry: new Map([['UpdateName', { action: 'UpdateName', version: 1, effects: [] }]]),
    authorizationService: {
      check: async () => true,
      listObjects: async () => ['*'],
      getVisibleFields: () => undefined,
      redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
      redactFieldsBatch: (_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] })),
      clearFieldCache: () => {},
    },
    objectManager: { get: vi.fn(), query: vi.fn() },
    linkManager: {},
  } as unknown as ResolverContext['deps'];
}

function ctxFor(deps: ResolverContext['deps']): ResolverContext {
  return {
    user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'] },
    requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
    deps,
  } as unknown as ResolverContext;
}

function actionRoute(deps: ResolverContext['deps']): RestRoute {
  const routes = generateRestRoutes(schema, deps);
  // Match the action execution route, not the form-metadata route
  // (/api/v1/actions/{name}/form) which also matches /actions/.
  const route = routes.find(r => r.method === 'POST' && r.pattern.includes('/actions/') && !r.pattern.endsWith('/form'));
  if (!route) throw new Error('no action route generated');
  return route;
}

async function post(errors: { code: string; message: string }[]) {
  const deps = depsReturning(errors);
  const ctx = ctxFor(deps);
  return actionRoute(deps).handler(
    {
      method: 'POST',
      path: '/api/v1/actions/UpdateName',
      params: { name: 'UpdateName' },
      query: {},
      body: { patient: 'p-1', name: 'Jane' },
      user: ctx.user,
      headers: { 'if-match': '3' },
    } as never,
    ctx,
  );
}

describe('action route: HTTP status for a refused write', () => {
  it('answers 412 when the caller asserted a stale version', async () => {
    const res = await post([
      { code: 'VERSION_CONFLICT', message: 'Patient was modified since you loaded it (you have v3, it is now v5).' },
    ]);

    expect(res.status).toBe(412);
    // The body still carries the detail — the status is what a plain HTTP
    // client acts on, the body is what a human reads.
    expect(JSON.stringify(res.body)).toContain('VERSION_CONFLICT');
  });

  it('still answers 200 when the action succeeds', async () => {
    const res = await post([]);

    expect(res.status).toBe(200);
  });
});
