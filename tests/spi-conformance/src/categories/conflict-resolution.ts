/**
 * ConflictResolutionService conformance — the same assertions against every provider.
 *
 * A conflict is a datasource sync and a user edit disagreeing about one field.
 * Two things are being pinned, and the second matters more than it looks:
 *
 *   1. that both providers keep the same conflicts and the same default
 *      strategy, and
 *   2. that both providers pick the **same winning value**.
 *
 * The second is the reason the resolver is shared code in @altius/spi. Its
 * output is *data*: two providers disagreeing about `latest_value_wins` would
 * write different values into the same field for the same conflict, and neither
 * would error. The divergence would surface much later, in the data itself,
 * with nothing to say which deployment produced it. So most of the cases below
 * are about which value wins, not about the record round-tripping.
 */

import { describe, it, expect } from 'vitest';
import type { ConflictResolutionService, DataConflict, RequestContext } from '@altius/spi';

export type ConflictResolutionFactory = () =>
  | ConflictResolutionService
  | Promise<ConflictResolutionService>;

type ConflictInput = Omit<DataConflict, 'id' | 'tenantId' | 'resolved' | 'detectedAt'>;

function conflict(overrides: Partial<ConflictInput> = {}): ConflictInput {
  return {
    objectType: 'Patient',
    objectId: 'p1',
    field: 'ward',
    datasourceValue: 'Cardiology',
    userValue: 'Oncology',
    datasourceTimestamp: '2026-08-20T09:00:00.000Z',
    userTimestamp: '2026-08-20T10:00:00.000Z',
    ...overrides,
  } as ConflictInput;
}

