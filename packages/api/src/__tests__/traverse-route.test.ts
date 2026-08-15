/**
 * Multi-hop traversal over REST, and what it must not disclose.
 *
 * `traverse` was implemented in both storage providers and conformance-tested,
 * but no API surface called it — the capability existed and was unreachable.
 * These cover the route itself and, more importantly, the three ways a graph
 * response leaks: an unauthorized node, an edge pointing at one, and a count
 * that reveals how much was withheld.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { OntologyObject, OntologyLink } from '@altius/spi';
import { generateTraverseRoute } from '../rest/traverse-route.js';
import type { RestRequest } from '../rest/types.js';
import type { ResolverContext } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType {
  id: ID! @primary
  name: String
}

type Patient @objectType {
  id: ID! @primary
  name: String
}

type Bed @objectType {
  id: ID! @primary
  label: String
}

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}

type BedInWard @linkType(from: "Bed", to: "Ward", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}
`;

const schema = parseOdl(ODL);

function obj(type: string, id: string, props: Record<string, unknown> = {}): OntologyObject {
  return { _id: id, _type: type, _tenantId: 't-1', _version: 1, ...props } as unknown as OntologyObject;
}

function link(id: string, fromId: string, toId: string): OntologyLink {
  return { _id: id, _type: 'AdmittedTo', _fromId: fromId, _toId: toId, _tenantId: 't-1' } as unknown as OntologyLink;
}

interface Options {
  /** ids the caller may view; every other node is denied. */
  visible: string[];
  nodes: OntologyObject[];
  edges?: OntologyLink[];
  /** ids whose consent check refuses. */
  consentDenied?: string[];
}

function makeCtx(o: Options): { ctx: ResolverContext; traverse: ReturnType<typeof vi.fn> } {
  const visible = new Set(o.visible);
  const consentDenied = new Set(o.consentDenied ?? []);

  const traverse = vi.fn(async () => ({
    nodes: o.nodes,
    edges: o.edges ?? [],
    // Deliberately larger than the visible set — the provider counts what the
    // traversal found, before any authorization runs.
    totalCount: o.nodes.length,
  }));

  const deps = {
    schema,
    linkManager: { traverse },
    authorizationService: {
      check: async (_user: string, _rel: string, resource: string) =>
        visible.has(resource.split(':')[1] ?? ''),
      redactFields: (_u: string, _r: string[], _t: string, data: Record<string, unknown>) => ({
        data,
        _redactedFields: [],
      }),
    },
    consentService: consentDenied.size > 0
      ? {
          checkSingleObject: async (data: unknown, subjectId: string) => ({
            data,
            _consentRestricted: consentDenied.has(subjectId),
          }),
        }
      : undefined,
    consentSubjectTypes: ['Patient'],
  };

  return {
    ctx: {
      user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'] },
      requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
      deps,
    } as unknown as ResolverContext,
    traverse,
  };
}

function request(body: unknown, id = 'ward-1'): RestRequest {
  return {
    method: 'POST',
    path: `/api/v1/wards/${id}/traverse`,
    params: { id },
    query: {},
    body,
    user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'] },
  } as unknown as RestRequest;
}

const TWO_HOPS = {
  steps: [
    { linkType: 'BedInWard', direction: 'inbound' },
    { linkType: 'AdmittedTo', direction: 'inbound' },
  ],
};

const route = (ctx: ResolverContext) =>
  generateTraverseRoute(ctx.deps, 'Ward', 'wards');

describe('POST /api/v1/{plural}/:id/traverse', () => {
  it('returns the nodes a multi-hop path reaches', async () => {
    const { ctx, traverse } = makeCtx({
      visible: ['ward-1', 'bed-1', 'p-1'],
      nodes: [obj('Bed', 'bed-1'), obj('Patient', 'p-1')],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);

    expect(res.status).toBe(200);
    const data = (res.body as { data: { nodes: { _id: string }[] } }).data;
    expect(data.nodes.map(n => n._id)).toEqual(['bed-1', 'p-1']);
    // The path reached the provider intact — both hops, with their directions.
    expect(traverse.mock.calls[0]![1]).toEqual(TWO_HOPS);
  });

  it('drops a node the caller cannot view', async () => {
    const { ctx } = makeCtx({
      visible: ['ward-1', 'bed-1'],
      nodes: [obj('Bed', 'bed-1'), obj('Patient', 'p-secret')],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);
    const data = (res.body as { data: { nodes: { _id: string }[] } }).data;

    expect(data.nodes.map(n => n._id)).toEqual(['bed-1']);
  });

  it('drops an edge pointing at a node the caller cannot view', async () => {
    const { ctx } = makeCtx({
      visible: ['ward-1', 'bed-1'],
      nodes: [obj('Bed', 'bed-1'), obj('Patient', 'p-secret')],
      edges: [link('l-1', 'bed-1', 'p-secret')],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);
    const data = (res.body as { data: { edges: unknown[] } }).data;

    // Returning the edge would confirm p-secret exists and is connected.
    expect(data.edges).toEqual([]);
  });

  it('counts only what it returns, not what the traversal found', async () => {
    const { ctx } = makeCtx({
      visible: ['ward-1', 'bed-1'],
      nodes: [obj('Bed', 'bed-1'), obj('Patient', 'p-secret'), obj('Patient', 'p-secret-2')],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);
    const data = (res.body as { data: { totalCount: number } }).data;

    // 3 were reached; reporting 3 would disclose the size of the hidden part.
    expect(data.totalCount).toBe(1);
  });

  it('drops a consent-restricted node rather than returning an empty shell', async () => {
    const { ctx } = makeCtx({
      visible: ['ward-1', 'bed-1', 'p-1'],
      nodes: [obj('Bed', 'bed-1'), obj('Patient', 'p-1')],
      consentDenied: ['p-1'],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);
    const data = (res.body as { data: { nodes: { _id: string }[] } }).data;

    expect(data.nodes.map(n => n._id)).toEqual(['bed-1']);
  });

  it('refuses to traverse out of an object the caller cannot view', async () => {
    const { ctx, traverse } = makeCtx({
      visible: [],
      nodes: [],
    });

    const res = await route(ctx).handler(request(TWO_HOPS), ctx);

    expect(res.status).toBe(403);
    // The neighbourhood is never even computed.
    expect(traverse).not.toHaveBeenCalled();
  });

  it('rejects a step naming a link type the ontology does not have', async () => {
    const { ctx, traverse } = makeCtx({ visible: ['ward-1'], nodes: [] });

    const res = await route(ctx).handler(
      request({ steps: [{ linkType: 'NoSuchLink', direction: 'inbound' }] }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('NoSuchLink');
    expect(traverse).not.toHaveBeenCalled();
  });

  it('rejects a body with no steps', async () => {
    const { ctx } = makeCtx({ visible: ['ward-1'], nodes: [] });

    const res = await route(ctx).handler(request({ steps: [] }), ctx);

    expect(res.status).toBe(400);
  });
});
