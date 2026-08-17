/**
 * Tests for event objects and process mining.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventObjectService, InMemoryProcessMiningService } from '../in-memory-process-mining.js';
import type { RequestContext, EventObject } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

function makeEvent(caseId: string, type: string, start: string, end?: string): EventObject {
  return {
    id: `${caseId}-${type}`,
    tenantId: 't1',
    eventType: type,
    caseId,
    startTime: start,
    endTime: end,
    durationMs: end ? new Date(end).getTime() - new Date(start).getTime() : undefined,
    badges: [],
    attributes: {},
    createdAt: new Date().toISOString(),
  };
}

describe('InMemoryEventObjectService', () => {
  let service: InMemoryEventObjectService;

  beforeEach(() => {
    service = new InMemoryEventObjectService();
  });

  it('creates an event with duration', async () => {
    const event = await service.create(CTX, {
      eventType: 'admission',
      caseId: 'c1',
      startTime: '2026-01-01T10:00:00Z',
      endTime: '2026-01-01T12:00:00Z',
    });
    expect(event.id).toBeTruthy();
    expect(event.durationMs).toBe(2 * 60 * 60 * 1000);
  });

  it('creates an instantaneous event', async () => {
    const event = await service.create(CTX, {
      eventType: 'note',
      caseId: 'c1',
      startTime: '2026-01-01T10:00:00Z',
    });
    expect(event.durationMs).toBeUndefined();
  });

  it('gets an event by ID', async () => {
    const event = await service.create(CTX, {
      eventType: 'test', caseId: 'c1', startTime: '2026-01-01T10:00:00Z',
    });
    const fetched = await service.get(CTX, event.id);
    expect(fetched?.eventType).toBe('test');
  });

  it('lists events with filters', async () => {
    await service.create(CTX, { eventType: 'a', caseId: 'c1', startTime: '2026-01-01T10:00:00Z' });
    await service.create(CTX, { eventType: 'b', caseId: 'c2', startTime: '2026-01-02T10:00:00Z' });
    const all = await service.list(CTX);
    expect(all.totalCount).toBe(2);
    const filtered = await service.list(CTX, { caseId: 'c1' });
    expect(filtered.totalCount).toBe(1);
  });

  it('filters by time range', async () => {
    await service.create(CTX, { eventType: 'a', caseId: 'c1', startTime: '2026-01-01T10:00:00Z' });
    await service.create(CTX, { eventType: 'b', caseId: 'c2', startTime: '2026-02-01T10:00:00Z' });
    const filtered = await service.list(CTX, {
      startTimeFrom: '2026-01-15T00:00:00Z',
      startTimeTo: '2026-03-01T00:00:00Z',
    });
    expect(filtered.totalCount).toBe(1);
  });

  it('updates an event', async () => {
    const event = await service.create(CTX, {
      eventType: 'test', caseId: 'c1', startTime: '2026-01-01T10:00:00Z',
    });
    const updated = await service.update(CTX, event.id, { eventType: 'updated' });
    expect(updated.eventType).toBe('updated');
  });

  it('deletes an event', async () => {
    const event = await service.create(CTX, {
      eventType: 'test', caseId: 'c1', startTime: '2026-01-01T10:00:00Z',
    });
    await service.delete(CTX, event.id);
    const fetched = await service.get(CTX, event.id);
    expect(fetched).toBeNull();
  });

  it('sets thresholds and marks breaches', async () => {
    await service.setThreshold(CTX, 'surgery', 'duration', 60 * 60 * 1000, 'above');
    const event = await service.create(CTX, {
      eventType: 'surgery', caseId: 'c1',
      startTime: '2026-01-01T10:00:00Z',
      endTime: '2026-01-01T12:00:00Z',
    });
    expect(event.thresholdBreached).toBe(true);
    expect(event.thresholdDetails?.value).toBe(2 * 60 * 60 * 1000);
  });

  it('gets timeline for a time range', async () => {
    await service.create(CTX, { eventType: 'a', caseId: 'c1', startTime: '2026-01-01T10:00:00Z' });
    await service.create(CTX, { eventType: 'b', caseId: 'c1', startTime: '2026-01-03T10:00:00Z' });
    const timeline = await service.getTimeline(CTX, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    expect(timeline).toHaveLength(1);
  });

  it('isolates tenants', async () => {
    await service.create(CTX, { eventType: 'a', caseId: 'c1', startTime: '2026-01-01T10:00:00Z' });
    const t2 = await service.list({ tenantId: 't2' } as RequestContext);
    expect(t2.totalCount).toBe(0);
  });
});

describe('InMemoryProcessMiningService', () => {
  let service: InMemoryProcessMiningService;
  let eventLog: EventObject[];

  beforeEach(() => {
    service = new InMemoryProcessMiningService();
    eventLog = [
      makeEvent('c1', 'admission', '2026-01-01T08:00:00Z', '2026-01-01T09:00:00Z'),
      makeEvent('c1', 'triage', '2026-01-01T09:00:00Z', '2026-01-01T09:30:00Z'),
      makeEvent('c1', 'treatment', '2026-01-01T09:30:00Z', '2026-01-01T11:00:00Z'),
      makeEvent('c1', 'discharge', '2026-01-01T11:00:00Z', '2026-01-01T11:30:00Z'),
      makeEvent('c2', 'admission', '2026-01-02T08:00:00Z', '2026-01-02T08:30:00Z'),
      makeEvent('c2', 'triage', '2026-01-02T08:30:00Z', '2026-01-02T09:00:00Z'),
      makeEvent('c2', 'discharge', '2026-01-02T09:00:00Z', '2026-01-02T09:30:00Z'),
    ];
  });

  it('discovers a process model', async () => {
    const model = await service.discover(CTX, eventLog);
    expect(model.totalCases).toBe(2);
    expect(model.totalEvents).toBe(7);
    expect(model.nodes.length).toBe(4); // admission, triage, treatment, discharge
    expect(model.edges.length).toBeGreaterThan(0);
    expect(model.startActivities).toContain('admission');
    expect(model.endActivities).toContain('discharge');
  });

  it('computes node statistics', async () => {
    const model = await service.discover(CTX, eventLog);
    const admission = model.nodes.find(n => n.activityName === 'admission');
    expect(admission).toBeTruthy();
    expect(admission!.frequency).toBe(2);
    expect(admission!.avgDurationMs).toBeGreaterThan(0);
  });

  it('discovers variants', async () => {
    const variants = await service.discoverVariants(CTX, eventLog);
    expect(variants.length).toBe(2);
    // The variant with treatment should have 1 case
    const treatmentVariant = variants.find(v => v.activities.includes('treatment'));
    expect(treatmentVariant?.caseCount).toBe(1);
    // The shorter variant should have 1 case
    const shortVariant = variants.find(v => !v.activities.includes('treatment'));
    expect(shortVariant?.caseCount).toBe(1);
  });

  it('checks conformance against expected process', async () => {
    const result = await service.checkConformance(CTX, eventLog, ['admission', 'triage', 'treatment', 'discharge']);
    expect(result.totalCases).toBe(2);
    // c2 is missing 'treatment'
    expect(result.deviatingCases).toBe(1);
    expect(result.conformingCases).toBe(1);
    expect(result.fitness).toBe(0.5);
    expect(result.deviations.length).toBeGreaterThan(0);
  });

  it('reports full conformance when all cases match', async () => {
    const conformingLog = [
      makeEvent('c1', 'a', '2026-01-01T08:00:00Z', '2026-01-01T09:00:00Z'),
      makeEvent('c1', 'b', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z'),
      makeEvent('c2', 'a', '2026-01-02T08:00:00Z', '2026-01-02T09:00:00Z'),
      makeEvent('c2', 'b', '2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z'),
    ];
    const result = await service.checkConformance(CTX, conformingLog, ['a', 'b']);
    expect(result.fitness).toBe(1);
    expect(result.deviations).toHaveLength(0);
  });

  it('gets case statistics', async () => {
    const stats = await service.getCaseStatistics(CTX, 'c1', eventLog);
    expect(stats.caseId).toBe('c1');
    expect(stats.eventCount).toBe(4);
    expect(stats.activities).toEqual(['admission', 'triage', 'treatment', 'discharge']);
    expect(stats.totalDurationMs).toBeGreaterThan(0);
  });

  it('handles empty event log', async () => {
    const model = await service.discover(CTX, []);
    expect(model.totalCases).toBe(0);
    expect(model.totalEvents).toBe(0);
    expect(model.nodes).toHaveLength(0);
  });
});
