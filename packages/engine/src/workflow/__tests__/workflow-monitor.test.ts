import { describe, it, expect } from 'vitest';
import { WorkflowMonitor, InMemoryWorkflowEventStore, newWorkflowId } from '../workflow-monitor.js';

describe('WorkflowMonitor', () => {
  it('records and retrieves events by workflow id', async () => {
    const monitor = new WorkflowMonitor({ store: new InMemoryWorkflowEventStore() });
    const wfId = newWorkflowId();

    await monitor.record({
      workflowId: wfId,
      tenantId: 'tenant-1',
      kind: 'action',
      label: 'AdmitPatient',
      outcome: 'in_progress',
    });
    await monitor.complete(wfId, 'tenant-1', 'action', 'AdmitPatient', 'success', { durationMs: 150 });

    const log = await monitor.getWorkflowLog('tenant-1', wfId);
    expect(log).toHaveLength(2);
    expect(log[0]!.outcome).toBe('in_progress');
    expect(log[1]!.outcome).toBe('success');
    expect(log[1]!.durationMs).toBe(150);
  });

  it('summarizes a workflow', async () => {
    const monitor = new WorkflowMonitor({ store: new InMemoryWorkflowEventStore() });
    const wfId = newWorkflowId();

    await monitor.record({
      workflowId: wfId,
      tenantId: 'tenant-1',
      kind: 'action',
      label: 'AdmitPatient',
      outcome: 'success',
      durationMs: 100,
    });
    await monitor.record({
      workflowId: wfId,
      tenantId: 'tenant-1',
      kind: 'function',
      label: 'ScoreRisk',
      outcome: 'failure',
      durationMs: 50,
      error: 'schema error',
    });

    const summary = await monitor.summarizeWorkflow('tenant-1', wfId);
    expect(summary).not.toBeNull();
    expect(summary!.eventCount).toBe(2);
    expect(summary!.outcomes.success).toBe(1);
    expect(summary!.outcomes.failure).toBe(1);
  });

  it('returns null for an unknown workflow', async () => {
    const monitor = new WorkflowMonitor({ store: new InMemoryWorkflowEventStore() });
    const summary = await monitor.summarizeWorkflow('tenant-1', 'nope');
    expect(summary).toBeNull();
  });

  it('queries recent events for a tenant', async () => {
    const store = new InMemoryWorkflowEventStore();
    const monitor = new WorkflowMonitor({ store });

    for (let i = 0; i < 5; i++) {
      await monitor.record({
        workflowId: `wf-${i}`,
        tenantId: 'tenant-1',
        kind: 'action',
        label: `Action${i}`,
        outcome: 'success',
      });
    }
    // Other tenant's events should not appear.
    await monitor.record({
      workflowId: 'wf-x',
      tenantId: 'tenant-2',
      kind: 'action',
      label: 'OtherAction',
      outcome: 'success',
    });

    const recent = await monitor.getRecentEvents('tenant-1', 3);
    expect(recent).toHaveLength(3);
    expect(recent.every((e) => e.tenantId === 'tenant-1')).toBe(true);
  });

  it('generates unique workflow ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(newWorkflowId());
    expect(ids.size).toBe(100);
  });
});
