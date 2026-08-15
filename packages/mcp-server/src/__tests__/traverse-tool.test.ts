/**
 * `traverse_<Type>`: multi-hop search-around for agents, and what it withholds.
 *
 * The provider primitive was implemented, conformance-tested, and reachable
 * from no surface — an agent could only fan out one getLinks per node and
 * stitch the graph itself. Exposing it is the easy half; the hard half is that
 * a traversal returns objects of MIXED types, so authorization runs per node
 * against its OWN type, and three things beyond the nodes leak if returned.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { invokeTool, buildToolList } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType { id: ID! @primary  name: String }
type Patient @objectType { id: ID! @primary  name: String }
type Bed @objectType { id: ID! @primary  label: String }

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) { id: ID! @primary }
`);

const caller: McpCaller = {
  user: { id: 'u-1', tenantId: 't-1', roles: ['clinician'], name: 'U' },
  requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
} as unknown as McpCaller;

function obj(type: string, id: string) {
  return { _id: id, _type: type, _tenantId: 't-1', _version: 1, name: id };
}

function makeDeps(o: {
  visible: string[];
  nodes: ReturnType<typeof obj>[];
  edges?: { _id: string; _type: string; _fromId: string; _toId: string }[];
  consentSubjectTypes?: string[];
  consentDenied?: string[];
}): { deps: McpServerDependencies; traverse: ReturnType<typeof vi.fn> } {
  const visible = new Set(o.visible);
  const traverse = vi.fn(async () => ({
    nodes: o.nodes,
    edges: o.edges ?? [],
    totalCount: o.nodes.length,
  }));
  return {
    traverse,
    deps: {
      schema,
      storage: { traverse },
      consentSubjectTypes: o.consentSubjectTypes,
      consentService: o.consentDenied
        ? {
            checkSingleObject: async (data: unknown, subjectId: string) => ({
              data, _consentRestricted: o.consentDenied!.includes(subjectId),
            }),
          }
        : undefined,
      authorizationService: {
        check: async (_u: string, _r: string, resource: string) =>
          visible.has(resource.split(':')[1] ?? ''),
        redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
          rows.map(data => ({ data, _redactedFields: [] })),
      },
    } as unknown as McpServerDependencies,
  };
}

const TWO_HOPS = { startId: 'ward-1', steps: [{ linkType: 'AdmittedTo', direction: 'inbound' }] };

function parse(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0]!.text) as {
    nodes?: { _id: string }[]; edges?: unknown[]; totalCount?: number; error?: string;
  };
}

describe('traverse_<Type> MCP tool', () => {
  it('is offered for every object type', () => {
    const { deps } = makeDeps({ visible: [], nodes: [] });
    const names = buildToolList(deps).map(t => t.name);

    expect(names).toContain('traverse_Ward');
    expect(names).toContain('traverse_Patient');
  });

  it('returns the objects a hop reaches', async () => {
    const { deps } = makeDeps({ visible: ['ward-1', 'p-1'], nodes: [obj('Patient', 'p-1')] });

    const out = parse(await invokeTool('traverse_Ward', TWO_HOPS, caller, deps) as never);

    expect(out.nodes!.map(n => n._id)).toEqual(['p-1']);
  });

  it('drops a node the caller cannot view, and the edge pointing at it', async () => {
    const { deps } = makeDeps({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1'), obj('Patient', 'p-secret')],
      edges: [{ _id: 'l-1', _type: 'AdmittedTo', _fromId: 'p-1', _toId: 'p-secret' }],
    });

    const out = parse(await invokeTool('traverse_Ward', TWO_HOPS, caller, deps) as never);

    expect(out.nodes!.map(n => n._id)).toEqual(['p-1']);
    // The edge would confirm p-secret exists and is connected.
    expect(out.edges).toEqual([]);
    // The provider found 2; saying so discloses the size of the hidden part.
    expect(out.totalCount).toBe(1);
  });

  it('drops a node the consent gate refuses', async () => {
    const { deps } = makeDeps({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1')],
      consentSubjectTypes: ['Patient'],
      consentDenied: ['p-1'],
    });

    const out = parse(await invokeTool('traverse_Ward', TWO_HOPS, caller, deps) as never);

    // Dropped, not blanked: on a graph, presence is itself the disclosure.
    expect(out.nodes).toEqual([]);
  });

  it('returns a consent-gated node the gate allows', async () => {
    const { deps } = makeDeps({
      visible: ['ward-1', 'p-1'],
      nodes: [obj('Patient', 'p-1')],
      consentSubjectTypes: ['Patient'],
      consentDenied: [],
    });

    const out = parse(await invokeTool('traverse_Ward', TWO_HOPS, caller, deps) as never);

    expect(out.nodes!.map(n => n._id)).toEqual(['p-1']);
  });

  it('refuses to traverse out of an object the caller cannot view', async () => {
    const { deps, traverse } = makeDeps({ visible: [], nodes: [] });

    const out = parse(await invokeTool('traverse_Ward', TWO_HOPS, caller, deps) as never);

    expect(out.error).toContain('Access denied');
    expect(traverse).not.toHaveBeenCalled();
  });

  it('refuses a link type the ontology does not have', async () => {
    const { deps, traverse } = makeDeps({ visible: ['ward-1'], nodes: [] });

    const out = parse(await invokeTool(
      'traverse_Ward',
      { startId: 'ward-1', steps: [{ linkType: 'NoSuchLink' }] },
      caller, deps,
    ) as never);

    expect(out.error).toContain('NoSuchLink');
    expect(traverse).not.toHaveBeenCalled();
  });
});
