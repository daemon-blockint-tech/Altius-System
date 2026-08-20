/**
 * In-memory event objects and process mining.
 */

import { randomUUID } from 'node:crypto';
import { evaluateEventThreshold } from '@altius/spi';
import type {
  EventObjectService,
  ProcessMiningService,
  EventObject,
  CreateEventInput,
  EventQuery,
  ProcessModel,
  ProcessNode,
  ProcessEdge,
  ProcessVariant,
  ConformanceResult,
  RequestContext,
} from '@altius/spi';

// ===========================================================================
// Event objects
// ===========================================================================

interface ThresholdConfig {
  metric: string;
  threshold: number;
  direction: 'above' | 'below';
}

export class InMemoryEventObjectService implements EventObjectService {
  private readonly events = new Map<string, Map<string, EventObject>>();
  private readonly thresholds = new Map<string, Map<string, ThresholdConfig>>();

  async create(ctx: RequestContext, input: CreateEventInput): Promise<EventObject> {
    const id = randomUUID();
    const now = new Date().toISOString();
    let durationMs: number | undefined;
    if (input.endTime) {
      durationMs = new Date(input.endTime).getTime() - new Date(input.startTime).getTime();
    }

    const event: EventObject = {
      id, tenantId: ctx.tenantId,
      eventType: input.eventType, caseId: input.caseId,
      objectId: input.objectId, objectType: input.objectType,
      startTime: input.startTime, endTime: input.endTime,
      durationMs,
      actorId: input.actorId,
      badges: input.badges ?? [],
      attributes: input.attributes ?? {},
      createdAt: now,
    };

    // Whether this breaches is shared with the Postgres provider: the answer is
    // written onto the event, so two providers disagreeing would store
    // different flags for the same event and the same threshold.
    const breach = evaluateEventThreshold(this.thresholds.get(ctx.tenantId)?.get(input.eventType), durationMs);
    if (breach) {
      event.thresholdBreached = true;
      event.thresholdDetails = breach;
    }

    this.getMap(ctx.tenantId).set(id, event);
    return event;
  }

  async get(ctx: RequestContext, eventId: string): Promise<EventObject | null> {
    return this.events.get(ctx.tenantId)?.get(eventId) ?? null;
  }

