/**
 * Workshop platform services — cross-app interactivity, low-code app builder,
 * mobile support, modular composition, reactive variables, and widget library.
 *
 * Covers six backlog rows:
 *   - workshop-ui/cross-application-interactivity (drag-drop, app pairing, commands)
 *   - workshop-ui/low-code-application-builder (module model: pages, sections, layouts, overlays, templates)
 *   - workshop-ui/mobile-application-support (launcher, mobile design mode, nav/QR/location, history)
 *   - workshop-ui/modular-composition-reuse (embedded modules, loop layouts, module interface, URL init)
 *   - workshop-ui/reactive-variables-data-binding (typed variables, sources, transformations, lineage)
 *   - workshop-ui/widget-library-60-widgets (expanded widget catalog with display optimization)
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Cross-app interactivity: drag-and-drop media types
// ===========================================================================

/** A drag-and-drop media type — a typed payload format for cross-app drag. */
export interface DragMediaType {
  id: string;
  /** Media type name (e.g. 'application/x-altius-object'). */
  type: string;
  /** Display label. */
  label: string;
  /** Description. */
  description: string;
  /** Payload schema (JSON schema fragment). */
  payloadSchema: Record<string, unknown>;
  /** Whether this media type can be dragged. */
  draggable: boolean;
  /** Whether this media type can be dropped. */
  droppable: boolean;
  /** App IDs that produce this media type. */
  producerApps: string[];
  /** App IDs that consume this media type. */
  consumerApps: string[];
}

/** A drag event — a payload dragged from one app to another. */
export interface DragEvent {
  id: string;
  tenantId: string;
  /** Source app ID. */
  sourceAppId: string;
  /** Target app ID (if dropped). */
  targetAppId?: string;
  /** Media type. */
  mediaType: string;
  /** Payload. */
  payload: Record<string, unknown>;
  /** Whether the drag was completed (dropped). */
  completed: boolean;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

// ===========================================================================
// Low-code app builder: module model
// ===========================================================================

/** App header configuration. */
export interface AppHeader {
  title: string;
  subtitle?: string;
  logoUrl?: string;
  actions?: Array<{ name: string; label: string; actionName?: string }>;
}

/** App overlay configuration. */
export interface AppOverlay {
  id: string;
  name: string;
  kind: 'modal' | 'drawer' | 'popover' | 'toast';
  trigger: 'button' | 'action' | 'auto';
  width?: string;
  height?: string;
  widgetIds: string[];
}

/** App template — a pre-built app definition. */
export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Template app definition (partial). */
  template: Partial<WorkshopAppDefinition>;
  /** Tags. */
  tags: string[];
}

/** A complete Workshop app definition — the module model. */
export interface WorkshopAppDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** Pages. */
  pages: WorkshopAppPage[];
  /** Header. */
  header?: AppHeader;
  /** Overlays. */
  overlays: AppOverlay[];
  /** Global variables (references to variable definitions). */
  variableIds: string[];
  /** Module interface — inputs/outputs for embedded use. */
  moduleInterface?: ModuleInterface;
  /** Template ID (if created from a template). */
  templateId?: string;
  /** Theme. */
  theme?: { primaryColor?: string; darkMode?: boolean; density?: 'compact' | 'comfortable' };
  /** Owner. */
  ownerId: string;
  sharedWith: string[];
  isPublic: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A page in a Workshop app. */
export interface WorkshopAppPage {
  id: string;
  name: string;
  /** Sections. */
  sections: WorkshopAppSection[];
  /** Navigation config. */
  navigation?: { title?: string; icon?: string; hidden?: boolean; order?: number };
  /** URL path for deep linking. */
  path?: string;
}

/** A section in a page. */
export interface WorkshopAppSection {
  id: string;
  name?: string;
  layout: 'stack' | 'grid' | 'tabs' | 'columns' | 'sidebar' | 'loop';
  layoutParams?: Record<string, unknown>;
  /** Widget instances. */
  widgets: WorkshopWidgetInstance[];
  /** Loop config (if layout is 'loop'). */
  loopConfig?: { variableName: string; itemVariableName: string };
  /** Embedded module ID (if this section embeds a module). */
  embeddedModuleId?: string;
  /** Module input bindings (if embedded). */
  moduleInputs?: Record<string, string>;
}

