/**
 * Widget registry — maps widget types to React components.
 *
 * The registry is the bridge between the WorkshopPlatformService widget
 * catalog (which defines what widgets exist) and the React rendering layer
 * (which knows how to draw them). A widget type that has no component
 * registered renders a PlaceholderWidget.
 */

import type { WidgetComponent, WidgetRegistryEntry } from './types.js';
import { ObjectTableWidget } from './components/ObjectTableWidget.js';
import { ObjectListWidget } from './components/ObjectListWidget.js';
import { ObjectViewWidget } from './components/ObjectViewWidget.js';
import { MetricCardWidget } from './components/MetricCardWidget.js';
import { MarkdownWidget } from './components/MarkdownWidget.js';
import { ActionFormWidget } from './components/ActionFormWidget.js';
import { ButtonGroupWidget } from './components/ButtonGroupWidget.js';
import { FilterListWidget } from './components/FilterListWidget.js';
import { SearchBarWidget } from './components/SearchBarWidget.js';
import { TextInputWidget } from './components/TextInputWidget.js';
import { NumberInputWidget } from './components/NumberInputWidget.js';
import { DatePickerWidget } from './components/DatePickerWidget.js';
import { CheckboxWidget } from './components/CheckboxWidget.js';
import { TabsWidget } from './components/TabsWidget.js';
import { StepperWidget } from './components/StepperWidget.js';
import { HeaderWidget } from './components/HeaderWidget.js';
import { ChartXYWidget } from './components/ChartXYWidget.js';
import { ChartPieWidget } from './components/ChartPieWidget.js';
import { PivotTableWidget } from './components/PivotTableWidget.js';
import { GraphWidget } from './components/GraphWidget.js';
import { TimeSeriesWidget } from './components/TimeSeriesWidget.js';
import { MobileNavbarWidget } from './components/MobileNavbarWidget.js';
import { CurrentLocationWidget } from './components/CurrentLocationWidget.js';
import { DigitalTwinCanvasWidget } from './components/DigitalTwinCanvasWidget.js';
import { TimeSeriesAnalysisWidget } from './components/TimeSeriesAnalysisWidget.js';
import { PlaceholderWidget } from './components/PlaceholderWidget.js';

// ── Registry ──────────────────────────────────────────────────

const REGISTRY = new Map<string, WidgetRegistryEntry>();

/** Register a widget component for a widget type. */
export function registerWidget(type: string, component: WidgetComponent, implemented = true): void {
  REGISTRY.set(type, { type, component, implemented });
}

/** Get the registry entry for a widget type. */
export function getWidget(type: string): WidgetRegistryEntry | undefined {
  return REGISTRY.get(type);
}

/** Check if a widget type has a registered component. */
export function isWidgetImplemented(type: string): boolean {
  return REGISTRY.get(type)?.implemented ?? false;
}

/** List all registered widget types. */
export function listRegisteredWidgets(): string[] {
  return Array.from(REGISTRY.keys());
}

// ── Built-in registrations ─────────────────────────────────────
// Real implementations (8):
registerWidget('object_table', ObjectTableWidget);
registerWidget('object_list', ObjectListWidget);
registerWidget('object_view', ObjectViewWidget);
registerWidget('metric_card', MetricCardWidget);
registerWidget('markdown', MarkdownWidget);
registerWidget('action_form', ActionFormWidget);
registerWidget('button_group', ButtonGroupWidget);
registerWidget('filter_list', FilterListWidget);
registerWidget('search_bar', SearchBarWidget);
registerWidget('text_input', TextInputWidget);
registerWidget('number_input', NumberInputWidget);
registerWidget('date_picker', DatePickerWidget);
registerWidget('checkbox', CheckboxWidget);
registerWidget('tabs', TabsWidget);
registerWidget('stepper', StepperWidget);
registerWidget('header', HeaderWidget);

// Phase 2: Chart & graph widgets (5 real implementations):
registerWidget('chart_xy', ChartXYWidget);
registerWidget('chart_pie', ChartPieWidget);
registerWidget('pivot_table', PivotTableWidget);
registerWidget('map', GraphWidget);       // graph visualization reuses GraphWidget for now
registerWidget('time_series', TimeSeriesWidget);

// Phase 4: Mobile, digital twin, and TS analysis widgets (4 real implementations):
registerWidget('mobile_navbar', MobileNavbarWidget);
registerWidget('current_location', CurrentLocationWidget);
registerWidget('digital_twin', DigitalTwinCanvasWidget);
registerWidget('time_series_analysis', TimeSeriesAnalysisWidget);

// Stubs for the remaining 35 widget types:
const STUB_TYPES = [
  // chart
  'chart_bar', 'chart_vega',
  'waterfall', 'observability_chart', 'heatmap', 'scatter_plot',
  // filter
  'object_selector', 'date_range', 'user_select',
  // input
  'radio_group', 'dropdown',
  // layout
  'spacer', 'divider', 'progress_bar', 'badge', 'tooltip', 'accordion',
  'property_list', 'object_set_title', 'links', 'tree_view', 'kanban',
  // action
  // media
  'media_preview', 'media_uploader', 'pdf_viewer', 'image_annotation',
  'spreadsheet_display', 'video_player', 'audio_player',
  // collaboration
  'comments', 'action_log',
  // ai
  'aip_chat', 'aip_generated_content',
  // navigation
  'breadcrumb',
  // time
  'gantt', 'timeline', 'calendar',
];

for (const type of STUB_TYPES) {
  registerWidget(type, PlaceholderWidget, false);
}