  async list(ctx: RequestContext, query?: EventQuery): Promise<{ events: EventObject[]; totalCount: number }> {
    const tenantEvents = this.events.get(ctx.tenantId);
    if (!tenantEvents) return { events: [], totalCount: 0 };
    let results = Array.from(tenantEvents.values());
    if (query?.caseId) results = results.filter(e => e.caseId === query.caseId);
    if (query?.eventType) results = results.filter(e => e.eventType === query.eventType);
    if (query?.objectId) results = results.filter(e => e.objectId === query.objectId);
    if (query?.objectType) results = results.filter(e => e.objectType === query.objectType);
    if (query?.actorId) results = results.filter(e => e.actorId === query.actorId);
    if (query?.thresholdBreached !== undefined) {
      // `=== query.thresholdBreached` would be wrong for the false case: a
      // non-breaching event carries no flag at all rather than `false`, so
      // `undefined === false` is false and the filter could only ever return an
      // empty list. Comparing truthiness instead makes `thresholdBreached:
      // false` mean "did not breach", which is the only thing it could have
      // meant. Narrowed in the Postgres provider the same way (`IS NOT TRUE`),
      // so the two cannot disagree.
      const want = query.thresholdBreached;
      results = results.filter(e => (e.thresholdBreached === true) === want);
    }
    if (query?.startTimeFrom) results = results.filter(e => e.startTime >= query.startTimeFrom!);
    if (query?.startTimeTo) results = results.filter(e => e.startTime <= query.startTimeTo!);
    if (query?.badges?.length) results = results.filter(e => query.badges!.some(b => e.badges.includes(b)));
    const totalCount = results.length;
    results.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);
    return { events: results, totalCount };
  }

  async update(ctx: RequestContext, eventId: string, updates: Partial<CreateEventInput>): Promise<EventObject> {
    const event = this.events.get(ctx.tenantId)?.get(eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);
    const updated: EventObject = {
      ...event,
      eventType: updates.eventType ?? event.eventType,
      caseId: updates.caseId ?? event.caseId,
      objectId: updates.objectId ?? event.objectId,
      objectType: updates.objectType ?? event.objectType,
      startTime: updates.startTime ?? event.startTime,
      endTime: updates.endTime ?? event.endTime,
      actorId: updates.actorId ?? event.actorId,
      badges: updates.badges ?? event.badges,
      attributes: updates.attributes ?? event.attributes,
    };
    if (updated.endTime) {
      updated.durationMs = new Date(updated.endTime).getTime() - new Date(updated.startTime).getTime();
    }
    this.getMap(ctx.tenantId).set(eventId, updated);
    return updated;
  }

  async delete(ctx: RequestContext, eventId: string): Promise<void> {
    this.events.get(ctx.tenantId)?.delete(eventId);
  }

  async setThreshold(ctx: RequestContext, eventType: string, metric: string, threshold: number, direction: 'above' | 'below'): Promise<void> {
    let m = this.thresholds.get(ctx.tenantId);
    if (!m) { m = new Map(); this.thresholds.set(ctx.tenantId, m); }
    m.set(eventType, { metric, threshold, direction });
  }

  async getTimeline(ctx: RequestContext, startTime: string, endTime: string, caseId?: string): Promise<EventObject[]> {
    const { events } = await this.list(ctx, {
      startTimeFrom: startTime,
      startTimeTo: endTime,
      caseId,
      limit: 10000,
    });
    return events;
  }

  private getMap(tenantId: string): Map<string, EventObject> {
    let m = this.events.get(tenantId);
    if (!m) { m = new Map(); this.events.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Process mining
// ===========================================================================

export class InMemoryProcessMiningService implements ProcessMiningService {
  async discover(_ctx: RequestContext, eventLog: EventObject[]): Promise<ProcessModel> {
    const caseMap = new Map<string, EventObject[]>();
    for (const e of eventLog) {
      const arr = caseMap.get(e.caseId) ?? [];
      arr.push(e);
      caseMap.set(e.caseId, arr);
    }

    // Build nodes
    const nodeMap = new Map<string, { durations: number[]; frequency: number }>();
    for (const e of eventLog) {
      const node = nodeMap.get(e.eventType) ?? { durations: [], frequency: 0 };
      node.frequency++;
      if (e.durationMs !== undefined) node.durations.push(e.durationMs);
      nodeMap.set(e.eventType, node);
    }

    const nodes: ProcessNode[] = Array.from(nodeMap.entries()).map(([name, data]) => ({
      activityName: name,
      frequency: data.frequency,
      avgDurationMs: data.durations.length > 0 ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length : 0,
      minDurationMs: data.durations.length > 0 ? Math.min(...data.durations) : 0,
      maxDurationMs: data.durations.length > 0 ? Math.max(...data.durations) : 0,
    }));

    // Build edges (transitions)
    const edgeMap = new Map<string, { frequency: number; waitings: number[] }>();
    const startActivities = new Set<string>();
    const endActivities = new Set<string>();

    for (const [caseId, events] of caseMap) {
      events.sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (events.length > 0) {
        startActivities.add(events[0]!.eventType);
        endActivities.add(events[events.length - 1]!.eventType);
      }
      for (let i = 0; i < events.length - 1; i++) {
        const from = events[i]!;
        const to = events[i + 1]!;
        const key = `${from.eventType}->${to.eventType}`;
        const edge = edgeMap.get(key) ?? { frequency: 0, waitings: [] };
        edge.frequency++;
        const waiting = new Date(to.startTime).getTime() - new Date(from.startTime).getTime();
        edge.waitings.push(waiting);
        edgeMap.set(key, edge);
      }
      void caseId;
    }

    const edges: ProcessEdge[] = Array.from(edgeMap.entries()).map(([key, data]) => {
      const [from, to] = key.split('->');
      return {
        fromActivity: from!,
        toActivity: to!,
        frequency: data.frequency,
        avgWaitingMs: data.waitings.reduce((a, b) => a + b, 0) / data.waitings.length,
      };
    });

    return {
      nodes, edges,
      totalCases: caseMap.size,
      totalEvents: eventLog.length,
      startActivities: Array.from(startActivities),
      endActivities: Array.from(endActivities),
      discoveredAt: new Date().toISOString(),
    };
  }

  async discoverVariants(_ctx: RequestContext, eventLog: EventObject[], limit = 20): Promise<ProcessVariant[]> {
    const caseMap = new Map<string, EventObject[]>();
    for (const e of eventLog) {
      const arr = caseMap.get(e.caseId) ?? [];
      arr.push(e);
      caseMap.set(e.caseId, arr);
    }

    const variantMap = new Map<string, { caseCount: number; durations: number[] }>();
    for (const events of caseMap.values()) {
      events.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const sequence = events.map(e => e.eventType).join('→');
      const variant = variantMap.get(sequence) ?? { caseCount: 0, durations: [] };
      variant.caseCount++;
      const totalDuration = events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
      variant.durations.push(totalDuration);
      variantMap.set(sequence, variant);
    }

    const totalCases = caseMap.size;
    const variants: ProcessVariant[] = Array.from(variantMap.entries())
      .map(([seq, data]) => ({
        activities: seq.split('→'),
        caseCount: data.caseCount,
        percentage: (data.caseCount / totalCases) * 100,
        avgDurationMs: data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
      }))
      .sort((a, b) => b.caseCount - a.caseCount)
      .slice(0, limit);

    return variants;
  }

  async checkConformance(_ctx: RequestContext, eventLog: EventObject[], expectedProcess: string[]): Promise<ConformanceResult> {
    const caseMap = new Map<string, EventObject[]>();
    for (const e of eventLog) {
      const arr = caseMap.get(e.caseId) ?? [];
      arr.push(e);
      caseMap.set(e.caseId, arr);
    }

    let conformingCases = 0;
    const deviations: ConformanceResult['deviations'] = [];

    for (const [caseId, events] of caseMap) {
      events.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const actualSequence = events.map(e => e.eventType);
      let caseConforms = true;

      // Check for missing and unexpected activities
      const expectedSet = new Set(expectedProcess);
      const actualSet = new Set(actualSequence);

      for (const expected of expectedProcess) {
        if (!actualSet.has(expected)) {
          deviations.push({ caseId, expectedActivity: expected, actualActivity: '(missing)', deviationType: 'missing' });
          caseConforms = false;
        }
      }

      for (const actual of actualSequence) {
        if (!expectedSet.has(actual)) {
          deviations.push({ caseId, actualActivity: actual, deviationType: 'unexpected' });
          caseConforms = false;
        }
      }

      // Check order
      let expectedIdx = 0;
      for (const actual of actualSequence) {
        if (expectedIdx < expectedProcess.length && actual === expectedProcess[expectedIdx]) {
          expectedIdx++;
        }
      }
      if (expectedIdx < expectedProcess.length && caseConforms) {
        // Activities exist but in wrong order
        deviations.push({ caseId, actualActivity: actualSequence.join('→'), deviationType: 'order' });
        caseConforms = false;
      }

      if (caseConforms) conformingCases++;
    }

    const totalCases = caseMap.size;
    const deviatingCases = totalCases - conformingCases;
    const fitness = totalCases > 0 ? conformingCases / totalCases : 0;

    return { totalCases, conformingCases, deviatingCases, fitness, deviations };
  }

  async getCaseStatistics(_ctx: RequestContext, caseId: string, eventLog: EventObject[]): Promise<{
    caseId: string;
    eventCount: number;
    totalDurationMs: number;
    activities: string[];
    startTime: string;
    endTime: string;
  }> {
    const caseEvents = eventLog.filter(e => e.caseId === caseId).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (caseEvents.length === 0) throw new Error(`Case not found: ${caseId}`);
    const totalDurationMs = caseEvents.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
    return {
      caseId,
      eventCount: caseEvents.length,
      totalDurationMs,
      activities: caseEvents.map(e => e.eventType),
      startTime: caseEvents[0]!.startTime,
      endTime: caseEvents[caseEvents.length - 1]!.endTime ?? caseEvents[caseEvents.length - 1]!.startTime,
    };
  }
}
