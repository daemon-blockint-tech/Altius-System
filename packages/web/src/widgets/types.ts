/**
 * Shared types for the widget rendering system.
 *
 * The widget rendering system takes a WorkshopAppDefinition (from
 * WorkshopPlatformService) and renders it as a live React tree —
 * no hardcoded screens. Each widget type maps to a React component
 * via the WidgetRegistry.
 *
 * The types here mirror the SPI types in packages/spi/src/workshop-platform.ts.
 * They are duplicated rather than imported to keep the web package
 * free of a direct SPI dependency — the frontend consumes the SDK,
 * not the platform SPI.
 */

// ── Workshop app model (mirrors @altius/spi workshop-platform.ts) ──

export interface WorkshopWidgetInstance {
  id: string;
  widgetType: string;
  config: Record<string, unknown>;
  boundVariable?: string;
  position?: { x: number; y: number; w: number; h: number };
  visible: boolean;
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

export interface WorkshopAppSection {
  id: string;
  name?: string;
  layout: 'stack' | 'grid' | 'tabs' | 'columns' | 'sidebar' | 'loop';
  layoutParams?: Record<string, unknown>;
  widgets: WorkshopWidgetInstance[];
  loopConfig?: { variableName: string; itemVariableName: string };
  embeddedModuleId?: string;
  moduleInputs?: Record<string, string>;
}

export interface WorkshopAppPage {
  id: string;
  name: string;
  sections: WorkshopAppSection[];
  navigation?: { title?: string; icon?: string; hidden?: boolean; order?: number };
  path?: string;
}

export interface AppHeader {
  title: string;
  subtitle?: string;
  logoUrl?: string;
  actions?: Array<{ name: string; label: string; actionName?: string }>;
}

export interface WorkshopAppDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  pages: WorkshopAppPage[];
  header?: AppHeader;
  overlays: unknown[];
  variableIds: string[];
  moduleInterface?: unknown;
  templateId?: string;
  theme?: { primaryColor?: string; darkMode?: boolean; density?: 'compact' | 'comfortable' };
  ownerId: string;
  sharedWith: string[];
  isPublic: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReactiveVariable {
  id: string;
  tenantId: string;
  appId: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object_set' | 'object' | 'array' | 'struct' | 'aggregation';
  source: unknown;
  lazy: boolean;
  transformations?: unknown[];
  structFields?: Array<{ name: string; type: string }>;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ── Widget runtime types ───────────────────────────────────────

/**
 * The context every widget receives. This is the runtime side of the
 * module model — it carries the SDK client, the current variable values,
 * and callbacks for variable updates and navigation.
 */
export interface WidgetContext {
  /** The Altius SDK client (typed, caller-scoped). */
  client: unknown;
  /** Current variable values, keyed by variable name. */
  variables: Record<string, unknown>;
  /** Update a variable value (triggers re-render of dependent widgets). */
  setVariable: (name: string, value: unknown) => void;
  /** Navigate to a page by ID. */
  navigate: (pageId: string) => void;
  /** The current page ID. */
  currentPageId: string;
  /** Tenant ID. */
  tenantId: string;
  /** User ID. */
  userId: string;
}

/**
 * Props every widget component receives.
 */
export interface WidgetProps {
  /** The widget instance from the app definition. */
  instance: WorkshopWidgetInstance;
  /** Runtime context. */
  ctx: WidgetContext;
}

/**
 * A widget component is a React component that takes WidgetProps.
 */
export type WidgetComponent = (props: WidgetProps) => React.ReactNode;

/**
 * Widget registry entry — maps a widget type to its component and metadata.
 */
export interface WidgetRegistryEntry {
  type: string;
  component: WidgetComponent;
  implemented: boolean;
}
