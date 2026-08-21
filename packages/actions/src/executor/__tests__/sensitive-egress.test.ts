/**
 * @sensitive masking on the side-effect egress.
 *
 * A webhook side-effect with no configured body POSTs the ENTIRE effect
 * context to an external URL — including storage-loaded @param objects with
 * their raw @sensitive values. Side effects now receive a redacted copy of
 * the context (sensitive fields nulled, listed in _redactedFields), while
 * explicitly-configured side-effect config keeps raw interpolation: an
 * author naming a sensitive field in `body`/`data` is the explicit,
 * reviewable re-exposure path.
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
}

type NotifyTransfer @actionType { patient: Patient! @param }
`);

const actor: ActionActor = { id: 'u-1', type: 'user', roles: ['clinician'], markings: [] };
const ctx = { requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' } } as ActionContext;

const manifest = {
  action: 'NotifyTransfer',
  version: 1,
  reversible: false,
  preconditions: [],
  effects: [],
  sideEffects: [{ name: 'notify', type: 'webhook', config: { url: 'https://external.example/hook' } }],
} as unknown as ActionManifest;

function harness() {
  const seExecute = vi.fn(async () => ({ success: true }));
  const executor = new ActionExecutor({
    storage: {
      getObject: vi.fn(async (_r: unknown, type: string, id: string) => ({
        _id: id, _type: type, _version: 1, id, status: 'ACTIVE', nhsNumber: '943-476-5919',
      })),
      capabilities: () => ({ supportsTransactions: true, supportsTransactionIsolation: true }),
      beginTransaction: vi.fn(async () => ({
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      })),
    },
    security: { checkPermission: vi.fn(async () => ({ allowed: true })) },
    cel: { evaluate: vi.fn(async () => ({ value: true })) },
    sideEffectHandler: { execute: seExecute },
  } as never);
  return { executor, seExecute };
}

describe('side-effect context redacts @sensitive fields', () => {
  it('nulls sensitive fields on storage-loaded objects and lists them', async () => {
    const { executor, seExecute } = harness();
    const result = await executor.execute(manifest, { patient: 'p-1' }, actor, ctx, schema);
    expect(result.success).toBe(true);
    expect(seExecute).toHaveBeenCalled();
    const context = (seExecute.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    const patient = context['patient'] as Record<string, unknown>;
    expect(patient).toBeDefined();
    expect(patient['nhsNumber']).toBeNull();
    expect(patient['_redactedFields']).toContain('nhsNumber');
    expect(patient['status']).toBe('ACTIVE');
  });

  it('leaves explicitly-configured side-effect config untouched (explicit re-exposure)', async () => {
    const { executor, seExecute } = harness();
    const explicit = {
      ...manifest,
      sideEffects: [{
        name: 'notify', type: 'webhook',
        config: { url: 'https://external.example/hook', body: { ref: 'patient.nhsNumber' } },
      }],
    } as unknown as ActionManifest;
    await executor.execute(explicit, { patient: 'p-1' }, actor, ctx, schema);
    const config = (seExecute.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    // The author's config interpolates against the RAW context — naming a
    // sensitive field there is the explicit, reviewable re-exposure path.
    expect(JSON.stringify(config)).toContain('943-476-5919');
  });

  it('does not mutate the executor-internal effect context', async () => {
    const { executor, seExecute } = harness();
    await executor.execute(manifest, { patient: 'p-1' }, actor, ctx, schema);
    const context = (seExecute.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(context).toBeDefined();
    // A second execution still loads and redacts fresh — no cross-call bleed.
    await executor.execute(manifest, { patient: 'p-1' }, actor, ctx, schema);
    const context2 = (seExecute.mock.calls[1] as unknown[])[3] as Record<string, unknown>;
    expect((context2['patient'] as Record<string, unknown>)['nhsNumber']).toBeNull();
  });
});
