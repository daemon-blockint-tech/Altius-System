/**
 * Tests for the in-memory ontology usage metrics service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOntologyUsageMetricsService } from '../in-memory-usage-metrics.js';
import type { OntologyUsageEvent, RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1' };

function makeEvent(partial: Partial<OntologyUsageEvent>): OntologyUsageEvent {
  return {
    tenantId: 't1',
    operation: 'read',
    objectType: 'Patient',
    success: true,
    durationMs: 10,
    timestamp: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('InMemoryOntologyUsageMetricsService', () => {
  let service: InMemoryOntologyUsageMetricsService;

  beforeEach(() => {
    service = new InMemoryOntologyUsageMetricsService();
  });

  it('records and queries events', async () => {
    await service.record(makeEvent({ userId: 'u1', operation: 'read', objectType: 'Patient' }));
    await service.record(makeEvent({ userId: 'u2', operation: 'create', objectType: 'Ward' }));
    const result = await service.queryEvents('t1');
    expect(result.totalCount).toBe(2);
  });

  it('computes per-type metrics', async () => {
    await service.record(makeEvent({ userId: 'u1', operation: 'read', objectType: 'Patient', durationMs: 10 }));
    await service.record(makeEvent({ userId: 'u2', operation: 'read', objectType: 'Patient', durationMs: 20 }));
    await service.record(makeEvent({ userId: 'u1', operation: 'create', objectType: 'Patient', durationMs: 30 }));
    await service.record(makeEvent({ userId: 'u1', operation: 'read', objectType: 'Ward', durationMs: 5 }));

    const metrics = await service.getObjectTypeMetrics('t1');
    const patient = metrics.find(m => m.objectType === 'Patient');
    expect(patient?.totalReads).toBe(2);
    expect(patient?.totalWrites).toBe(1);
    expect(patient?.activeUsers).toBe(2);
  });

  it('computes per-action metrics', async () => {
    await service.record(makeEvent({ userId: 'u1', operation: 'action', actionOrFunctionName: 'admitPatient', durationMs: 100 }));
    await service.record(makeEvent({ userId: 'u2', operation: 'action', actionOrFunctionName: 'admitPatient', durationMs: 200, success: false }));
    await service.record(makeEvent({ userId: 'u1', operation: 'function', actionOrFunctionName: 'calculateRisk', durationMs: 50 }));

    const metrics = await service.getActionFunctionMetrics('t1');
    expect(metrics).toHaveLength(2);
    const admit = metrics.find(m => m.name === 'admitPatient');
    expect(admit?.totalExecutions).toBe(2);
    expect(admit?.totalErrors).toBe(1);
    expect(admit?.activeUsers).toBe(2);
  });

  it('gets usage summary', async () => {
    await service.record(makeEvent({ userId: 'u1', operation: 'read', objectType: 'Patient' }));
    await service.record(makeEvent({ userId: 'u2', operation: 'create', objectType: 'Ward', success: false }));

    const summary = await service.getSummary('t1');
    expect(summary.totalOperations).toBe(2);
    expect(summary.totalErrors).toBe(1);
    expect(summary.activeUsers).toBe(2);
    expect(summary.byObjectType).toHaveLength(2);
  });

  it('counts active users', async () => {
    await service.record(makeEvent({ userId: 'u1' }));
    await service.record(makeEvent({ userId: 'u2' }));
    await service.record(makeEvent({ userId: 'u1' }));
    const count = await service.getActiveUserCount('t1');
    expect(count).toBe(2);
  });

  it('filters by time range', async () => {
    await service.record(makeEvent({ timestamp: '2026-01-01T00:00:00Z' }));
    await service.record(makeEvent({ timestamp: '2026-06-01T00:00:00Z' }));
    const early = await service.queryEvents('t1', { endTime: '2026-03-01T00:00:00Z' });
    expect(early.totalCount).toBe(1);
  });

  it('isolates tenants', async () => {
    await service.record(makeEvent({ tenantId: 't1' }));
    await service.record(makeEvent({ tenantId: 't2' }));
    const t1 = await service.queryEvents('t1');
    const t2 = await service.queryEvents('t2');
    expect(t1.totalCount).toBe(1);
    expect(t2.totalCount).toBe(1);
  });

  it('creates and evaluates monitoring rules', async () => {
    // Record some events with errors
    for (let i = 0; i < 10; i++) {
      await service.record(makeEvent({
        userId: 'u1',
        operation: 'read',
        objectType: 'Patient',
        success: i < 8, // 20% error rate
        durationMs: 50,
        timestamp: new Date().toISOString(),
      }));
    }

    const rule = await service.createMonitoringRule(CTX, {
      name: 'High error rate',
      metric: 'error_rate',
      objectType: 'Patient',
      operation: 'read',
      threshold: 0.15,
      operator: 'gt',
      windowSeconds: 3600,
      enabled: true,
    });
    expect(rule.id).toBeTruthy();

    const results = await service.evaluateMonitoringRules(CTX);
    expect(results).toHaveLength(1);
    expect(results[0]!.triggered).toBe(true);
    expect(results[0]!.currentValue).toBeCloseTo(0.2, 1);
  });

  it('does not trigger when threshold not met', async () => {
    for (let i = 0; i < 10; i++) {
      await service.record(makeEvent({
        userId: 'u1',
        operation: 'read',
        success: true,
        durationMs: 10,
        timestamp: new Date().toISOString(),
      }));
    }

    await service.createMonitoringRule(CTX, {
      name: 'Error rate check',
      metric: 'error_rate',
      objectType: '*',
      operation: '*',
      threshold: 0.5,
      operator: 'gt',
      windowSeconds: 3600,
      enabled: true,
    });

    const results = await service.evaluateMonitoringRules(CTX);
    expect(results[0]!.triggered).toBe(false);
  });

  it('deletes monitoring rules', async () => {
    const rule = await service.createMonitoringRule(CTX, {
      name: 'Test',
      metric: 'request_count',
      objectType: '*',
      operation: '*',
      threshold: 100,
      operator: 'gt',
      windowSeconds: 60,
      enabled: true,
    });
    await service.deleteMonitoringRule(CTX, rule.id);
    const rules = await service.listMonitoringRules(CTX);
    expect(rules).toHaveLength(0);
  });
});
