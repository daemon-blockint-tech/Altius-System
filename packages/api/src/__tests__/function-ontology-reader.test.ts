/**
 * The ontology a function sees is the caller's ontology, not the platform's.
 *
 * invokeFunction hands the executor a reader bound to the invoking user. The
 * isolated runtime forks pack code with a scrubbed env so it holds no database
 * or OpenFGA credentials — the read happens here, through the same three
 * controls the object routes apply: ReBAC scoping, field redaction, consent.
 *
 * Without that, giving functions ontology access would have been a way to read
 * around every one of them: ship the query as a function and the platform
 * fetches it for you.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';

import { invokeFunction } from '../functions/invoke-function.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';

const ODL = `
type Patient @objectType {
  id: ID! @primary
  name: String!
  diagnosis: String @sensitive
}

type ScoreRisk @function(runtime: "cel", entry: "1", requiredRoles: "clinician") {
  patientId: ID! @param
}
`;

const schema = parseOdl(ODL);
const scoreRisk = schema.functionTypes.find(f => f.name === 'ScoreRisk')!;

/** Captures the reader the executor is handed, so the test can drive it. */
function depsWith(overrides: {
  check?: () => Promise<boolean>;
  get?: () => Promise<Record<string, unknown> | null>;
  redactFields?: (u: string, r: string[], t: string, o: Record<string, unknown>) => { data: Record<string, unknown>; _redactedFields: string[] };
  consentService?: unknown;
}) {
  const captured: { ontology?: { getObject(t: string, id: string): Promise<Record<string, unknown> | null> } } = {};
  const deps = {
    schema,
    functionExecutor: {
      execute: vi.fn(async (_n: string, _i: Record<string, unknown>, opts?: typeof captured) => {
        if (opts?.ontology) captured.ontology = opts.ontology;
        return { result: 1, logs: [], durationMs: 1 };
      }),
    },
    auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
    objectManager: {
      get: overrides.get ?? vi.fn(async () => ({ _id: 'p-1', _type: 'Patient', name: 'Ada', diagnosis: 'HIV' })),
    },
    authorizationService: {
      check: overrides.check ?? vi.fn(async () => true),
      redactFields: overrides.redactFields
        ?? ((_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] })),
    },
    ...(overrides.consentService ? { consentService: overrides.consentService } : {}),
  } as unknown as ApiDependencies;
  return { deps, captured };
}

const ctx = {
  user: { id: 'u1', tenantId: 'tenant-1', roles: ['clinician'], groups: [] },
  requestContext: { tenantId: 'tenant-1', actorId: 'u1', traceId: 'tr-1' },
} as unknown as ResolverContext;

async function readerFrom(deps: ApiDependencies, captured: { ontology?: { getObject(t: string, id: string): Promise<Record<string, unknown> | null> } }) {
  await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
  return captured.ontology!;
}

describe('function ontology reader', () => {
  it('is handed to the executor for every invocation', async () => {
    const { deps, captured } = depsWith({});

    const reader = await readerFrom(deps, captured);

    expect(typeof reader.getObject).toBe('function');
  });

  it('checks the caller ReBAC relation in the caller tenant', async () => {
    const check = vi.fn(async () => true);
    const { deps, captured } = depsWith({ check });
    const reader = await readerFrom(deps, captured);

    await reader.getObject('Patient', 'p-1');

    expect(check).toHaveBeenCalledWith('user:u1', 'viewer', 'patient:p-1', 'tenant-1');
  });

  it('refuses a read the caller is not authorized for', async () => {
    const { deps, captured } = depsWith({ check: vi.fn(async () => false) });
    const reader = await readerFrom(deps, captured);

    await expect(reader.getObject('Patient', 'p-1')).rejects.toThrow(/Access denied to Patient p-1/);
  });

  it('applies the caller field redaction before pack code sees the object', async () => {
    const { deps, captured } = depsWith({
      redactFields: (_u, _r, _t, o) => {
        const { diagnosis: _drop, ...rest } = o;
        return { data: rest, _redactedFields: ['diagnosis'] };
      },
    });
    const reader = await readerFrom(deps, captured);

    const got = await reader.getObject('Patient', 'p-1');

    expect(got).not.toHaveProperty('diagnosis');
    expect(got).toHaveProperty('name', 'Ada');
  });

  it('refuses a consent-restricted subject rather than returning nulled fields', async () => {
    const { deps, captured } = depsWith({
      consentService: { checkSingleObject: vi.fn(async () => ({ _consentRestricted: true })) },
    });
    const reader = await readerFrom(deps, captured);

    await expect(reader.getObject('Patient', 'p-1')).rejects.toThrow(/Consent denied for Patient p-1/);
  });

  it('returns null for a missing object without inventing one', async () => {
    const { deps, captured } = depsWith({ get: vi.fn(async () => null) });
    const reader = await readerFrom(deps, captured);

    expect(await reader.getObject('Patient', 'gone')).toBeNull();
  });

  it('rejects an object type that is not in the schema', async () => {
    const { deps, captured } = depsWith({});
    const reader = await readerFrom(deps, captured);

    await expect(reader.getObject('Ghost', 'x')).rejects.toThrow(/Unknown object type "Ghost"/);
  });
});

