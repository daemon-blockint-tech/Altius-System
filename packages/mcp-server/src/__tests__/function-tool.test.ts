/**
 * `function_<Name>`: declared FunctionTypes exposed as MCP tools.
 *
 * Actions and object reads were already tools, but @function logic — the
 * pack-authored compute path REST and GraphQL expose — was invisible to agents.
 * These pin that functions become tools only when an invoker is wired, that the
 * input schema comes from @param fields, and that invocation is delegated to
 * the governed invoker (which owns role checks + audit).
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { invokeTool, buildToolList } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  name: String }

type ScoreRisk @function(runtime: "node", entry: "score.js", requiredRoles: "analyst") {
  customerId: ID! @param
  factor: Int @param
}
`);

const caller: McpCaller = {
  user: { id: 'u-1', tenantId: 't-1', roles: ['analyst'], name: 'U' },
  requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
} as unknown as McpCaller;

function makeDeps(invoker?: McpServerDependencies['functionInvoker']): McpServerDependencies {
  return { schema, functionInvoker: invoker } as unknown as McpServerDependencies;
}

function parse(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe('function_<Name> MCP tool', () => {
  it('offers one function tool per FunctionType when an invoker is wired', () => {
    const names = buildToolList(makeDeps({ invoke: vi.fn() })).map((t) => t.name);
    expect(names).toContain('function_ScoreRisk');
  });

  it('offers no function tools when no invoker is wired', () => {
    const names = buildToolList(makeDeps(undefined)).map((t) => t.name);
    expect(names).not.toContain('function_ScoreRisk');
  });

  it('derives the input schema from @param fields', () => {
    const tool = buildToolList(makeDeps({ invoke: vi.fn() })).find((t) => t.name === 'function_ScoreRisk')!;
    const schemaObj = tool.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schemaObj.properties).sort()).toEqual(['customerId', 'factor']);
    expect(schemaObj.required).toEqual(['customerId']);
  });

  it('dispatches to the invoker and returns its result', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const, result: { score: 42 } }));
    const out = parse(await invokeTool('function_ScoreRisk', { customerId: 'c-1', factor: 3 }, caller, makeDeps({ invoke })) as never);

    expect(invoke).toHaveBeenCalledTimes(1);
    const arg = (invoke.mock.calls[0] as unknown[])[0] as { functionName: string; args: Record<string, unknown>; user: { id: string } };
    expect(arg.functionName).toBe('ScoreRisk');
    expect(arg.args).toEqual({ customerId: 'c-1', factor: 3 });
    expect(arg.user.id).toBe('u-1');
    expect(out).toEqual({ score: 42 });
  });

  it('surfaces an invoker denial as an error result', async () => {
    const invoke = vi.fn(async () => ({ ok: false as const, error: 'requires one of: analyst', code: 'FORBIDDEN' }));
    const res = await invokeTool('function_ScoreRisk', {}, caller, makeDeps({ invoke })) as { isError?: boolean; content: { text: string }[] };

    expect(res.isError).toBe(true);
    expect(parse(res)).toEqual({ error: 'requires one of: analyst', code: 'FORBIDDEN' });
  });

  it('reports an unknown function name', async () => {
    const res = await invokeTool('function_DoesNotExist', {}, caller, makeDeps({ invoke: vi.fn() })) as { isError?: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(String(parse(res)['error'])).toContain('Unknown tool');
  });
});
