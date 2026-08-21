/**
 * Widget rendering system — public API.
 *
 * This module exports everything needed to render a Workshop app
 * definition as a live React tree:
 *   - AppRenderer: top-level component
 *   - WidgetRegistry: widget type → component mapping
 *   - WidgetRenderer: renders a single widget instance
 *   - SectionRenderer, PageRenderer: layout renderers
 *   - Types: WidgetProps, WidgetContext, etc.
 */

export { AppRenderer } from './AppRenderer.js';
export type { AppRendererProps } from './AppRenderer.js';
export { PageRenderer } from './PageRenderer.js';
export type { PageRendererProps } from './PageRenderer.js';
export { SectionRenderer } from './SectionRenderer.js';
export type { SectionRendererProps } from './SectionRenderer.js';
export { WidgetRenderer } from './WidgetRenderer.js';
export type { WidgetRendererProps } from './WidgetRenderer.js';
export { registerWidget, getWidget, isWidgetImplemented, listRegisteredWidgets } from './WidgetRegistry.js';
export { authedFetch, setWidgetAuthProvider } from './auth-fetch.js';
export type { WidgetComponent, WidgetProps, WidgetContext, WidgetRegistryEntry, WorkshopWidgetInstance, WorkshopAppSection, WorkshopAppPage, WorkshopAppDefinition, ReactiveVariable } from './types.js';
