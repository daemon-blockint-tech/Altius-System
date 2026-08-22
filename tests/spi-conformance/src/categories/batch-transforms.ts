/**
 * BatchTransformService conformance — the same assertions against every provider.
 *
 * A transform reads datasets, applies logic, and writes an output dataset.
 * What is being pinned here is that both providers agree on the parts a caller
 * can observe: the registry, the build record a run leaves behind, and the
 * schedule list.
 *
 * The category needs a DatasetService too, because a build is only meaningful
 * against real datasets — the factory hands back both, already paired, so each
 * provider supplies its own matching pair rather than the memory transform
 * service being tested against Postgres datasets or vice versa.
 */

import { describe, it, expect } from 'vitest';
import type {
  BatchTransformService,
  DatasetService,
  DatasetSchema,
  RequestContext,
} from '@altius/spi';

export interface TransformPair {
  transforms: BatchTransformService;
  datasets: DatasetService;
}

export type TransformPairFactory = () => TransformPair | Promise<TransformPair>;

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'amount', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

export function registerBatchTransformTests(providerName: string, factory: TransformPairFactory): void {
  describe(`[${providerName}] SPI Conformance: BatchTransformService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_tx_${label}_${counter++}`, actorId: 'u1' });

    /** A transform over one input dataset, with both datasets created. */
    async function seed(pair: TransformPair, ctx: RequestContext, name: string, rows: Record<string, unknown>[]) {
      await pair.datasets.create(ctx, { name: `${name}_in`, schema: SCHEMA });
      await pair.datasets.create(ctx, { name: `${name}_out`, schema: SCHEMA });
      if (rows.length) await pair.datasets.insert(ctx, `${name}_in`, { rows });
      return pair.transforms.create(ctx, {
        name, description: 'copy input to output',
        inputs: [`${name}_in`], output: `${name}_out`,
        kind: 'map', source: 'passthrough',
      });
    }

    describe('the transform registry', () => {
      it('creates and reads back a transform', async () => {
        const pair = await factory();
        const ctx = ctxFor('create');
        const t = await seed(pair, ctx, 'copy', []);
        expect(t.kind).toBe('map');
        expect(t.incremental).toBe(false);
        // `inputs` is a TEXT[] on Postgres — the #19 defect made every write
        // with one fail. Asserting the round trip, not just the absence of a
        // throw: a wrongly-serialised array can still insert as one element.
        expect(t.inputs).toEqual(['copy_in']);

        const fetched = await pair.transforms.get(ctx, 'copy');
        expect(fetched!.output).toBe('copy_out');
        expect(fetched!.inputs).toEqual(['copy_in']);
      });

      it('handles a transform with several inputs', async () => {
        const pair = await factory();
        const ctx = ctxFor('multi');
        for (const n of ['a', 'b', 'joined']) await pair.datasets.create(ctx, { name: n, schema: SCHEMA });
        const t = await pair.transforms.create(ctx, {
          name: 'merge', description: '', inputs: ['a', 'b'], output: 'joined',
          kind: 'join', source: 'concat',
        });
        expect(t.inputs).toEqual(['a', 'b']);
        expect((await pair.transforms.get(ctx, 'merge'))!.inputs).toEqual(['a', 'b']);
      });

      it('returns null for an unknown transform', async () => {
        const pair = await factory();
        expect(await pair.transforms.get(ctxFor('missing'), 'nope')).toBeNull();
      });

      it('lists and updates transforms', async () => {
        const pair = await factory();
        const ctx = ctxFor('list');
        await seed(pair, ctx, 'one', []);
        await seed(pair, ctx, 'two', []);
        expect(await pair.transforms.list(ctx)).toHaveLength(2);

        const updated = await pair.transforms.update(ctx, 'one', { description: 'changed', incremental: true });
        expect(updated.description).toBe('changed');
        expect(updated.incremental).toBe(true);
        // Unspecified fields keep their previous values rather than resetting.
        expect(updated.inputs).toEqual(['one_in']);
        expect(updated.output).toBe('one_out');
      });

      it('deletes a transform', async () => {
        const pair = await factory();
        const ctx = ctxFor('delete');
        await seed(pair, ctx, 'doomed', []);
        await pair.transforms.delete(ctx, 'doomed');
        expect(await pair.transforms.get(ctx, 'doomed')).toBeNull();
      });

      it('keeps transforms in separate tenants apart', async () => {
        const pair = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        await seed(pair, a, 'mine', []);
        expect(await pair.transforms.get(b, 'mine')).toBeNull();
        expect(await pair.transforms.list(b)).toHaveLength(0);
      });

      it('refuses to build a transform that does not exist', async () => {
        const pair = await factory();
        await expect(pair.transforms.startBuild(ctxFor('nobuild'), 'nope', 'manual')).rejects.toThrow(/not found/i);
      });
    });

    describe('builds', () => {
      it('runs a build and records what it moved', async () => {
        const pair = await factory();
        const ctx = ctxFor('build');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }, { id: 2, amount: 20 }]);

        const build = await pair.transforms.startBuild(ctx, 'copy', 'manual');
        expect(build.state).toBe('succeeded');
        expect(build.trigger).toBe('manual');
        expect(build.rowsRead).toBe(2);
        expect(build.rowsWritten).toBe(2);
        expect(build.transformName).toBe('copy');
        expect(build.endedAt).toBeDefined();

        // The output dataset actually received the rows.
        const out = await pair.datasets.read(ctx, 'copy_out');
        expect(out.rows).toHaveLength(2);
      });

      it('records the build against the transform', async () => {
        const pair = await factory();
        const ctx = ctxFor('lastbuild');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }]);
        const build = await pair.transforms.startBuild(ctx, 'copy', 'schedule');
        const t = await pair.transforms.get(ctx, 'copy');
        expect(t!.lastBuildState).toBe('succeeded');
        expect(t!.lastBuildId).toBe(build.id);
      });

      it('reads a build back by id and lists newest first', async () => {
        const pair = await factory();
        const ctx = ctxFor('history');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }]);
        const first = await pair.transforms.startBuild(ctx, 'copy', 'manual');
        const second = await pair.transforms.startBuild(ctx, 'copy', 'upstream');

        expect((await pair.transforms.getBuild(ctx, first.id))!.trigger).toBe('manual');
        const builds = await pair.transforms.listBuilds(ctx, 'copy');
        expect(builds).toHaveLength(2);
        expect(builds[0]!.id).toBe(second.id);
      });

      it('honours the build list limit', async () => {
        const pair = await factory();
        const ctx = ctxFor('limit');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }]);
        await pair.transforms.startBuild(ctx, 'copy', 'manual');
        await pair.transforms.startBuild(ctx, 'copy', 'manual');
        expect(await pair.transforms.listBuilds(ctx, 'copy', 1)).toHaveLength(1);
      });

      it('uses a registered executor in place of the default', async () => {
        const pair = await factory();
        const ctx = ctxFor('executor');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }, { id: 2, amount: 20 }]);
        await pair.transforms.registerExecutor(ctx, 'copy', {
          execute: (inputs) => inputs[0]!.filter(r => Number(r['amount']) > 15),
        });
        const build = await pair.transforms.startBuild(ctx, 'copy', 'manual');
        expect(build.rowsRead).toBe(2);
        expect(build.rowsWritten).toBe(1);
        expect((await pair.datasets.read(ctx, 'copy_out')).rows).toHaveLength(1);
      });

      it('marks a build aborted', async () => {
        const pair = await factory();
        const ctx = ctxFor('abort');
        await seed(pair, ctx, 'copy', [{ id: 1, amount: 10 }]);
        const build = await pair.transforms.startBuild(ctx, 'copy', 'manual');
        await pair.transforms.abortBuild(ctx, build.id);
        expect((await pair.transforms.getBuild(ctx, build.id))!.state).toBe('aborted');
      });

      it('returns null for an unknown build', async () => {
        const pair = await factory();
        expect(await pair.transforms.getBuild(ctxFor('nobuildid'), 'no-such-build')).toBeNull();
      });
    });

    describe('schedules', () => {
      it('registers, lists and deletes a schedule', async () => {
        const pair = await factory();
        const ctx = ctxFor('sched');
        await seed(pair, ctx, 'copy', []);
        const { scheduleId } = await pair.transforms.schedule(ctx, 'copy', '0 * * * *');
        expect(scheduleId).toBeTruthy();

        const listed = await pair.transforms.listSchedules(ctx);
        expect(listed).toHaveLength(1);
        expect(listed[0]!.transformName).toBe('copy');
        expect(listed[0]!.cronExpression).toBe('0 * * * *');
        expect(listed[0]!.enabled).toBe(true);

        await pair.transforms.deleteSchedule(ctx, scheduleId);
        expect(await pair.transforms.listSchedules(ctx)).toHaveLength(0);
      });

      it('keeps schedules in separate tenants apart', async () => {
        const pair = await factory();
        const a = ctxFor('sched_a');
        const b = ctxFor('sched_b');
        await seed(pair, a, 'copy', []);
        await pair.transforms.schedule(a, 'copy', '0 * * * *');
        expect(await pair.transforms.listSchedules(b)).toHaveLength(0);
      });
    });
  });
}
