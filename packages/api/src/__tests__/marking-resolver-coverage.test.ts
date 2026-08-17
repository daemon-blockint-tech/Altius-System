/**
 * Every GraphQL surface that can disclose a marked type must consult the gate.
 *
 * marking-enforcement.test.ts already covers `isTypeVisible` in isolation, and
 * it passed throughout — the helper was never wrong. What was wrong is that
 * only two of the ten generated resolvers CALLED it: `patient(id:)` and
 * `patients`. A caller holding a ReBAC `viewer` relation but lacking the
 * required marking was correctly refused by both, then read the same rows via
 * `searchPatients`, `patientAggregate`, `traversePatient`, any `@link` field
 * pointing at the marked type, or `history`.
 *
 * A unit test of the helper cannot see that, because the defect is an ABSENT
 * call. So these drive the resolvers themselves, with authorization mocked to
 * ALLOW everything — the point is that a permitted caller is still refused by
 * the marking, which is what "mandatory" means. Every case here fails if its
 * guard is removed.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { MarkingPolicy } from '@altius/security';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type {
  ApiDependencies,
  AuthenticatedUserInfo,
  ResolverContext,
} from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String
  notes: [Note] @link(type: "HasNote", direction: "OUTBOUND")
}

type Note @objectType {
  id: ID! @primary
  body: String
}

type Ward @objectType {
  id: ID! @primary
  name: String
  patients: [Patient] @link(type: "Admitted", direction: "OUTBOUND")
}

type HasNote @linkType(from: "Patient", to: "Note", cardinality: ONE_TO_MANY) {
  id: ID! @primary
}

type Admitted @linkType(from: "Ward", to: "Patient", cardinality: ONE_TO_MANY) {
  id: ID! @primary
}
`;

/** Patient is marked PII; Ward and Note are not. */
const policy = new MarkingPolicy({
  categories: [],
  markings: [{ name: 'PII' }],
  byObjectType: { Patient: ['PII'] },
});

function user(markings: string[]): AuthenticatedUserInfo {
  return {
    id: 'user-1',
    name: 'Dr Smith',
    email: 'dr@test.uk',
    // Deliberately an admin. A role expands access and a marking restricts it,
    // so this identity must still be refused — that is the property that makes
    // markings different from every other control here.
    roles: ['admin', 'clinician'],
    groups: [],
    tenantId: 'tenant-1',
    markings,
  } as AuthenticatedUserInfo;
}

const patientRow = {
  _id: 'p1',
  _type: 'Patient',
  _tenantId: 'tenant-1',
  _version: 1,
  _createdAt: '2025-01-01T00:00:00Z',
  _updatedAt: '2025-01-01T00:00:00Z',
  id: 'p1',
  name: 'Jane Doe',
};

