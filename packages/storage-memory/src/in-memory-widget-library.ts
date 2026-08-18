/**
 * In-memory widget library service.
 */

import { randomUUID } from 'node:crypto';
import type {
  WidgetLibraryService, WidgetDefinition,
  AppDefinition, CreateAppDefinitionInput,
  AppPage, WidgetInstance, RequestContext,
} from '@altius/spi';

// Default widget catalog
const DEFAULT_WIDGETS: Array<Omit<WidgetDefinition, 'id'>> = [
  { type: 'object_table', name: 'Object Table', description: 'Tabular display of objects with sorting and filtering', category: 'data', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set', 'object_property'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0' },
  { type: 'object_list', name: 'Object List', description: 'Card-based list of objects', category: 'data', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'object_view', name: 'Object View', description: 'Single object detail view', category: 'data', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'chart_xy', name: 'Chart XY', description: 'XY scatter/line chart', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['aggregation', 'object_set'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0' },
  { type: 'chart_pie', name: 'Pie Chart', description: 'Pie/donut chart', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'pivot_table', name: 'Pivot Table', description: 'Multi-dimensional pivot table', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0' },
  { type: 'metric_card', name: 'Metric Card', description: 'Single KPI display', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['aggregation', 'static'], supportsLiveUpdates: true, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'filter_list', name: 'Filter List', description: 'Histogram-based filter list', category: 'filter', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'object_selector', name: 'Object Selector', description: 'Dropdown to select an object', category: 'filter', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'text_input', name: 'Text Input', description: 'Text input field', category: 'input', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'number_input', name: 'Number Input', description: 'Numeric input field', category: 'input', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'date_picker', name: 'Date Picker', description: 'Date selection widget', category: 'input', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'button_group', name: 'Button Group', description: 'Action-triggering buttons', category: 'action', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0' },
  { type: 'stepper', name: 'Stepper', description: 'Multi-step workflow navigation', category: 'action', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'tabs', name: 'Tabs', description: 'Tabbed navigation container', category: 'layout', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0' },
  { type: 'markdown', name: 'Markdown', description: 'Markdown content display', category: 'layout', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'map', name: 'Map', description: 'Geospatial map widget', category: 'data', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set', 'geo'], supportsLiveUpdates: true, minWidth: 4, available: true, version: '1.0.0' },
  { type: 'gantt', name: 'Gantt Chart', description: 'Gantt timeline chart', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0' },
  { type: 'time_series', name: 'Time Series Analysis', description: 'Time series chart with analysis', category: 'chart', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['time_series', 'aggregation'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0' },
  { type: 'media_preview', name: 'Media Preview', description: 'Image/video preview', category: 'media', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'comments', name: 'Comments', description: 'Comment thread widget', category: 'collaboration', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0' },
  { type: 'aip_chat', name: 'AIP Chat', description: 'AI assistant chat widget', category: 'ai', configSchema: { type: 'object' }, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0' },
];

export class InMemoryWidgetLibraryService implements WidgetLibraryService {
  private readonly widgets = new Map<string, WidgetDefinition>();
  private readonly apps = new Map<string, Map<string, AppDefinition>>();
  private readonly appsByName = new Map<string, Map<string, string>>();

  constructor() {
    for (const w of DEFAULT_WIDGETS) {
      const id = randomUUID();
      this.widgets.set(w.type, { id, ...w });
    }
  }

  async registerWidget(_ctx: RequestContext, widget: Omit<WidgetDefinition, 'id'>): Promise<WidgetDefinition> {
    const id = randomUUID();
    const def: WidgetDefinition = { id, ...widget };
    this.widgets.set(widget.type, def);
    return def;
  }
  async getWidget(_ctx: RequestContext, type: string): Promise<WidgetDefinition | null> {
    return this.widgets.get(type) ?? null;
  }
  async listWidgets(_ctx: RequestContext, category?: WidgetDefinition['category']): Promise<WidgetDefinition[]> {
    let list = Array.from(this.widgets.values());
    if (category) list = list.filter(w => w.category === category);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createApp(ctx: RequestContext, input: CreateAppDefinitionInput): Promise<AppDefinition> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const app: AppDefinition = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      pages: input.pages ?? [],
      variables: input.variables ?? [],
      theme: input.theme,
      ownerId: ctx.actorId ?? 'system',
      sharedWith: [],
      isPublic: input.isPublic ?? false,
      version: 1,
      createdAt: now, updatedAt: now,
    };
    this.getAppMap(ctx.tenantId).set(id, app);
    this.getNameMap(ctx.tenantId).set(input.name, id);
    return app;
  }
  async getApp(ctx: RequestContext, id: string): Promise<AppDefinition | null> {
    return this.apps.get(ctx.tenantId)?.get(id) ?? null;
  }
  async getAppByName(ctx: RequestContext, name: string): Promise<AppDefinition | null> {
    const id = this.appsByName.get(ctx.tenantId)?.get(name);
    return id ? (this.apps.get(ctx.tenantId)?.get(id) ?? null) : null;
  }
  async listApps(ctx: RequestContext): Promise<AppDefinition[]> {
    const m = this.apps.get(ctx.tenantId);
    return m ? Array.from(m.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  }
  async updateApp(ctx: RequestContext, id: string, updates: Partial<CreateAppDefinitionInput>): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    const updated: AppDefinition = {
      ...app,
      name: updates.name ?? app.name, description: updates.description ?? app.description,
      pages: updates.pages ?? app.pages, variables: updates.variables ?? app.variables,
      theme: updates.theme ?? app.theme, isPublic: updates.isPublic ?? app.isPublic,
      version: app.version + 1, updatedAt: new Date().toISOString(),
    };
    this.getAppMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async deleteApp(ctx: RequestContext, id: string): Promise<void> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (app) this.getNameMap(ctx.tenantId).delete(app.name);
    this.apps.get(ctx.tenantId)?.delete(id);
  }
  async shareApp(ctx: RequestContext, id: string, userIds: string[]): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    const updated = { ...app, sharedWith: [...new Set([...app.sharedWith, ...userIds])] };
    this.getAppMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async duplicateApp(ctx: RequestContext, id: string, newName: string): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    return this.createApp(ctx, { name: newName, description: app.description, pages: app.pages, variables: app.variables, theme: app.theme });
  }

  async addPage(ctx: RequestContext, appId: string, page: Omit<AppPage, 'id'>): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const newPage: AppPage = { id: randomUUID(), ...page };
    const updated = { ...app, pages: [...app.pages, newPage], updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async updatePage(ctx: RequestContext, appId: string, pageId: string, updates: Partial<Omit<AppPage, 'id'>>): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const pages = app.pages.map(p => p.id === pageId ? { ...p, ...updates } : p);
    const updated = { ...app, pages, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async removePage(ctx: RequestContext, appId: string, pageId: string): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const updated = { ...app, pages: app.pages.filter(p => p.id !== pageId), updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }

  async addWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widget: Omit<WidgetInstance, 'id'>): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const newWidget: WidgetInstance = { id: randomUUID(), ...widget };
    const pages = app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: [...s.widgets, newWidget] } : s) };
    });
    const updated = { ...app, pages, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async updateWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string, updates: Partial<Omit<WidgetInstance, 'id'>>): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const pages = app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: s.widgets.map(w => w.id === widgetId ? { ...w, ...updates } : w) } : s) };
    });
    const updated = { ...app, pages, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async removeWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string): Promise<AppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const pages = app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: s.widgets.filter(w => w.id !== widgetId) } : s) };
    });
    const updated = { ...app, pages, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }

  private getAppMap(t: string) { let m = this.apps.get(t); if (!m) { m = new Map(); this.apps.set(t, m); } return m; }
  private getNameMap(t: string) { let m = this.appsByName.get(t); if (!m) { m = new Map(); this.appsByName.set(t, m); } return m; }
}
