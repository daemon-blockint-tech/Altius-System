/**
 * What an agent can see and do over MCP.
 *
 * Three gaps, all of which matter more for an autonomous agent than for a
 * human at a keyboard:
 *
 * 1. Declared @function types were invisible. REST and GraphQL both expose
 *    them; MCP built tools from actionTypes and objectTypes only, so pack
 *    logic shipped as a function could not be reached by an agent at all.
 * 2. No dry-run. REST has accepted ?dryRun=true for a while; MCP never passed
 *    it, so the caller most likely to want to preview a write before
 *    committing was the one surface that could not.
 * 3. tools/list returned every tool to every caller. Execution was denied
 *    later, so this was disclosure rather than an authority hole — but for an
 *    LLM the tool list IS the affordance, and advertising writes it can never
 *    perform invites it to try.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { buildToolList, invokeTool, scopeToolList } from '../tools.js';
import type { McpServerDependencies, McpCaller } from '../types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Ward @objectType { id: ID! @primary  name: String }

type ScoreRisk @function(runtime: "node", entry: "score.js", requiredRoles: "clinician") {
  wardId: String!
  weight: Int
}

type AdminOnly @function(runtime: "node", entry: "admin.js", requiredRoles: "admin") {
  input: String!
}
`);

function caller(roles: string[]): McpCaller {
  return {
    user: { id: 'agent-1', tenantId: 't-1', roles, name: 'Agent' },
    requestContext: { tenantId: 't-1', actorId: 'agent-1', traceId: 'tr-1' },
  } as unknown as McpCaller;
}

function makeDeps(over: Partial<McpServerDependencies> = {}): McpServerDependencies {
  return {
    schema,
    functionInvoker: vi.fn(async () => ({ score: 42 })),
    authorizationService: {
      listObjects: async () => ['w-1'],
      check: async () => true,
      getVisibleFields: () => undefined,
      redactFieldsBatch: (_u: string, _r: string[], _t: string, rows: Record<string, unknown>[]) =>
        rows.map(data => ({ data, _redactedFields: [] })),
    },
    storage: { queryObjects: vi.fn(async () => ({ items: [], totalCount: 0 })) },
    ...over,
  } as unknown as McpServerDependencies;
}

describe('FunctionTypes as MCP tools', () => {
  it('advertises a tool per declared function', () => {
    const names = buildToolList(makeDeps()).map(t => t.name);

    expect(names).toContain('function_ScoreRisk');
    expect(names).toContain('function_AdminOnly');
  });

  it('derives the input schema from the function fields', () => {
    const tool = buildToolList(makeDeps()).find(t => t.name === 'function_ScoreRisk');
    const s = tool!.inputSchema as { properties: Record<string, unknown>; required?: string[] };

    expect(Object.keys(s.properties)).toEqual(['wardId', 'weight']);
    expect(s.required).toEqual(['wardId']);
  });

  it('advertises nothing when no invoker is wired — discovery must not lie', () => {
    const deps = makeDeps();
    delete (deps as { functionInvoker?: unknown }).functionInvoker;

    expect(buildToolList(deps).map(t => t.name).some(n => n.startsWith('function_'))).toBe(false);
  });

  it('routes invocation through the injected governed entry point', async () => {
    const deps = makeDeps();
    await invokeTool('function_ScoreRisk', { wardId: 'w-1' }, caller(['clinician']), deps);

    expect(deps.functionInvoker).toHaveBeenCalledWith('ScoreRisk', { wardId: 'w-1' }, expect.anything());
  });

  it('returns a denial as isError content, not a protocol error', async () => {
    const deps = makeDeps({
      functionInvoker: vi.fn(async () => { throw new Error('requires one of: admin'); }),
    } as unknown as Partial<McpServerDependencies>);

    const res = await invokeTool('function_AdminOnly', { input: 'x' }, caller(['clinician']), deps);

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('admin');
  });
});

describe('dry-run over MCP', () => {
  it('advertises dryRun on every action tool', () => {
    const withAction = parseOdl(`
extend schema @namespace(name: "t", version: "0.1.0")
type Ward @objectType { id: ID! @primary }
type CleanBed @actionType { bedId: String! @param }
`);
    const tool = buildToolList(makeDeps({ schema: withAction } as never))
      .find(t => t.name === 'CleanBed');
    const s = tool!.inputSchema as { properties: Record<string, unknown> };

    expect(s.properties['dryRun']).toBeDefined();
  });
});

describe('per-caller tool scoping', () => {
  it('hides a function whose required role the caller lacks', async () => {
    const deps = makeDeps();
    const scoped = await scopeToolList(buildToolList(deps), caller(['clinician']), deps);
    const names = scoped.map(t => t.name);

    expect(names).toContain('function_ScoreRisk');
    expect(names).not.toContain('function_AdminOnly');
  });

  it('keeps read tools for everyone — their results are FGA-scoped', async () => {
    const deps = makeDeps();
    const scoped = await scopeToolList(buildToolList(deps), caller([]), deps);

    expect(scoped.map(t => t.name)).toContain('search_Ward');
  });

  it('fails open on an authorization outage rather than emptying the toolbox', async () => {
    const deps = makeDeps({
      authorizationService: {
        listObjects: async () => { throw new Error('fga down'); },
        getVisibleFields: () => undefined,
      },
    } as unknown as Partial<McpServerDependencies>);

    const scoped = await scopeToolList(buildToolList(deps), caller(['clinician']), deps);

    // Read tools survive; nothing is authorized by this — the executor still
    // refuses a caller who lacks the relation.
    expect(scoped.map(t => t.name)).toContain('search_Ward');
  });
});
