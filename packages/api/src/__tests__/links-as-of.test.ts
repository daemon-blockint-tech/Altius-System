/**
 * GET /api/v1/{plural}/:id/links/:linkType?asOf= — the graph as it was.
 *
 * Object reads had asOf on the record, the collection and the history route;
 * links had nothing, so a historical question about the graph could only be
 * answered with the current graph — every present link silently backdated.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import type { RestRequest } from '../rest/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")
type Patient @objectType { id: ID! @primary  name: String }
type Ward @objectType { id: ID! @primary  name: String }
type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) { id: ID! @primary }
`;

const TENANT = 't1';
const AT = '2026-08-12T09:00:00.000Z';

function user(): AuthenticatedUserInfo {
  return { id: 'user-1', name: 'T', email: 't@t.uk', roles: ['admin'], groups: [], tenantId: TENANT };
}

function emptyPage() {
  return { items: [], totalCount: 0, hasNextPage: false };
}

function deps(): ApiDependencies {
  return {
    schema: parseOdl(ODL),
    objectManager: {} as never,
    linkManager: {
      getLinks: vi.fn().mockResolvedValue(emptyPage()),
      getLinksAtTime: vi.fn().mockResolvedValue(emptyPage()),
    } as never,
    actionExecutor: {} as never,
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn(),
      redactFields: vi.fn(),
      redactFieldsBatch: vi.fn((_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
        rows.map(data => ({ data, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as never,
    authenticator: {} as never,
    storage: {} as never,
  } as unknown as ApiDependencies;
}

function ctxFor(d: ApiDependencies): ResolverContext {
  return { requestContext: { tenantId: TENANT, actorId: 'user-1', traceId: 'trace' }, user: user(), deps: d };
}

function req(query: Record<string, string>): RestRequest {
  return {
    method: 'GET',
    path: '/api/v1/patients/p-1/links/AdmittedTo',
    params: { id: 'p-1', linkType: 'AdmittedTo' },
    query,
    body: {},
    user: user(),
  };
}

function linksRoute(d: ApiDependencies) {
  const r = generateRestRoutes(d.schema, d).find(
    x => x.method === 'GET' && x.pattern === '/api/v1/patients/:id/links/:linkType',
  );
  if (!r) throw new Error('links route not registered');
  return r;
}

describe('links ?asOf=', () => {
  it('reads the live graph when asOf is absent', async () => {
    const d = deps();
    const res = await linksRoute(d).handler(req({}), ctxFor(d));
    expect(res.status).toBe(200);
    expect(d.linkManager.getLinks).toHaveBeenCalled();
    expect(d.linkManager.getLinksAtTime).not.toHaveBeenCalled();
  });

  it('routes to the temporal read when asOf is given, passing the instant through', async () => {
    const d = deps();
    const res = await linksRoute(d).handler(req({ asOf: AT }), ctxFor(d));
    expect(res.status).toBe(200);
    expect(d.linkManager.getLinks).not.toHaveBeenCalled();
    const call = (d.linkManager.getLinksAtTime as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe('p-1');
    expect(call[1]).toBe('AdmittedTo');
    expect(call[2]).toBe('outbound');
    expect(call[3]).toBe(AT);
  });

  it('honours ?direction=inbound with asOf', async () => {
    const d = deps();
    await linksRoute(d).handler(req({ asOf: AT, direction: 'inbound' }), ctxFor(d));
    const call = (d.linkManager.getLinksAtTime as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[2]).toBe('inbound');
  });

  it('passes pagination through to the temporal read', async () => {
    const d = deps();
    await linksRoute(d).handler(req({ asOf: AT, limit: '5', offset: '10' }), ctxFor(d));
    const call = (d.linkManager.getLinksAtTime as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[4]).toMatchObject({ limit: 5, offset: 10 });
  });

  it('refuses a malformed asOf instead of falling back to the live graph', async () => {
    const d = deps();
    const res = await linksRoute(d).handler(req({ asOf: 'last tuesday' }), ctxFor(d));
    expect(res.status).toBe(400);
    expect(d.linkManager.getLinks).not.toHaveBeenCalled();
    expect(d.linkManager.getLinksAtTime).not.toHaveBeenCalled();
  });

  it('still enforces viewer access on the parent object', async () => {
    const d = deps();
    (d.authorizationService.check as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await linksRoute(d).handler(req({ asOf: AT }), ctxFor(d));
    expect(res.status).toBe(403);
    expect(d.linkManager.getLinksAtTime).not.toHaveBeenCalled();
  });

  it('redacts link properties on the temporal read as it does on the live one', async () => {
    const d = deps();
    (d.linkManager.getLinksAtTime as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ _id: 'l-1', _type: 'AdmittedTo', _fromId: 'p-1', _toId: 'w-1', secret: 'x' }],
      totalCount: 1,
      hasNextPage: false,
    });
    (d.authorizationService.redactFieldsBatch as ReturnType<typeof vi.fn>).mockImplementation(
      (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
        rows.map(row => ({ data: { ...row, secret: null }, _redactedFields: ['secret'] })),
    );
    const res = await linksRoute(d).handler(req({ asOf: AT }), ctxFor(d));
    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>[];
    expect(data[0]!['secret']).toBeNull();
  });
});
