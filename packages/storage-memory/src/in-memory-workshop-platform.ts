/**
 * In-memory Workshop platform service.
 */

import { randomUUID } from 'node:crypto';
import type {
  WorkshopPlatformService,
  DragMediaType, DragEvent,
  WorkshopAppDefinition, WorkshopAppPage, WorkshopAppSection,
  WorkshopWidgetInstance, AppHeader, AppOverlay, AppTemplate,
  MobileAppConfig, MobileLaunchSession,
  AppModule, ModuleInterface,
  ReactiveVariable, VariableSource, VariableTransformation, VariableLineage,
  WidgetCatalogEntry,
  RequestContext,
} from '@altius/spi';

// ── Default widget catalog (~60 widget types) ─────────────────────────

const DEFAULT_WIDGETS: Array<Omit<WidgetCatalogEntry, 'id'>> = [
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

export class InMemoryWorkshopPlatformService implements WorkshopPlatformService {
  private readonly dragTypes = new Map<string, DragMediaType>();
  private readonly dragEvents = new Map<string, Map<string, DragEvent>>();
  private readonly apps = new Map<string, Map<string, WorkshopAppDefinition>>();
  private readonly templates = new Map<string, AppTemplate>();
  private readonly mobileConfigs = new Map<string, Map<string, MobileAppConfig>>();
  private readonly mobileSessions = new Map<string, Map<string, MobileLaunchSession>>();
  private readonly modules = new Map<string, Map<string, AppModule>>();
  private readonly variables = new Map<string, Map<string, ReactiveVariable>>();
  private readonly widgets = new Map<string, WidgetCatalogEntry>();

  constructor() {
    for (const w of DEFAULT_WIDGETS) {
      this.widgets.set(w.type, { id: randomUUID(), ...w });
    }
  }

  // ── Cross-app interactivity ──

  async registerDragMediaType(_ctx: RequestContext, mediaType: Omit<DragMediaType, 'id'>): Promise<DragMediaType> {
    const entry: DragMediaType = { id: randomUUID(), ...mediaType };
    this.dragTypes.set(entry.id, entry);
    return entry;
  }
  async listDragMediaTypes(_ctx: RequestContext): Promise<DragMediaType[]> {
    return Array.from(this.dragTypes.values());
  }
  async recordDragEvent(ctx: RequestContext, sourceAppId: string, mediaType: string, payload: Record<string, unknown>, targetAppId?: string): Promise<DragEvent> {
    const event: DragEvent = { id: randomUUID(), tenantId: ctx.tenantId, sourceAppId, targetAppId, mediaType, payload, completed: !!targetAppId, timestamp: new Date().toISOString() };
    this.getDragEventMap(ctx.tenantId).set(event.id, event);
    return event;
  }
  async listDragEvents(ctx: RequestContext, appId?: string): Promise<DragEvent[]> {
    const m = this.dragEvents.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appId) list = list.filter(e => e.sourceAppId === appId || e.targetAppId === appId);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ── App builder ──

  async createApp(ctx: RequestContext, input: { name: string; description?: string; header?: AppHeader; theme?: WorkshopAppDefinition['theme'] }): Promise<WorkshopAppDefinition> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const app: WorkshopAppDefinition = {
      id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '',
      pages: [], header: input.header, overlays: [], variableIds: [],
      theme: input.theme, ownerId: ctx.actorId ?? 'system', sharedWith: [],
      isPublic: false, version: 1, createdAt: now, updatedAt: now,
    };
    this.getAppMap(ctx.tenantId).set(id, app);
    return app;
  }
  async getApp(ctx: RequestContext, id: string): Promise<WorkshopAppDefinition | null> {
    return this.apps.get(ctx.tenantId)?.get(id) ?? null;
  }
  async listApps(ctx: RequestContext): Promise<WorkshopAppDefinition[]> {
    const m = this.apps.get(ctx.tenantId);
    return m ? Array.from(m.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  }
  async updateApp(ctx: RequestContext, id: string, updates: Partial<WorkshopAppDefinition>): Promise<WorkshopAppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    const updated = { ...app, ...updates, version: app.version + 1, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async deleteApp(ctx: RequestContext, id: string): Promise<void> { this.apps.get(ctx.tenantId)?.delete(id); }
  async shareApp(ctx: RequestContext, id: string, userIds: string[]): Promise<WorkshopAppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    const updated = { ...app, sharedWith: [...new Set([...app.sharedWith, ...userIds])] };
    this.getAppMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async duplicateApp(ctx: RequestContext, id: string, newName: string): Promise<WorkshopAppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    return this.createApp(ctx, { name: newName, description: app.description, header: app.header, theme: app.theme });
  }

  // ── Pages/sections/widgets ──

  async addPage(ctx: RequestContext, appId: string, page: Omit<WorkshopAppPage, 'id'>): Promise<WorkshopAppDefinition> {
    return this.updateAppPages(ctx, appId, app => [...app.pages, { id: randomUUID(), ...page }]);
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
      return { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, widgets: [...s.widgets, { id: randomUUID(), ...widget }] } : s) };
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
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const updated = { ...app, overlays: [...app.overlays, { id: randomUUID(), ...overlay }], updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async removeOverlay(ctx: RequestContext, appId: string, overlayId: string): Promise<WorkshopAppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const updated = { ...app, overlays: app.overlays.filter(o => o.id !== overlayId), updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }

  // ── Templates ──

  async createTemplate(_ctx: RequestContext, template: Omit<AppTemplate, 'id'>): Promise<AppTemplate> {
    const t: AppTemplate = { id: randomUUID(), ...template };
    this.templates.set(t.id, t);
    return t;
  }
  async listTemplates(_ctx: RequestContext, category?: string): Promise<AppTemplate[]> {
    let list = Array.from(this.templates.values());
    if (category) list = list.filter(t => t.category === category);
    return list;
  }
  async createAppFromTemplate(ctx: RequestContext, templateId: string, name: string): Promise<WorkshopAppDefinition> {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);
    const app = await this.createApp(ctx, { name, description: template.description, header: template.template.header, theme: template.template.theme });
    const updated = { ...app, templateId, pages: template.template.pages ?? [] };
    this.getAppMap(ctx.tenantId).set(app.id, updated);
    return updated;
  }

  // ── Mobile ──

  async getMobileConfig(ctx: RequestContext, appId: string): Promise<MobileAppConfig | null> {
    return this.mobileConfigs.get(ctx.tenantId)?.get(appId) ?? null;
  }
  async updateMobileConfig(ctx: RequestContext, appId: string, updates: Partial<Omit<MobileAppConfig, 'id' | 'tenantId' | 'appId' | 'updatedAt'>>): Promise<MobileAppConfig> {
    const existing = await this.getMobileConfig(ctx, appId);
    const config: MobileAppConfig = existing ?? {
      id: randomUUID(), tenantId: ctx.tenantId, appId,
      enabled: false, designMode: 'responsive',
      navBar: { items: [], position: 'bottom' },
      qrReaderEnabled: false, geolocationEnabled: false,
      historyNavigation: { enabled: false }, mobileWidgetIds: [],
      updatedAt: new Date().toISOString(),
    };
    const updated = { ...config, ...updates, updatedAt: new Date().toISOString() };
    this.getMobileConfigMap(ctx.tenantId).set(appId, updated);
    return updated;
  }
  async launchMobileSession(ctx: RequestContext, appId: string, device: MobileLaunchSession['device']): Promise<MobileLaunchSession> {
    const now = new Date().toISOString();
    const session: MobileLaunchSession = {
      id: randomUUID(), tenantId: ctx.tenantId, appId,
      userId: ctx.actorId ?? 'system', device, active: true,
      launchedAt: now, lastActivityAt: now,
    };
    this.getMobileSessionMap(ctx.tenantId).set(session.id, session);
    return session;
  }
  async listMobileSessions(ctx: RequestContext, appId?: string): Promise<MobileLaunchSession[]> {
    const m = this.mobileSessions.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appId) list = list.filter(s => s.appId === appId);
    return list.sort((a, b) => b.launchedAt.localeCompare(a.launchedAt));
  }
  async endMobileSession(ctx: RequestContext, sessionId: string): Promise<void> {
    const s = this.mobileSessions.get(ctx.tenantId)?.get(sessionId);
    if (s) { s.active = false; this.getMobileSessionMap(ctx.tenantId).set(sessionId, s); }
  }

  // ── Modular composition ──

  async createModule(ctx: RequestContext, input: { name: string; description?: string; interface: ModuleInterface; sections: WorkshopAppSection[] }): Promise<AppModule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const mod: AppModule = {
      id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '',
      interface: input.interface, sections: input.sections, published: false,
      version: 1, ownerId: ctx.actorId ?? 'system', createdAt: now, updatedAt: now,
    };
    this.getModuleMap(ctx.tenantId).set(id, mod);
    return mod;
  }
  async getModule(ctx: RequestContext, id: string): Promise<AppModule | null> {
    return this.modules.get(ctx.tenantId)?.get(id) ?? null;
  }
  async listModules(ctx: RequestContext): Promise<AppModule[]> {
    const m = this.modules.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }
  async publishModule(ctx: RequestContext, id: string): Promise<AppModule> {
    const mod = this.modules.get(ctx.tenantId)?.get(id);
    if (!mod) throw new Error(`Module not found: ${id}`);
    const updated = { ...mod, published: true, updatedAt: new Date().toISOString() };
    this.getModuleMap(ctx.tenantId).set(id, updated);
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
    const id = randomUUID();
    const now = new Date().toISOString();
    const v: ReactiveVariable = {
      id, tenantId: ctx.tenantId, appId: input.appId, name: input.name, type: input.type,
      source: input.source, lazy: input.lazy ?? true, transformations: input.transformations,
      structFields: input.structFields, description: input.description ?? '',
      createdAt: now, updatedAt: now,
    };
    this.getVariableMap(ctx.tenantId).set(id, v);
    return v;
  }
  async getVariable(ctx: RequestContext, id: string): Promise<ReactiveVariable | null> {
    return this.variables.get(ctx.tenantId)?.get(id) ?? null;
  }
  async getVariableByName(ctx: RequestContext, appId: string, name: string): Promise<ReactiveVariable | null> {
    const m = this.variables.get(ctx.tenantId);
    if (!m) return null;
    for (const v of m.values()) { if (v.appId === appId && v.name === name) return v; }
    return null;
  }
  async listVariables(ctx: RequestContext, appId: string): Promise<ReactiveVariable[]> {
    const m = this.variables.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(v => v.appId === appId);
  }
  async updateVariable(ctx: RequestContext, id: string, updates: Partial<ReactiveVariable>): Promise<ReactiveVariable> {
    const v = this.variables.get(ctx.tenantId)?.get(id);
    if (!v) throw new Error(`Variable not found: ${id}`);
    const updated = { ...v, ...updates, updatedAt: new Date().toISOString() };
    this.getVariableMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async deleteVariable(ctx: RequestContext, id: string): Promise<void> {
    this.variables.get(ctx.tenantId)?.delete(id);
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
    return null; // In-memory: non-static sources return null
  }

  // ── Widget catalog ──

  async listWidgetCatalog(_ctx: RequestContext, category?: WidgetCatalogEntry['category']): Promise<WidgetCatalogEntry[]> {
    let list = Array.from(this.widgets.values());
    if (category) list = list.filter(w => w.category === category);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  async getWidgetCatalogEntry(_ctx: RequestContext, type: string): Promise<WidgetCatalogEntry | null> {
    return this.widgets.get(type) ?? null;
  }
  async registerWidgetCatalogEntry(_ctx: RequestContext, entry: Omit<WidgetCatalogEntry, 'id'>): Promise<WidgetCatalogEntry> {
    const e: WidgetCatalogEntry = { id: randomUUID(), ...entry };
    this.widgets.set(entry.type, e);
    return e;
  }

  // ── Private helpers ──

  private async updateAppPages(ctx: RequestContext, appId: string, fn: (app: WorkshopAppDefinition) => WorkshopAppPage[]): Promise<WorkshopAppDefinition> {
    const app = this.apps.get(ctx.tenantId)?.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const updated = { ...app, pages: fn(app), version: app.version + 1, updatedAt: new Date().toISOString() };
    this.getAppMap(ctx.tenantId).set(appId, updated);
    return updated;
  }

  private getDragEventMap(t: string) { let m = this.dragEvents.get(t); if (!m) { m = new Map(); this.dragEvents.set(t, m); } return m; }
  private getAppMap(t: string) { let m = this.apps.get(t); if (!m) { m = new Map(); this.apps.set(t, m); } return m; }
  private getMobileConfigMap(t: string) { let m = this.mobileConfigs.get(t); if (!m) { m = new Map(); this.mobileConfigs.set(t, m); } return m; }
  private getMobileSessionMap(t: string) { let m = this.mobileSessions.get(t); if (!m) { m = new Map(); this.mobileSessions.set(t, m); } return m; }
  private getModuleMap(t: string) { let m = this.modules.get(t); if (!m) { m = new Map(); this.modules.set(t, m); } return m; }
  private getVariableMap(t: string) { let m = this.variables.get(t); if (!m) { m = new Map(); this.variables.set(t, m); } return m; }
}
