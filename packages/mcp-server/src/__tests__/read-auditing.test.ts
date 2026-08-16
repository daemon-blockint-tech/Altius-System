/**
 * An agent's reads belong in the audit trail too.
 *
 * MCP is the third read surface. REST and GraphQL now record who read what;
 * without this, an agent — which reads at machine rate — was the one caller
 * whose reads left no trace, so "who read this record" had a blind spot
 * exactly where the volume is highest.
 *
 * Audited at the `invokeTool` dispatcher, where both read tools converge, so
 * a read tool added later is covered without being remembered.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { AuditRecord } from '@altius/spi';
import { invokeTool } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType { id: ID! @primary  name: String }
type Patient @objectType { id: ID! @primary  name: String }

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) { id: ID! @primary }
`);

const caller: McpCaller = {
  user: { id: 'agent-1', tenantId: 't-1', roles: ['clinician'], name: 'Agent' },
  requestContext: { tenantId: 't-1', actorId: 'agent-1', traceId: 'tr-1' },
} as unknown as McpCaller;

let written: AuditRecord[];

function makeDeps(over: Partial<McpServerDependencies> = {}): McpServerDependencies {
  return {
    schema,
    auditWriter: { write: async (r: AuditRecord) => { written.push(r); } },
    storage: {
      traverse: vi.fn(async () => ({ nodes: [], edges: [], totalCount: 0 })),
      queryObjects: vi.fn(async () => ({ items: [], totalCount: 0 })),
    },
    objectManager: { query: vi.fn(async () => ({ items: [], totalCount: 0 })) },
    authorizationService: {
      check: async () => true,
      listObjects: async () => ['w-1'],
      getVisibleFields: () => undefined,
      redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
        rows.map(data => ({ data, _redactedFields: [] })),
    },
    ...over,
  } as unknown as McpServerDependencies;
}

beforeEach(() => { written = []; });

describe('MCP read auditing', () => {
  it('records a search tool call', async () => {
    await invokeTool('search_Ward', { filters: [] }, caller, makeDeps());

    expect(written).toHaveLength(1);
    expect(written[0]?.operation.type).toBe('query');
    expect(written[0]?.operation.objectType).toBe('Ward');
    expect(written[0]?.detail.query).toBe('mcp search_Ward');
    expect(written[0]?.actor.id).toBe('agent-1');
    expect(written[0]?.tenantId).toBe('t-1');
  });

  it('records a traverse tool call', async () => {
    await invokeTool(
      'traverse_Ward',
      { startId: 'w-1', steps: [{ linkType: 'AdmittedTo', direction: 'inbound' }] },
      caller,
      makeDeps(),
    );

    expect(written).toHaveLength(1);
    expect(written[0]?.operation.objectType).toBe('Ward');
    expect(written[0]?.detail.query).toBe('mcp traverse_Ward');
  });

  it('does not audit an unknown tool — there was no read', async () => {
    await invokeTool('search_NoSuchType', {}, caller, makeDeps());

    expect(written).toHaveLength(0);
  });

  it('never fails the read when the audit store throws', async () => {
    const deps = makeDeps({
      auditWriter: { write: async () => { throw new Error('store down'); } },
    } as unknown as Partial<McpServerDependencies>);

    const res = await invokeTool('search_Ward', { filters: [] }, caller, deps);
    expect(res.isError).not.toBe(true);
  });

  it('is inert when no audit writer is configured', async () => {
    const deps = makeDeps();
    delete (deps as { auditWriter?: unknown }).auditWriter;

    const res = await invokeTool('search_Ward', { filters: [] }, caller, deps);
    expect(res.isError).not.toBe(true);
    expect(written).toHaveLength(0);
  });
});
