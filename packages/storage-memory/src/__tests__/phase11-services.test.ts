/**
 * Tests for Phase 11: ontology manager and workshop UX services.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOntologyManagerService } from '../in-memory-ontology-manager.js';
import { InMemoryWorkshopUxService } from '../in-memory-workshop-ux.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Ontology manager
// ===========================================================================

describe('InMemoryOntologyManagerService', () => {
  let service: InMemoryOntologyManagerService;

  const mockSchema = async (_ctx: RequestContext) => ({
    types: [
      {
        name: 'Patient', displayName: 'Patient', description: 'A patient',
        isAbstract: false, tags: ['clinical'],
        properties: [
          { name: 'name', displayName: 'Name', type: 'string', required: true, unique: false, indexed: true, sensitive: false, description: '' },
          { name: 'age', displayName: 'Age', type: 'integer', required: false, unique: false, indexed: false, sensitive: false, description: '' },
        ],
        links: [
          { name: 'orders', displayName: 'Orders', sourceType: 'Patient', targetType: 'Order', cardinality: 'one-to-many' as const, required: false, description: '' },
        ],
      },
      {
        name: 'Order', displayName: 'Order', description: 'An order',
        isAbstract: false, tags: ['ops'],
        properties: [
          { name: 'total', displayName: 'Total', type: 'decimal', required: true, unique: false, indexed: false, sensitive: true, description: '' },
        ],
        links: [],
      },
    ],
    actions: [
      { name: 'admit', displayName: 'Admit', description: 'Admit a patient', parameterCount: 3, targetType: 'Patient', enabled: true },
    ],
    functions: [
      { name: 'getAge', displayName: 'Get Age', description: 'Calculate age', inputCount: 1, outputType: 'integer', enabled: true },
    ],
    version: 5,
  });

  const mockUsage = async (_ctx: RequestContext) => ({
    types: new Map([
      ['Patient', { reads: 500, writes: 100, searches: 50, activeUsers: 25, avgDurationMs: 12, errors: 3 }],
    ]),
    actions: new Map([
      ['admit', { executions: 200, errors: 5, avgDurationMs: 45, activeUsers: 10, lastExecutedAt: '2026-08-18T10:00:00Z' }],
    ]),
    functions: new Map([
      ['getAge', { executions: 1000, errors: 0, avgDurationMs: 2, lastExecutedAt: '2026-08-18T12:00:00Z' }],
    ]),
  });

  beforeEach(() => { service = new InMemoryOntologyManagerService(mockSchema, mockUsage); });

  it('lists types', async () => {
    const types = await service.listTypes(CTX);
    expect(types).toHaveLength(2);
    expect(types[0]!.name).toBe('Patient');
    expect(types[0]!.propertyCount).toBe(2);
  });

  it('gets type detail with properties and links', async () => {
    const detail = await service.getTypeDetail(CTX, 'Patient');
    expect(detail?.properties).toHaveLength(2);
    expect(detail?.links).toHaveLength(1);
    expect(detail?.actions).toHaveLength(1);
  });

  it('searches types', async () => {
    const results = await service.searchTypes(CTX, 'pat');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Patient');
  });

  it('lists actions with usage stats', async () => {
    const actions = await service.listActions(CTX);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.usageCount30d).toBe(200);
  });

  it('lists functions with usage stats', async () => {
    const functions = await service.listFunctions(CTX);
    expect(functions).toHaveLength(1);
    expect(functions[0]!.usageCount30d).toBe(1000);
  });

  it('creates and validates a proposal', async () => {
    const p = await service.createProposal(CTX, {
      name: 'Add email property', kind: 'add_property', targetType: 'Patient',
      change: { propertyName: 'email', type: 'string' },
    });
    const validated = await service.validateProposal(CTX, p.id);
    expect(validated.validationStatus).toBe('valid');
  });

  it('detects breaking changes', async () => {
    const p = await service.createProposal(CTX, {
      name: 'Remove Patient', kind: 'remove_type', targetType: 'Patient',
      change: { typeName: 'Patient' },
    });
    const validated = await service.validateProposal(CTX, p.id);
    expect(validated.isBreaking).toBe(true);
    expect(validated.validationStatus).toBe('invalid'); // no migration plan
  });

  it('accepts breaking changes with migration plan', async () => {
    const p = await service.createProposal(CTX, {
      name: 'Remove Patient', kind: 'remove_type', targetType: 'Patient',
      change: { typeName: 'Patient' }, migrationPlan: 'Migrate to Person type',
    });
    const validated = await service.validateProposal(CTX, p.id);
    expect(validated.isBreaking).toBe(true);
    expect(validated.validationStatus).toBe('valid');
  });

  it('submits, reviews, and applies a proposal', async () => {
    const p = await service.createProposal(CTX, {
      name: 'Add phone', kind: 'add_property', targetType: 'Patient',
      change: { propertyName: 'phone', type: 'string' },
    });
    await service.validateProposal(CTX, p.id);
    const submitted = await service.submitProposal(CTX, p.id);
    expect(submitted.reviewStatus).toBe('submitted');
    const reviewed = await service.reviewProposal(CTX, p.id, 'approved', 'Looks good');
    expect(reviewed.reviewStatus).toBe('approved');
    const applied = await service.applyProposal(CTX, p.id);
    expect(applied.reviewStatus).toBe('applied');
    expect(applied.appliedVersion).toBeDefined();
  });

  it('rejects invalid proposal submission', async () => {
    const p = await service.createProposal(CTX, {
      name: 'Bad', kind: 'remove_type', change: {},
    });
    await service.validateProposal(CTX, p.id);
    await expect(service.submitProposal(CTX, p.id)).rejects.toThrow();
  });

  it('lists proposals by status', async () => {
    const p = await service.createProposal(CTX, { name: 'P1', kind: 'add_property', targetType: 'Patient', change: { name: 'x' } });
    await service.validateProposal(CTX, p.id);
    await service.submitProposal(CTX, p.id);
    const submitted = await service.listProposals(CTX, 'submitted');
    expect(submitted).toHaveLength(1);
  });

  it('gets type observability', async () => {
    const obs = await service.getTypeObservability(CTX, 'Patient');
    expect(obs.reads30d).toBe(500);
    expect(obs.activeUsers30d).toBe(25);
  });

  it('gets action observability', async () => {
    const obs = await service.getActionObservability(CTX, 'admit');
    expect(obs.executions30d).toBe(200);
    expect(obs.lastExecutedAt).toBeDefined();
  });

  it('gets all observability', async () => {
    const all = await service.getAllObservability(CTX);
    expect(all.types).toHaveLength(1);
    expect(all.actions).toHaveLength(1);
    expect(all.functions).toHaveLength(1);
  });
});

// ===========================================================================
// Workshop UX
// ===========================================================================

describe('InMemoryWorkshopUxService', () => {
  let service: InMemoryWorkshopUxService;
  beforeEach(() => { service = new InMemoryWorkshopUxService(); });

  it('saves and retrieves app state', async () => {
    const s = await service.saveState(CTX, { appId: 'app1', name: 'Default', state: { tab: 'patients', filter: 'active' } });
    expect(s.name).toBe('Default');
    const fetched = await service.getState(CTX, s.id);
    expect(fetched?.state.tab).toBe('patients');
  });

  it('lists states by app', async () => {
    await service.saveState(CTX, { appId: 'app1', name: 'S1', state: {} });
    await service.saveState(CTX, { appId: 'app1', name: 'S2', state: {} });
    await service.saveState(CTX, { appId: 'app2', name: 'S3', state: {} });
    const list = await service.listStates(CTX, 'app1');
    expect(list).toHaveLength(2);
  });

  it('updates app state with version increment', async () => {
    const s = await service.saveState(CTX, { appId: 'app1', name: 'S1', state: { v: 1 } });
    const updated = await service.updateState(CTX, s.id, { state: { v: 2 } });
    expect(updated.version).toBe(2);
    expect(updated.state.v).toBe(2);
  });

  it('shares and forks state', async () => {
    const s = await service.saveState(CTX, { appId: 'app1', name: 'S1', state: { x: 1 } });
    const shared = await service.shareState(CTX, s.id, ['user2']);
    expect(shared.sharedWith).toContain('user2');
    const forked = await service.forkState(CTX, s.id, 'S1 Copy');
    expect(forked.name).toBe('S1 Copy');
    expect(forked.state.x).toBe(1);
  });

  it('gets and updates redact mode', async () => {
    const initial = await service.getRedactMode(CTX);
    expect(initial.enabled).toBe(false);
    const updated = await service.updateRedactMode(CTX, { enabled: true, level: 'partial', redactedFields: ['*.ssn', '*.nino'] });
    expect(updated.enabled).toBe(true);
    expect(updated.redactedFields).toContain('*.ssn');
  });

  it('checks shouldRedact with pattern matching', async () => {
    await service.updateRedactMode(CTX, { enabled: true, level: 'partial', redactedFields: ['*.ssn', 'Patient.nino'] });
    expect(await service.shouldRedact(CTX, 'Patient.ssn')).toBe(true);
    expect(await service.shouldRedact(CTX, 'Patient.nino')).toBe(true);
    expect(await service.shouldRedact(CTX, 'Patient.name')).toBe(false);
  });

  it('redacts all non-allowed fields in full mode', async () => {
    await service.updateRedactMode(CTX, { enabled: true, level: 'full', allowedFields: ['Patient.name'] });
    expect(await service.shouldRedact(CTX, 'Patient.name')).toBe(false);
    expect(await service.shouldRedact(CTX, 'Patient.ssn')).toBe(true);
  });

  it('records and lists performance profiles', async () => {
    const p = await service.recordProfile(CTX, {
      appId: 'app1', name: 'Profile 1', durationMs: 5000,
      renderMetrics: { renderCount: 100, avgRenderMs: 5, p95RenderMs: 15, slowestComponent: 'Table', slowestRenderMs: 20 },
      networkMetrics: { requestCount: 50, avgRequestMs: 100, p95RequestMs: 300, failedRequests: 2 },
    });
    expect(p.name).toBe('Profile 1');
    const list = await service.listProfiles(CTX, 'app1');
    expect(list).toHaveLength(1);
  });

  it('sets and gets translations', async () => {
    await service.setTranslation(CTX, { key: 'patient.title', locale: 'en', value: 'Patients' });
    await service.setTranslation(CTX, { key: 'patient.title', locale: 'fr', value: 'Patients (FR)' });
    const en = await service.getTranslation(CTX, 'patient.title', 'en');
    expect(en?.value).toBe('Patients');
    const fr = await service.getTranslation(CTX, 'patient.title', 'fr');
    expect(fr?.value).toBe('Patients (FR)');
  });

  it('gets translation bundle with missing count', async () => {
    await service.setTranslation(CTX, { key: 'a', locale: 'en', value: 'A' });
    await service.setTranslation(CTX, { key: 'b', locale: 'en', value: 'B' });
    await service.setTranslation(CTX, { key: 'a', locale: 'fr', value: 'A (FR)' });
    const bundle = await service.getBundle(CTX, 'fr');
    expect(bundle.entries.a).toBe('A (FR)');
    expect(bundle.missingCount).toBe(1); // 'b' is missing
  });

  it('lists locales', async () => {
    await service.setTranslation(CTX, { key: 'x', locale: 'en', value: 'X' });
    await service.setTranslation(CTX, { key: 'x', locale: 'fr', value: 'X (FR)' });
    await service.setTranslation(CTX, { key: 'x', locale: 'es', value: 'X (ES)' });
    const locales = await service.listLocales(CTX);
    expect(locales).toEqual(['en', 'es', 'fr']);
  });

  it('auto-translates missing keys', async () => {
    await service.setTranslation(CTX, { key: 'a', locale: 'en', value: 'Hello' });
    await service.setTranslation(CTX, { key: 'b', locale: 'en', value: 'World' });
    const result = await service.autoTranslate(CTX, 'de');
    expect(result.translated).toBe(2);
    const bundle = await service.getBundle(CTX, 'de');
    expect(bundle.autoTranslatedCount).toBe(2);
  });

  it('skips manually translated keys during auto-translate', async () => {
    await service.setTranslation(CTX, { key: 'a', locale: 'en', value: 'Hello' });
    await service.setTranslation(CTX, { key: 'a', locale: 'fr', value: 'Bonjour', source: 'manual' });
    const result = await service.autoTranslate(CTX, 'fr');
    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('deletes translations', async () => {
    await service.setTranslation(CTX, { key: 'x', locale: 'en', value: 'X' });
    await service.deleteTranslation(CTX, 'x', 'en');
    expect(await service.getTranslation(CTX, 'x', 'en')).toBeNull();
  });
});
