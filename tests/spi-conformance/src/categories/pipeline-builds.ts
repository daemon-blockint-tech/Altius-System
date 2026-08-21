/**
 * PipelineBuildService conformance — the same assertions against every provider.
 *
 * Three pieces of state, and the two quiet ones are why this matters:
 *
 *   - schedules — a cron registration that stops firing looks like nothing
 *     happening rather than like a failure
 *   - action triggers — the action->pipeline map; lose it and actions stop
 *     kicking off pipelines, with nothing erroring
 *   - build history — the record of what ran
 *
 * What is deliberately NOT asserted here is that a build does any work.
 * `startBuild` is a stub in both providers: it writes a `running` row and
 * immediately rewrites it as `succeeded` with a hardcoded 100ms duration. These
 * cases pin that both providers stub it the *same* way, which is the contract
 * as it actually stands — not that a pipeline ran. `BatchTransformService` is
 * the one that reads inputs and writes an output dataset.
 */

import { describe, it, expect, vi } from 'vitest';
import type { PipelineBuildService, RequestContext } from '@altius/spi';

export type PipelineBuildFactory = () => PipelineBuildService | Promise<PipelineBuildService>;

export function registerPipelineBuildTests(providerName: string, factory: PipelineBuildFactory): void {
  describe(`[${providerName}] SPI Conformance: PipelineBuildService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_pb_${label}_${counter++}`, actorId: 'u1' });

    describe('builds', () => {
      it('starts a build and records who triggered it', async () => {
        const svc = await factory();
        const ctx = ctxFor('start');
        const b = await svc.startBuild(ctx, 'daily_ingest', 'manual');
        expect(b.pipelineName).toBe('daily_ingest');
        expect(b.trigger).toBe('manual');
        expect(b.triggeredBy).toBe('u1');
        expect(b.tenantId).toBe(ctx.tenantId);
        expect(b.retryCount).toBe(0);
        expect(b.maxRetries).toBe(3);
        expect(b.expectationGated).toBe(false);
        // The stub, pinned as a stub: succeeded without work having happened.
        expect(b.state).toBe('succeeded');
        expect(b.durationMs).toBe(100);
        expect(b.steps).toEqual([{ name: 'init', state: 'succeeded', durationMs: 50 }]);
        expect(b.endedAt).toBeTruthy();
      });

      it('reads a build back by id', async () => {
        const svc = await factory();
        const ctx = ctxFor('get');
        const b = await svc.startBuild(ctx, 'daily_ingest', 'schedule');
        const found = await svc.getBuild(ctx, b.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(b.id);
        expect(found!.trigger).toBe('schedule');
        expect(found!.steps).toEqual(b.steps);
      });

      it('returns null for an unknown build id', async () => {
        const svc = await factory();
        expect(await svc.getBuild(ctxFor('missing'), 'no-such-build')).toBeNull();
      });

      it('lists builds newest first', async () => {
        const svc = await factory();
        const ctx = ctxFor('order');
        const first = await svc.startBuild(ctx, 'p1', 'manual');
        const second = await svc.startBuild(ctx, 'p1', 'manual');
        const third = await svc.startBuild(ctx, 'p1', 'manual');
        const listed = await svc.listBuilds(ctx);
        expect(listed.map(b => b.id)).toEqual([third.id, second.id, first.id]);
      });

      it('still orders newest first when start timestamps collide', async () => {
        // The case above passes on a provider that orders by `startedAt`
        // alone, because three round-trips to Postgres land in three different
        // milliseconds. That is luck, not a contract: a millisecond timestamp
        // is not a total order, two builds started in the same one compare
        // equal, and the sort degenerates to whatever order the rows arrive in.
        //
        // Freezing the clock removes the luck. Both providers stamp
        // `startedAt` from `new Date()` in this process, so with Date faked all
        // three builds carry the identical timestamp and only a real tiebreak —
        // a sequence in Postgres, insertion order in memory — can still return
        // them newest-first.
        //
        // Only Date is faked: faking timers as well would stall the pg driver's
        // own scheduling and hang the query.
        const svc = await factory();
        const ctx = ctxFor('order_tie');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
        try {
          const first = await svc.startBuild(ctx, 'p1', 'manual');
          const second = await svc.startBuild(ctx, 'p1', 'manual');
          const third = await svc.startBuild(ctx, 'p1', 'manual');
          expect(new Set([first.startedAt, second.startedAt, third.startedAt]).size).toBe(1);
          const listed = await svc.listBuilds(ctx);
          expect(listed.map(b => b.id)).toEqual([third.id, second.id, first.id]);
        } finally {
          vi.useRealTimers();
        }
      });

      it('filters builds by pipeline and honours the limit', async () => {
        const svc = await factory();
        const ctx = ctxFor('filter');
        await svc.startBuild(ctx, 'p1', 'manual');
        await svc.startBuild(ctx, 'p2', 'manual');
        await svc.startBuild(ctx, 'p1', 'manual');
        expect(await svc.listBuilds(ctx)).toHaveLength(3);
        expect(await svc.listBuilds(ctx, 'p1')).toHaveLength(2);
        expect(await svc.listBuilds(ctx, 'nothing')).toHaveLength(0);
        expect(await svc.listBuilds(ctx, undefined, 2)).toHaveLength(2);
      });

      it('aborts a build', async () => {
        const svc = await factory();
        const ctx = ctxFor('abort');
        const b = await svc.startBuild(ctx, 'p1', 'manual');
        await svc.abortBuild(ctx, b.id);
        const found = await svc.getBuild(ctx, b.id);
        expect(found!.state).toBe('aborted');
        expect(found!.endedAt).toBeTruthy();
      });

      it('is silent when aborting a build that does not exist', async () => {
        // Not an error in either provider: aborting something already gone is
        // the outcome the caller wanted.
        const svc = await factory();
        await expect(svc.abortBuild(ctxFor('abort_gone'), 'no-such-build')).resolves.toBeUndefined();
      });

      it('retries a build in place, accumulating the retry count', async () => {
        const svc = await factory();
        const ctx = ctxFor('retry');
        const b = await svc.startBuild(ctx, 'p1', 'manual');
        const once = await svc.retryBuild(ctx, b.id);
        expect(once.id).toBe(b.id);
        expect(once.retryCount).toBe(1);
        expect(once.state).toBe('succeeded');
        // The same record, not a new one — so a reader sees one build that was
        // retried rather than two builds.
        expect(await svc.listBuilds(ctx, 'p1')).toHaveLength(1);
        expect((await svc.retryBuild(ctx, b.id)).retryCount).toBe(2);
      });

      it('refuses to retry past maxRetries', async () => {
        const svc = await factory();
        const ctx = ctxFor('retry_max');
        const b = await svc.startBuild(ctx, 'p1', 'manual');
        for (let i = 0; i < 3; i++) await svc.retryBuild(ctx, b.id);
        expect((await svc.getBuild(ctx, b.id))!.retryCount).toBe(3);
        await expect(svc.retryBuild(ctx, b.id)).rejects.toThrow(/max retries/i);
      });

      it('reports a missing build on retry', async () => {
        const svc = await factory();
        await expect(svc.retryBuild(ctxFor('retry_gone'), 'no-such-build')).rejects.toThrow(/not found/i);
      });

      it('keeps builds in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const build = await svc.startBuild(a, 'p1', 'manual');
        expect(await svc.getBuild(b, build.id)).toBeNull();
        expect(await svc.listBuilds(b)).toHaveLength(0);
      });
    });

    describe('schedules', () => {
      it('creates a schedule with enabled defaulting on and abortOnFailure off', async () => {
        const svc = await factory();
        const ctx = ctxFor('sched');
        const s = await svc.createSchedule(ctx, { pipelineName: 'p1', cronExpression: '0 2 * * *' });
        expect(s.pipelineName).toBe('p1');
        expect(s.cronExpression).toBe('0 2 * * *');
        // The defaults decide whether a registered schedule actually fires.
        expect(s.enabled).toBe(true);
        expect(s.maxRetries).toBe(3);
        expect(s.abortOnFailure).toBe(false);
        expect(s.createdBy).toBe('u1');
      });

      it('honours explicit schedule settings', async () => {
        const svc = await factory();
        const ctx = ctxFor('sched_opts');
        const s = await svc.createSchedule(ctx, {
          pipelineName: 'p1', cronExpression: '*/5 * * * *',
          enabled: false, maxRetries: 7, abortOnFailure: true,
        });
        expect(s.enabled).toBe(false);
        expect(s.maxRetries).toBe(7);
        expect(s.abortOnFailure).toBe(true);
      });

      it('lists schedules newest first', async () => {
        const svc = await factory();
        const ctx = ctxFor('sched_list');
        const a = await svc.createSchedule(ctx, { pipelineName: 'p1', cronExpression: '0 1 * * *' });
        const b = await svc.createSchedule(ctx, { pipelineName: 'p2', cronExpression: '0 2 * * *' });
        expect((await svc.listSchedules(ctx)).map(s => s.id)).toEqual([b.id, a.id]);
      });

      it('still orders schedules newest first when creation timestamps collide', async () => {
        // Same reasoning as the build ordering case: `createdAt` is a
        // millisecond timestamp, so it needs a tiebreak underneath it.
        const svc = await factory();
        const ctx = ctxFor('sched_tie');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
        try {
          const a = await svc.createSchedule(ctx, { pipelineName: 'p1', cronExpression: '0 1 * * *' });
          const b = await svc.createSchedule(ctx, { pipelineName: 'p2', cronExpression: '0 2 * * *' });
          expect(a.createdAt).toBe(b.createdAt);
          expect((await svc.listSchedules(ctx)).map(s => s.id)).toEqual([b.id, a.id]);
        } finally {
          vi.useRealTimers();
        }
      });

      it('updates a schedule, leaving unspecified fields alone', async () => {
        const svc = await factory();
        const ctx = ctxFor('sched_update');
        const s = await svc.createSchedule(ctx, {
          pipelineName: 'p1', cronExpression: '0 2 * * *', maxRetries: 5,
        });
        const updated = await svc.updateSchedule(ctx, s.id, { enabled: false });
        // Disabling is the interesting one: it is how a schedule stops firing
        // on purpose, and it has to be the reason it stopped rather than a lost
        // registration looking identical.
        expect(updated.enabled).toBe(false);
        expect(updated.cronExpression).toBe('0 2 * * *');
        expect(updated.maxRetries).toBe(5);
        expect(updated.id).toBe(s.id);
        expect(updated.createdAt).toBe(s.createdAt);
      });

      it('reports a missing schedule on update', async () => {
        const svc = await factory();
        await expect(
          svc.updateSchedule(ctxFor('sched_gone'), 'no-such-schedule', { enabled: false }),
        ).rejects.toThrow(/not found/i);
      });

      it('deletes a schedule', async () => {
        const svc = await factory();
        const ctx = ctxFor('sched_delete');
        const s = await svc.createSchedule(ctx, { pipelineName: 'p1', cronExpression: '0 2 * * *' });
        await svc.deleteSchedule(ctx, s.id);
        expect(await svc.listSchedules(ctx)).toHaveLength(0);
      });

      it('keeps schedules in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('sched_iso_a');
        const b = ctxFor('sched_iso_b');
        await svc.createSchedule(a, { pipelineName: 'p1', cronExpression: '0 2 * * *' });
        expect(await svc.listSchedules(b)).toHaveLength(0);
      });
    });

    describe('action triggers', () => {
      it('registers an action->pipeline mapping and reads it back', async () => {
        const svc = await factory();
        const ctx = ctxFor('trigger');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p1');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p2');
        expect((await svc.getActionTriggers(ctx, 'approveOrder')).sort()).toEqual(['p1', 'p2']);
      });

      it('treats a duplicate registration as a no-op', async () => {
        // Set semantics in memory; the same pair registered twice must not
        // produce two rows, or an action would fire one pipeline twice.
        const svc = await factory();
        const ctx = ctxFor('trigger_dup');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p1');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p1');
        expect(await svc.getActionTriggers(ctx, 'approveOrder')).toEqual(['p1']);
      });

      it('returns nothing for an action with no registration', async () => {
        const svc = await factory();
        expect(await svc.getActionTriggers(ctxFor('trigger_none'), 'unregistered')).toEqual([]);
      });

      it('starts one build per registered pipeline when an action fires', async () => {
        const svc = await factory();
        const ctx = ctxFor('trigger_fire');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p1');
        await svc.registerActionTrigger(ctx, 'approveOrder', 'p2');
        const builds = await svc.triggerForAction(ctx, 'approveOrder');
        expect(builds).toHaveLength(2);
        expect(builds.every(b => b.trigger === 'action')).toBe(true);
        expect(builds.map(b => b.pipelineName).sort()).toEqual(['p1', 'p2']);
        // And the builds are in the history, not only in the return value.
        expect(await svc.listBuilds(ctx)).toHaveLength(2);
      });

      it('fires nothing for an action with no registration', async () => {
        const svc = await factory();
        const ctx = ctxFor('trigger_fire_none');
        expect(await svc.triggerForAction(ctx, 'unregistered')).toEqual([]);
        expect(await svc.listBuilds(ctx)).toHaveLength(0);
      });

      it('keeps action triggers in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('trigger_iso_a');
        const b = ctxFor('trigger_iso_b');
        await svc.registerActionTrigger(a, 'approveOrder', 'p1');
        expect(await svc.getActionTriggers(b, 'approveOrder')).toEqual([]);
      });
    });
  });
}
