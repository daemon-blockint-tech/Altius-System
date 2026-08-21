/**
 * Workshop platform over a document store — the shared implementation.
 *
 * Every Workshop entity (apps, templates, modules, variables, mobile configs,
 * sessions, drag types/events, widget catalog, object views) is a JSON document
 * keyed by (tenant, collection, key). The 52 WorkshopPlatformService methods are
 * pure logic over those documents, so they live ONCE here, parameterized by a
 * four-method WorkshopDocStore. The in-memory provider backs it with Maps and
 * the Postgres provider with one JSONB table — two providers cannot drift on
 * app/page/widget semantics because there is only one implementation of them
 * (the same reason evaluateOntologySql and the business-rule engine live here).
 */

import type { RequestContext } from './ontology.js';
import type {
  WorkshopPlatformService,
  DragMediaType, DragEvent,
  WorkshopAppDefinition, WorkshopAppPage, WorkshopAppSection,
  WorkshopWidgetInstance, AppHeader, AppOverlay, AppTemplate,
  MobileAppConfig, MobileLaunchSession,
  AppModule, ModuleInterface,
  ReactiveVariable, VariableSource, VariableTransformation, VariableLineage,
  WidgetCatalogEntry,
  ObjectView, CreateObjectViewInput,
} from './workshop-platform.js';

/**
 * Persistence for workshop documents. Keys are unique per (tenant, collection).
 * Implementations only store and retrieve — every semantic lives in the service.
 */
export interface WorkshopDocStore {
  get(tenantId: string, collection: string, key: string): Promise<unknown | null>;
  put(tenantId: string, collection: string, key: string, doc: unknown): Promise<void>;
  delete(tenantId: string, collection: string, key: string): Promise<void>;
  list(tenantId: string, collection: string): Promise<unknown[]>;
}

// ── Collections ──────────────────────────────────────────────────────────
const DRAG_TYPES = 'drag_types';
const DRAG_EVENTS = 'drag_events';
const APPS = 'apps';
const TEMPLATES = 'templates';
const MOBILE_CONFIGS = 'mobile_configs';
const MOBILE_SESSIONS = 'mobile_sessions';
const MODULES = 'modules';
const VARIABLES = 'variables';
const WIDGETS = 'widgets';
const OBJECT_VIEWS = 'object_views';

// ── Pure-ES base64url of UTF-8 JSON (SPI carries no Buffer/btoa) ─────────

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8ToBase64Url(str: string): string {
  // Percent-encoding round-trip yields the UTF-8 byte string, matching what
  // Buffer.from(str, 'utf8') would produce byte-for-byte.
  const bytes = unescape(encodeURIComponent(str));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i) << 16;
    const b = (i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0) << 8;
    const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
    const t = a | b | c;
    out += B64URL[(t >> 18) & 0x3f]! + B64URL[(t >> 12) & 0x3f]!;
    if (i + 1 < bytes.length) out += B64URL[(t >> 6) & 0x3f]!;
    if (i + 2 < bytes.length) out += B64URL[t & 0x3f]!;
  }
  return out;
}

function base64UrlToUtf8(b64: string): string {
  let bytes = '';
  for (let i = 0; i < b64.length; i += 4) {
    const a = B64URL.indexOf(b64[i]!);
    const b = B64URL.indexOf(b64[i + 1] ?? '');
    const c = i + 2 < b64.length ? B64URL.indexOf(b64[i + 2]!) : -1;
    const d = i + 3 < b64.length ? B64URL.indexOf(b64[i + 3]!) : -1;
    if (a < 0 || b < 0) throw new Error('Invalid encoded state');
    const t = (a << 18) | (b << 12) | ((c >= 0 ? c : 0) << 6) | (d >= 0 ? d : 0);
    bytes += String.fromCharCode((t >> 16) & 0xff);
    if (c >= 0) bytes += String.fromCharCode((t >> 8) & 0xff);
    if (d >= 0) bytes += String.fromCharCode(t & 0xff);
  }
  return decodeURIComponent(escape(bytes));
}

/** ID generation is injectable so environments without crypto can supply one. */
export type IdGenerator = () => string;

const defaultIdGenerator: IdGenerator = () => {
  // RFC4122-shaped random id without a crypto dependency; uniqueness here only
  // needs to hold within a tenant's workshop documents.
  let out = '';
  for (const ch of 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx') {
    if (ch === 'x') out += Math.floor(Math.random() * 16).toString(16);
    else if (ch === 'y') out += (8 + Math.floor(Math.random() * 4)).toString(16);
    else out += ch;
  }
  return out;
};

