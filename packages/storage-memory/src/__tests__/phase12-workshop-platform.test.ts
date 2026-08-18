/**
 * Tests for Phase 12: Workshop platform service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryWorkshopPlatformService } from '../in-memory-workshop-platform.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

describe('InMemoryWorkshopPlatformService', () => {
  let service: InMemoryWorkshopPlatformService;
  beforeEach(() => { service = new InMemoryWorkshopPlatformService(); });

  // ── Cross-app interactivity ──

  it('registers and lists drag media types', async () => {
    const mt = await service.registerDragMediaType(CTX, {
      type: 'application/x-altius-object', label: 'Altius Object',
      description: 'Drag an ontology object', payloadSchema: { type: 'object' },
      draggable: true, droppable: true, producerApps: ['app1'], consumerApps: ['app2'],
    });
    expect(mt.type).toBe('application/x-altius-object');
    const list = await service.listDragMediaTypes(CTX);
    expect(list).toHaveLength(1);
  });

  it('records drag events', async () => {
    const event = await service.recordDragEvent(CTX, 'app1', 'application/x-altius-object', { id: 'obj1' }, 'app2');
    expect(event.completed).toBe(true);
    const events = await service.listDragEvents(CTX, 'app1');
    expect(events).toHaveLength(1);
  });

  // ── App builder ──

  it('creates and retrieves an app', async () => {
    const app = await service.createApp(CTX, { name: 'Patient App', description: 'Clinical dashboard' });
    expect(app.name).toBe('Patient App');
    expect(await service.getApp(CTX, app.id)).not.toBeNull();
  });

  it('lists apps', async () => {
    await service.createApp(CTX, { name: 'App1' });
    await service.createApp(CTX, { name: 'App2' });
    expect((await service.listApps(CTX))).toHaveLength(2);
  });

  it('adds pages and widgets', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const withPage = await service.addPage(CTX, app.id, { name: 'Page 1', sections: [{ id: 's1', name: 'S1', layout: 'stack', widgets: [] }] });
    expect(withPage.pages).toHaveLength(1);
    const withWidget = await service.addWidget(CTX, app.id, withPage.pages[0]!.id, 's1', {
      widgetType: 'object_table', config: {}, visible: true, boundVariable: 'patients',
      displayOptimization: { pageSize: 50, virtualization: true },
    });
    expect(withWidget.pages[0]!.sections[0]!.widgets).toHaveLength(1);
  });

  it('adds and removes overlays', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const withOverlay = await service.addOverlay(CTX, app.id, { name: 'Detail Modal', kind: 'modal', trigger: 'button', widgetIds: [] });
    expect(withOverlay.overlays).toHaveLength(1);
    const without = await service.removeOverlay(CTX, app.id, withOverlay.overlays[0]!.id);
    expect(without.overlays).toHaveLength(0);
  });

  it('shares and duplicates apps', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const shared = await service.shareApp(CTX, app.id, ['user2']);
    expect(shared.sharedWith).toContain('user2');
    const copy = await service.duplicateApp(CTX, app.id, 'App1 Copy');
    expect(copy.name).toBe('App1 Copy');
  });

  // ── Templates ──

  it('creates templates and creates app from template', async () => {
    const template = await service.createTemplate(CTX, {
      name: 'Clinical Dashboard', description: 'A clinical dashboard template',
      category: 'healthcare', template: { header: { title: 'Dashboard' } }, tags: ['clinical'],
    });
    const app = await service.createAppFromTemplate(CTX, template.id, 'My Dashboard');
    expect(app.name).toBe('My Dashboard');
    expect(app.templateId).toBe(template.id);
    expect(app.header?.title).toBe('Dashboard');
  });

  // ── Mobile ──

  it('gets and updates mobile config', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const config = await service.updateMobileConfig(CTX, app.id, {
      enabled: true, designMode: 'dedicated', qrReaderEnabled: true,
      navBar: { items: [{ label: 'Home', pageId: 'p1' }], position: 'bottom' },
    });
    expect(config.enabled).toBe(true);
    expect(config.designMode).toBe('dedicated');
    expect((await service.getMobileConfig(CTX, app.id))?.qrReaderEnabled).toBe(true);
  });

  it('launches and ends mobile sessions', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const session = await service.launchMobileSession(CTX, app.id, { platform: 'ios', model: 'iPhone 15' });
    expect(session.active).toBe(true);
    const sessions = await service.listMobileSessions(CTX, app.id);
    expect(sessions).toHaveLength(1);
    await service.endMobileSession(CTX, session.id);
    expect((await service.listMobileSessions(CTX, app.id))[0]!.active).toBe(false);
  });

  // ── Modular composition ──

  it('creates and publishes modules', async () => {
    const mod = await service.createModule(CTX, {
      name: 'Patient Card', description: 'Reusable patient card module',
      interface: { inputs: [{ name: 'patientId', type: 'string', required: true }], outputs: [{ name: 'selected', type: 'boolean' }] },
      sections: [{ id: 's1', name: 'Main', layout: 'stack', widgets: [] }],
    });
    expect(mod.published).toBe(false);
    const published = await service.publishModule(CTX, mod.id);
    expect(published.published).toBe(true);
  });

  it('embeds a module in a section', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const withPage = await service.addPage(CTX, app.id, { name: 'P1', sections: [{ id: 's1', name: 'S1', layout: 'stack', widgets: [] }] });
    const mod = await service.createModule(CTX, {
      name: 'M1', interface: { inputs: [{ name: 'id', type: 'string', required: true }], outputs: [] },
      sections: [],
    });
    const embedded = await service.embedModule(CTX, app.id, withPage.pages[0]!.id, 's1', mod.id, { id: 'selectedPatientId' });
    expect(embedded.pages[0]!.sections[0]!.embeddedModuleId).toBe(mod.id);
    expect(embedded.pages[0]!.sections[0]!.moduleInputs?.id).toBe('selectedPatientId');
  });

  // ── Reactive variables ──

  it('creates and retrieves variables', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const v = await service.createVariable(CTX, {
      appId: app.id, name: 'selectedPatient', type: 'object',
      source: { kind: 'static', value: { id: 'p1' } },
    });
    expect(v.name).toBe('selectedPatient');
    expect(await service.getVariable(CTX, v.id)).not.toBeNull();
    expect((await service.getVariableByName(CTX, app.id, 'selectedPatient'))?.id).toBe(v.id);
  });

  it('lists variables by app', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    await service.createVariable(CTX, { appId: app.id, name: 'v1', type: 'string', source: { kind: 'static', value: 'x' } });
    await service.createVariable(CTX, { appId: app.id, name: 'v2', type: 'number', source: { kind: 'static', value: 42 } });
    expect((await service.listVariables(CTX, app.id))).toHaveLength(2);
  });

  it('creates variables with different source types', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const aggVar = await service.createVariable(CTX, {
      appId: app.id, name: 'patientCount', type: 'aggregation',
      source: { kind: 'aggregation', objectType: 'Patient', aggregation: { function: 'COUNT' } },
    });
    expect(aggVar.source.kind).toBe('aggregation');
    const objSetVar = await service.createVariable(CTX, {
      appId: app.id, name: 'activePatients', type: 'object_set',
      source: { kind: 'object_set', objectType: 'Patient', filter: { status: 'active' } },
    });
    expect(objSetVar.source.kind).toBe('object_set');
  });

  it('creates struct variables with fields', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const v = await service.createVariable(CTX, {
      appId: app.id, name: 'patientSummary', type: 'struct',
      source: { kind: 'static', value: {} },
      structFields: [{ name: 'name', type: 'string' }, { name: 'age', type: 'number' }],
    });
    expect(v.structFields).toHaveLength(2);
  });

  it('creates variables with transformations', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const v = await service.createVariable(CTX, {
      appId: app.id, name: 'sortedPatients', type: 'object_set',
      source: { kind: 'object_set', objectType: 'Patient' },
      transformations: [{ kind: 'sort', params: { field: 'name', direction: 'asc' } }],
    });
    expect(v.transformations).toHaveLength(1);
  });

  it('gets variable lineage', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    await service.createVariable(CTX, {
      appId: app.id, name: 'base', type: 'string',
      source: { kind: 'static', value: 'x' },
    });
    await service.createVariable(CTX, {
      appId: app.id, name: 'derived', type: 'string',
      source: { kind: 'expression', expression: 'base + "!"', dependencies: ['base'] },
    });
    const lineage = await service.getVariableLineage(CTX, app.id);
    const baseLineage = lineage.find(l => l.variableName === 'base');
    expect(baseLineage?.dependedBy).toContain('derived');
    const derivedLineage = lineage.find(l => l.variableName === 'derived');
    expect(derivedLineage?.dependsOn).toContain('base');
  });

  it('evaluates static variables', async () => {
    const app = await service.createApp(CTX, { name: 'App1' });
    const v = await service.createVariable(CTX, {
      appId: app.id, name: 'greeting', type: 'string',
      source: { kind: 'static', value: 'Hello' },
    });
    const value = await service.evaluateVariable(CTX, v.id);
    expect(value).toBe('Hello');
  });

  // ── Widget catalog ──

  it('has 50+ pre-registered widgets', async () => {
    const widgets = await service.listWidgetCatalog(CTX);
    expect(widgets.length).toBeGreaterThanOrEqual(50);
  });

  it('lists widgets by category', async () => {
    const charts = await service.listWidgetCatalog(CTX, 'chart');
    expect(charts.length).toBeGreaterThanOrEqual(5);
    const dataWidgets = await service.listWidgetCatalog(CTX, 'data');
    expect(dataWidgets.length).toBeGreaterThanOrEqual(5);
    const filters = await service.listWidgetCatalog(CTX, 'filter');
    expect(filters.length).toBeGreaterThanOrEqual(4);
  });

  it('gets a widget by type', async () => {
    const table = await service.getWidgetCatalogEntry(CTX, 'object_table');
    expect(table?.name).toBe('Object Table');
    expect(table?.displayOptimization.supportsVirtualization).toBe(true);
  });

  it('registers a custom widget', async () => {
    const w = await service.registerWidgetCatalogEntry(CTX, {
      type: 'custom_widget', name: 'Custom', description: 'User widget',
      category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'],
      supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0',
      displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false },
      mobileOptimized: true,
    });
    expect(w.type).toBe('custom_widget');
    expect(await service.getWidgetCatalogEntry(CTX, 'custom_widget')).not.toBeNull();
  });

  it('widgets have display optimization metadata', async () => {
    const table = await service.getWidgetCatalogEntry(CTX, 'object_table');
    expect(table?.displayOptimization.defaultPageSize).toBe(50);
    expect(table?.displayOptimization.supportsFrozenColumns).toBe(true);
  });

  it('widgets have mobile optimization flag', async () => {
    const table = await service.getWidgetCatalogEntry(CTX, 'object_table');
    const map = await service.getWidgetCatalogEntry(CTX, 'map');
    expect(table?.mobileOptimized).toBe(true);
    expect(map?.mobileOptimized).toBe(false);
  });

  // ── Object Views ──

  it('creates and retrieves an object view', async () => {
    const view = await service.createObjectView(CTX, {
      name: 'Patient Overview', objectType: 'Patient',
      columns: [
        { propertyName: 'name', displayName: 'Name', visible: true, order: 0, width: 200 },
        { propertyName: 'age', displayName: 'Age', visible: true, order: 1, format: 'number' },
      ],
    });
    expect(view.name).toBe('Patient Overview');
    expect(view.columns).toHaveLength(2);
    const fetched = await service.getObjectView(CTX, view.id);
    expect(fetched?.objectType).toBe('Patient');
  });

  it('lists object views by type', async () => {
    await service.createObjectView(CTX, { name: 'V1', objectType: 'Patient', columns: [] });
    await service.createObjectView(CTX, { name: 'V2', objectType: 'Patient', columns: [] });
    await service.createObjectView(CTX, { name: 'V3', objectType: 'Order', columns: [] });
    expect((await service.listObjectViews(CTX, 'Patient'))).toHaveLength(2);
    expect((await service.listObjectViews(CTX, 'Order'))).toHaveLength(1);
    expect((await service.listObjectViews(CTX))).toHaveLength(3);
  });

  it('updates an object view with version increment', async () => {
    const view = await service.createObjectView(CTX, { name: 'V1', objectType: 'Patient', columns: [] });
    const updated = await service.updateObjectView(CTX, view.id, { name: 'V1 Updated', pageSize: 100 });
    expect(updated.name).toBe('V1 Updated');
    expect(updated.version).toBe(2);
    expect(updated.pageSize).toBe(100);
  });

  it('sets and gets default object view', async () => {
    const v1 = await service.createObjectView(CTX, { name: 'V1', objectType: 'Patient', columns: [] });
    await service.setDefaultObjectView(CTX, v1.id);
    const def = await service.getDefaultObjectView(CTX, 'Patient');
    expect(def?.id).toBe(v1.id);
  });

  it('creating a default view unsets other defaults for same type', async () => {
    const v1 = await service.createObjectView(CTX, { name: 'V1', objectType: 'Patient', columns: [], isDefault: true });
    const v2 = await service.createObjectView(CTX, { name: 'V2', objectType: 'Patient', columns: [], isDefault: true });
    const def = await service.getDefaultObjectView(CTX, 'Patient');
    expect(def?.id).toBe(v2.id);
    const old = await service.getObjectView(CTX, v1.id);
    expect(old?.isDefault).toBe(false);
  });

  it('deletes an object view', async () => {
    const view = await service.createObjectView(CTX, { name: 'V1', objectType: 'Patient', columns: [] });
    await service.deleteObjectView(CTX, view.id);
    expect(await service.getObjectView(CTX, view.id)).toBeNull();
  });

  it('creates object view with filters and sort config', async () => {
    const view = await service.createObjectView(CTX, {
      name: 'Active Patients', objectType: 'Patient',
      columns: [
        { propertyName: 'name', displayName: 'Name', visible: true, order: 0 },
      ],
      filters: [{ propertyName: 'status', operator: 'eq', value: 'active' }],
      sortBy: [{ propertyName: 'name', direction: 'asc' }],
      groupBy: ['ward'],
    });
    expect(view.filters).toHaveLength(1);
    expect(view.sortBy).toHaveLength(1);
    expect(view.groupBy).toEqual(['ward']);
  });
});
