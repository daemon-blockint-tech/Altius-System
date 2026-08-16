/**
 * Required-property enforcement on the action-apply path.
 *
 * Action effects write straight to the storage transaction
 * (`txn.createObject` / `txn.updateObject`) rather than through ObjectManager,
 * so they never reached engine validation. Enforcement was therefore whatever
 * the provider happened to do: the memory provider surfaced
 * `EFFECT_EXECUTION_ERROR`, Postgres a raw `23502` — same ODL, same action,
 * different error per backend, and neither naming the offending field.
 *
 * Validation now runs in the executor, before the write, using the schema the
 * executor is already handed. The code is structured and provider-independent.
 *
 * The update case matters as much as the create case: an update patch that
 * omits a required field is legitimate, so validation must run against the
 * MERGED object. Checking the patch alone would reject every partial update —
 * a far worse regression than the bug being fixed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ParsedSchema } from '@altius/odl';
import type { OntologySchema, RequestContext, OntologyObject } from '@altius/spi';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { ActionExecutor } from '../action-executor.js';
import { parseActionManifest } from '../../parser/index.js';
import type { ActionActor } from '../types.js';

const REQ_CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' };
const ACTOR: ActionActor = { id: 'user-1', type: 'user', roles: ['clinician'] };

function field(name: string, type: string, nonNull: boolean, directives: { kind: string }[] = []) {
  return { name, type: { name: type, nonNull, isList: false, listElementNonNull: false }, directives };
}

const SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Referral',
      fields: [
        field('id', 'ID', true, [{ kind: 'primary' }]),
        // Required, no @default — omitting it must be refused.
        field('destination', 'String', true),
        // Required WITH a default — omitting it must be allowed.
        field('status', 'String', true, [{ kind: 'default', value: 'DRAFT' } as never]),
        field('notes', 'String', false),
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'CreateReferral',
      fields: [
        field('destination', 'String', false, [{ kind: 'param' }]),
        field('notes', 'String', false, [{ kind: 'param' }]),
      ],
      directives: [{ kind: 'actionType' }],
    },
    {
      kind: 'actionType',
      name: 'AnnotateReferral',
      fields: [
        // Typed as the ObjectType so the executor resolves the id into the
        // context — that resolution is what `target: "referral"` addresses.
        field('referral', 'Referral', true, [{ kind: 'param' }]),
        field('notes', 'String', false, [{ kind: 'param' }]),
      ],
      directives: [{ kind: 'actionType' }],
    },
    {
      kind: 'actionType',
      name: 'ClearDestination',
      fields: [
        field('referral', 'Referral', true, [{ kind: 'param' }]),
        field('destination', 'String', false, [{ kind: 'param' }]),
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  enums: [],
  interfaces: [],
  functionTypes: [],
} as unknown as ParsedSchema;

const SPI_SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Referral',
      properties: [
        { name: 'destination', type: 'String' },
        { name: 'status', type: 'String' },
        { name: 'notes', type: 'String' },
      ],
    },
  ],
  linkTypes: [],
};

/** Creates a Referral with no `destination` — the required field. */
const CREATE_MISSING_REQUIRED = `
action: CreateReferral
version: 1
reversible: false

effects:
  - type: createObject
    objectType: "Referral"
    properties:
      notes: "params.notes"
`;

/** Patches only `notes`, leaving the stored required field untouched. */
const UPDATE_PARTIAL = `
action: AnnotateReferral
version: 1
reversible: false

effects:
  - type: updateObject
    target: "referral"
    set:
      notes: "params.notes"
`;

/** Blanks the required field on an existing row. */
const UPDATE_CLEARS_REQUIRED = `
action: ClearDestination
version: 1
reversible: false

effects:
  - type: updateObject
    target: "referral"
    set:
      destination: "params.destination"
`;

function makeExecutor(storage: MemoryStorageProvider): ActionExecutor {
  return new ActionExecutor({
    storage,
    security: { async checkPermission() { return { allowed: true }; } },
    // No preconditions in these manifests, so the evaluator is never consulted.
    cel: { async evaluate() { return { value: true }; } },
  });
}

describe('required-property enforcement on the action path', () => {
  let storage: MemoryStorageProvider;
  let executor: ActionExecutor;
  let referral: OntologyObject;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(REQ_CTX, SPI_SCHEMA);
    referral = await storage.createObject(REQ_CTX, 'Referral', {
      destination: 'Cardiology',
      status: 'DRAFT',
    });
    executor = makeExecutor(storage);
  });

  it('refuses a create that omits a required field, with a structured code', async () => {
    const { manifest } = parseActionManifest(CREATE_MISSING_REQUIRED);
    const result = await executor.execute(
      manifest!,
      { notes: 'urgent' },
      ACTOR,
      { requestContext: REQ_CTX },
      SCHEMA,
    );

    expect(result.success).toBe(false);
    // The whole point: a provider-independent code, not EFFECT_EXECUTION_ERROR
    // on memory and a raw 23502 on Postgres.
    expect(result.errors[0]!.code).toBe('VALIDATION_ERROR');
    // And it must name the field, which neither provider's error did.
    expect(result.errors[0]!.message).toContain('destination');
  });

  it('allows a create that omits a required field carrying @default', async () => {
    const { manifest } = parseActionManifest(`
action: CreateReferral
version: 1
reversible: false

effects:
  - type: createObject
    objectType: "Referral"
    properties:
      destination: "params.destination"
`);
    const result = await executor.execute(
      manifest!,
      { destination: 'Neurology' },
      ACTOR,
      { requestContext: REQ_CTX },
      SCHEMA,
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('allows a partial update that omits a required field the stored row has', async () => {
    const { manifest } = parseActionManifest(UPDATE_PARTIAL);
    const result = await executor.execute(
      manifest!,
      { referral: referral._id, notes: 'seen by triage' },
      ACTOR,
      { requestContext: REQ_CTX },
      SCHEMA,
    );

    // Validating the patch instead of the merged object would fail this.
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('refuses an update that blanks a required field', async () => {
    const { manifest } = parseActionManifest(UPDATE_CLEARS_REQUIRED);
    const result = await executor.execute(
      manifest!,
      { referral: referral._id, destination: null },
      ACTOR,
      { requestContext: REQ_CTX },
      SCHEMA,
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('VALIDATION_ERROR');
    expect(result.errors[0]!.message).toContain('destination');

    // The transaction must have rolled back — the stored value is intact.
    const stored = await storage.getObject(REQ_CTX, 'Referral', referral._id);
    expect(stored?.['destination']).toBe('Cardiology');
  });
});
