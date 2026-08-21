/**
 * @sensitive masking on the audit write path.
 *
 * The audit trail's detail.before/after carried raw @sensitive values,
 * so a DPO querying the audit store (even with read-path redaction at
 * audit-routes.ts) could recover PII from the stored rows. Now the
 * executor redacts at write-time using the same redactSensitiveForEgress
 * used for webhook egress — the read-path redaction becomes
 * defense-in-depth, not the primary guard.
 *
 * Two-sided proof:
 *   1. Without write-time redaction → audit detail carries raw nhsNumber.
 *   2. With write-time redaction    → audit detail has nhsNumber=null.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  status: String
  nhsNumber: String @sensitive
  name: String @sensitive
}

type UpdatePatientStatus @actionType {
  patient: Patient! @param
  newStatus: String! @param
}
`);

const actor: ActionActor = { id: 'u-1', type: 'user', roles: ['clinician'], markings: [] };
const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

const manifest = {
  action: 'UpdatePatientStatus',
  version: 1,
  reversible: false,
  preconditions: [],
  effects: [{
    type: 'updateObject',
    target: 'patient',
    set: { status: 'newStatus' },
  }],
  sideEffects: [],
} as unknown as ActionManifest;

function harness() {
  const auditWrite = vi.fn(async () => {});
  const storedPatient = {
    _id: 'p-1', _type: 'Patient', _version: 1, id: 'p-1', status: 'ACTIVE', nhsNumber: '943-476-5919', name: 'Alice',
  };
  // txn.updateObject(type, id, props, expectedVersion) — 4 args, no ctx
  const txnUpdateObject = vi.fn(async (_type: string, id: string, props: Record<string, unknown>) => {
    return { ...storedPatient, ...props, _version: 2, _id: id, _type: 'Patient' };
  });
  const executor = new ActionExecutor({
    storage: {
      getObject: vi.fn(async (_r: unknown, type: string, id: string) => ({
        ...storedPatient, _type: type, _id: id,
      })),
      updateObject: vi.fn(async () => ({})),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
        updateObject: txnUpdateObject,
        createObject: vi.fn(async () => ({})),
        deleteObject: vi.fn(async () => ({})),
        createLink: vi.fn(async () => ({})),
        deleteLink: vi.fn(async () => ({})),
        getLink: vi.fn(async () => null),
      })),
    },
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    auditWriter: { write: auditWrite },
  } as never);
  return { executor, auditWrite, txnUpdateObject };
}

describe('audit write redacts @sensitive fields at write-time', () => {
  it('nulls sensitive fields in audit detail.before and detail.after', async () => {
    const { executor, auditWrite, txnUpdateObject } = harness();
    const result = await executor.execute(manifest, { patient: 'p-1', newStatus: 'DISCHARGED' }, actor, ctx, schema);
    if (!result.success) {
      expect(result.errors).toEqual([]);
    }
    expect(result.success).toBe(true);
    // Verify the action actually called txn.updateObject with the new status
    expect(txnUpdateObject).toHaveBeenCalled();
    const calls = (txnUpdateObject as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // txn.updateObject(type, id, props, expectedVersion) — props is index 2
    const callProps = calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(callProps).toBeDefined();
    expect(callProps!['status']).toBe('DISCHARGED');
    expect(auditWrite).toHaveBeenCalled();

    const auditRecord = (auditWrite as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
      detail: { before: Record<string, Record<string, unknown>>; after: Record<string, Record<string, unknown>> };
    } | undefined;
    expect(auditRecord).toBeDefined();

    // before: Patient object with sensitive fields nulled
    const beforePatient = auditRecord!.detail.before['Patient:p-1'];
    expect(beforePatient).toBeDefined();
    expect(beforePatient!['nhsNumber']).toBeNull();
    expect(beforePatient!['name']).toBeNull();
    expect(beforePatient!['_redactedFields']).toContain('nhsNumber');
    expect(beforePatient!['_redactedFields']).toContain('name');
    // Non-sensitive field preserved
    expect(beforePatient!['status']).toBe('ACTIVE');

    // after: same redaction
    const afterPatient = auditRecord!.detail.after['Patient:p-1'];
    expect(afterPatient).toBeDefined();
    expect(afterPatient!['nhsNumber']).toBeNull();
    expect(afterPatient!['name']).toBeNull();
    // Non-sensitive field carries the new value
    expect(afterPatient!['status']).toBe('DISCHARGED');
  });
});