/** Default widget catalog seeded per tenant on first access (~60 entries). */
export interface WorkshopDocStoreOptions {
  idGenerator?: IdGenerator;
  defaultWidgets?: Array<Omit<WidgetCatalogEntry, 'id'>>;
}

export class DocStoreWorkshopPlatformService implements WorkshopPlatformService {
  private readonly store: WorkshopDocStore;
  private readonly genId: IdGenerator;
  private readonly defaultWidgets: Array<Omit<WidgetCatalogEntry, 'id'>>;

  constructor(store: WorkshopDocStore, options: WorkshopDocStoreOptions = {}) {
    this.store = store;
    this.genId = options.idGenerator ?? defaultIdGenerator;
    this.defaultWidgets = options.defaultWidgets ?? [];
  }

  // ── Cross-app interactivity ──

  async registerDragMediaType(ctx: RequestContext, mediaType: Omit<DragMediaType, 'id'>): Promise<DragMediaType> {
    const entry: DragMediaType = { id: this.genId(), ...mediaType };
    await this.store.put(ctx.tenantId, DRAG_TYPES, entry.id, entry);
    return entry;
  }
  async listDragMediaTypes(ctx: RequestContext): Promise<DragMediaType[]> {
    return (await this.store.list(ctx.tenantId, DRAG_TYPES)) as DragMediaType[];
  }
  async recordDragEvent(ctx: RequestContext, sourceAppId: string, mediaType: string, payload: Record<string, unknown>, targetAppId?: string): Promise<DragEvent> {
    const event: DragEvent = { id: this.genId(), tenantId: ctx.tenantId, sourceAppId, targetAppId, mediaType, payload, completed: !!targetAppId, timestamp: new Date().toISOString() };
    await this.store.put(ctx.tenantId, DRAG_EVENTS, event.id, event);
    return event;
  }
  async listDragEvents(ctx: RequestContext, appId?: string): Promise<DragEvent[]> {
    let list = (await this.store.list(ctx.tenantId, DRAG_EVENTS)) as DragEvent[];
    if (appId) list = list.filter(e => e.sourceAppId === appId || e.targetAppId === appId);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ── App builder ──

  async createApp(ctx: RequestContext, input: { name: string; description?: string; header?: AppHeader; theme?: WorkshopAppDefinition['theme'] }): Promise<WorkshopAppDefinition> {
    const id = this.genId();
    const now = new Date().toISOString();
    const app: WorkshopAppDefinition = {
      id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '',
      pages: [], header: input.header, overlays: [], variableIds: [],
      theme: input.theme, ownerId: ctx.actorId ?? 'system', sharedWith: [],
      isPublic: false, version: 1, createdAt: now, updatedAt: now,
    };
    await this.store.put(ctx.tenantId, APPS, id, app);
    return app;
  }
  async getApp(ctx: RequestContext, id: string): Promise<WorkshopAppDefinition | null> {
    return (await this.store.get(ctx.tenantId, APPS, id)) as WorkshopAppDefinition | null;
  }
  async listApps(ctx: RequestContext): Promise<WorkshopAppDefinition[]> {
    const list = (await this.store.list(ctx.tenantId, APPS)) as WorkshopAppDefinition[];
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async updateApp(ctx: RequestContext, id: string, updates: Partial<WorkshopAppDefinition>): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, id);
    const updated = { ...app, ...updates, version: app.version + 1, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, APPS, id, updated);
    return updated;
  }
  async deleteApp(ctx: RequestContext, id: string): Promise<void> {
    await this.store.delete(ctx.tenantId, APPS, id);
  }
  async shareApp(ctx: RequestContext, id: string, userIds: string[]): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, id);
    const updated = { ...app, sharedWith: [...new Set([...app.sharedWith, ...userIds])] };
    await this.store.put(ctx.tenantId, APPS, id, updated);
    return updated;
  }
  async duplicateApp(ctx: RequestContext, id: string, newName: string): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, id);
    return this.createApp(ctx, { name: newName, description: app.description, header: app.header, theme: app.theme });
  }

  // ── Pages/sections/widgets ──

  async addPage(ctx: RequestContext, appId: string, page: Omit<WorkshopAppPage, 'id'>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => [...app.pages, { id: this.genId(), ...page }]);
  }
  async updatePage(ctx: RequestContext, appId: string, pageId: string, updates: Partial<Omit<WorkshopAppPage, 'id'>>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.map(p => p.id === pageId ? { ...p, ...updates } : p));
  }
  async removePage(ctx: RequestContext, appId: string, pageId: string): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.filter(p => p.id !== pageId));
  }
  async addWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widget: Omit<WorkshopWidgetInstance, 'id'>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: [...s.widgets, { id: this.genId(), ...widget }] } : s) };
    }));
  }
  async updateWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string, updates: Partial<Omit<WorkshopWidgetInstance, 'id'>>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: s.widgets.map(w => w.id === widgetId ? { ...w, ...updates } : w) } : s) };
    }));
  }
  async removeWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: s.widgets.filter(w => w.id !== widgetId) } : s) };
    }));
  }

  // ── Overlays ──

  async addOverlay(ctx: RequestContext, appId: string, overlay: Omit<AppOverlay, 'id'>): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, appId);
    const updated = { ...app, overlays: [...app.overlays, { id: this.genId(), ...overlay }], updatedAt: new Date().toISOString() } as WorkshopAppDefinition;
    await this.store.put(ctx.tenantId, APPS, appId, updated);
    return updated;
  }
  async removeOverlay(ctx: RequestContext, appId: string, overlayId: string): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, appId);
    const overlays = (app.overlays as Array<{ id: string }>).filter(o => o.id !== overlayId) as unknown[];
    const updated = { ...app, overlays, updatedAt: new Date().toISOString() } as WorkshopAppDefinition;
    await this.store.put(ctx.tenantId, APPS, appId, updated);
    return updated;
  }

  // ── Templates ──

  async createTemplate(ctx: RequestContext, template: Omit<AppTemplate, 'id'>): Promise<AppTemplate> {
    const t: AppTemplate = { id: this.genId(), ...template };
    await this.store.put(ctx.tenantId, TEMPLATES, t.id, t);
    return t;
  }
  async listTemplates(ctx: RequestContext, category?: string): Promise<AppTemplate[]> {
    let list = (await this.store.list(ctx.tenantId, TEMPLATES)) as AppTemplate[];
    if (category) list = list.filter(t => t.category === category);
    return list;
  }
  async createAppFromTemplate(ctx: RequestContext, templateId: string, name: string): Promise<WorkshopAppDefinition> {
    const template = (await this.store.get(ctx.tenantId, TEMPLATES, templateId)) as AppTemplate | null;
    if (!template) throw new Error(`Template not found: ${templateId}`);
    const app = await this.createApp(ctx, { name, description: template.description, header: template.template.header, theme: template.template.theme });
    const updated = { ...app, templateId, pages: template.template.pages ?? [] };
    await this.store.put(ctx.tenantId, APPS, app.id, updated);
    return updated;
  }

  // ── Mobile ──

  async getMobileConfig(ctx: RequestContext, appId: string): Promise<MobileAppConfig | null> {
    return (await this.store.get(ctx.tenantId, MOBILE_CONFIGS, appId)) as MobileAppConfig | null;
  }
  async updateMobileConfig(ctx: RequestContext, appId: string, updates: Partial<Omit<MobileAppConfig, 'id' | 'tenantId' | 'appId' | 'updatedAt'>>): Promise<MobileAppConfig> {
    const existing = await this.getMobileConfig(ctx, appId);
    const config: MobileAppConfig = existing ?? {
      id: this.genId(), tenantId: ctx.tenantId, appId,
      enabled: false, designMode: 'responsive',
      navBar: { items: [], position: 'bottom' },
      qrReaderEnabled: false, geolocationEnabled: false,
      historyNavigation: { enabled: false }, mobileWidgetIds: [],
      updatedAt: new Date().toISOString(),
    };
    const updated = { ...config, ...updates, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, MOBILE_CONFIGS, appId, updated);
    return updated;
  }
  async launchMobileSession(ctx: RequestContext, appId: string, device: MobileLaunchSession['device']): Promise<MobileLaunchSession> {
    const now = new Date().toISOString();
    const session: MobileLaunchSession = {
      id: this.genId(), tenantId: ctx.tenantId, appId,
      userId: ctx.actorId ?? 'system', device, active: true,
      launchedAt: now, lastActivityAt: now,
    };
    await this.store.put(ctx.tenantId, MOBILE_SESSIONS, session.id, session);
    return session;
  }
  async listMobileSessions(ctx: RequestContext, appId?: string): Promise<MobileLaunchSession[]> {
    let list = (await this.store.list(ctx.tenantId, MOBILE_SESSIONS)) as MobileLaunchSession[];
    if (appId) list = list.filter(s => s.appId === appId);
    return list.sort((a, b) => b.launchedAt.localeCompare(a.launchedAt));
  }
  async endMobileSession(ctx: RequestContext, sessionId: string): Promise<void> {
    const s = (await this.store.get(ctx.tenantId, MOBILE_SESSIONS, sessionId)) as MobileLaunchSession | null;
    if (s) await this.store.put(ctx.tenantId, MOBILE_SESSIONS, sessionId, { ...s, active: false });
  }

  // ── Modular composition ──

  async createModule(ctx: RequestContext, input: { name: string; description?: string; interface: ModuleInterface; sections: WorkshopAppSection[] }): Promise<AppModule> {
    const id = this.genId();
    const now = new Date().toISOString();
    const mod: AppModule = {
      id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '',
      interface: input.interface, sections: input.sections, published: false,
      version: 1, ownerId: ctx.actorId ?? 'system', createdAt: now, updatedAt: now,
    };
    await this.store.put(ctx.tenantId, MODULES, id, mod);
    return mod;
  }
  async getModule(ctx: RequestContext, id: string): Promise<AppModule | null> {
    return (await this.store.get(ctx.tenantId, MODULES, id)) as AppModule | null;
  }
  async listModules(ctx: RequestContext): Promise<AppModule[]> {
    return (await this.store.list(ctx.tenantId, MODULES)) as AppModule[];
  }
  async publishModule(ctx: RequestContext, id: string): Promise<AppModule> {
    const mod = await this.getModule(ctx, id);
    if (!mod) throw new Error(`Module not found: ${id}`);
    const updated = { ...mod, published: true, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, MODULES, id, updated);
    return updated;
  }
  async embedModule(ctx: RequestContext, appId: string, pageId: string, sectionId: string, moduleId: string, inputBindings: Record<string, string>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => app.pages.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, embeddedModuleId: moduleId, moduleInputs: inputBindings } : s) };
    }));
  }

  // ── Reactive variables ──

  async createVariable(ctx: RequestContext, input: { appId: string; name: string; type: ReactiveVariable['type']; source: VariableSource; lazy?: boolean; transformations?: VariableTransformation[]; structFields?: Array<{ name: string; type: string }>; description?: string }): Promise<ReactiveVariable> {
    const id = this.genId();
    const now = new Date().toISOString();
    const v: ReactiveVariable = {
      id, tenantId: ctx.tenantId, appId: input.appId, name: input.name, type: input.type,
      source: input.source, lazy: input.lazy ?? true, transformations: input.transformations,
      structFields: input.structFields, description: input.description ?? '',
      createdAt: now, updatedAt: now,
    };
    await this.store.put(ctx.tenantId, VARIABLES, id, v);
    return v;
  }
  async getVariable(ctx: RequestContext, id: string): Promise<ReactiveVariable | null> {
    return (await this.store.get(ctx.tenantId, VARIABLES, id)) as ReactiveVariable | null;
  }
  async getVariableByName(ctx: RequestContext, appId: string, name: string): Promise<ReactiveVariable | null> {
    const list = (await this.store.list(ctx.tenantId, VARIABLES)) as ReactiveVariable[];
    return list.find(v => v.appId === appId && v.name === name) ?? null;
  }
  async listVariables(ctx: RequestContext, appId: string): Promise<ReactiveVariable[]> {
    const list = (await this.store.list(ctx.tenantId, VARIABLES)) as ReactiveVariable[];
    return list.filter(v => v.appId === appId);
  }
  async updateVariable(ctx: RequestContext, id: string, updates: Partial<ReactiveVariable>): Promise<ReactiveVariable> {
    const v = await this.getVariable(ctx, id);
    if (!v) throw new Error(`Variable not found: ${id}`);
    const updated = { ...v, ...updates, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, VARIABLES, id, updated);
    return updated;
  }
  async deleteVariable(ctx: RequestContext, id: string): Promise<void> {
    await this.store.delete(ctx.tenantId, VARIABLES, id);
  }
  async getVariableLineage(ctx: RequestContext, appId: string): Promise<VariableLineage[]> {
    const vars = await this.listVariables(ctx, appId);
    return vars.map(v => ({
      variableName: v.name,
      dependsOn: v.source.dependencies ?? [],
      dependedBy: vars.filter(other => other.source.dependencies?.includes(v.name)).map(o => o.name),
    }));
  }
  async evaluateVariable(ctx: RequestContext, id: string): Promise<unknown> {
    const v = await this.getVariable(ctx, id);
    if (!v) throw new Error(`Variable not found: ${id}`);
    if (v.source.kind === 'static') return v.source.value;
    return null; // non-static sources evaluate against live data in the renderer
  }

  // ── Widget catalog ──

  async listWidgetCatalog(ctx: RequestContext, category?: WidgetCatalogEntry['category']): Promise<WidgetCatalogEntry[]> {
    let list = await this.widgetCatalog(ctx.tenantId);
    if (category) list = list.filter(w => w.category === category);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  async getWidgetCatalogEntry(ctx: RequestContext, type: string): Promise<WidgetCatalogEntry | null> {
    await this.widgetCatalog(ctx.tenantId); // ensure seeded
    return (await this.store.get(ctx.tenantId, WIDGETS, type)) as WidgetCatalogEntry | null;
  }
  async registerWidgetCatalogEntry(ctx: RequestContext, entry: Omit<WidgetCatalogEntry, 'id'>): Promise<WidgetCatalogEntry> {
    await this.widgetCatalog(ctx.tenantId); // ensure seeded before overriding
    const e: WidgetCatalogEntry = { id: this.genId(), ...entry };
    await this.store.put(ctx.tenantId, WIDGETS, entry.type, e);
    return e;
  }

  /** The catalog is keyed by widget `type`; defaults seed per tenant on first access. */
  private async widgetCatalog(tenantId: string): Promise<WidgetCatalogEntry[]> {
    const list = (await this.store.list(tenantId, WIDGETS)) as WidgetCatalogEntry[];
    if (list.length > 0 || this.defaultWidgets.length === 0) return list;
    const seeded: WidgetCatalogEntry[] = [];
    for (const w of this.defaultWidgets) {
      const e: WidgetCatalogEntry = { id: this.genId(), ...w };
      await this.store.put(tenantId, WIDGETS, w.type, e);
      seeded.push(e);
    }
    return seeded;
  }

  // ── Object Views ──

  async createObjectView(ctx: RequestContext, input: CreateObjectViewInput): Promise<ObjectView> {
    const id = this.genId();
    const now = new Date().toISOString();
    const view: ObjectView = {
      id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '',
      objectType: input.objectType, columns: input.columns, filters: input.filters ?? [],
      sortBy: input.sortBy, groupBy: input.groupBy, pageSize: input.pageSize ?? 50,
      isDefault: input.isDefault ?? false, isPublic: input.isPublic ?? false,
      ownerId: ctx.actorId ?? 'system', sharedWith: [], version: 1,
      createdAt: now, updatedAt: now,
    };
    if (view.isDefault) await this.unsetOtherDefaults(ctx, input.objectType, id);
    await this.store.put(ctx.tenantId, OBJECT_VIEWS, id, view);
    return view;
  }
  async getObjectView(ctx: RequestContext, id: string): Promise<ObjectView | null> {
    return (await this.store.get(ctx.tenantId, OBJECT_VIEWS, id)) as ObjectView | null;
  }
  async listObjectViews(ctx: RequestContext, objectType?: string): Promise<ObjectView[]> {
    let list = (await this.store.list(ctx.tenantId, OBJECT_VIEWS)) as ObjectView[];
    if (objectType) list = list.filter(v => v.objectType === objectType);
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async updateObjectView(ctx: RequestContext, id: string, updates: Partial<CreateObjectViewInput>): Promise<ObjectView> {
    const v = await this.getObjectView(ctx, id);
    if (!v) throw new Error(`Object view not found: ${id}`);
    const updated: ObjectView = { ...v, ...updates, version: v.version + 1, updatedAt: new Date().toISOString() };
    if (updates.isDefault) await this.unsetOtherDefaults(ctx, v.objectType, id);
    await this.store.put(ctx.tenantId, OBJECT_VIEWS, id, updated);
    return updated;
  }
  async deleteObjectView(ctx: RequestContext, id: string): Promise<void> {
    await this.store.delete(ctx.tenantId, OBJECT_VIEWS, id);
  }
  async getDefaultObjectView(ctx: RequestContext, objectType: string): Promise<ObjectView | null> {
    const views = await this.listObjectViews(ctx, objectType);
    return views.find(v => v.isDefault) ?? null;
  }
  async setDefaultObjectView(ctx: RequestContext, id: string): Promise<ObjectView> {
    const v = await this.getObjectView(ctx, id);
    if (!v) throw new Error(`Object view not found: ${id}`);
    await this.unsetOtherDefaults(ctx, v.objectType, id);
    const updated = { ...v, isDefault: true, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, OBJECT_VIEWS, id, updated);
    return updated;
  }

  private async unsetOtherDefaults(ctx: RequestContext, objectType: string, exceptId: string): Promise<void> {
    const list = (await this.store.list(ctx.tenantId, OBJECT_VIEWS)) as ObjectView[];
    for (const v of list) {
      if (v.objectType === objectType && v.id !== exceptId && v.isDefault) {
        await this.store.put(ctx.tenantId, OBJECT_VIEWS, v.id, { ...v, isDefault: false });
      }
    }
  }

  // ── URL state encoding ──

  async encodeState(_ctx: RequestContext, _appId: string, variables: Record<string, unknown>): Promise<string> {
    return `s:${utf8ToBase64Url(JSON.stringify(variables))}`;
  }
  async decodeState(_ctx: RequestContext, encoded: string): Promise<Record<string, unknown>> {
    const b64 = encoded.startsWith('s:') ? encoded.slice(2) : encoded;
    return JSON.parse(base64UrlToUtf8(b64)) as Record<string, unknown>;
  }

  // ── Private helpers ──

  private async mustGetApp(ctx: RequestContext, id: string): Promise<WorkshopAppDefinition> {
    const app = await this.getApp(ctx, id);
    if (!app) throw new Error(`App not found: ${id}`);
    return app;
  }

  private async updateAppPages(ctx: RequestContext, appId: string, fn: (app: WorkshopAppDefinition) => WorkshopAppPage[]): Promise<WorkshopAppDefinition> {
    const app = await this.mustGetApp(ctx, appId);
    const updated = { ...app, pages: fn(app), version: app.version + 1, updatedAt: new Date().toISOString() };
    await this.store.put(ctx.tenantId, APPS, appId, updated);
    return updated;
  }
}

/**
 * The default widget catalog (~60 entries), seeded per tenant on first access.
 * Shared so both providers advertise the identical catalog.
 */
export const DEFAULT_WIDGET_CATALOG: Array<Omit<WidgetCatalogEntry, 'id'>> = [
  // Data widgets
  { type: 'object_table', name: 'Object Table', description: 'Tabular display with sorting/filtering', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: true, supportsFrozenColumns: true, supportsDensityModes: true, defaultPageSize: 50 }, mobileOptimized: true },
  { type: 'object_list', name: 'Object List', description: 'Card-based list', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: true }, mobileOptimized: true },
  { type: 'object_view', name: 'Object View', description: 'Single object detail', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'property_list', name: 'Property List', description: 'Property key-value list', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'object_set_title', name: 'Object Set Title', description: 'Title bar for an object set', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'links', name: 'Links', description: 'Links from an object', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Chart widgets
  { type: 'chart_xy', name: 'Chart XY', description: 'XY scatter/line chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'chart_pie', name: 'Pie Chart', description: 'Pie/donut chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'chart_bar', name: 'Bar Chart', description: 'Bar chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'chart_vega', name: 'Vega Chart', description: 'Vega-Lite specification chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'pivot_table', name: 'Pivot Table', description: 'Multi-dimensional pivot', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: true, supportsFrozenColumns: true, supportsDensityModes: true }, mobileOptimized: false },
  { type: 'metric_card', name: 'Metric Card', description: 'Single KPI display', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation', 'static'], supportsLiveUpdates: true, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'waterfall', name: 'Waterfall Chart', description: 'Waterfall chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'observability_chart', name: 'Observability Chart', description: 'Time-series observability chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  // Filter widgets
  { type: 'filter_list', name: 'Filter List', description: 'Histogram-based filter list', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'object_selector', name: 'Object Selector', description: 'Dropdown object selector', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'date_picker', name: 'Date Picker', description: 'Date selection', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'date_range', name: 'Date Range Picker', description: 'Date range selection', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'search_bar', name: 'Search Bar', description: 'Full-text search input', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'user_select', name: 'User Select', description: 'User directory selector', category: 'filter', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Input widgets
  { type: 'text_input', name: 'Text Input', description: 'Text input field', category: 'input', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'number_input', name: 'Number Input', description: 'Numeric input', category: 'input', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'checkbox', name: 'Checkbox', description: 'Boolean checkbox', category: 'input', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'radio_group', name: 'Radio Group', description: 'Radio button group', category: 'input', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'dropdown', name: 'Dropdown', description: 'Dropdown select', category: 'input', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Layout widgets
  { type: 'tabs', name: 'Tabs', description: 'Tabbed navigation container', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'stepper', name: 'Stepper', description: 'Multi-step workflow', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'markdown', name: 'Markdown', description: 'Markdown content display', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'header', name: 'Header', description: 'Page header', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'spacer', name: 'Spacer', description: 'Spacing element', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'divider', name: 'Divider', description: 'Visual divider', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Action widgets
  { type: 'button_group', name: 'Button Group', description: 'Action buttons', category: 'action', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'action_form', name: 'Action Form', description: 'Action parameter form', category: 'action', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Media widgets
  { type: 'media_preview', name: 'Media Preview', description: 'Image/video preview', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'media_uploader', name: 'Media Uploader', description: 'File upload widget', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'pdf_viewer', name: 'PDF Viewer', description: 'PDF document viewer', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'image_annotation', name: 'Image Annotation', description: 'Image with annotations', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'spreadsheet_display', name: 'Spreadsheet Display', description: 'Spreadsheet viewer', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: true, supportsFrozenColumns: true, supportsDensityModes: true }, mobileOptimized: false },
  // Collaboration widgets
  { type: 'comments', name: 'Comments', description: 'Comment thread', category: 'collaboration', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'action_log', name: 'Action Log', description: 'Action history timeline', category: 'collaboration', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // AI widgets
  { type: 'aip_chat', name: 'AIP Chat', description: 'AI assistant chat', category: 'ai', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'aip_generated_content', name: 'AIP Generated Content', description: 'AI-generated content display', category: 'ai', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Navigation widgets
  { type: 'mobile_navbar', name: 'Mobile Navbar', description: 'Mobile navigation bar', category: 'navigation', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'breadcrumb', name: 'Breadcrumb', description: 'Breadcrumb navigation', category: 'navigation', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Time widgets
  { type: 'time_series', name: 'Time Series Analysis', description: 'Time series chart with analysis', category: 'time', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'gantt', name: 'Gantt Chart', description: 'Gantt timeline', category: 'time', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: false, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: true, supportsFrozenColumns: true, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'timeline', name: 'Timeline', description: 'Event timeline', category: 'time', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Geo widgets
  { type: 'map', name: 'Map', description: 'Geospatial map', category: 'geo', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'current_location', name: 'Current Location', description: 'Current location manager', category: 'geo', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  // Additional widgets to reach ~60
  { type: 'video_player', name: 'Video Player', description: 'Video playback widget', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'audio_player', name: 'Audio Player', description: 'Audio playback widget', category: 'media', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_property'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'progress_bar', name: 'Progress Bar', description: 'Progress indicator', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'badge', name: 'Badge', description: 'Status badge', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'tooltip', name: 'Tooltip', description: 'Hover tooltip', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 1, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'accordion', name: 'Accordion', description: 'Collapsible sections', category: 'layout', configSchema: {}, defaultConfig: {}, supportedDataSources: ['static'], supportsLiveUpdates: false, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'tree_view', name: 'Tree View', description: 'Hierarchical tree', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 2, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: true, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'kanban', name: 'Kanban Board', description: 'Kanban-style board', category: 'data', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 4, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'calendar', name: 'Calendar', description: 'Calendar view', category: 'time', configSchema: {}, defaultConfig: {}, supportedDataSources: ['object_set'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: true },
  { type: 'heatmap', name: 'Heatmap', description: 'Heatmap visualization', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: false, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
  { type: 'scatter_plot', name: 'Scatter Plot', description: 'Scatter plot chart', category: 'chart', configSchema: {}, defaultConfig: {}, supportedDataSources: ['aggregation'], supportsLiveUpdates: true, minWidth: 3, available: true, version: '1.0.0', displayOptimization: { supportsVirtualization: false, supportsColumnResize: false, supportsFrozenColumns: false, supportsDensityModes: false }, mobileOptimized: false },
];
