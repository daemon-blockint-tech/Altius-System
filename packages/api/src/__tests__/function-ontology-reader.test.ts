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

function depsWithActions(execute: ReturnType<typeof vi.fn>, manifest: unknown = { action: 'AdmitPatient' }) {
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
    manifestRegistry: { get: vi.fn(() => manifest) },
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
    const execute = vi.fn(async () => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });

    const [, params, actor] = execute.mock.calls[0]!;
    expect(params).toEqual({ patientId: 'p-1', wardId: 'w-1' });
    expect(actor).toEqual({ id: 'u1', type: 'user', roles: ['clinician'] });
  });

  it('derives the consent subject exactly as the HTTP action route does', async () => {
    const execute = vi.fn(async () => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] }));
    const { deps, captured } = depsWithActions(execute);
    const reader = await actionReader(deps, captured);

    await reader.applyAction!('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });

    // Without this, calling an action from a function would skip the consent
    // stage that calling it over HTTP applies.
    const actionCtx = execute.mock.calls[0]![3] as { consentSubjectId?: string };
    expect(actionCtx.consentSubjectId).toBe('p-1');
  });

  it('throws when the action is refused, so pack code cannot read it as applied', async () => {
    const execute = vi.fn(async () => ({
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
    const { deps, captured } = depsWithActions(execute, undefined);
    const reader = await actionReader(deps, captured);

    await expect(reader.applyAction!('Ghost', {})).rejects.toThrow(/Unknown action "Ghost"/);
    expect(execute).not.toHaveBeenCalled();
  });
});