export function registerConflictResolutionTests(providerName: string, factory: ConflictResolutionFactory): void {
  describe(`[${providerName}] SPI Conformance: ConflictResolutionService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_cfl_${label}_${counter++}`, actorId: 'u1' });

    describe('detecting and reading', () => {
      it('records a conflict as unresolved, stamped with a detection time', async () => {
        const svc = await factory();
        const ctx = ctxFor('detect');
        const c = await svc.detect(ctx, conflict());
        expect(c.resolved).toBe(false);
        expect(c.tenantId).toBe(ctx.tenantId);
        expect(c.objectType).toBe('Patient');
        expect(c.field).toBe('ward');
        expect(c.datasourceValue).toBe('Cardiology');
        expect(c.userValue).toBe('Oncology');
        expect(c.detectedAt).toBeTruthy();
        expect(c.resolvedValue).toBeUndefined();
        expect(c.resolvedBy).toBeUndefined();
      });

      it('round-trips object values on both sides', async () => {
        // The merge strategy exists for object values, so they have to survive
        // storage — this is the case a TEXT column would quietly mangle.
        const svc = await factory();
        const ctx = ctxFor('objects');
        const c = await svc.detect(ctx, conflict({
          datasourceValue: { ward: 'Cardiology', bed: 3 },
          userValue: { ward: 'Oncology' },
        }));
        const found = await svc.get(ctx, c.id);
        expect(found!.datasourceValue).toEqual({ ward: 'Cardiology', bed: 3 });
        expect(found!.userValue).toEqual({ ward: 'Oncology' });
      });

      it('round-trips a null value distinctly from an absent one', async () => {
        const svc = await factory();
        const ctx = ctxFor('nulls');
        const c = await svc.detect(ctx, conflict({ userValue: null }));
        const found = await svc.get(ctx, c.id);
        expect(found!.userValue).toBeNull();
        // Never resolved, so there is no resolved value at all — which is a
        // different thing from a resolved value of null.
        expect(found!.resolvedValue).toBeUndefined();
      });

      it('returns null for an unknown conflict id', async () => {
        const svc = await factory();
        expect(await svc.get(ctxFor('missing'), 'no-such-conflict')).toBeNull();
      });

      it('lists unresolved conflicts newest first, filterable by object type', async () => {
        const svc = await factory();
        const ctx = ctxFor('list');
        await svc.detect(ctx, conflict());
        await svc.detect(ctx, conflict({ objectType: 'Order', objectId: 'o1' }));
        expect(await svc.listUnresolved(ctx)).toHaveLength(2);
        expect(await svc.listUnresolved(ctx, 'Patient')).toHaveLength(1);
        expect(await svc.listUnresolved(ctx, 'Nothing')).toHaveLength(0);
      });

      it('drops a conflict from the unresolved list once it is resolved', async () => {
        // The list is a work queue, so what leaves it is as much the contract
        // as what is in it.
        const svc = await factory();
        const ctx = ctxFor('list_resolved');
        const a = await svc.detect(ctx, conflict());
        await svc.detect(ctx, conflict({ objectId: 'p2' }));
        await svc.resolve(ctx, a.id, 'user_edits_win');
        expect(await svc.listUnresolved(ctx)).toHaveLength(1);
        // Still readable by id — resolving is not deleting.
        expect((await svc.get(ctx, a.id))!.resolved).toBe(true);
      });

      it('keeps conflicts in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const c = await svc.detect(a, conflict());
        expect(await svc.get(b, c.id)).toBeNull();
        expect(await svc.listUnresolved(b)).toHaveLength(0);
      });
    });

    describe('which value wins', () => {
      // The heart of the category. Every case here is one both providers have
      // to answer identically, because the answer is written into the data.

      it('user_edits_win takes the user value', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_user');
        const c = await svc.detect(ctx, conflict());
        const r = await svc.resolve(ctx, c.id, 'user_edits_win');
        expect(r.resolvedValue).toBe('Oncology');
        expect(r.resolvedBy).toBe('user_edits_win');
        expect(r.resolved).toBe(true);
        expect(r.resolvedAt).toBeTruthy();
      });

      it('latest_value_wins takes the user value when the user edit is newer', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_latest_user');
        const c = await svc.detect(ctx, conflict({
          datasourceTimestamp: '2026-08-20T09:00:00.000Z',
          userTimestamp: '2026-08-20T10:00:00.000Z',
        }));
        expect((await svc.resolve(ctx, c.id, 'latest_value_wins')).resolvedValue).toBe('Oncology');
      });

      it('latest_value_wins takes the datasource value when the sync is newer', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_latest_ds');
        const c = await svc.detect(ctx, conflict({
          datasourceTimestamp: '2026-08-20T11:00:00.000Z',
          userTimestamp: '2026-08-20T10:00:00.000Z',
        }));
        expect((await svc.resolve(ctx, c.id, 'latest_value_wins')).resolvedValue).toBe('Cardiology');
      });

      it('latest_value_wins gives an exact tie to the datasource', async () => {
        // Strictly-greater, not greater-or-equal. Pinned because a provider
        // that flipped the comparison would be right in every case except this
        // one, and this one would never be noticed.
        const svc = await factory();
        const ctx = ctxFor('win_tie');
        const c = await svc.detect(ctx, conflict({
          datasourceTimestamp: '2026-08-20T10:00:00.000Z',
          userTimestamp: '2026-08-20T10:00:00.000Z',
        }));
        expect((await svc.resolve(ctx, c.id, 'latest_value_wins')).resolvedValue).toBe('Cardiology');
      });

      it('merge overlays the user object on the datasource object', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_merge');
        const c = await svc.detect(ctx, conflict({
          datasourceValue: { ward: 'Cardiology', bed: 3, source: 'sync' },
          userValue: { ward: 'Oncology', note: 'moved' },
        }));
        // Datasource fields survive where the user did not set them; user
        // fields win where both did.
        expect((await svc.resolve(ctx, c.id, 'merge')).resolvedValue).toEqual({
          ward: 'Oncology', bed: 3, source: 'sync', note: 'moved',
        });
      });

      it('merge falls back to the user value when either side is not an object', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_merge_scalar');
        const c = await svc.detect(ctx, conflict());
        expect((await svc.resolve(ctx, c.id, 'merge')).resolvedValue).toBe('Oncology');
      });

      it('merge falls back to the user value when the datasource value is null', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_merge_null_ds');
        const c = await svc.detect(ctx, conflict({
          datasourceValue: null,
          userValue: { ward: 'Oncology' },
        }));
        expect((await svc.resolve(ctx, c.id, 'merge')).resolvedValue).toEqual({ ward: 'Oncology' });
      });

      it('merge resolves to null when the USER value is null', async () => {
        // This is the direction that makes the null guard load-bearing, and the
        // case above does not: `typeof null === 'object'`, so without the guard
        // both sides look mergeable and the result is the datasource object.
        // With it, the user's null wins outright and the field is cleared.
        //
        // Spreading null in an object literal is a no-op, which is why the
        // datasource-null case answers the same either way — it pins the
        // behaviour but proves nothing about the guard.
        const svc = await factory();
        const ctx = ctxFor('win_merge_null_user');
        const c = await svc.detect(ctx, conflict({
          datasourceValue: { ward: 'Cardiology', bed: 3 },
          userValue: null,
        }));
        expect((await svc.resolve(ctx, c.id, 'merge')).resolvedValue).toBeNull();
      });

      it('manual takes the value the caller supplied', async () => {
        const svc = await factory();
        const ctx = ctxFor('win_manual');
        const c = await svc.detect(ctx, conflict());
        const r = await svc.resolve(ctx, c.id, 'manual', 'Neurology');
        expect(r.resolvedValue).toBe('Neurology');
        expect(r.resolvedBy).toBe('manual');
      });

      it('manual with no value resolves the conflict and stores no value', async () => {
        // Legal, and surprising enough to pin: the conflict leaves the queue
        // with nothing recorded as the winner.
        const svc = await factory();
        const ctx = ctxFor('win_manual_none');
        const c = await svc.detect(ctx, conflict());
        const r = await svc.resolve(ctx, c.id, 'manual');
        expect(r.resolved).toBe(true);
        expect(r.resolvedValue).toBeUndefined();
        expect((await svc.get(ctx, c.id))!.resolvedValue).toBeUndefined();
        expect(await svc.listUnresolved(ctx)).toHaveLength(0);
      });
    });

    describe('resolving', () => {
      it('refuses to resolve a conflict twice', async () => {
        // The first decision stands. A second resolve with a different strategy
        // would otherwise overwrite the recorded winner.
        const svc = await factory();
        const ctx = ctxFor('twice');
        const c = await svc.detect(ctx, conflict());
        await svc.resolve(ctx, c.id, 'user_edits_win');
        await expect(svc.resolve(ctx, c.id, 'latest_value_wins')).rejects.toThrow(/already resolved/i);
        expect((await svc.get(ctx, c.id))!.resolvedBy).toBe('user_edits_win');
      });

      it('reports a missing conflict on resolve', async () => {
        const svc = await factory();
        await expect(svc.resolve(ctxFor('gone'), 'no-such-conflict', 'user_edits_win'))
          .rejects.toThrow(/not found/i);
      });

      it('auto-resolves every unresolved conflict with one strategy', async () => {
        const svc = await factory();
        const ctx = ctxFor('auto');
        await svc.detect(ctx, conflict());
        await svc.detect(ctx, conflict({ objectId: 'p2' }));
        const result = await svc.autoResolve(ctx, 'user_edits_win');
        expect(result.resolved).toBe(2);
        expect(result.conflicts.every(c => c.resolved)).toBe(true);
        expect(result.conflicts.every(c => c.resolvedBy === 'user_edits_win')).toBe(true);
        expect(await svc.listUnresolved(ctx)).toHaveLength(0);
      });

      it('auto-resolves nothing when the queue is empty', async () => {
        const svc = await factory();
        expect(await svc.autoResolve(ctxFor('auto_empty'), 'user_edits_win')).toEqual({
          resolved: 0, conflicts: [],
        });
      });

      it('leaves already-resolved conflicts alone on auto-resolve', async () => {
        const svc = await factory();
        const ctx = ctxFor('auto_partial');
        const a = await svc.detect(ctx, conflict());
        await svc.detect(ctx, conflict({ objectId: 'p2' }));
        await svc.resolve(ctx, a.id, 'manual', 'Neurology');
        const result = await svc.autoResolve(ctx, 'user_edits_win');
        expect(result.resolved).toBe(1);
        // The earlier decision is untouched, not re-decided.
        expect((await svc.get(ctx, a.id))!.resolvedValue).toBe('Neurology');
      });
    });

    describe('the default strategy', () => {
      it('falls back to user_edits_win when a tenant has not chosen', async () => {
        // This fallback is exactly why losing the setting is silent: a tenant
        // that chose otherwise gets no error, it gets the other answer.
        const svc = await factory();
        expect(await svc.getDefaultStrategy(ctxFor('default_none'))).toBe('user_edits_win');
      });

      it('stores and reads back a chosen strategy', async () => {
        const svc = await factory();
        const ctx = ctxFor('default_set');
        await svc.setDefaultStrategy(ctx, 'latest_value_wins');
        expect(await svc.getDefaultStrategy(ctx)).toBe('latest_value_wins');
      });

      it('replaces the strategy rather than accumulating', async () => {
        const svc = await factory();
        const ctx = ctxFor('default_replace');
        await svc.setDefaultStrategy(ctx, 'latest_value_wins');
        await svc.setDefaultStrategy(ctx, 'merge');
        expect(await svc.getDefaultStrategy(ctx)).toBe('merge');
      });

      it('keeps each tenant on its own strategy', async () => {
        const svc = await factory();
        const a = ctxFor('default_iso_a');
        const b = ctxFor('default_iso_b');
        await svc.setDefaultStrategy(a, 'merge');
        expect(await svc.getDefaultStrategy(a)).toBe('merge');
        // And the tenant that chose nothing is still on the fallback rather
        // than inheriting its neighbour's choice.
        expect(await svc.getDefaultStrategy(b)).toBe('user_edits_win');
      });
    });
  });
}
