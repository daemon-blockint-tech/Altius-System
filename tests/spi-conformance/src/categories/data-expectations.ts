/**
 * DataExpectationsService conformance — the same assertions against every provider.
 *
 * The expectations *are* the build quality gate, so what is being pinned is
 * not only that they store and read back, but that `gateBuild` reaches the same
 * verdict on both providers. A gate that opens on one deployment and closes on
 * the other is worse than no gate: it looks enforced.
 *
 * Evaluation itself is shared code in @altius/spi, which is half the guarantee.
 * This is the half that checks both providers are wired to it the same way —
 * that `enabled` is honoured before evaluating, and `blocking` after.
 */

import { describe, it, expect } from 'vitest';
import type { DataExpectationsService, CreateExpectationInput, RequestContext } from '@altius/spi';

export type DataExpectationsFactory = () => DataExpectationsService | Promise<DataExpectationsService>;

function notNull(overrides: Partial<CreateExpectationInput> = {}): CreateExpectationInput {
  return {
    name: 'nhs number present',
    description: 'every patient must have an NHS number',
    targetType: 'Patient',
    field: 'nhsNumber',
    type: 'not_null',
    params: {},
    ...overrides,
  };
}

const CLEAN = [{ nhsNumber: 'NHS-1' }, { nhsNumber: 'NHS-2' }];
const DIRTY = [{ nhsNumber: 'NHS-1' }, { nhsNumber: null }];

