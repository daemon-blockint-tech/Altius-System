/**
 * Markings on the agent surface.
 *
 * An agent reads at machine rate, so a mandatory control enforced on the
 * human surfaces and not here is not enforced at all. Two things must hold:
 * a marked type's read tools are not advertised (listing search_Patient tells
 * the agent Patient exists), and invoking one anyway answers exactly like an
 * unknown tool rather than a denial that confirms it.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { buildToolList, invokeTool, scopeToolList } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")
type Patient @objectType { id: ID! @primary  name: String }
type Ward @objectType { id: ID! @primary  name: String }
`);

const policy = {
  isEmpty: false,
  requiredFor: (t: string) => (t === 'Patient' ? ['PII'] : []),
  check: (held: readonly string[], required: readonly string[]) => ({
    allowed: required.every(r => held.includes(r)),
  }),
};

function caller(markings: string[]): McpCaller {
  return {
    user: { id: 'agent-1', tenantId: 't-1', roles: ['clinician'], name: 'A', markings },
    requestContext: { tenantId: 't-1', actorId: 'agent-1', traceId: 'tr-1' },
  } as unknown as McpCaller;
}

const deps = {
  schema,
  markingPolicy: policy,
  authorizationService: {
    listObjects: async () => ['w-1'],
    check: async () => true,
    getVisibleFields: () => undefined,
    redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
      rows.map(data => ({ data, _redactedFields: [] })),
  },
  storage: { queryObjects: vi.fn(async () => ({ items: [], totalCount: 0 })) },
} as unknown as McpServerDependencies;

describe('marked types on the MCP surface', () => {
  it('does not advertise read tools for a type the caller cannot see', async () => {
    const scoped = await scopeToolList(buildToolList(deps), caller([]), deps);
    const names = scoped.map(t => t.name);

    expect(names).not.toContain('search_Patient');
    expect(names).not.toContain('traverse_Patient');
    expect(names).toContain('search_Ward');
  });

  it('advertises them once the caller holds the marking', async () => {
    const scoped = await scopeToolList(buildToolList(deps), caller(['PII']), deps);

    expect(scoped.map(t => t.name)).toContain('search_Patient');
  });

  it('answers an invocation as unknown, not denied — a denial confirms it exists', async () => {
    const res = await invokeTool('search_Patient', { filters: [] }, caller([]), deps);

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Unknown tool');
    expect(res.content[0]!.text).not.toContain('marking');
  });

  it('still serves the tool to a caller who holds the marking', async () => {
    const res = await invokeTool('search_Patient', { filters: [] }, caller(['PII']), deps);

    expect(res.content[0]!.text).not.toContain('Unknown tool');
  });
});
