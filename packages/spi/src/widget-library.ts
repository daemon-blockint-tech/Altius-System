/**
 * No-code widget library and app-building UI substrate.
 *
 * Provides:
 *   1. Widget registry — catalog of available widget types with config schemas
 *   2. App definition model — pages, sections, layouts, widget configurations
 *   3. Widget configuration persistence
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Widget registry
// ===========================================================================

/** A widget definition in the catalog. */
export interface WidgetDefinition {
  id: string;
  /** Widget type name (e.g. 'object_table', 'chart_xy', 'filter_list'). */
  type: string;
  /** Display name. */
  name: string;
  description: string;
  /** Widget category. */
  category: 'data' | 'chart' | 'filter' | 'input' | 'layout' | 'action' | 'media' | 'collaboration' | 'ai';
  /** Icon (CSS class or URL). */
  icon?: string;
  /** JSON schema for widget configuration. */
  configSchema: Record<string, unknown>;
  /** Default configuration. */
  defaultConfig: Record<string, unknown>;
  /** Data sources the widget can bind to. */
  supportedDataSources: Array<'object_set' | 'aggregation' | 'function' | 'static' | 'object_property' | 'time_series' | 'geo'>;
  /** Whether the widget supports live updates. */
  supportsLiveUpdates: boolean;
  /** Minimum width in columns. */
  minWidth: number;
  /** Whether the widget is available. */
  available: boolean;
  /** Widget version. */
  version: string;
}

// ===========================================================================
// App definitions
// ===========================================================================

/** A no-code app definition — pages, layouts, and widget configurations. */
export interface AppDefinition {
  id: string;
  tenantId: string;
  /** App name. */
  name: string;
  description: string;
  /** Pages in the app. */
  pages: AppPage[];
  /** Global variables. */
  variables?: AppVariable[];
  /** Theme configuration. */
  theme?: { primaryColor?: string; darkMode?: boolean };
  /** Owner user ID. */
  ownerId: string;
  /** Shared with user IDs. */
  sharedWith: string[];
  /** Whether the app is public. */
  isPublic: boolean;
  /** App version. */
  version: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** A page in an app definition. */
export interface AppPage {
  id: string;
  /** Page name. */
  name: string;
  /** Sections in the page. */
  sections: AppSection[];
  /** Page navigation config. */
  navigation?: { title?: string; icon?: string; hidden?: boolean };
}

/** A section in a page. */
export interface AppSection {
  id: string;
  /** Section name. */
  name?: string;
  /** Layout kind. */
  layout: 'stack' | 'grid' | 'tabs' | 'columns' | 'sidebar';
  /** Layout parameters (columns, gap, etc.). */
  layoutParams?: Record<string, unknown>;
  /** Widgets in this section. */
  widgets: WidgetInstance[];
}

/** A widget instance — a placed widget with configuration. */
export interface WidgetInstance {
  id: string;
  /** Widget type from the registry. */
  widgetType: string;
  /** Widget configuration. */
  config: Record<string, unknown>;
  /** Data binding. */
  dataBinding?: {
    source: WidgetDefinition['supportedDataSources'][number];
    objectType?: string;
    filter?: Record<string, unknown>;
    aggregation?: Record<string, unknown>;
  };
  /** Layout position. */
  position?: { x: number; y: number; w: number; h: number };
  /** Whether the widget is visible. */
  visible: boolean;
}

/** A variable in an app definition. */
export interface AppVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object_set' | 'object' | 'array' | 'date';
  source: 'static' | 'function' | 'aggregation' | 'object_property' | 'object_set';
  value?: unknown;
  objectType?: string;
  field?: string;
  filter?: Record<string, unknown>;
}

/** Input for creating an app definition. */
export interface CreateAppDefinitionInput {
  name: string;
  description?: string;
  pages?: AppPage[];
  variables?: AppVariable[];
  theme?: AppDefinition['theme'];
  isPublic?: boolean;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * No-code widget library service — widget registry, app definition CRUD,
 * and widget configuration.
 */
export interface WidgetLibraryService {
  // ── Widget registry ──
  registerWidget(ctx: RequestContext, widget: Omit<WidgetDefinition, 'id'>): Promise<WidgetDefinition>;
  getWidget(ctx: RequestContext, type: string): Promise<WidgetDefinition | null>;
  listWidgets(ctx: RequestContext, category?: WidgetDefinition['category']): Promise<WidgetDefinition[]>;

  // ── App definitions ──
  createApp(ctx: RequestContext, input: CreateAppDefinitionInput): Promise<AppDefinition>;
  getApp(ctx: RequestContext, id: string): Promise<AppDefinition | null>;
  getAppByName(ctx: RequestContext, name: string): Promise<AppDefinition | null>;
  listApps(ctx: RequestContext): Promise<AppDefinition[]>;
  updateApp(ctx: RequestContext, id: string, updates: Partial<CreateAppDefinitionInput>): Promise<AppDefinition>;
  deleteApp(ctx: RequestContext, id: string): Promise<void>;
  shareApp(ctx: RequestContext, id: string, userIds: string[]): Promise<AppDefinition>;
  duplicateApp(ctx: RequestContext, id: string, newName: string): Promise<AppDefinition>;

  // ── Page operations ──
  addPage(ctx: RequestContext, appId: string, page: Omit<AppPage, 'id'>): Promise<AppDefinition>;
  updatePage(ctx: RequestContext, appId: string, pageId: string, updates: Partial<Omit<AppPage, 'id'>>): Promise<AppDefinition>;
  removePage(ctx: RequestContext, appId: string, pageId: string): Promise<AppDefinition>;

  // ── Widget operations ──
  addWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widget: Omit<WidgetInstance, 'id'>): Promise<AppDefinition>;
  updateWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string, updates: Partial<Omit<WidgetInstance, 'id'>>): Promise<AppDefinition>;
  removeWidget(ctx: RequestContext, appId: string, pageId: string, sectionId: string, widgetId: string): Promise<AppDefinition>;
}
