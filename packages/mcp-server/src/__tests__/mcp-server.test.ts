/**
 * Tests for the MCP server.
 *
 * Covers: initialize, tools/list, tools/call (action + read), auth boundary,
 * JSON-RPC error codes, notification handling, and capability-agnostic
 * protocol behavior. Uses the same NHS schema fixture shape as the
 * tool-registry tests.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ParsedSchema, ActionType, ObjectType } from '@altius/odl';
import type { ActionManifest, ActionResult } from '@altius/actions';
import type { StorageProvider, ObjectPage, OntologyObject } from '@altius/spi';
import type { AuthorizationService, OidcAuthenticator, AuthenticatedUser, RedactionResult } from '@altius/security';
import { AuthenticationError } from '@altius/security';
import { createMcpServer } from '../server.js';
import type { McpServerDependencies, ManifestRegistry } from '../types.js';
import { MCP_PROTOCOL_VERSION, JSON_RPC_ERROR } from '../protocol.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PATIENT_TYPE: ObjectType = {
  kind: 'objectType',
  name: 'Patient',
  fields: [
    { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
    { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
    { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
  ],
  interfaces: [],
  directives: [{ kind: 'objectType' }],
};

const WARD_TYPE: ObjectType = {
  kind: 'objectType',
  name: 'Ward',
  fields: [
    { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
    { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
  ],
  interfaces: [],
  directives: [{ kind: 'objectType' }],
};

const ADMIT_ACTION: ActionType = {
  kind: 'actionType',
  name: 'AdmitPatient',
  description: 'Admit a patient to a ward',
  fields: [
    { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
    { name: 'ward', type: { name: 'Ward', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
    { name: 'reason', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
  ],
  directives: [{ kind: 'actionType' }],
};

const SCHEMA: ParsedSchema = {
  objectTypes: [PATIENT_TYPE, WARD_TYPE],
  linkTypes: [],
  actionTypes: [ADMIT_ACTION],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

const ADMIT_MANIFEST: ActionManifest = {
  action: 'AdmitPatient',
  version: 1,
  reversible: false,
  preconditions: [],
  effects: [],
  sideEffects: [],
};

const DEV_USER: AuthenticatedUser = {
  id: 'dev-user',
  name: 'Dev',
  email: 'dev@altius.local',
  roles: ['admin'],
  groups: [],
  tenantId: 'default',
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockAuthenticator(): OidcAuthenticator {
  const auth = {
    configure: vi.fn(),
    authenticate: vi.fn(async (token: string) => {
      if (token === 'valid-token') return DEV_USER;
      throw new AuthenticationError('INVALID_TOKEN', 'Invalid token');
    }),
  };
  return auth as unknown as OidcAuthenticator;
}

function createMockAuthz(): AuthorizationService {
  return {
    listObjects: vi.fn(async () => ['*']),
    getVisibleFields: vi.fn(() => null),
    redactFieldsBatch: vi.fn(
      <T extends Record<string, unknown>>(_userId: string, _roles: string[], _type: string, items: T[]): RedactionResult<T>[] =>
        items.map((data) => ({ data, _redactedFields: [] })),
    ),
  } as unknown as AuthorizationService;
}

function createMockStorage(items: OntologyObject[] = []): StorageProvider {
  const page: ObjectPage = { items, totalCount: items.length, hasNextPage: false };
  return {
    queryObjects: vi.fn(async () => page),
  } as unknown as StorageProvider;
}

function createMockDeps(overrides?: {
  storage?: StorageProvider;
  executeResult?: ActionResult;
}): { deps: McpServerDependencies; manifestRegistry: ManifestRegistry } {
  const manifestRegistry: ManifestRegistry = {
    get: (name: string) => (name === 'AdmitPatient' ? ADMIT_MANIFEST : undefined),
  };

  const actionExecutor = {
    execute: vi.fn(async (): Promise<ActionResult> =>
      overrides?.executeResult ?? {
        success: true,
        actionId: 'act_test',
        errors: [],
        affectedObjects: [{ type: 'Patient', id: 'p-1', changeType: 'updated' }],
      },
    ),
  };

  const deps: McpServerDependencies = {
    schema: SCHEMA,
    actionExecutor: actionExecutor as unknown as McpServerDependencies['actionExecutor'],
    authorizationService: createMockAuthz(),
    authenticator: createMockAuthenticator(),
    storage: overrides?.storage ?? createMockStorage(),
    manifestRegistry,
  };

  return { deps, manifestRegistry };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP server', () => {
  const validHeaders = { authorization: 'Bearer valid-token' };

  describe('initialize', () => {
    it('returns protocol version, capabilities, and server info', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
        },
      });

      expect(res.status).toBe(200);
      const body = res.body as { jsonrpc: string; id: number; result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string; version: string } } };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
      expect(body.result.capabilities).toEqual({ tools: {} });
      expect(body.result.serverInfo.name).toBe('altius-mcp');
    });
  });

  describe('tools/list', () => {
    it('returns one tool per ActionType plus one search_<Type> per ObjectType', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      });

      expect(res.status).toBe(200);
      const body = res.body as { result: { tools: { name: string }[] } };
      const names = body.result.tools.map((t) => t.name);
      expect(names).toContain('AdmitPatient');
      expect(names).toContain('search_Patient');
      expect(names).toContain('search_Ward');
      expect(names).toHaveLength(3);
    });

    it('action tool has inputSchema with required params', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      });

      const body = res.body as { result: { tools: { name: string; inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] } }[] } };
      const admit = body.result.tools.find((t) => t.name === 'AdmitPatient')!;
      expect(admit.inputSchema.type).toBe('object');
      expect(admit.inputSchema.properties).toHaveProperty('patient');
      expect(admit.inputSchema.properties).toHaveProperty('ward');
      expect(admit.inputSchema.properties).toHaveProperty('reason');
      expect(admit.inputSchema.required).toEqual(['patient', 'ward']);
    });
  });

  describe('tools/call — action tool', () => {
    it('executes the action and returns the result as text content', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'AdmitPatient', arguments: { patient: 'p-1', ward: 'w-1', reason: 'test' } },
        },
      });

      expect(res.status).toBe(200);
      const body = res.body as { result: { content: { type: string; text: string }[]; isError: boolean } };
      expect(body.result.content).toHaveLength(1);
      expect(body.result.content[0]!.type).toBe('text');
      const parsed = JSON.parse(body.result.content[0]!.text) as ActionResult;
      expect(parsed.success).toBe(true);
      expect(parsed.actionId).toBe('act_test');
      expect(body.result.isError).toBe(false);
    });

    it('passes params to ActionExecutor.execute', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'AdmitPatient', arguments: { patient: 'p-1', ward: 'w-1' } },
        },
      });

      const executeMock = deps.actionExecutor.execute as ReturnType<typeof vi.fn>;
      expect(executeMock).toHaveBeenCalledTimes(1);
      const callArgs = executeMock.mock.calls[0]!;
      expect(callArgs[0]).toBe(ADMIT_MANIFEST);
      expect(callArgs[1]).toEqual({ patient: 'p-1', ward: 'w-1' });
    });

    it('returns isError=true when action fails', async () => {
      const { deps } = createMockDeps({
        executeResult: {
          success: false,
          actionId: 'act_fail',
          errors: [{ code: 'AUTHORIZATION_DENIED', message: 'Not allowed' }],
          affectedObjects: [],
        },
      });
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'AdmitPatient', arguments: { patient: 'p-1', ward: 'w-1' } },
        },
      });

      const body = res.body as { result: { isError: boolean; content: { text: string }[] } };
      expect(body.result.isError).toBe(true);
      const parsed = JSON.parse(body.result.content[0]!.text) as { success: boolean };
      expect(parsed.success).toBe(false);
    });

    it('returns isError=true for unknown action tool', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'Nonexistent', arguments: {} },
        },
      });

      const body = res.body as { result: { isError: boolean; content: { text: string }[] } };
      expect(body.result.isError).toBe(true);
      const parsed = JSON.parse(body.result.content[0]!.text) as { error: string };
      expect(parsed.error).toContain('Unknown tool');
    });

    it('returns isError=true when manifest is missing', async () => {
      const { deps } = createMockDeps();
      // Override manifestRegistry to return undefined for all names
      deps.manifestRegistry = { get: () => undefined };
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'AdmitPatient', arguments: { patient: 'p-1', ward: 'w-1' } },
        },
      });

      const body = res.body as { result: { isError: boolean; content: { text: string }[] } };
      expect(body.result.isError).toBe(true);
      const parsed = JSON.parse(body.result.content[0]!.text) as { error: string };
      expect(parsed.error).toContain('No manifest');
    });
  });

  describe('tools/call — read tool', () => {
    it('returns objects from FGA-scoped storage query', async () => {
      const items: OntologyObject[] = [
        { _id: 'p-1', _type: 'Patient', _version: 1, _tenantId: 'default', _createdAt: '', _updatedAt: '', id: 'p-1', status: 'ACTIVE', name: 'Jane' } as OntologyObject,
      ];
      const { deps } = createMockDeps({ storage: createMockStorage(items) });
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name: 'search_Patient', arguments: { limit: 10 } },
        },
      });

      expect(res.status).toBe(200);
      const body = res.body as { result: { content: { text: string }[]; isError: boolean } };
      expect(body.result.isError).toBe(false);
      const parsed = JSON.parse(body.result.content[0]!.text) as { items: unknown[]; totalCount: number };
      expect(parsed.items).toHaveLength(1);
      expect(parsed.totalCount).toBe(1);
    });

    it('returns empty list when no objects authorized', async () => {
      const { deps } = createMockDeps();
      // Override authz to return no authorized objects
      (deps.authorizationService.listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'search_Patient', arguments: {} },
        },
      });

      const body = res.body as { result: { content: { text: string }[]; isError: boolean } };
      expect(body.result.isError).toBe(false);
      const parsed = JSON.parse(body.result.content[0]!.text) as { items: unknown[]; totalCount: number };
      expect(parsed.items).toHaveLength(0);
    });
  });

  describe('auth boundary', () => {
    it('returns 401 when no bearer token and not dev mode', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: {},
        body: { jsonrpc: '2.0', id: 11, method: 'tools/list' },
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid token', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: { authorization: 'Bearer bad-token' },
        body: { jsonrpc: '2.0', id: 12, method: 'tools/list' },
      });

      expect(res.status).toBe(401);
    });

    it('allows dev-user when isDev=true, no token, and the bypass flag is set', async () => {
      const previous = process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'];
      process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'] = 'true';
      try {
        const { deps } = createMockDeps();
        const handler = createMcpServer({ deps, isDev: true });

        const res = await handler({
          method: 'POST',
          headers: {},
          body: { jsonrpc: '2.0', id: 13, method: 'tools/list' },
        });

        expect(res.status).toBe(200);
      } finally {
        if (previous === undefined) delete process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'];
        else process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'] = previous;
      }
    });
  });

  describe('JSON-RPC protocol errors', () => {
    it('returns method-not-found for unknown methods', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { jsonrpc: '2.0', id: 14, method: 'resources/list' },
      });

      const body = res.body as { error: { code: number; message: string } };
      expect(body.error.code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
    });

    it('returns invalid-params for tools/call without name', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { arguments: {} } },
      });

      const body = res.body as { error: { code: number; message: string } };
      expect(body.error.code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
    });

    it('returns invalid-request for non-JSON-RPC body', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { foo: 'bar' },
      });

      const body = res.body as { error: { code: number } };
      expect(body.error.code).toBe(JSON_RPC_ERROR.INVALID_REQUEST);
    });

    it('returns 202 for notifications (no response body)', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({
        method: 'POST',
        headers: validHeaders,
        body: { jsonrpc: '2.0', method: 'notifications/initialized' },
      });

      expect(res.status).toBe(202);
      expect(res.body).toBeUndefined();
    });
  });

  describe('HTTP method handling', () => {
    it('returns 405 for GET', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({ method: 'GET', headers: validHeaders, body: null });
      expect(res.status).toBe(405);
    });

    it('returns 200 for DELETE (stateless no-op)', async () => {
      const { deps } = createMockDeps();
      const handler = createMcpServer({ deps, isDev: false });

      const res = await handler({ method: 'DELETE', headers: validHeaders, body: null });
      expect(res.status).toBe(200);
    });
  });
});
