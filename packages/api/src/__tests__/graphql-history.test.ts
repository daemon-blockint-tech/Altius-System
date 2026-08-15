/**
 * Tests for the GraphQL `history` field resolver.
 *
 * Before this field existed, edit history was REST-only (GET /api/v1/{plural}/:id/history)
 * and used an N+1 loop of getObjectAtVersion calls. The GraphQL `history` field
 * uses the batch `getObjectHistory` SPI method (one query) and applies the same
 * redaction + consent filtering as every other read path.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl, generateGraphQLSchema } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject } from '@altius/spi';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ApiDependencies, AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

// ─── Minimal ODL fixture ───

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String! @sensitive
  status: String
}
`;

// ─── Mock factories ───

function createMockUser(): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr.smith@test.uk',
    roles: ['clinician'],
    groups: [],
    tenantId: 'tenant-1',
  };
}

function createVersionedObject(version: number, overrides: Partial<OntologyObject> = {}): OntologyObject {
  return {
    _tenantId: 'tenant-1',
    _type: 'Patient',
    _id: 'p-1',
    _version: version,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: `2025-01-0${version}T00:00:00Z`,
    name: `Patient p-1 v${version}`,
    status: 'ACTIVE',
    ...overrides,
  };
}

function createMockDeps(schema: ParsedSchema, history: OntologyObject[]): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn(),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue([]),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(
        (_userId: string, _roles: string[], _type: string, obj: Record<string, unknown>) => ({
          data: obj,
          _redactedFields: [],
        }),
      ),
      redactFieldsBatch: vi.fn().mockImplementation(
        (_userId: string, _roles: string[], _type: string, objects: Record<string, unknown>[]) =>
          objects.map(obj => ({ data: obj, _redactedFields: [] })),
      ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    consentService: undefined,
    auditWriter: undefined,
    storage: {
      getObjectHistory: vi.fn().mockResolvedValue(history),
    } as unknown as ApiDependencies['storage'],
  };
}

function createCtx(deps: ApiDependencies, user?: AuthenticatedUserInfo): ResolverContext {
  const u = user ?? createMockUser();
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps,
  };
}

// ════════════════════════════════════════════════════════════════════

describe('GraphQL Patient.history field', () => {
  const schema = parseOdl(ODL);
  const history = [
    createVersionedObject(1, { name: 'v1', status: 'ACTIVE' }),
    createVersionedObject(2, { name: 'v2', status: 'ACTIVE' }),
    createVersionedObject(3, { name: 'v3', status: 'DISCHARGED' }),
  ];

  it('emits the history field in the SDL', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('history(asOf: String): [Patient!]');
  });

  it('returns all versions ordered by version ascending', async () => {
    const deps = createMockDeps(schema, history);
    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (parent: Record<string, unknown>, args: unknown, ctx: ResolverContext) => Promise<unknown>;

    const result = await historyResolver(
      { id: 'p-1' },
      undefined,
      createCtx(deps),
    );

    const items = result as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    expect(items[0]!._version).toBe(1);
    expect(items[1]!._version).toBe(2);
    expect(items[2]!._version).toBe(3);
  });

  it('calls getObjectHistory once (batch, not N+1)', async () => {
    const deps = createMockDeps(schema, history);
    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (parent: Record<string, unknown>, args: unknown, ctx: ResolverContext) => Promise<unknown>;

    await historyResolver({ id: 'p-1' }, undefined, createCtx(deps));

    expect(deps.storage.getObjectHistory).toHaveBeenCalledTimes(1);
    expect(deps.storage.getObjectHistory).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'Patient',
      'p-1',
    );
  });

  it('returns empty array when caller has no view access', async () => {
    const deps = createMockDeps(schema, history);
    // Override check to deny
    (deps.authorizationService.check as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (parent: Record<string, unknown>, args: unknown, ctx: ResolverContext) => Promise<unknown>;

    const result = await historyResolver({ id: 'p-1' }, undefined, createCtx(deps));
    expect(result).toEqual([]);
    // Should not even call storage when denied
    expect(deps.storage.getObjectHistory).not.toHaveBeenCalled();
  });

  it('returns empty array when parent has no id', async () => {
    const deps = createMockDeps(schema, history);
    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (parent: Record<string, unknown>, args: unknown, ctx: ResolverContext) => Promise<unknown>;

    const result = await historyResolver({}, undefined, createCtx(deps));
    expect(result).toEqual([]);
  });

  it('applies field-level redaction to each version', async () => {
    const deps = createMockDeps(schema, history);
    // Override redactFieldsBatch to redact the `name` field
    (deps.authorizationService.redactFieldsBatch as ReturnType<typeof vi.fn>).mockImplementation(
      (_userId: string, _roles: string[], _type: string, objects: Record<string, unknown>[]) =>
        objects.map(obj => ({
          data: { ...obj, name: null },
          _redactedFields: ['name'],
        })),
    );

    const { resolvers } = generateResolvers(schema, deps);
    const patientResolvers = resolvers['Patient'] as Record<string, unknown>;
    const historyResolver = patientResolvers['history'] as (parent: Record<string, unknown>, args: unknown, ctx: ResolverContext) => Promise<unknown>;

    const result = await historyResolver({ id: 'p-1' }, undefined, createCtx(deps));
    const items = result as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item['name']).toBeNull();
      expect(item['_redactedFields']).toEqual(['name']);
    }
  });
});
