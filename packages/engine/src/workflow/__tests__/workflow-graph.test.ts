import { describe, it, expect } from 'vitest';
import {
  WorkflowGraphBuilder,
  objectNodeId,
  actionNodeId,
  functionNodeId,
  type WorkflowAuditReader,
} from '../workflow-graph.js';
import { InMemoryLineageStore } from '../../lineage/lineage-recorder.js';
import type { AuditRecord } from '@altius/spi';

function makeAuditRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 'a-1',
    timestamp: '2026-01-01T00:00:00Z',
    traceId: 't-1',
    tenantId: 'tenant-1',
    actor: { type: 'user', id: 'u-1', roles: ['analyst'] },
    operation: { type: 'create', objectType: 'Patient', objectId: 'p-1' },
    detail: { result: 'success' },
    ...overrides,
  };
}

function makeAuditStore(records: AuditRecord[]): WorkflowAuditReader {
  return {
    async query(filter) {
      return records.filter((r) => {
        if (filter.tenantId && r.tenantId !== filter.tenantId) return false;
        if (filter.objectType && r.operation.objectType !== filter.objectType) return false;
        if (filter.objectId && r.operation.objectId !== filter.objectId) return false;
        return true;
      });
    },
  };
}

describe('WorkflowGraphBuilder', () => {
  it('builds a graph from lineage and audit records', async () => {
    const lineageStore = new InMemoryLineageStore();
    await lineageStore.write({
      tenantId: 'tenant-1',
      objectType: 'Patient',
      objectId: 'p-1',
      field: 'riskScore',
      valueHash: 'abc',
      producedAt: '2026-01-01T00:00:00Z',
      source: { kind: 'FUNCTION', functionName: 'ScoreRisk', functionVersion: '1', inputRefs: [] },
    });

    const auditStore = makeAuditStore([
      makeAuditRecord({
        operation: { type: 'create', objectType: 'Patient', objectId: 'p-1' },
      }),
      makeAuditRecord({
        id: 'a-2',
        operation: { type: 'function', functionName: 'ScoreRisk' },
      }),
    ]);

    const builder = new WorkflowGraphBuilder({ lineageStore, auditStore });
    const graph = await builder.buildGraph('tenant-1', {
      rootObject: { objectType: 'Patient', objectId: 'p-1' },
    });

    // The object node should be present.
    const objNode = graph.nodes.find((n) => n.kind === 'object' && n.type === 'Patient');
    expect(objNode).toBeDefined();
    expect(objNode!.id).toBe(objectNodeId('tenant-1', 'Patient', 'p-1'));

    // The function node from lineage should be present.
    const fnNode = graph.nodes.find((n) => n.kind === 'function' && n.label === 'ScoreRisk');
    expect(fnNode).toBeDefined();
    expect(fnNode!.id).toBe(functionNodeId('tenant-1', 'ScoreRisk'));

    // There should be a 'produced' edge from the function to the object.
    const producedEdge = graph.edges.find((e) => e.kind === 'produced');
    expect(producedEdge).toBeDefined();
    expect(producedEdge!.from).toBe(functionNodeId('tenant-1', 'ScoreRisk'));
    expect(producedEdge!.to).toBe(objectNodeId('tenant-1', 'Patient', 'p-1'));
    expect(producedEdge!.field).toBe('riskScore');
  });

  it('creates wrote edges from audit create/update records', async () => {
    const lineageStore = new InMemoryLineageStore();
    const auditStore = makeAuditStore([
      makeAuditRecord({
        operation: { type: 'create', objectType: 'Patient', objectId: 'p-2', actionType: 'AdmitPatient', actionId: 'act-1' },
      }),
    ]);

    const builder = new WorkflowGraphBuilder({ lineageStore, auditStore });
    const graph = await builder.buildGraph('tenant-1');

    const wroteEdge = graph.edges.find((e) => e.kind === 'wrote');
    expect(wroteEdge).toBeDefined();
    expect(wroteEdge!.to).toBe(objectNodeId('tenant-1', 'Patient', 'p-2'));
  });

  it('creates read edges from audit read records', async () => {
    const lineageStore = new InMemoryLineageStore();
    const auditStore = makeAuditStore([
      makeAuditRecord({
        operation: { type: 'read', objectType: 'Patient', objectId: 'p-3' },
      }),
    ]);

    const builder = new WorkflowGraphBuilder({ lineageStore, auditStore });
    const graph = await builder.buildGraph('tenant-1');

    const readEdge = graph.edges.find((e) => e.kind === 'read');
    expect(readEdge).toBeDefined();
  });

  it('scopes to a single tenant', async () => {
    const lineageStore = new InMemoryLineageStore();
    const auditStore = makeAuditStore([
      makeAuditRecord({ tenantId: 'tenant-1', operation: { type: 'create', objectType: 'Patient', objectId: 'p-1' } }),
      makeAuditRecord({ tenantId: 'tenant-2', operation: { type: 'create', objectType: 'Patient', objectId: 'p-2' } }),
    ]);

    const builder = new WorkflowGraphBuilder({ lineageStore, auditStore });
    const graph = await builder.buildGraph('tenant-1');

    expect(graph.nodes.every((n) => n.tenantId === 'tenant-1')).toBe(true);
    expect(graph.edges.every((e) => e.tenantId === 'tenant-1')).toBe(true);
  });
});
