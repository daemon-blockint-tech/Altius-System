/**
 * EventObjectService conformance — the same assertions against every provider.
 *
 * An event object is one step in a process instance: a type, a case, a time
 * range, and some badges and attributes. The service holds two things — the
 * event log itself, and the per-event-type thresholds that mark an event as
 * breaching when it is created.
 *
 * Most of the cases below are about **querying**, because that is where the two
 * providers could most easily part company: the filters compare timestamps as
 * strings, `totalCount` counts matches rather than the page, and a
 * non-breaching event stores nothing rather than `false`. Each of those is a
 * place where a SQL translation could look right and answer differently.
 */

import { describe, it, expect } from 'vitest';
import type { CreateEventInput, EventObjectService, RequestContext } from '@altius/spi';

export type EventObjectFactory = () => EventObjectService | Promise<EventObjectService>;

function event(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    eventType: 'admission',
    caseId: 'case-1',
    startTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

export function registerEventObjectTests(providerName: string, factory: EventObjectFactory): void {
  describe(`[${providerName}] SPI Conformance: EventObjectService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_evt_${label}_${counter++}`, actorId: 'u1' });

    describe('recording events', () => {
      it('creates an event with defaults for the optional parts', async () => {
        const svc = await factory();
        const ctx = ctxFor('create');
        const e = await svc.create(ctx, event());
        expect(e.eventType).toBe('admission');
        expect(e.caseId).toBe('case-1');
        expect(e.startTime).toBe('2026-08-20T09:00:00.000Z');
        expect(e.badges).toEqual([]);
        expect(e.attributes).toEqual({});
        expect(e.tenantId).toBe(ctx.tenantId);
        expect(e.createdAt).toBeTruthy();
        // Instantaneous: no end, so no duration and nothing to breach.
        expect(e.endTime).toBeUndefined();
        expect(e.durationMs).toBeUndefined();
        expect(e.thresholdBreached).toBeUndefined();
      });

      it('computes a duration from the time range', async () => {
        const svc = await factory();
        const ctx = ctxFor('duration');
        const e = await svc.create(ctx, event({
          startTime: '2026-08-20T09:00:00.000Z',
          endTime: '2026-08-20T09:30:00.000Z',
        }));
        expect(e.durationMs).toBe(30 * 60 * 1000);
      });

      it('round-trips badges and attributes', async () => {
        const svc = await factory();
        const ctx = ctxFor('payload');
        const e = await svc.create(ctx, event({
          badges: ['urgent', 'reviewed'],
          attributes: { ward: 'Cardiology', bed: 3, flagged: false },
          objectId: 'p1', objectType: 'Patient', actorId: 'nurse-7',
        }));
        const found = await svc.get(ctx, e.id);
        expect(found!.badges).toEqual(['urgent', 'reviewed']);
        expect(found!.attributes).toEqual({ ward: 'Cardiology', bed: 3, flagged: false });
        expect(found!.objectId).toBe('p1');
        expect(found!.objectType).toBe('Patient');
        expect(found!.actorId).toBe('nurse-7');
      });

      it('returns null for an unknown event id', async () => {
        const svc = await factory();
        expect(await svc.get(ctxFor('missing'), 'no-such-event')).toBeNull();
      });

      it('updates an event and recomputes its duration', async () => {
        const svc = await factory();
        const ctx = ctxFor('update');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        const updated = await svc.update(ctx, e.id, { endTime: '2026-08-20T10:00:00.000Z' });
        expect(updated.durationMs).toBe(60 * 60 * 1000);
        // Unspecified fields hold.
        expect(updated.eventType).toBe('admission');
        expect(updated.caseId).toBe('case-1');
      });

      it('reports a missing event on update', async () => {
        const svc = await factory();
        await expect(svc.update(ctxFor('update_gone'), 'no-such-event', { caseId: 'x' }))
          .rejects.toThrow(/not found/i);
      });

      it('deletes an event', async () => {
        const svc = await factory();
        const ctx = ctxFor('delete');
        const e = await svc.create(ctx, event());
        await svc.delete(ctx, e.id);
        expect(await svc.get(ctx, e.id)).toBeNull();
        expect((await svc.list(ctx)).totalCount).toBe(0);
      });

      it('keeps events in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const e = await svc.create(a, event());
        expect(await svc.get(b, e.id)).toBeNull();
        expect((await svc.list(b)).totalCount).toBe(0);
      });
    });

    describe('thresholds', () => {
      it('marks an event that breaches an above-threshold', async () => {
        const svc = await factory();
        const ctx = ctxFor('breach_above');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 20 * 60 * 1000, 'above');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        expect(e.thresholdBreached).toBe(true);
        expect(e.thresholdDetails).toEqual({
          metric: 'durationMs',
          value: 30 * 60 * 1000,
          threshold: 20 * 60 * 1000,
          direction: 'above',
        });
      });

      it('marks an event that breaches a below-threshold', async () => {
        const svc = await factory();
        const ctx = ctxFor('breach_below');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 20 * 60 * 1000, 'below');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:10:00.000Z' }));
        expect(e.thresholdBreached).toBe(true);
        expect(e.thresholdDetails!.direction).toBe('below');
      });

      it('leaves an event inside the threshold unmarked', async () => {
        const svc = await factory();
        const ctx = ctxFor('no_breach');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 60 * 60 * 1000, 'above');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        expect(e.thresholdBreached).toBeUndefined();
        expect(e.thresholdDetails).toBeUndefined();
      });

      it('does not breach on a duration exactly equal to the threshold', async () => {
        // Strict on both sides. Pinned because a provider that used >= would be
        // right everywhere except the boundary, and the boundary is where a
        // threshold is argued about.
        const svc = await factory();
        const ctx = ctxFor('breach_exact');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 30 * 60 * 1000, 'above');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        expect(e.thresholdBreached).toBeUndefined();
      });

      it('never breaches an event with no duration', async () => {
        // An instantaneous event has nothing to compare, and no threshold can
        // conjure one — including a below-threshold, which would otherwise be
        // tempting to read as "zero is below N".
        const svc = await factory();
        const ctx = ctxFor('breach_nodur');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 60 * 60 * 1000, 'below');
        expect((await svc.create(ctx, event())).thresholdBreached).toBeUndefined();
      });

      it('applies a threshold only to its own event type', async () => {
        const svc = await factory();
        const ctx = ctxFor('breach_type');
        await svc.setThreshold(ctx, 'surgery', 'durationMs', 1, 'above');
        expect((await svc.create(ctx, event({ eventType: 'admission', endTime: '2026-08-20T09:30:00.000Z' }))).thresholdBreached)
          .toBeUndefined();
        expect((await svc.create(ctx, event({ eventType: 'surgery', endTime: '2026-08-20T09:30:00.000Z' }))).thresholdBreached)
          .toBe(true);
      });

      it('replaces a threshold rather than accumulating', async () => {
        const svc = await factory();
        const ctx = ctxFor('breach_replace');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 1, 'above');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 60 * 60 * 1000, 'above');
        expect((await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }))).thresholdBreached)
          .toBeUndefined();
      });

      it('does not re-evaluate the threshold on update', async () => {
        // PINNED AS-IS, NOT ENDORSED. The flag is decided at creation and never
        // revisited, in both providers: an event edited to a breaching duration
        // keeps its unbreached flag, and an event created before a threshold
        // existed never gains one. Changing this would silently re-flag
        // historical events.
        const svc = await factory();
        const ctx = ctxFor('breach_update');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 20 * 60 * 1000, 'above');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:10:00.000Z' }));
        expect(e.thresholdBreached).toBeUndefined();

        const updated = await svc.update(ctx, e.id, { endTime: '2026-08-20T11:00:00.000Z' });
        expect(updated.durationMs).toBe(2 * 60 * 60 * 1000);
        // Well past the threshold, and still unflagged.
        expect(updated.thresholdBreached).toBeUndefined();
      });

      it('does not apply a threshold set after the event was created', async () => {
        const svc = await factory();
        const ctx = ctxFor('breach_late');
        const e = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        await svc.setThreshold(ctx, 'admission', 'durationMs', 1, 'above');
        expect((await svc.get(ctx, e.id))!.thresholdBreached).toBeUndefined();
      });
    });

    describe('querying the log', () => {
      /** Four events across two cases, two types and two actors. */
      async function seeded(label: string) {
        const svc = await factory();
        const ctx = ctxFor(label);
        const a = await svc.create(ctx, event({
          caseId: 'case-1', eventType: 'admission', startTime: '2026-08-20T09:00:00.000Z',
          actorId: 'nurse-7', badges: ['urgent'], objectId: 'p1', objectType: 'Patient',
        }));
        const b = await svc.create(ctx, event({
          caseId: 'case-1', eventType: 'surgery', startTime: '2026-08-20T11:00:00.000Z',
          actorId: 'surgeon-2', badges: ['reviewed'],
        }));
        const c = await svc.create(ctx, event({
          caseId: 'case-2', eventType: 'admission', startTime: '2026-08-20T10:00:00.000Z',
          actorId: 'nurse-7', badges: ['urgent', 'reviewed'],
        }));
        const d = await svc.create(ctx, event({
          caseId: 'case-2', eventType: 'discharge', startTime: '2026-08-20T13:00:00.000Z',
        }));
        return { svc, ctx, a, b, c, d };
      }

      it('returns events oldest first', async () => {
        // An event log reads forwards in time, which is the opposite of every
        // other list in this suite — worth pinning for that reason alone.
        const { svc, ctx, a, b, c, d } = await seeded('order');
        expect((await svc.list(ctx)).events.map(e => e.id)).toEqual([a.id, c.id, b.id, d.id]);
      });

      it('filters by case, type, actor and object', async () => {
        const { svc, ctx, a } = await seeded('filters');
        expect((await svc.list(ctx, { caseId: 'case-1' })).totalCount).toBe(2);
        expect((await svc.list(ctx, { eventType: 'admission' })).totalCount).toBe(2);
        expect((await svc.list(ctx, { actorId: 'nurse-7' })).totalCount).toBe(2);
        expect((await svc.list(ctx, { objectId: 'p1' })).events.map(e => e.id)).toEqual([a.id]);
        expect((await svc.list(ctx, { objectType: 'Patient' })).events.map(e => e.id)).toEqual([a.id]);
        expect((await svc.list(ctx, { caseId: 'nothing' })).totalCount).toBe(0);
      });

      it('combines filters conjunctively', async () => {
        const { svc, ctx, a } = await seeded('filters_and');
        expect((await svc.list(ctx, { caseId: 'case-1', eventType: 'admission' })).events.map(e => e.id))
          .toEqual([a.id]);
        expect((await svc.list(ctx, { caseId: 'case-1', eventType: 'discharge' })).totalCount).toBe(0);
      });

      it('filters by a start-time range, inclusive at both ends', async () => {
        const { svc, ctx, a, b, c } = await seeded('range');
        const within = await svc.list(ctx, {
          startTimeFrom: '2026-08-20T09:00:00.000Z',
          startTimeTo: '2026-08-20T11:00:00.000Z',
        });
        expect(within.events.map(e => e.id)).toEqual([a.id, c.id, b.id]);
      });

      it('matches any of the badges asked for, not all', async () => {
        const { svc, ctx, a, b, c } = await seeded('badges');
        expect((await svc.list(ctx, { badges: ['urgent'] })).events.map(e => e.id)).toEqual([a.id, c.id]);
        expect((await svc.list(ctx, { badges: ['reviewed'] })).events.map(e => e.id)).toEqual([c.id, b.id]);
        // Two badges is a union, so it returns everything carrying either.
        expect((await svc.list(ctx, { badges: ['urgent', 'reviewed'] })).totalCount).toBe(3);
        expect((await svc.list(ctx, { badges: ['nothing'] })).totalCount).toBe(0);
      });

      it('filters by whether an event breached', async () => {
        // The false case is the interesting one: a non-breaching event records
        // nothing rather than `false`, so asking for the unbreached has to mean
        // "not true" rather than "equals false".
        const svc = await factory();
        const ctx = ctxFor('breach_filter');
        await svc.setThreshold(ctx, 'admission', 'durationMs', 20 * 60 * 1000, 'above');
        const breaching = await svc.create(ctx, event({ endTime: '2026-08-20T09:30:00.000Z' }));
        const clean = await svc.create(ctx, event({ startTime: '2026-08-20T10:00:00.000Z' }));

        expect((await svc.list(ctx, { thresholdBreached: true })).events.map(e => e.id)).toEqual([breaching.id]);
        expect((await svc.list(ctx, { thresholdBreached: false })).events.map(e => e.id)).toEqual([clean.id]);
        expect((await svc.list(ctx)).totalCount).toBe(2);
      });

      it('counts matches rather than the page when paging', async () => {
        // `totalCount` is computed before offset and limit are applied, so a
        // caller can page without losing the size of the result set.
        const { svc, ctx, a, c } = await seeded('paging');
        const firstPage = await svc.list(ctx, { limit: 2 });
        expect(firstPage.events.map(e => e.id)).toEqual([a.id, c.id]);
        expect(firstPage.totalCount).toBe(4);

        const secondPage = await svc.list(ctx, { limit: 2, offset: 2 });
        expect(secondPage.events).toHaveLength(2);
        expect(secondPage.totalCount).toBe(4);

        // And paging applies to the filtered set, not the whole log.
        const filtered = await svc.list(ctx, { eventType: 'admission', limit: 1 });
        expect(filtered.events).toHaveLength(1);
        expect(filtered.totalCount).toBe(2);
      });

      it('returns an empty result rather than throwing for a tenant with no events', async () => {
        const svc = await factory();
        expect(await svc.list(ctxFor('empty'))).toEqual({ events: [], totalCount: 0 });
      });
    });

    describe('the timeline', () => {
      it('returns events in a window, oldest first', async () => {
        const svc = await factory();
        const ctx = ctxFor('timeline');
        const early = await svc.create(ctx, event({ startTime: '2026-08-20T08:00:00.000Z' }));
        const mid = await svc.create(ctx, event({ startTime: '2026-08-20T12:00:00.000Z' }));
        await svc.create(ctx, event({ startTime: '2026-08-21T08:00:00.000Z' }));

        const window = await svc.getTimeline(ctx, '2026-08-20T00:00:00.000Z', '2026-08-20T23:59:59.999Z');
        expect(window.map(e => e.id)).toEqual([early.id, mid.id]);
      });

      it('narrows the timeline to one case', async () => {
        const svc = await factory();
        const ctx = ctxFor('timeline_case');
        const mine = await svc.create(ctx, event({ caseId: 'case-1', startTime: '2026-08-20T09:00:00.000Z' }));
        await svc.create(ctx, event({ caseId: 'case-2', startTime: '2026-08-20T10:00:00.000Z' }));
        const window = await svc.getTimeline(ctx, '2026-08-20T00:00:00.000Z', '2026-08-20T23:59:59.999Z', 'case-1');
        expect(window.map(e => e.id)).toEqual([mine.id]);
      });

      it('returns nothing for a window with no events', async () => {
        const svc = await factory();
        const ctx = ctxFor('timeline_empty');
        await svc.create(ctx, event({ startTime: '2026-08-20T09:00:00.000Z' }));
        expect(await svc.getTimeline(ctx, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toEqual([]);
      });
    });
  });
}