// ─── applyAction: changes go through the governed pipeline ───

const ODL_WITH_ACTION = `
type Patient @objectType {
  id: ID! @primary
  name: String!
}

type AdmitPatient @actionType {
  patientId: Patient! @param
  wardId: ID! @param
}

type Admit @function(runtime: "cel", entry: "1", requiredRoles: "clinician") {
  patientId: ID! @param
}
`;

const schemaWithAction = parseOdl(ODL_WITH_ACTION);
const admitFn = schemaWithAction.functionTypes.find(f => f.name === 'Admit')!;

function depsWithActions(execute: ReturnType<typeof vi.fn>, known = true) {
  const captured: { ontology?: { applyAction?(n: string, p: Record<string, unknown>): Promise<unknown> } } = {};
  const deps = {
    schema: schemaWithAction,
    functionExecutor: {
      execute: vi.fn(async (_n: string, _i: Record<string, unknown>, opts?: typeof captured) => {
        if (opts?.ontology) captured.ontology = opts.ontology;
        return { result: 1, logs: [], durationMs: 1 };
      }),
    },
    auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
    objectManager: { get: vi.fn() },
    authorizationService: {
      check: vi.fn(async () => true),
      redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
    },
    // Resolves by name, as the real registry does — passing an undeclared
    // action must miss, not fall back to whatever manifest the test set up.
    manifestRegistry: { get: vi.fn((n: string) => (known && n === 'AdmitPatient' ? { action: 'AdmitPatient' } : undefined)) },
    actionExecutor: { execute },
  } as unknown as ApiDependencies;
  return { deps, captured };
}

async function actionReader(deps: ApiDependencies, captured: { ontology?: { applyAction?(n: string, p: Record<string, unknown>): Promise<unknown> } }) {
  await invokeFunction(admitFn, deps, ctx, { patientId: 'p-1' });
  return captured.ontology!;
}

describe('function ontology edits go through the action pipeline', () => {
  it('runs the action as the invoking user, not a service account', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });

    const [, params, actor] = execute.mock.calls[0]!;
    expect(params).toEqual({ patientId: 'p-1', wardId: 'w-1' });
    expect(actor).toEqual({ id: 'u1', type: 'user', roles: ['clinician'] });
  });

  it('derives the consent subject exactly as the HTTP action route does', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });

    // Without this, calling an action from a function would skip the consent
    // stage that calling it over HTTP applies.
    const actionCtx = execute.mock.calls[0]![3] as unknown as { consentSubjectId?: string };
    expect(actionCtx.consentSubjectId).toBe('p-1');
  });

  it('throws when the action is refused, so pack code cannot read it as applied', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({
      success: false, actionId: 'act-1', affectedObjects: [],
      errors: [{ code: 'FORBIDDEN', message: 'not permitted' }],
    }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await expect(reader.applyAction!('AdmitPatient', { patientId: 'p-1' }))
      .rejects.toThrow(/failed: not permitted/);
  });

  it('refuses an action that is not declared', async () => {
    const execute = vi.fn();
    const { deps, captured } = depsWithActions(execute, false);
    const reader = await actionReader(deps, captured);

    await expect(reader.applyAction!('Ghost', {})).rejects.toThrow(/Unknown action "Ghost"/);
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── queryObjects: object sets carry the same three controls ───

function depsWithQuery(overrides: {
  listObjects?: () => Promise<string[]>;
  items?: Record<string, unknown>[];
  redactFieldsBatch?: (u: string, r: string[], t: string, o: Record<string, unknown>[]) => { data: Record<string, unknown>; _redactedFields: string[] }[];
  consentService?: unknown;
} = {}) {
  const query = vi.fn(async (..._args: unknown[]) => ({
    items: overrides.items ?? [
      { _id: 'p-1', _type: 'Patient', name: 'Ada' },
      { _id: 'p-2', _type: 'Patient', name: 'Grace' },
    ],
    totalCount: 2,
    hasNextPage: false,
  }));
  const captured: { ontology?: { queryObjects?(t: string, f?: unknown, l?: number): Promise<Record<string, unknown>[]> } } = {};
  const deps = {
    schema,
    functionExecutor: {
      execute: vi.fn(async (_n: string, _i: Record<string, unknown>, opts?: typeof captured) => {
        if (opts?.ontology) captured.ontology = opts.ontology;
        return { result: 1, logs: [], durationMs: 1 };
      }),
    },
    auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
    objectManager: { get: vi.fn(), query },
    authorizationService: {
      check: vi.fn(async () => true),
      listObjects: overrides.listObjects ?? vi.fn(async () => ['*']),
      getVisibleFields: vi.fn(() => undefined),
      redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
      redactFieldsBatch: overrides.redactFieldsBatch
        ?? ((_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] }))),
    },
    ...(overrides.consentService ? { consentService: overrides.consentService } : {}),
  } as unknown as ApiDependencies;
  return { deps, captured, query };
}