function deps(schema: ParsedSchema): ApiDependencies {
  const noRedact = (_u: string, _r: string[], _t: string, obj: Record<string, unknown>) => ({
    data: obj,
    _redactedFields: [],
  });
  return {
    schema,
    markingPolicy: policy,
    objectManager: {
      get: vi.fn(async () => patientRow),
      list: vi.fn(async () => ({ items: [patientRow], totalCount: 1, hasNextPage: false })),
      // A search hit wraps the object; it is not the object itself.
      search: vi.fn(async () => ({ hits: [{ object: patientRow, score: 1 }], totalCount: 1 })),
      aggregate: vi.fn(async () => ({ groups: [{ keys: {}, values: { count: 1 } }], totalGroups: 1 })),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {
      traverse: vi.fn(async () => ({ nodes: [patientRow], edges: [], totalCount: 1 })),
      getLinks: vi.fn(async () => ({
        items: [
          {
            _tenantId: 'tenant-1',
            _type: 'Admitted',
            _id: 'l1',
            _fromType: 'Ward',
            _fromId: 'w1',
            _toType: 'Patient',
            _toId: 'p1',
            _version: 1,
            _createdAt: '2025-01-01T00:00:00Z',
            _updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
        totalCount: 1,
        hasNextPage: false,
      })),
    } as unknown as ApiDependencies['linkManager'],
    // Storage answers a traversal with a Patient node, so a missing gate shows
    // up as disclosed data rather than an empty result for unrelated reasons.
    storage: {
      getObjectHistory: vi.fn(async () => [patientRow]),
      getObjectAtTime: vi.fn(async () => patientRow),
    } as unknown as ApiDependencies['storage'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    auditWriter: { write: vi.fn(async () => {}) } as unknown as ApiDependencies['auditWriter'],
    authorizationService: {
      // Everything permitted. The marking must still deny.
      check: vi.fn().mockResolvedValue(true),
      listObjects: vi.fn().mockResolvedValue(['p1']),
      getVisibleFields: vi.fn().mockReturnValue(undefined),
      redactFields: vi.fn().mockImplementation(noRedact),
      redactFieldsBatch: vi
        .fn()
        .mockImplementation((_u: string, _r: string[], _t: string, objs: Record<string, unknown>[]) =>
          objs.map((o) => ({ data: o, _redactedFields: [] })),
        ),
      clearFieldCache: vi.fn(),
    } as unknown as ApiDependencies['authorizationService'],
  } as unknown as ApiDependencies;
}

function ctxFor(d: ApiDependencies, markings: string[]): ResolverContext {
  const u = user(markings);
  return {
    requestContext: { tenantId: u.tenantId, actorId: u.id, traceId: 'trace-test' },
    user: u,
    deps: d,
  } as ResolverContext;
}

type Resolver = (p: unknown, a: unknown, c: ResolverContext) => Promise<unknown>;

const schema = parseOdl(ODL);

/** aggregate requires a fields list; the deny path returns before reading it. */
const AGG_ARGS = { fields: [{ fn: 'COUNT', field: 'id', alias: 'count' }] };

function resolversFor(): { map: Record<string, Record<string, Resolver>>; d: ApiDependencies } {
  const d = deps(schema);
  const { resolvers } = generateResolvers(schema, d);
  return { map: resolvers as unknown as Record<string, Record<string, Resolver>>, d };
}

describe('marked types are hidden on every disclosing resolver, not just the two that read by id', () => {
  it('search returns no hits', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['searchPatients']!({}, { query: 'a' }, ctxFor(d, []))) as {
      hits: unknown[];
      totalCount: number;
    };
    expect(res.hits).toEqual([]);
    expect(res.totalCount).toBe(0);
  });

  it('aggregate returns no groups', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['patientAggregate']!({}, AGG_ARGS, ctxFor(d, []))) as {
      groups: unknown[];
      totalGroups: number;
    };
    expect(res.groups).toEqual([]);
    expect(res.totalGroups).toBe(0);
  });

  it('traverse returns no nodes', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['traversePatient']!(
      {},
      { startId: 'p1', steps: [{ linkType: 'HasNote', direction: 'OUTBOUND' }] },
      ctxFor(d, []),
    )) as { nodes: unknown[]; totalCount: number };
    expect(res.nodes).toEqual([]);
    expect(res.totalCount).toBe(0);
  });

  it('a @link field pointing at the marked type yields nothing', async () => {
    // Ward is unmarked, so the caller can read the ward — and would otherwise
    // reach every Patient through it. The marking that applies is the one on
    // the target type, not the parent.
    const { map, d } = resolversFor();
    const res = (await map['Ward']!['patients']!(
      { id: 'w1' },
      {},
      ctxFor(d, []),
    )) as { edges: unknown[]; totalCount: number };
    expect(res.edges).toEqual([]);
    expect(res.totalCount).toBe(0);
  });

  it('history returns no versions', async () => {
    const { map, d } = resolversFor();
    const res = await map['Patient']!['history']!({ id: 'p1' }, {}, ctxFor(d, []));
    expect(res).toEqual([]);
  });
});

describe('holding the marking restores every one of those surfaces', () => {
  // Without this half, "return empty" would pass just as well if the resolvers
  // were broken outright.

  it('search returns hits', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['searchPatients']!(
      {},
      { query: 'a' },
      ctxFor(d, ['PII']),
    )) as { totalCount: number };
    expect(res.totalCount).toBe(1);
  });

  it('aggregate returns groups', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['patientAggregate']!({}, AGG_ARGS, ctxFor(d, ['PII']))) as {
      totalGroups: number;
    };
    expect(res.totalGroups).toBe(1);
  });

  it('traverse returns nodes', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['traversePatient']!(
      {},
      { startId: 'p1', steps: [{ linkType: 'HasNote', direction: 'OUTBOUND' }] },
      ctxFor(d, ['PII']),
    )) as { totalCount: number };
    expect(res.totalCount).toBe(1);
  });

  it('the @link field yields the linked objects', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Ward']!['patients']!(
      { id: 'w1' },
      {},
      ctxFor(d, ['PII']),
    )) as { totalCount: number };
    expect(res.totalCount).toBe(1);
  });

  it('history returns versions', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Patient']!['history']!(
      { id: 'p1' },
      {},
      ctxFor(d, ['PII']),
    )) as unknown[];
    expect(res.length).toBe(1);
  });
});

describe('an unmarked type is unaffected', () => {
  it('a caller with no markings still reads Ward', async () => {
    const { map, d } = resolversFor();
    const res = (await map['Query']!['wardAggregate']!({}, AGG_ARGS, ctxFor(d, []))) as {
      totalGroups: number;
    };
    expect(res.totalGroups).toBe(1);
  });
});
