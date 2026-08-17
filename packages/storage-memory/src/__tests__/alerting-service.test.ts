/**
 * Tests for the in-memory alerting service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAlertingService } from '../in-memory-alerting-service.js';
import { InMemoryNotificationStore } from '../in-memory-notification-store.js';
import { pointSatisfies, findConsecutiveRun } from '@altius/spi';
import type { RequestContext, TimeSeriesPoint } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1' };

function makePoint(value: number, timestamp: string, tags?: Record<string, string>): TimeSeriesPoint {
  return { value, timestamp, tags };
}

describe('InMemoryAlertingService', () => {
  let service: InMemoryAlertingService;
  let notificationStore: InMemoryNotificationStore;

  beforeEach(() => {
    notificationStore = new InMemoryNotificationStore();
    service = new InMemoryAlertingService({ notificationStore, notifyUserId: 'u1' });
  });

  it('creates and retrieves a rule', async () => {
    const rule = await service.createRule(CTX, {
      name: 'High temp',
      objectType: 'Sensor',
      objectId: 's1',
      property: 'temperature',
      operator: 'gt',
      threshold: 100,
    });
    expect(rule.id).toBeTruthy();
    expect(rule.enabled).toBe(true);
    const fetched = await service.getRule(CTX, rule.id);
    expect(fetched?.name).toBe('High temp');
  });

  it('lists rules filtered by object', async () => {
    await service.createRule(CTX, { name: 'R1', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'gt', threshold: 100 });
    await service.createRule(CTX, { name: 'R2', objectType: 'Sensor', objectId: 's2', property: 'temp', operator: 'gt', threshold: 100 });
    const s1Rules = await service.listRules(CTX, 'Sensor', 's1');
    expect(s1Rules).toHaveLength(1);
    expect(s1Rules[0]!.name).toBe('R1');
  });

  it('updates a rule', async () => {
    const rule = await service.createRule(CTX, { name: 'R1', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'gt', threshold: 100 });
    const updated = await service.updateRule(CTX, rule.id, { threshold: 150, enabled: false });
    expect(updated?.threshold).toBe(150);
    expect(updated?.enabled).toBe(false);
  });

  it('deletes a rule', async () => {
    const rule = await service.createRule(CTX, { name: 'R1', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'gt', threshold: 100 });
    await service.deleteRule(CTX, rule.id);
    const fetched = await service.getRule(CTX, rule.id);
    expect(fetched).toBeNull();
  });

  it('raises an alert when threshold is crossed', async () => {
    const rule = await service.createRule(CTX, {
      name: 'High temp',
      objectType: 'Sensor',
      objectId: 's1',
      property: 'temperature',
      operator: 'gt',
      threshold: 100,
    });
    const points = [makePoint(95, '2026-01-01T00:00:00Z'), makePoint(105, '2026-01-01T00:01:00Z')];
    const result = await service.evaluateRule(CTX, rule.id, points);
    expect(result.triggered).toBe(true);
    expect(result.alert).toBeDefined();
    expect(result.alert!.triggeredValue).toBe(105);
    expect(result.alert!.status).toBe('active');
  });

  it('does not raise alert when threshold not crossed', async () => {
    const rule = await service.createRule(CTX, {
      name: 'High temp', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100,
    });
    const points = [makePoint(95, '2026-01-01T00:00:00Z'), makePoint(98, '2026-01-01T00:01:00Z')];
    const result = await service.evaluateRule(CTX, rule.id, points);
    expect(result.triggered).toBe(false);
  });

  it('requires consecutive points', async () => {
    const rule = await service.createRule(CTX, {
      name: 'Sustained high', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100, consecutivePoints: 3,
    });
    // Only 2 consecutive — should not trigger
    const points1 = [
      makePoint(105, '2026-01-01T00:00:00Z'),
      makePoint(108, '2026-01-01T00:01:00Z'),
      makePoint(95, '2026-01-01T00:02:00Z'),
    ];
    const result1 = await service.evaluateRule(CTX, rule.id, points1);
    expect(result1.triggered).toBe(false);

    // 3 consecutive — should trigger
    const points2 = [
      makePoint(105, '2026-01-01T00:00:00Z'),
      makePoint(108, '2026-01-01T00:01:00Z'),
      makePoint(110, '2026-01-01T00:02:00Z'),
    ];
    const result2 = await service.evaluateRule(CTX, rule.id, points2);
    expect(result2.triggered).toBe(true);
  });

  it('respects minDurationSeconds', async () => {
    const rule = await service.createRule(CTX, {
      name: 'Sustained', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100, consecutivePoints: 2, minDurationSeconds: 120,
    });
    // 2 points 60s apart — duration not met
    const points1 = [
      makePoint(105, '2026-01-01T00:00:00Z'),
      makePoint(108, '2026-01-01T00:01:00Z'),
    ];
    const result1 = await service.evaluateRule(CTX, rule.id, points1);
    expect(result1.triggered).toBe(false);

    // 2 points 120s apart — duration met
    const points2 = [
      makePoint(105, '2026-01-01T00:00:00Z'),
      makePoint(108, '2026-01-01T00:02:00Z'),
    ];
    const result2 = await service.evaluateRule(CTX, rule.id, points2);
    expect(result2.triggered).toBe(true);
  });

  it('filters by tags', async () => {
    const rule = await service.createRule(CTX, {
      name: 'Tagged', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100, tagFilter: { location: 'room1' },
    });
    const points = [
      makePoint(105, '2026-01-01T00:00:00Z', { location: 'room2' }), // wrong tag
      makePoint(108, '2026-01-01T00:01:00Z', { location: 'room1' }), // matches
    ];
    const result = await service.evaluateRule(CTX, rule.id, points);
    expect(result.triggered).toBe(true);
    expect(result.alert!.triggeredValue).toBe(108);
  });

  it('dispatches a notification when alert is raised', async () => {
    const rule = await service.createRule(CTX, {
      name: 'High temp', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100,
    });
    const points = [makePoint(105, '2026-01-01T00:00:00Z')];
    const result = await service.evaluateRule(CTX, rule.id, points);
    expect(result.alert!.notificationIds).toHaveLength(1);

    const notifs = await notificationStore.list('t1', 'u1');
    expect(notifs.notifications).toHaveLength(1);
    expect(notifs.notifications[0]!.type).toBe('alert');
    expect(notifs.notifications[0]!.sourceObjectId).toBe('s1');
  });

  it('acknowledges and resolves alerts', async () => {
    const rule = await service.createRule(CTX, {
      name: 'High temp', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100,
    });
    const points = [makePoint(105, '2026-01-01T00:00:00Z')];
    const result = await service.evaluateRule(CTX, rule.id, points);
    const alertId = result.alert!.id;

    await service.acknowledgeAlert(CTX, alertId, 'user1');
    let alert = await service.getAlert(CTX, alertId);
    expect(alert?.status).toBe('acknowledged');
    expect(alert?.acknowledgedBy).toBe('user1');

    await service.resolveAlert(CTX, alertId, 'user1');
    alert = await service.getAlert(CTX, alertId);
    expect(alert?.status).toBe('resolved');
  });

  it('lists alerts by status', async () => {
    const rule = await service.createRule(CTX, {
      name: 'R', objectType: 'Sensor', objectId: 's1', property: 'temperature',
      operator: 'gt', threshold: 100,
    });
    await service.evaluateRule(CTX, rule.id, [makePoint(105, '2026-01-01T00:00:00Z')]);
    await service.evaluateRule(CTX, rule.id, [makePoint(110, '2026-01-01T00:01:00Z')]);

    const active = await service.listAlerts(CTX, { status: 'active' });
    expect(active.totalCount).toBe(2);
  });

  it('evaluateForSeries runs all matching rules', async () => {
    await service.createRule(CTX, { name: 'R1', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'gt', threshold: 100 });
    await service.createRule(CTX, { name: 'R2', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'lt', threshold: 0 });
    await service.createRule(CTX, { name: 'R3', objectType: 'Sensor', objectId: 's1', property: 'humidity', operator: 'gt', threshold: 50 });

    const points = [makePoint(105, '2026-01-01T00:00:00Z')];
    const results = await service.evaluateForSeries(CTX, 'Sensor', 's1', 'temp', points);
    expect(results).toHaveLength(2); // R1 and R2 match property 'temp', R3 doesn't
    const triggered = results.filter(r => r.triggered);
    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.alert!.ruleName).toBe('R1');
  });

  it('does not evaluate disabled rules', async () => {
    const rule = await service.createRule(CTX, {
      name: 'Disabled', objectType: 'Sensor', objectId: 's1', property: 'temp',
      operator: 'gt', threshold: 100, enabled: false,
    });
    const points = [makePoint(105, '2026-01-01T00:00:00Z')];
    const result = await service.evaluateRule(CTX, rule.id, points);
    expect(result.triggered).toBe(false);
  });

  it('isolates tenants', async () => {
    const rule = await service.createRule(CTX, { name: 'R', objectType: 'Sensor', objectId: 's1', property: 'temp', operator: 'gt', threshold: 100 });
    const ctx2: RequestContext = { tenantId: 't2' };
    const fetched = await service.getRule(ctx2, rule.id);
    expect(fetched).toBeNull();
  });
});

describe('pointSatisfies', () => {
  it('evaluates gt', () => {
    expect(pointSatisfies(makePoint(5, 't'), 'gt', 4)).toBe(true);
    expect(pointSatisfies(makePoint(4, 't'), 'gt', 4)).toBe(false);
  });
  it('evaluates gte', () => {
    expect(pointSatisfies(makePoint(4, 't'), 'gte', 4)).toBe(true);
    expect(pointSatisfies(makePoint(3, 't'), 'gte', 4)).toBe(false);
  });
  it('evaluates lt', () => {
    expect(pointSatisfies(makePoint(3, 't'), 'lt', 4)).toBe(true);
    expect(pointSatisfies(makePoint(4, 't'), 'lt', 4)).toBe(false);
  });
  it('evaluates lte', () => {
    expect(pointSatisfies(makePoint(4, 't'), 'lte', 4)).toBe(true);
    expect(pointSatisfies(makePoint(5, 't'), 'lte', 4)).toBe(false);
  });
});

describe('findConsecutiveRun', () => {
  it('finds a run of consecutive qualifying points', () => {
    const points = [
      makePoint(95, '2026-01-01T00:00:00Z'),
      makePoint(105, '2026-01-01T00:01:00Z'),
      makePoint(108, '2026-01-01T00:02:00Z'),
      makePoint(95, '2026-01-01T00:03:00Z'),
    ];
    const run = findConsecutiveRun(points, 'gt', 100, 2);
    expect(run).not.toBeNull();
    expect(run!.count).toBe(2);
  });

  it('returns null when no run found', () => {
    const points = [makePoint(95, '2026-01-01T00:00:00Z'), makePoint(98, '2026-01-01T00:01:00Z')];
    const run = findConsecutiveRun(points, 'gt', 100, 1);
    expect(run).toBeNull();
  });

  it('returns null for empty points', () => {
    const run = findConsecutiveRun([], 'gt', 100, 1);
    expect(run).toBeNull();
  });
});