/** A widget instance in a section. */
export interface WorkshopWidgetInstance {
  id: string;
  widgetType: string;
  config: Record<string, unknown>;
  /** Data binding — variable name. */
  boundVariable?: string;
  /** Position. */
  position?: { x: number; y: number; w: number; h: number };
  visible: boolean;
  /** Display optimization settings. */
  displayOptimization?: {
    pageSize?: number;
    virtualization?: boolean;
    columnWidths?: Record<string, number>;
    frozenColumns?: string[];
    density?: 'compact' | 'comfortable';
    showHeader?: boolean;
    showFooter?: boolean;
  };
}

// ===========================================================================
// Mobile support
// ===========================================================================

/** Mobile app configuration. */
export interface MobileAppConfig {
  id: string;
  tenantId: string;
  /** App ID this mobile config belongs to. */
  appId: string;
  /** Whether mobile mode is enabled. */
  enabled: boolean;
  /** Mobile design mode. */
  designMode: 'responsive' | 'dedicated';
  /** Mobile navigation bar config. */
  navBar: {
    items: Array<{ label: string; pageId: string; icon?: string }>;
    position: 'bottom' | 'top' | 'hidden';
  };
  /** Whether QR code reader is enabled. */
  qrReaderEnabled: boolean;
  /** Whether geolocation prompt is enabled. */
  geolocationEnabled: boolean;
  /** Browser history navigation config. */
  historyNavigation: {
    enabled: boolean;
    deepLinkPattern?: string;
  };
  /** Mobile-optimized widget IDs. */
  mobileWidgetIds: string[];
  /** ISO 8601 last update. */
  updatedAt: string;
}

/** Mobile launch session — a kiosk/launcher session. */
export interface MobileLaunchSession {
  id: string;
  tenantId: string;
  /** App ID. */
  appId: string;
  /** User ID. */
  userId: string;
  /** Device info. */
  device: { platform: string; model?: string; osVersion?: string };
  /** Whether the session is active. */
  active: boolean;
  /** ISO 8601 launch timestamp. */
  launchedAt: string;
  /** ISO 8601 last activity. */
  lastActivityAt: string;
}

// ===========================================================================
// Modular composition
// ===========================================================================