async function queryReader(deps: ApiDependencies, captured: { ontology?: { queryObjects?(t: string, f?: unknown, l?: number): Promise<Record<string, unknown>[]> } }) {
  await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
  return captured.ontology!;
}

describe('function ontology queries are scoped like the list route', () => {
  it('returns the object set the caller may see', async () => {
    const { deps, captured } = depsWithQuery();
    const reader = await queryReader(deps, captured);

    const rows = await reader.queryObjects!('Patient');

    expect(rows.map(r => r['name'])).toEqual(['Ada', 'Grace']);
  });

  it('folds the caller authorized ids into the filter, not a post-filter', async () => {
    const { deps, captured, query } = depsWithQuery({
      listObjects: vi.fn(async () => ['patient:p-2']),
    });
    const reader = await queryReader(deps, captured);

    await reader.queryObjects!('Patient');

    // Scoping must reach storage: filtering after the fact would still have
    // pulled every row into the gateway.
    const filter = query.mock.calls[0]![1] as { field?: string; operator?: string; value?: unknown };
    expect(filter).toMatchObject({ field: '_id', operator: 'in', value: ['p-2'] });
  });

  it('returns nothing when the caller is authorized for nothing', async () => {
    const { deps, captured, query } = depsWithQuery({ listObjects: vi.fn(async () => []) });
    const reader = await queryReader(deps, captured);

    expect(await reader.queryObjects!('Patient')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('redacts every row before pack code sees the set', async () => {
    const { deps, captured } = depsWithQuery({
      items: [{ _id: 'p-1', _type: 'Patient', name: 'Ada', diagnosis: 'HIV' }],
      redactFieldsBatch: (_u, _r, _t, rows) => rows.map(({ diagnosis: _d, ...rest }) => ({ data: rest, _redactedFields: ['diagnosis'] })),
    });
    const reader = await queryReader(deps, captured);

    const rows = await reader.queryObjects!('Patient');

    expect(rows[0]).not.toHaveProperty('diagnosis');
  });

  it('drops consent-restricted rows rather than blanking them', async () => {
    const { deps, captured } = depsWithQuery({
      consentService: {
        checkSingleObject: vi.fn(async (row: Record<string, unknown>) => ({
          _consentRestricted: row['_id'] === 'p-2',
        })),
      },
    });
    const reader = await queryReader(deps, captured);

    const rows = await reader.queryObjects!('Patient');

    // A function averaging over blanked rows returns a confidently wrong
    // number; dropping them is the honest answer.
    expect(rows.map(r => r['_id'])).toEqual(['p-1']);
  });

  it('caps the row count a single query may pull back', async () => {
    const { deps, captured, query } = depsWithQuery();
    const reader = await queryReader(deps, captured);

    await reader.queryObjects!('Patient', undefined, 999_999);

    expect((query.mock.calls[0]![2] as { limit: number }).limit).toBe(1000);
  });
});

// ─── getLinkedObjects: traversal carries the per-object controls ───

const ODL_LINKED = `
type Patient @objectType {
  id: ID! @primary
  name: String!
}

type Ward @objectType {
  id: ID! @primary
  label: String!
}

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) {
  since: String
}

type ScoreRisk @function(runtime: "cel", entry: "1", requiredRoles: "clinician") {
  patientId: ID! @param
}
`;

const linkedSchema = parseOdl(ODL_LINKED);
const linkedFn = linkedSchema.functionTypes.find(f => f.name === 'ScoreRisk')!;

function depsWithLinks(overrides: {
  check?: (u: string, r: string, res: string, t: string) => Promise<boolean>;
  links?: { _fromId: string; _toId: string }[];
  consentService?: unknown;
} = {}) {
  const captured: { ontology?: { getLinkedObjects?(t: string, id: string, lt: string, d?: 'outbound' | 'inbound'): Promise<Record<string, unknown>[]> } } = {};
  const deps = {
    schema: linkedSchema,
    functionExecutor: {
      execute: vi.fn(async (_n: string, _i: Record<string, unknown>, opts?: typeof captured) => {
        if (opts?.ontology) captured.ontology = opts.ontology;
        return { result: 1, logs: [], durationMs: 1 };
      }),
    },
    auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
    linkManager: {
      getLinks: vi.fn(async () => ({
        items: overrides.links ?? [
          { _fromId: 'p-1', _toId: 'w-1' },
          { _fromId: 'p-1', _toId: 'w-2' },
          { _fromId: 'p-1', _toId: 'w-1' },
        ],
        totalCount: 3, hasNextPage: false,
      })),
    },
    objectManager: {
      get: vi.fn(async (_t: string, id: string) => ({ _id: id, _type: 'Ward', label: `Ward ${id}` })),
    },
    authorizationService: {
      check: overrides.check ?? vi.fn(async () => true),
      redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
    },
    ...(overrides.consentService ? { consentService: overrides.consentService } : {}),
  } as unknown as ApiDependencies;
  return { deps, captured };
}

async function linkReader(deps: ApiDependencies, captured: { ontology?: { getLinkedObjects?(t: string, id: string, lt: string, d?: 'outbound' | 'inbound'): Promise<Record<string, unknown>[]> } }) {
  await invokeFunction(linkedFn, deps, ctx, { patientId: 'p-1' });
  return captured.ontology!;
}

describe('function ontology traversal is scoped like the link resolver', () => {
  it('walks the link and de-duplicates repeated neighbours', async () => {
    const { deps, captured } = depsWithLinks();
    const reader = await linkReader(deps, captured);

    const wards = await reader.getLinkedObjects!('Patient', 'p-1', 'AdmittedTo');

    expect(wards.map(w => w['_id'])).toEqual(['w-1', 'w-2']);
  });

  it('omits a neighbour the caller may not view, without failing the walk', async () => {
    const { deps, captured } = depsWithLinks({
      check: vi.fn(async (_u: string, _r: string, res: string) => res !== 'ward:w-2'),
    });
    const reader = await linkReader(deps, captured);

    const wards = await reader.getLinkedObjects!('Patient', 'p-1', 'AdmittedTo');

    // Traversal must not become a way around a direct read, and one refused
    // neighbour must not fail the whole walk.
    expect(wards.map(w => w['_id'])).toEqual(['w-1']);
  });

  it('rejects a traversal that does not start where the link does', async () => {
    const { deps, captured } = depsWithLinks();
    const reader = await linkReader(deps, captured);

    await expect(reader.getLinkedObjects!('Ward', 'w-1', 'AdmittedTo'))
      .rejects.toThrow(/does not run outbound from Ward/);
  });

  it('rejects an undeclared link type', async () => {
    const { deps, captured } = depsWithLinks();
    const reader = await linkReader(deps, captured);

    await expect(reader.getLinkedObjects!('Patient', 'p-1', 'Ghost'))
      .rejects.toThrow(/Unknown link type "Ghost"/);
  });
});

// ─── predicate leakage: filtering on a field you cannot see ───

describe('function queries cannot filter on redacted fields', () => {
  function depsWithVisibility(visible: string[] | undefined) {
    const query = vi.fn(async (..._a: unknown[]) => ({
      items: [{ _id: 'p-1', _type: 'Patient', name: 'Ada' }],
      totalCount: 1, hasNextPage: false,
    }));
    const captured: { ontology?: { queryObjects?(t: string, f?: unknown, l?: number): Promise<Record<string, unknown>[]> } } = {};
    const deps = {
      schema,
      functionExecutor: {
        execute: vi.fn(async (_n: string, _i: Record<string, unknown>, opts?: typeof captured) => {
          if (opts?.ontology) captured.ontology = opts.ontology;
          return { result: 1, logs: [], durationMs: 1 };
        }),
      },
      auditWriter: { write: vi.fn().mockResolvedValue(undefined) },
      objectManager: { get: vi.fn(), query },
      authorizationService: {
        check: vi.fn(async () => true),
        listObjects: vi.fn(async () => ['*']),
        getVisibleFields: vi.fn(() => (visible ? new Set(visible) : undefined)),
        redactFields: (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({ data: o, _redactedFields: [] }),
        redactFieldsBatch: (_u: string, _r: string[], _t: string, o: Record<string, unknown>[]) => o.map(data => ({ data, _redactedFields: [] })),
      },
    } as unknown as ApiDependencies;
    return { deps, captured, query };
  }

  it('refuses a filter on a field the caller cannot see, without querying', async () => {
    const { deps, captured, query } = depsWithVisibility(['id', 'name']);
    await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
    const reader = captured.ontology!;

    // The leak this closes: the rows that come back tell the caller which
    // patients carry the value, without the field ever being returned.
    await expect(reader.queryObjects!('Patient', { field: 'diagnosis', operator: 'eq', value: 'HIV' }))
      .rejects.toThrow(/redacted field/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows a filter on a visible field', async () => {
    const { deps, captured, query } = depsWithVisibility(['id', 'name']);
    await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
    const reader = captured.ontology!;

    await reader.queryObjects!('Patient', { field: 'name', operator: 'eq', value: 'Ada' });

    expect(query).toHaveBeenCalled();
  });

  it('allows system fields, which carry no field-level policy', async () => {
    const { deps, captured, query } = depsWithVisibility(['id', 'name']);
    await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
    const reader = captured.ontology!;

    await reader.queryObjects!('Patient', { field: '_id', operator: 'in', value: ['p-1'] });

    expect(query).toHaveBeenCalled();
  });

  it('imposes no restriction when no field policy is configured', async () => {
    const { deps, captured, query } = depsWithVisibility(undefined);
    await invokeFunction(scoreRisk, deps, ctx, { patientId: 'p-1' });
    const reader = captured.ontology!;

    await reader.queryObjects!('Patient', { field: 'diagnosis', operator: 'eq', value: 'HIV' });

    expect(query).toHaveBeenCalled();
  });
});

// ─── withheld vs absent: pack code must be able to tell them apart ───

describe('function reads report which fields were withheld', () => {
  const redactDiagnosis = (_u: string, _r: string[], _t: string, o: Record<string, unknown>) => ({
    data: { ...o, diagnosis: null },
    _redactedFields: ['diagnosis'],
  });

  it('marks a redacted field on a direct read', async () => {
    const { deps, captured } = depsWith({ redactFields: redactDiagnosis });
    const reader = await readerFrom(deps, captured);

    const got = await reader.getObject('Patient', 'p-1');

    // Redaction nulls the value rather than deleting it, so without this a
    // function cannot tell "no diagnosis recorded" from "you may not see it"
    // — and the two give different answers.
    expect(got!['diagnosis']).toBeNull();
    expect(got!['_redactedFields']).toEqual(['diagnosis']);
  });

  it('reports nothing withheld when nothing was', async () => {
    const { deps, captured } = depsWith({});
    const reader = await readerFrom(deps, captured);

    const got = await reader.getObject('Patient', 'p-1');

    expect(got!['_redactedFields']).toBeNull();
  });
});

describe('function query rows report which fields were withheld', () => {
  it('marks redacted fields on every row of a set', async () => {
    const { deps, captured } = depsWithQuery({
      redactFieldsBatch: (_u, _r, _t, rows) =>
        rows.map(o => ({ data: { ...o, diagnosis: null }, _redactedFields: ['diagnosis'] })),
    });
    const reader = await queryReader(deps, captured);

    const rows = await reader.queryObjects!('Patient');

    expect(rows.every(r => Array.isArray(r['_redactedFields']))).toBe(true);
  });
});

// ─── read-modify-write from a function needs the version it decided on ───

describe('function-applied actions carry optimistic concurrency', () => {
  it('forwards _expectedVersion into the action context', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    // A function reads a patient at _version 3, computes, then acts on it.
    // Without carrying that version the write lands regardless of what changed
    // in between — and functions only became able to read *and* act recently,
    // which is exactly the read-modify-write window this guards.
    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1', _expectedVersion: 3 });

    const actionCtx = execute.mock.calls[0]![3] as unknown as { expectedVersion?: number };
    expect(actionCtx.expectedVersion).toBe(3);
  });

  it('leaves the check off when the function does not claim a version', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });

    const actionCtx = execute.mock.calls[0]![3] as unknown as { expectedVersion?: number };
    expect(actionCtx.expectedVersion).toBeUndefined();
  });

  it('ignores a non-numeric version rather than failing the call', async () => {
    const execute = vi.fn(async (..._args: unknown[]) => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', _expectedVersion: 'three' });

    const actionCtx = execute.mock.calls[0]![3] as unknown as { expectedVersion?: number };
    expect(actionCtx.expectedVersion).toBeUndefined();
  });
});
