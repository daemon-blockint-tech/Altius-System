/**
 * `traverse<Type>` on GraphQL — the third and last surface for search-around.
 *
 * REST and MCP already expose the provider primitive. What matters on every
 * surface is the same: a traversal returns objects of MIXED types, so each node
 * is authorized, redacted and consent-checked against its OWN type, and three
 * things beyond the nodes leak if returned — an edge to a dropped node, the
 * provider's count, and the neighbourhood of an unreadable start object.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ResolverContext } from '../graphql/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType { id: ID! @primary  name: String }
type Patient @objectType { id: ID! @primary  name: String }

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) { id: ID! @primary }
`);

function obj(type: string, id: string) {
  return { _id: id, _type: type, _tenantId: 't-1', _version: 1, name: id };
}

function harness(o: {
  visible: string[];
  nodes: ReturnType<typeof obj>[];
  edges?: { _id: string; _type: string; _fromId: string; _toId: string }[];
  consentDenied?: string[];
}) {
  const visible = new Set(o.visible);
  const consentDenied = new Set(o.consentDenied ?? []);
  const traverse = vi.fn(async () => ({
    nodes: o.nodes,
    edges: o.edges ?? [],
    totalCount: o.nodes.length,
  }));

  const deps = {
    schema,
    linkManager: { traverse },
    objectManager: { get: vi.fn(), query: vi.fn() },
    authorizationService: {
      check: async (_u: string, _r: string, resource: string) =>
        visible.has(resource.split(':')[1] ?? ''),
      listObjects: async () => [],
      getVisibleFields: () => undefined,
      redactFields: (_u: string, _r: string[], _t: string, data: Record<string, unknown>) => ({
        data, _redactedFields: [],
      }),
      redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
        rows.map(data => ({ data, _redactedFields: [] })),
      clearFieldCache: () => {},
    },
    consentService: consentDenied.size > 0
      ? {
          checkSingleObject: async (data: unknown, subjectId: string) => ({
            data, _consentRestricted: consentDenied.has(subjectId),
          }),
        }
      : undefined,
    consentSubjectTypes: ['Patient'],
  } as unknown as ResolverContext['deps'];

  const ctx = {
    user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'] },
    requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
    deps,
  } as unknown as ResolverContext;

  const { resolvers } = generateResolvers(schema, deps) as unknown as {
    resolvers: { Query: Record<string, (p: unknown, a: unknown, c: ResolverContext) => Promise<unknown>> };
  };
  return { resolvers, ctx, traverse };
}

const ARGS = { startId: 'ward-1', steps: [{ linkType: 'AdmittedTo', direction: 'INBOUND' }] };

type Out = {
  nodes: { id: string; type: string }[];
  edges: unknown[];
  totalCount: number;
};

describe('traverse<Type> GraphQL query', () => {
  it('is generated for every object type', () => {
    const { resolvers } = harness({ visible: [], nodes: [] });

    expect(resolvers.Query['traverseWard']).toBeTypeOf('function');
    expect(resolvers.Query['traversePatient']).toBeTypeOf('function');
  });

  it('returns the objects a hop reaches, typed by their own type', async () => {
    const { resolvers, ctx } = harness({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1')],
    });

    const out = await resolvers.Query['traverseWard']!(null, ARGS, ctx) as Out;

    expect(out.nodes).toEqual([
      expect.objectContaining({ id: 'p-1', type: 'Patient' }),
    ]);
  });

  it('drops an unauthorized node, its edge, and keeps the count honest', async () => {
    const { resolvers, ctx } = harness({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1'), obj('Patient', 'p-secret')],
      edges: [{ _id: 'l-1', _type: 'AdmittedTo', _fromId: 'p-1', _toId: 'p-secret' }],
    });

    const out = await resolvers.Query['traverseWard']!(null, ARGS, ctx) as Out;

    expect(out.nodes.map(n => n.id)).toEqual(['p-1']);
    expect(out.edges).toEqual([]);
    expect(out.totalCount).toBe(1);
  });

  it('drops a consent-restricted node rather than returning an empty shell', async () => {
    const { resolvers, ctx } = harness({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1')],
      consentDenied: ['p-1'],
    });

    const out = await resolvers.Query['traverseWard']!(null, ARGS, ctx) as Out;

    expect(out.nodes).toEqual([]);
  });

  it('refuses to traverse out of an object the caller cannot view', async () => {
    const { resolvers, ctx, traverse } = harness({ visible: [], nodes: [] });

    await expect(resolvers.Query['traverseWard']!(null, ARGS, ctx)).rejects.toThrow();
    expect(traverse).not.toHaveBeenCalled();
  });

  it('refuses a link type the ontology does not have', async () => {
    const { resolvers, ctx, traverse } = harness({ visible: ['ward-1'], nodes: [] });

    await expect(
      resolvers.Query['traverseWard']!(null, { startId: 'ward-1', steps: [{ linkType: 'Nope' }] }, ctx),
    ).rejects.toThrow(/Nope/);
    expect(traverse).not.toHaveBeenCalled();
  });
});
