/**
 * Effect values and action params must keep their declared types.
 *
 * Two defects in one theme: a manifest declaring `quantity: 5` must not write
 * the string "5" (the memory provider stores it verbatim; Postgres coerces or
 * rejects against a typed column — the two providers disagree), and a param
 * declared `Int` must be rejected at the pipeline's validate step rather than
 * surfacing as an opaque storage/CEL error further down.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { MemoryStorageProvider } from '@altius/storage-memory';
import type { ParsedSchema } from '@altius/odl';
import type { OntologyObject, OntologySchema, RequestContext } from '@altius/spi';

import { parseActionManifest } from '../../parser/index.js';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext, SecurityLayer, CelEvaluator } from '../types.js';

const REQ_CTX: RequestContext = {
  tenantId: 'nhs-trust-01',
  actorId: 'dr-smith',
  traceId: 'trace-types',
};

const ACTOR: ActionActor = { id: 'dr-smith', type: 'user', roles: ['clinician'] };
const ACTION_CTX: ActionContext = { requestContext: REQ_CTX };

const SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Prescription',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'quantity', type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'dose', type: { name: 'Float', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'active', type: { name: 'Boolean', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'status', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'DispenseMedication',
      fields: [
        { name: 'prescription', type: { name: 'Prescription', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'count', type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'note', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'route', type: { name: 'AdminRoute', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  functionTypes: [],
  enums: [
    {
      kind: 'enum',
      name: 'AdminRoute',
      values: [
        { name: 'ORAL', directives: [] },
        { name: 'IV', directives: [] },
      ],
    },
  ],
  interfaces: [],
  scalars: [],
};

const SPI_SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Prescription',
      properties: [
        { name: 'quantity', type: 'Int' },
        { name: 'dose', type: 'Float' },
        { name: 'active', type: 'Boolean' },
        { name: 'status', type: 'String' },
      ],
    },
  ],
  linkTypes: [],
};

const DISPENSE_YAML = `
action: DispenseMedication
version: 1
reversible: false

effects:
  - type: updateObject
    target: "prescription"
    set:
      quantity: 5
      dose: 2.5
      active: true
      status: "DISPENSED"
`;

/** Same action, but gated on the target's stored state — what a forged param subverts. */
const GATED_DISPENSE_YAML = `
action: DispenseMedication
version: 1
reversible: false

preconditions:
  - expr: "prescription.status == 'PENDING'"
    error: "Prescription already dispensed"

effects:
  - type: updateObject
    target: "prescription"
    set:
      status: "DISPENSED"
`;

function createAllowAllSecurity(): SecurityLayer {
  return { async checkPermission() { return { allowed: true }; } };
}

/** No preconditions in these manifests; the executor never calls this. */
function createStubCel(): CelEvaluator {
  return { async evaluate() { return { value: true }; } };
}

describe('effect value and param typing', () => {
  let storage: MemoryStorageProvider;
  let prescription: OntologyObject;
  let executor: ActionExecutor;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(REQ_CTX, SPI_SCHEMA);
    prescription = await storage.createObject(REQ_CTX, 'Prescription', {
      quantity: 0,
      dose: 0,
      active: false,
      status: 'PENDING',
    });

    executor = new ActionExecutor({
      storage,
      security: createAllowAllSecurity(),
      cel: createStubCel(),
    });
  });

  it('writes effect values with the types the manifest declared', async () => {
    const { manifest } = parseActionManifest(DISPENSE_YAML);
    expect(manifest).toBeDefined();

    const result = await executor.execute(
      manifest!,
      { prescription: prescription._id },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(true);

    const updated = await storage.getObject(REQ_CTX, 'Prescription', prescription._id);
    expect(updated!['quantity']).toBe(5);
    expect(updated!['dose']).toBe(2.5);
    expect(updated!['active']).toBe(true);
    // Unquoted bare words remain string literals — that grammar is unchanged.
    expect(updated!['status']).toBe('DISPENSED');
  });

  it('rejects a param whose value does not match its declared scalar type', async () => {
    const { manifest } = parseActionManifest(DISPENSE_YAML);

    const result = await executor.execute(
      manifest!,
      { prescription: prescription._id, count: 'twelve' },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('INVALID_PARAM_TYPE');
    expect(result.errors[0]!.message).toContain('count');
    expect(result.errors[0]!.message).toContain('Int');

    // Nothing reached storage.
    const untouched = await storage.getObject(REQ_CTX, 'Prescription', prescription._id);
    expect(untouched!['status']).toBe('PENDING');
  });

  it('refuses an object-typed param handed a literal instead of an id', async () => {
    // An object param is a REFERENCE. Step 4 only loads from storage when the
    // value is a string; anything else fell through to "scalar pass-through",
    // so a caller could substitute a fabricated object for a stored one and
    // preconditions would then be evaluated against caller-controlled data
    // instead of the record. Reachable wherever the body is untyped — the REST
    // action route and MCP both forward what the caller sent.
    const seen: Record<string, unknown>[] = [];
    const recordingCel: CelEvaluator = {
      async evaluate(_expression, variables) {
        seen.push(variables);
        return { value: true };
      },
    };
    const gated = new ActionExecutor({
      storage,
      security: createAllowAllSecurity(),
      cel: recordingCel,
    });
    const { manifest } = parseActionManifest(GATED_DISPENSE_YAML);

    const result = await gated.execute(
      manifest!,
      // No such prescription is stored; the caller asserts its state outright.
      { prescription: { _id: 'forged', status: 'PENDING' }, count: 1 },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('INVALID_PARAM_TYPE');
    expect(result.errors[0]!.message).toContain('prescription');

    // The point of the fix: the forged object never reaches the precondition.
    expect(seen).toHaveLength(0);
  });

  it('rejects an enum param whose value is not a declared member', async () => {
    const { manifest } = parseActionManifest(DISPENSE_YAML);

    const result = await executor.execute(
      manifest!,
      { prescription: prescription._id, route: 'SUBLINGUAL' },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('INVALID_PARAM_TYPE');
    expect(result.errors[0]!.message).toContain('ORAL');
  });

  it('accepts params that do match their declared types', async () => {
    const { manifest } = parseActionManifest(DISPENSE_YAML);

    const result = await executor.execute(
      manifest!,
      { prescription: prescription._id, count: 12, note: 'ok', route: 'ORAL' },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });
});
