/**
 * Checkpoints: justification capture for sensitive actions.
 *
 * A manifest may declare `requiresJustification: true`. The executor then
 * refuses to run the action unless the caller supplied a non-empty
 * justification (ctx.justification, carried by the reserved `_justification`
 * input field on every surface), and captures it in the JustificationStore
 * BEFORE effects run — capture-before-act is the checkpoint semantic, so a
 * failed capture fails the action.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseOdl } from '@altius/odl';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext } from '../types.js';
import type { ActionManifest } from '../../parser/types.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType { id: ID! @primary  status: String }

type ExportRecords @actionType { reason: String @param }
`);

const actor: ActionActor = { id: 'u-1', type: 'user', roles: ['admin'], markings: [] };

function ctxWith(justification?: string): ActionContext {
  return {
    requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
    ...(justification !== undefined ? { justification } : {}),
  } as ActionContext;
}

function manifest(requiresJustification: boolean): ActionManifest {
  return {
    action: 'ExportRecords',
    version: 1,
    reversible: false,
    ...(requiresJustification ? { requiresJustification } : {}),
    preconditions: [],
    effects: [],
    sideEffects: [],
  } as unknown as ActionManifest;
}

function harness(opts?: { createFails?: boolean }) {
  const create = vi.fn(async () => {
    if (opts?.createFails) throw new Error('justification store down');
    return { id: 'j-1' } as never;
  });
  const auditWrite = vi.fn(async () => ({} as never));

  const executor = new ActionExecutor({
    storage: {
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    justificationStore: { create, get: vi.fn(), list: vi.fn(), approve: vi.fn() },
    auditWriter: { write: auditWrite },
  } as never);

  return { executor, create, auditWrite };
}

describe('requiresJustification enforcement', () => {
  it('refuses execution when no justification is supplied', async () => {
    const { executor, create } = harness();
    const result = await executor.execute(manifest(true), {}, actor, ctxWith(), schema);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('JUSTIFICATION_REQUIRED');
    expect(result.errors?.[0]?.message).toContain('_justification');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a blank justification', async () => {
    const { executor } = harness();
    const result = await executor.execute(manifest(true), {}, actor, ctxWith('   '), schema);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('JUSTIFICATION_REQUIRED');
  });

  it('audits the refusal', async () => {
    const { executor, auditWrite } = harness();
    await executor.execute(manifest(true), {}, actor, ctxWith(), schema);
    const denied = auditWrite.mock.calls
      .map(c => (c as unknown[])[0] as { detail: { result?: string } })
      .find(r => r.detail.result === 'denied');
    expect(denied).toBeDefined();
  });

  it('captures the justification before effects and succeeds', async () => {
    const { executor, create } = harness();
    const result = await executor.execute(
      manifest(true), {}, actor, ctxWith('break-glass: patient deteriorating'), schema,
    );
    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith('t-1', 'u-1', expect.objectContaining({
      actionName: 'ExportRecords',
      justification: 'break-glass: patient deteriorating',
    }));
  });

  it('fails the action when the capture fails — capture-before-act', async () => {
    const { executor } = harness({ createFails: true });
    const result = await executor.execute(
      manifest(true), {}, actor, ctxWith('reason'), schema,
    );
    expect(result.success).toBe(false);
  });

  it('stamps the justification into the success audit record', async () => {
    const { executor, auditWrite } = harness();
    await executor.execute(manifest(true), {}, actor, ctxWith('audit me'), schema);
    const success = auditWrite.mock.calls
      .map(c => (c as unknown[])[0] as { detail: { justification?: string } })
      .find(r => r.detail.justification === 'audit me');
    expect(success).toBeDefined();
  });

  it('leaves actions without the declaration untouched', async () => {
    const { executor, create } = harness();
    const result = await executor.execute(manifest(false), {}, actor, ctxWith(), schema);
    expect(result.success).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