export function registerDataExpectationTests(providerName: string, factory: DataExpectationsFactory): void {
  describe(`[${providerName}] SPI Conformance: DataExpectationsService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_exp_${label}_${counter++}`, actorId: 'u1' });

    describe('create and read', () => {
      it('creates with blocking and enabled defaulting to true', async () => {
        const svc = await factory();
        const ctx = ctxFor('create');
        const e = await svc.create(ctx, notNull());
        // An expectation you bothered to write is presumed to be one you want
        // enforced — the default matters, because it decides whether a build
        // stops.
        expect(e.blocking).toBe(true);
        expect(e.enabled).toBe(true);
        expect(e.targetType).toBe('Patient');
        expect(e.field).toBe('nhsNumber');

        const fetched = await svc.get(ctx, e.id);
        expect(fetched!.name).toBe('nhs number present');
        expect(fetched!.type).toBe('not_null');
      });

      it('round-trips check params', async () => {
        const svc = await factory();
        const ctx = ctxFor('params');
        const e = await svc.create(ctx, notNull({ type: 'range', field: 'age', params: { min: 0, max: 120 } }));
        const fetched = await svc.get(ctx, e.id);
        expect(fetched!.params).toEqual({ min: 0, max: 120 });
      });

      it('returns null for an unknown id', async () => {
        const svc = await factory();
        expect(await svc.get(ctxFor('missing'), 'no-such-expectation')).toBeNull();
      });

      it('lists and filters by target type', async () => {
        const svc = await factory();
        const ctx = ctxFor('list');
        await svc.create(ctx, notNull());
        await svc.create(ctx, notNull({ targetType: 'Order', field: 'total' }));
        expect(await svc.list(ctx)).toHaveLength(2);
        expect(await svc.list(ctx, 'Patient')).toHaveLength(1);
        expect(await svc.list(ctx, 'Nothing')).toHaveLength(0);
      });

      it('updates and deletes', async () => {
        const svc = await factory();
        const ctx = ctxFor('update');
        const e = await svc.create(ctx, notNull());
        const updated = await svc.update(ctx, e.id, { blocking: false, description: 'downgraded to a warning' });
        expect(updated.blocking).toBe(false);
        expect(updated.description).toBe('downgraded to a warning');
        // Unspecified fields keep their values rather than resetting.
        expect(updated.type).toBe('not_null');
        expect(updated.enabled).toBe(true);

        await svc.delete(ctx, e.id);
        expect(await svc.get(ctx, e.id)).toBeNull();
      });

      it('reports a missing expectation on update', async () => {
        const svc = await factory();
        await expect(svc.update(ctxFor('gone'), 'no-such-id', { enabled: false })).rejects.toThrow(/not found/i);
      });

      it('keeps expectations in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const e = await svc.create(a, notNull());
        expect(await svc.get(b, e.id)).toBeNull();
        expect(await svc.list(b)).toHaveLength(0);
      });
    });

    describe('evaluation', () => {
      it('passes clean data and fails dirty data', async () => {
        const svc = await factory();
        const ctx = ctxFor('evaluate');
        await svc.create(ctx, notNull());

        const ok = await svc.evaluate(ctx, 'Patient', CLEAN);
        expect(ok).toHaveLength(1);
        expect(ok[0]!.passed).toBe(true);
        expect(ok[0]!.rowsChecked).toBe(2);
        expect(ok[0]!.rowsFailed).toBe(0);

        const bad = await svc.evaluate(ctx, 'Patient', DIRTY);
        expect(bad[0]!.passed).toBe(false);
        expect(bad[0]!.rowsFailed).toBe(1);
      });

      it('skips disabled expectations rather than reporting them as passing', async () => {
        // The difference matters: a disabled check reported as passing would
        // make a gate look enforced when it is switched off.
        const svc = await factory();
        const ctx = ctxFor('disabled');
        await svc.create(ctx, notNull({ enabled: false }));
        expect(await svc.evaluate(ctx, 'Patient', DIRTY)).toHaveLength(0);
      });

      it('only evaluates expectations for the target type asked about', async () => {
        const svc = await factory();
        const ctx = ctxFor('target');
        await svc.create(ctx, notNull());
        await svc.create(ctx, notNull({ targetType: 'Order' }));
        expect(await svc.evaluate(ctx, 'Patient', CLEAN)).toHaveLength(1);
      });

      it('evaluates a unique check', async () => {
        const svc = await factory();
        const ctx = ctxFor('unique');
        await svc.create(ctx, notNull({ name: 'unique nhs', type: 'unique' }));
        const dup = await svc.evaluate(ctx, 'Patient', [{ nhsNumber: 'NHS-1' }, { nhsNumber: 'NHS-1' }]);
        expect(dup[0]!.passed).toBe(false);
        expect(await svc.evaluate(ctx, 'Patient', CLEAN).then(r => r[0]!.passed)).toBe(true);
      });
    });

    describe('the build gate', () => {
      it('blocks a build on a failing blocking expectation', async () => {
        const svc = await factory();
        const ctx = ctxFor('gate_block');
        await svc.create(ctx, notNull());
        const gate = await svc.gateBuild(ctx, 'Patient', DIRTY);
        expect(gate.passed).toBe(false);
        expect(gate.blockingFailures).toHaveLength(1);
        expect(gate.results).toHaveLength(1);
      });

      it('lets a build through when a failing expectation is non-blocking', async () => {
        // Reported, not enforced: the failure still appears in `results`, so a
        // caller can surface it without the build stopping.
        const svc = await factory();
        const ctx = ctxFor('gate_warn');
        await svc.create(ctx, notNull({ blocking: false }));
        const gate = await svc.gateBuild(ctx, 'Patient', DIRTY);
        expect(gate.passed).toBe(true);
        expect(gate.blockingFailures).toHaveLength(0);
        expect(gate.results[0]!.passed).toBe(false);
      });

      it('passes a build with clean data', async () => {
        const svc = await factory();
        const ctx = ctxFor('gate_ok');
        await svc.create(ctx, notNull());
        const gate = await svc.gateBuild(ctx, 'Patient', CLEAN);
        expect(gate.passed).toBe(true);
        expect(gate.blockingFailures).toHaveLength(0);
      });

      it('passes a build when no expectation is defined', async () => {
        // The honest behaviour of an empty gate — and exactly what a store
        // that lost its expectations would do, which is why losing them is
        // silent rather than loud.
        const svc = await factory();
        const gate = await svc.gateBuild(ctxFor('gate_empty'), 'Patient', DIRTY);
        expect(gate.passed).toBe(true);
        expect(gate.results).toHaveLength(0);
      });

      it('ignores a disabled blocking expectation', async () => {
        const svc = await factory();
        const ctx = ctxFor('gate_disabled');
        await svc.create(ctx, notNull({ enabled: false }));
        expect((await svc.gateBuild(ctx, 'Patient', DIRTY)).passed).toBe(true);
      });
    });
  });
}
