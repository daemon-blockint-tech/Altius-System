/**
 * Security regression tests for the MCP server.
 *
 * (A) Dev auth bypass must be an explicit opt-in (ALTIUS_MCP_DEV_AUTH_BYPASS),
 *     never granted merely because NODE_ENV !== 'production'.
 * (B) `search_<Type>` must refuse filters on fields the caller cannot read,
 *     mirroring the GraphQL validateQueryFields guard.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ParsedSchema, ObjectType } from '@altius/odl';
import type { StorageProvider, ObjectPage } from '@altius/spi';
import type { AuthorizationService, OidcAuthenticator, AuthenticatedUser, RedactionResult } from '@altius/security';
import { AuthenticationError } from '@altius/security';
import { createMcpServer } from '../server.js';
import type { McpServerDependencies, ManifestRegistry } from '../types.js';

const PATIENT_TYPE: ObjectType = {
  kind: 'objectType',
  name: 'Patient',
  fields: [
    { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
    { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
    { name: 'diagnosis', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
  ],
  interfaces: [],
  directives: [{ kind: 'objectType' }],
};

const SCHEMA: ParsedSchema = {
  objectTypes: [PATIENT_TYPE],
  linkTypes: [],
  actionTypes: [],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

const USER: AuthenticatedUser = {
  id: 'receptionist-jane',
  name: 'Jane',
  email: 'jane@altius.local',
  roles: ['receptionist'],
  groups: [],
  tenantId: 'default',
};

function createDeps(visibleFields: Set<string> | null): {
  deps: McpServerDependencies;
  queryObjects: ReturnType<typeof vi.fn>;
} {
  const page: ObjectPage = { items: [], totalCount: 0, hasNextPage: false };
  const queryObjects = vi.fn(async () => page);
  const manifestRegistry: ManifestRegistry = { get: () => undefined };

  const deps: McpServerDependencies = {
    schema: SCHEMA,
    actionExecutor: { execute: vi.fn() } as unknown as McpServerDependencies['actionExecutor'],
    authorizationService: {
      listObjects: vi.fn(async () => ['*']),
      getVisibleFields: vi.fn(() => visibleFields),
      redactFieldsBatch: vi.fn(
        <T extends Record<string, unknown>>(_u: string, _r: string[], _t: string, items: T[]): RedactionResult<T>[] =>
          items.map((data) => ({ data, _redactedFields: [] })),
      ),
    } as unknown as AuthorizationService,
    authenticator: {
      configure: vi.fn(),
      authenticate: vi.fn(async (token: string) => {
        if (token === 'valid-token') return USER;
        throw new AuthenticationError('INVALID_TOKEN', 'Invalid token');
      }),
    } as unknown as OidcAuthenticator,
    storage: { queryObjects } as unknown as StorageProvider,
    manifestRegistry,
  };

  return { deps, queryObjects };
}

describe('MCP dev auth bypass gate', () => {
  const originalBypass = process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'];
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalBypass === undefined) delete process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'];
    else process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'] = originalBypass;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('rejects an unauthenticated request when the opt-in flag is unset, even with isDev=true', async () => {
    delete process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'];
    process.env['NODE_ENV'] = 'staging';
    const { deps } = createDeps(null);
    const handler = createMcpServer({ deps, isDev: true });

    const res = await handler({
      method: 'POST',
      headers: {},
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated request in production even when the flag is set', async () => {
    process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'production';
    const { deps } = createDeps(null);
    const handler = createMcpServer({ deps, isDev: true });

    const res = await handler({
      method: 'POST',
      headers: {},
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    });

    expect(res.status).toBe(401);
  });

  it('allows the dev identity only when the flag is explicitly set outside production', async () => {
    process.env['ALTIUS_MCP_DEV_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'development';
    const { deps } = createDeps(null);
    const handler = createMcpServer({ deps, isDev: true });

    const res = await handler({
      method: 'POST',
      headers: {},
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list' },
    });

    expect(res.status).toBe(200);
  });
});

describe('MCP search tool redacted-field filter guard', () => {
  it('refuses a filter on a field the caller cannot read', async () => {
    const { deps, queryObjects } = createDeps(new Set(['id', 'status']));
    const handler = createMcpServer({ deps, isDev: false });

    const res = await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_Patient',
          arguments: { filter: [{ field: 'diagnosis', operator: 'eq', value: 'HIV' }] },
        },
      },
    });

    const body = res.body as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    const parsed = JSON.parse(body.result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('diagnosis');
    expect(queryObjects).not.toHaveBeenCalled();
  });

  it('allows a filter on a visible field', async () => {
    const { deps, queryObjects } = createDeps(new Set(['id', 'status']));
    const handler = createMcpServer({ deps, isDev: false });

    const res = await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search_Patient',
          arguments: { filter: [{ field: 'status', operator: 'eq', value: 'ACTIVE' }] },
        },
      },
    });

    const body = res.body as { result: { isError: boolean } };
    expect(body.result.isError).toBe(false);
    expect(queryObjects).toHaveBeenCalledTimes(1);
  });
});