/** A module — a reusable app fragment that can be embedded. */
export interface AppModule {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** Module interface — inputs and outputs. */
  interface: ModuleInterface;
  /** Module pages/sections. */
  sections: WorkshopAppSection[];
  /** Whether the module is published. */
  published: boolean;
  /** Version. */
  version: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

/** Module interface — declared inputs and outputs. */
export interface ModuleInterface {
  inputs: Array<{ name: string; type: string; required: boolean; defaultValue?: unknown }>;
  outputs: Array<{ name: string; type: string }>;
}

/** A module instance — an embedded module with bound inputs. */
export interface ModuleInstance {
  id: string;
  moduleId: string;
  /** Input bindings — variable name to module input. */
  inputBindings: Record<string, string>;
  /** Output bindings — module output to variable name. */
  outputBindings: Record<string, string>;
}

// ===========================================================================
// Reactive variables
// ===========================================================================

/** A reactive variable definition. */
export interface ReactiveVariable {
  id: string;
  tenantId: string;
  /** App ID. */
  appId: string;
  /** Variable name. */
  name: string;
  /** Variable type. */
  type: 'string' | 'number' | 'boolean' | 'date' | 'object_set' | 'object' | 'array' | 'struct' | 'aggregation';
  /** Data source. */
  source: VariableSource;
  /** Whether recompute is lazy. */
  lazy: boolean;
  /** Transformations applied to the source value. */
  transformations?: VariableTransformation[];
  /** Struct fields (if type is 'struct'). */
  structFields?: Array<{ name: string; type: string }>;
  /** Description. */
  description: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update. */
  updatedAt: string;
}

/** A variable data source. */
export interface VariableSource {
  kind: 'static' | 'function' | 'aggregation' | 'object_property' | 'object_set' | 'expression';
  /** Static value (if kind is 'static'). */
  value?: unknown;
  /** Function name (if kind is 'function'). */
  functionName?: string;
  /** Function parameters. */
  functionParams?: Record<string, unknown>;
  /** Object type (if kind is 'object_property' or 'object_set'). */
  objectType?: string;
  /** Object ID (if kind is 'object_property'). */
  objectId?: string;
  /** Property name (if kind is 'object_property'). */
  propertyName?: string;
  /** Filter (if kind is 'object_set'). */
  filter?: Record<string, unknown>;
  /** Aggregation config (if kind is 'aggregation'). */
  aggregation?: { function: string; field?: string; groupBy?: string[] };
  /** Expression (if kind is 'expression'). */
  expression?: string;
  /** Dependencies — other variable names this source depends on. */
  dependencies?: string[];
}

/** A variable transformation. */
export interface VariableTransformation {
  kind: 'map' | 'filter' | 'sort' | 'reduce' | 'format' | 'lookup' | 'math' | 'string_op';
  /** Transformation parameters. */
  params: Record<string, unknown>;
}

/** Variable lineage — dependency graph. */
export interface VariableLineage {
  variableName: string;
  dependsOn: string[];
  dependedBy: string[];
}

// ===========================================================================
// Widget library expansion
// ===========================================================================

/** A widget definition with display optimization metadata. */
export interface WidgetCatalogEntry {
  id: string;
  type: string;
  name: string;
  description: string;
  category: 'data' | 'chart' | 'filter' | 'input' | 'layout' | 'action' | 'media' | 'collaboration' | 'ai' | 'navigation' | 'time' | 'geo';
  icon?: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  supportedDataSources: string[];
  supportsLiveUpdates: boolean;
  minWidth: number;
  available: boolean;
  version: string;
  /** Display optimization capabilities. */
  displayOptimization: {
    supportsVirtualization: boolean;
    supportsColumnResize: boolean;
    supportsFrozenColumns: boolean;
    supportsDensityModes: boolean;
    defaultPageSize?: number;
  };
  /** Mobile support. */
  mobileOptimized: boolean;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Workshop platform service — the unified backend for the Workshop UI layer.
 */
export interface WorkshopPlatformService {
  // ── Cross-app interactivity ──
  registerDragMediaType(ctx: RequestContext, mediaType: Omit<DragMediaType, 'id'>): Promise<DragMediaType>;
  listDragMediaTypes(ctx: RequestContext): Promise<DragMediaType[]>;
  recordDragEvent(ctx: RequestContext, sourceAppId: string, mediaType: string, payload: Record<string, unknown>, targetAppId?: string): Promise<DragEvent>;
  listDragEvents(ctx: RequestContext, appId?: string): Promise<DragEvent[]>;

  // ── App builder ──
  createApp(ctx: RequestContext, input: { name: string; description?: string; header?: AppHeader; theme?: WorkshopAppDefinition['theme'] }): Promise<WorkshopAppDefinition>;
  getApp(ctx: RequestContext, id: string): Promise<WorkshopAppDefinition | null>;
  listApps(ctx: RequestContext): Promise<WorkshopAppDefinition[]>;
  updateApp(ctx: RequestContext, id: string, updates: Partial<WorkshopAppDefinition>): Promise<WorkshopAppDefinition>;
  deleteApp(ctx: RequestContext, id: string): Promise<void>;
  shareApp(ctx: RequestContext, id: string, userIds: string[]): Promise<WorkshopAppDefinition>;
  duplicateApp(ctx: RequestContext, id: string, newName: string): Promise<WorkshopAppDefinition>;

