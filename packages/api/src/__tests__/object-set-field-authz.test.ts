/**
 * Executing a saved object set must not leak redacted field values.
 *
 * A set whose filter or orderBy references a field the caller cannot see would
 * expose those values through row membership and ordering. The list route and
 * the object-set aggregate route both reject that (SEC-14); execute did not.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import type { ObjectSetDefinition } from '@altius/spi';
import { generateRestRoutes } from '../rest/route-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  status: String!
  dateOfBirth: Date @sensitive
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'user-1', name: 'Dr Smith', email: 'd@nhs.uk',
  roles: ['clinician'], groups: [], tenantId: 'tenant-1',
};

const REQ_CTX = { tenantId: 'tenant-1', actorId: USER.id, traceId: 't' };

function savedSet(overrides: Partial<ObjectSetDefinition>): ObjectSetDefinition {
  return {
    id: 'os-1', name: 'set', objectType: 'Patient',
    createdBy: USER.id, createdAt: '2025-01-01T00:00:00Z' as never,
    updatedAt: '2025-01-01T00:00:00Z' as never,
    isPublic: false, tenantId: 'tenant-1',
    ...overrides,
  } as ObjectSetDefinition;
}

/** `status` is visible; `dateOfBirth` is redacted for this caller. */
function makeDeps(schema: ParsedSchema, def: ObjectSetDefinition): ApiDependencies {
  return {
    schema,
    objectManager: {
      query: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    objectSetManager: {
      get: vi.fn().mockResolvedValue(def),
    } as unknown as ApiDependencies['objectSetManager'],
    linkManager: { getLinks: vi.fn() } as unknown as ApiDependencies['linkManager'],
    actionExecutor: { execute: vi.fn() } as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['*']),
      getVisibleFields: vi.fn().mockReturnValue(new Set(['id', 'status'])),
      redactFieldsBatch: vi.fn().mockReturnValue([]),
      redactFields: vi.fn(),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    manifestRegistry: { get: () => undefined },
    consentService: undefined,
    auditWriter: undefined,
    storage: {} as unknown as ApiDependencies['storage'],
  } as unknown as ApiDependencies;
}

async function runExecute(schema: ParsedSchema, def: ObjectSetDefinition) {
  const deps = makeDeps(schema, def);
  const route = generateRestRoutes(schema, deps)
    .find(r => r.method === 'GET' && r.pattern === '/api/v1/object-sets/:id/execute')!;
  return route.handler(
    { method: 'GET', path: '/api/v1/object-sets/os-1/execute', params: { id: 'os-1' }, query: {}, body: undefined, user: USER },
    { requestContext: REQ_CTX, user: USER, deps } as never,
  );
}

describe('object set execute — field-level authorization', () => {
  let parsed: ParsedSchema;
  beforeAll(() => { parsed = parseOdl(ODL); });

  it('refuses a set filtered on a redacted field', async () => {
    const res = await runExecute(parsed, savedSet({
      filter: { field: 'dateOfBirth', operator: 'gt', value: '1990-01-01' },
    }));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('dateOfBirth');
  });

  it('refuses a set ordered by a redacted field', async () => {
    const res = await runExecute(parsed, savedSet({
      orderBy: [{ field: 'dateOfBirth', direction: 'asc' }],
    }));

    expect(res.status).toBe(403);
  });

  it('allows a set that only touches visible fields', async () => {
    const res = await runExecute(parsed, savedSet({
      filter: { field: 'status', operator: 'eq', value: 'ACTIVE' },
      orderBy: [{ field: 'status', direction: 'asc' }],
    }));

    expect(res.status).toBe(200);
  });
});
