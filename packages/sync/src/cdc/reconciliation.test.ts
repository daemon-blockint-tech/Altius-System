import { describe, it, expect } from 'vitest';
import { ReconciliationService } from './reconciliation.js';
import type { MappedObject } from '../mapping/record-mapper.js';

function makeMapped(id: string, props: Record<string, unknown>): MappedObject {
  return { objectType: 'Patient', id, properties: props, operation: 'INSERT', links: [] };
}

describe('ReconciliationService', () => {
  const service = new ReconciliationService();

  it('detects missing objects (in source but not ontology)', () => {
    const source = [
      makeMapped('p1', { name: 'Alice' }),
      makeMapped('p2', { name: 'Bob' }),
    ];
    const ontology = new Map([['p1', { _id: 'p1', name: 'Alice' }]]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient');
    expect(report.sourceCount).toBe(2);
    expect(report.ontologyCount).toBe(1);
    const missing = report.discrepancies.filter((d) => d.type === 'missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.objectId).toBe('p2');
  });

  it('detects orphaned objects (in ontology but not source)', () => {
    const source = [makeMapped('p1', { name: 'Alice' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice' }],
      ['p3', { _id: 'p3', name: 'Carol' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient');
    const orphaned = report.discrepancies.filter((d) => d.type === 'orphaned');
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]!.objectId).toBe('p3');
  });

  it('detects field drift', () => {
    const source = [makeMapped('p1', { name: 'Alice', status: 'ACTIVE' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice', status: 'DISCHARGED' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient');
    const drift = report.discrepancies.filter((d) => d.type === 'field_drift');
    expect(drift).toHaveLength(1);
    expect(drift[0]!.field).toBe('status');
    expect(drift[0]!.sourceValue).toBe('ACTIVE');
    expect(drift[0]!.ontologyValue).toBe('DISCHARGED');
  });

  it('reports no discrepancies when source and ontology match', () => {
    const source = [makeMapped('p1', { name: 'Alice', status: 'ACTIVE' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice', status: 'ACTIVE' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient');
    expect(report.discrepancies).toHaveLength(0);
  });

  it('respects reportOrphaned=false', () => {
    const source = [makeMapped('p1', { name: 'Alice' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice' }],
      ['p2', { _id: 'p2', name: 'Bob' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient', {
      reportOrphaned: false,
    });
    const orphaned = report.discrepancies.filter((d) => d.type === 'orphaned');
    expect(orphaned).toHaveLength(0);
  });

  it('respects reportMissing=false', () => {
    const source = [
      makeMapped('p1', { name: 'Alice' }),
      makeMapped('p2', { name: 'Bob' }),
    ];
    const ontology = new Map([['p1', { _id: 'p1', name: 'Alice' }]]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient', {
      reportMissing: false,
    });
    const missing = report.discrepancies.filter((d) => d.type === 'missing');
    expect(missing).toHaveLength(0);
  });

  it('respects reportFieldDrift=false', () => {
    const source = [makeMapped('p1', { name: 'Alice', status: 'ACTIVE' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice', status: 'DISCHARGED' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient', {
      reportFieldDrift: false,
    });
    const drift = report.discrepancies.filter((d) => d.type === 'field_drift');
    expect(drift).toHaveLength(0);
  });

  it('limits field comparison to specified fields', () => {
    const source = [makeMapped('p1', { name: 'Alice', status: 'ACTIVE', ward: 'A' })];
    const ontology = new Map([
      ['p1', { _id: 'p1', name: 'Alice', status: 'DISCHARGED', ward: 'B' }],
    ]);

    const report = service.reconcile(source, ontology, 'ehr', 'Patient', {
      fields: ['name'],
    });
    const drift = report.discrepancies.filter((d) => d.type === 'field_drift');
    expect(drift).toHaveLength(0); // name matches, other fields not compared
  });

  it('handles empty source and ontology', () => {
    const report = service.reconcile([], new Map(), 'ehr', 'Patient');
    expect(report.sourceCount).toBe(0);
    expect(report.ontologyCount).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
  });

  it('includes timing information', () => {
    const report = service.reconcile([], new Map(), 'ehr', 'Patient');
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.reconciledAt).toBeDefined();
  });
});