  // ── Pages/sections/widgets ──
  addPage(ctx: RequestContext, appId: string, page: Omit<WorkshopAppPage, 'id'>): Promise<WorkshopAppDefinition>;
  updatePage(ctx: RequestContext, appId: string, pageId: string, updates: Partial<Omit<WorkshopAppPage, 'id'>>): Promise<WorkshopAppDefinition>;
  removePage(ctx: RequestContext, appId: string, pageId: string): Promise<WorkshopAppDefinition>;
  addWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widget: Omit<WorkshopWidgetInstance, 'id'>): Promise<WorkshopAppDefinition>;
  updateWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string, updates: Partial<Omit<WorkshopWidgetInstance, 'id'>>): Promise<WorkshopAppDefinition>;
  removeWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string): Promise<WorkshopAppDefinition>;

  // ── Overlays ──
  addOverlay(ctx: RequestContext, appId: string, overlay: Omit<AppOverlay, 'id'>): Promise<WorkshopAppDefinition>;
  removeOverlay(ctx: RequestContext, appId: string, overlayId: string): Promise<WorkshopAppDefinition>;

  // ── Templates ──
  createTemplate(ctx: RequestContext, template: Omit<AppTemplate, 'id'>): Promise<AppTemplate>;
  listTemplates(ctx: RequestContext, category?: string): Promise<AppTemplate[]>;
  createAppFromTemplate(ctx: RequestContext, templateId: string, name: string): Promise<WorkshopAppDefinition>;

  // ── Mobile ──
  getMobileConfig(ctx: RequestContext, appId: string): Promise<MobileAppConfig | null>;
  updateMobileConfig(ctx: RequestContext, appId: string, updates: Partial<Omit<MobileAppConfig, 'id' | 'tenantId' | 'appId' | 'updatedAt'>>): Promise<MobileAppConfig>;
  launchMobileSession(ctx: RequestContext, appId: string, device: MobileLaunchSession['device']): Promise<MobileLaunchSession>;
  listMobileSessions(ctx: RequestContext, appId?: string): Promise<MobileLaunchSession[]>;
  endMobileSession(ctx: RequestContext, sessionId: string): Promise<void>;

  // ── Modular composition ──
  createModule(ctx: RequestContext, input: { name: string; description?: string; interface: ModuleInterface; sections: WorkshopAppSection[] }): Promise<AppModule>;
  getModule(ctx: RequestContext, id: string): Promise<AppModule | null>;
  listModules(ctx: RequestContext): Promise<AppModule[]>;
  publishModule(ctx: RequestContext, id: string): Promise<AppModule>;
  /** Embed a module in a section with input bindings. */
  embedModule(ctx: RequestContext, appId: string, pageId: string, sectionId: string, moduleId: string, inputBindings: Record<string, string>): Promise<WorkshopAppDefinition>;

  // ── Reactive variables ──
  createVariable(ctx: RequestContext, input: { appId: string; name: string; type: ReactiveVariable['type']; source: VariableSource; lazy?: boolean; transformations?: VariableTransformation[]; structFields?: Array<{ name: string; type: string }>; description?: string }): Promise<ReactiveVariable>;
  getVariable(ctx: RequestContext, id: string): Promise<ReactiveVariable | null>;
  getVariableByName(ctx: RequestContext, appId: string, name: string): Promise<ReactiveVariable | null>;
  listVariables(ctx: RequestContext, appId: string): Promise<ReactiveVariable[]>;
  updateVariable(ctx: RequestContext, id: string, updates: Partial<ReactiveVariable>): Promise<ReactiveVariable>;
  deleteVariable(ctx: RequestContext, id: string): Promise<void>;
  /** Get the lineage graph for an app's variables. */
  getVariableLineage(ctx: RequestContext, appId: string): Promise<VariableLineage[]>;
  /** Evaluate a variable's value (in-memory: returns the static value or a placeholder). */
  evaluateVariable(ctx: RequestContext, id: string): Promise<unknown>;

  // ── Widget catalog ──
  listWidgetCatalog(ctx: RequestContext, category?: WidgetCatalogEntry['category']): Promise<WidgetCatalogEntry[]>;
  getWidgetCatalogEntry(ctx: RequestContext, type: string): Promise<WidgetCatalogEntry | null>;
  registerWidgetCatalogEntry(ctx: RequestContext, entry: Omit<WidgetCatalogEntry, 'id'>): Promise<WidgetCatalogEntry>;
}
