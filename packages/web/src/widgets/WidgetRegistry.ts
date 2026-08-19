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
import { MapWidget } from './components/MapWidget.js';
import { GraphWidget } from './components/GraphWidget.js';
import { ScenarioWidget } from './components/ScenarioWidget.js';
import { CommentsWidget } from './components/CommentsWidget.js';
import { ActionLogTimelineWidget } from './components/ActionLogTimelineWidget.js';
import {
  ChartBarWidget, ChartVegaWidget, WaterfallWidget, ObservabilityChartWidget,
  HeatmapWidget, ScatterPlotWidget,
  ObjectSelectorWidget, DateRangeWidget, UserSelectWidget,
  RadioGroupWidget, DropdownWidget,
  SpacerWidget, DividerWidget, ProgressBarWidget, BadgeWidget, TooltipWidget,
  AccordionWidget, PropertyListWidget, ObjectSetTitleWidget, LinksWidget,
  TreeViewWidget, KanbanWidget,
  AipChatWidget, AipGeneratedContentWidget,
  BreadcrumbWidget,
  GanttWidget, TimelineWidget, CalendarWidget,
} from './components/StubWidgets.js';
import {
  SavedViewsWidget, EditHistoryWidget, ResourceBrowserWidget,
  IframeWidget, AppPairingWidget,
} from './components/Phase20ExtraWidgets.js';
import { TimeSeriesWidget } from './components/TimeSeriesWidget.js';
import { MobileNavbarWidget } from './components/MobileNavbarWidget.js';
import { CurrentLocationWidget } from './components/CurrentLocationWidget.js';
import { DigitalTwinCanvasWidget } from './components/DigitalTwinCanvasWidget.js';
import { TimeSeriesAnalysisWidget } from './components/TimeSeriesAnalysisWidget.js';
import { MediaPreviewWidget } from './components/MediaPreviewWidget.js';
import { MediaUploaderWidget } from './components/MediaUploaderWidget.js';
import { PdfViewerWidget } from './components/PdfViewerWidget.js';
import { ImageAnnotationWidget } from './components/ImageAnnotationWidget.js';
import { SpreadsheetDisplayWidget } from './components/SpreadsheetDisplayWidget.js';
import { VideoPlayerWidget } from './components/VideoPlayerWidget.js';
import { AudioPlayerWidget } from './components/AudioPlayerWidget.js';
import {
  DataFreshnessWidget,
  OntologyChangeHistoryWidget,
  ValueFormattingWidget,
  DesignSystemThemeWidget,
  FunctionBackedWidget,
  LiveDataPushWidget,
  QrCodeReaderWidget,
  CameraCaptureWidget,
  VisualOntologyManagerWidget,
  OntologyMetadataCatalogWidget,
  KioskModeWidget,
} from './components/Fase21Widgets.js';
import {
  MobileAppLauncherWidget,
  ViewportSwitcherWidget,
  QRDeepLinkLaunchWidget,
  GeolocationPromptWidget,
  GraphVisualizationWidget,
  ObjectSetFilterStateWidget,
  CommandLauncherWidget,
} from './components/Fase22Widgets.js';
import {
  ActionFormConfigWidget,
  OntologyChangeManagerWidget,
  BranchManagerWidget,
  TransformExpressionWidget,
} from './components/Fase23Widgets.js';
import {
  DatasetTableWidget,
  BatchTransformWidget,
  SqlWorkbenchWidget,
  PipelineBuilderWidget,
  DataExpectationsWidget,
  RulesEngineWidget,
  VariableTransformerWidget,
  SqlAnalyticsWidget,
  CdcIngestWidget,
  DatasourceMapperWidget,
  BuildTriggerWidget,
} from './components/Fase24Widgets.js';
// PlaceholderWidget is no longer imported — all widget types now have real implementations.
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
registerWidget('map', MapWidget);
registerWidget('graph', GraphWidget);
registerWidget('time_series', TimeSeriesWidget);

// Phase 4: Mobile, digital twin, and TS analysis widgets (4 real implementations):
registerWidget('mobile_navbar', MobileNavbarWidget);
registerWidget('current_location', CurrentLocationWidget);
registerWidget('digital_twin', DigitalTwinCanvasWidget);
registerWidget('time_series_analysis', TimeSeriesAnalysisWidget);

// Phase 4: Media widgets (7 real implementations):
registerWidget('media_preview', MediaPreviewWidget);
registerWidget('media_uploader', MediaUploaderWidget);
registerWidget('pdf_viewer', PdfViewerWidget);
registerWidget('image_annotation', ImageAnnotationWidget);
registerWidget('spreadsheet_display', SpreadsheetDisplayWidget);
registerWidget('video_player', VideoPlayerWidget);
registerWidget('audio_player', AudioPlayerWidget);

// Phase 17: Scenario widget (1 real implementation):
registerWidget('scenario_panel', ScenarioWidget);

// Phase 18: Comments and action log widgets (2 real implementations):
registerWidget('comments', CommentsWidget);
registerWidget('action_log', ActionLogTimelineWidget);

// Phase 20: All 28 remaining widget types now have real implementations:
registerWidget('chart_bar', ChartBarWidget);
registerWidget('chart_vega', ChartVegaWidget);
registerWidget('waterfall', WaterfallWidget);
registerWidget('observability_chart', ObservabilityChartWidget);
registerWidget('heatmap', HeatmapWidget);
registerWidget('scatter_plot', ScatterPlotWidget);
registerWidget('object_selector', ObjectSelectorWidget);
registerWidget('date_range', DateRangeWidget);
registerWidget('user_select', UserSelectWidget);
registerWidget('radio_group', RadioGroupWidget);
registerWidget('dropdown', DropdownWidget);
registerWidget('spacer', SpacerWidget);
registerWidget('divider', DividerWidget);
registerWidget('progress_bar', ProgressBarWidget);
registerWidget('badge', BadgeWidget);
registerWidget('tooltip', TooltipWidget);
registerWidget('accordion', AccordionWidget);
registerWidget('property_list', PropertyListWidget);
registerWidget('object_set_title', ObjectSetTitleWidget);
registerWidget('links', LinksWidget);
registerWidget('tree_view', TreeViewWidget);
registerWidget('kanban', KanbanWidget);
registerWidget('aip_chat', AipChatWidget);
registerWidget('aip_generated_content', AipGeneratedContentWidget);
registerWidget('breadcrumb', BreadcrumbWidget);
registerWidget('gantt', GanttWidget);
registerWidget('timeline', TimelineWidget);
registerWidget('calendar', CalendarWidget);

// Phase 20: Additional widgets for saved views, edit history, resources, embedding:
registerWidget('saved_views', SavedViewsWidget);
registerWidget('edit_history', EditHistoryWidget);
registerWidget('resource_browser', ResourceBrowserWidget);
registerWidget('iframe', IframeWidget);
registerWidget('app_pairing', AppPairingWidget);

// Phase 21 (Fase 21) widgets:
registerWidget('data_freshness', DataFreshnessWidget);
registerWidget('ontology_change_history', OntologyChangeHistoryWidget);
registerWidget('value_formatting', ValueFormattingWidget);
registerWidget('design_system_theme', DesignSystemThemeWidget);
registerWidget('function_backed', FunctionBackedWidget);
registerWidget('live_data_push', LiveDataPushWidget);
registerWidget('qr_code_reader', QrCodeReaderWidget);
registerWidget('camera_capture', CameraCaptureWidget);
registerWidget('visual_ontology_manager', VisualOntologyManagerWidget);
registerWidget('ontology_metadata_catalog', OntologyMetadataCatalogWidget);
registerWidget('kiosk_mode', KioskModeWidget);

// Fase 22 widgets:
registerWidget('mobile_app_launcher', MobileAppLauncherWidget);
registerWidget('viewport_switcher', ViewportSwitcherWidget);
registerWidget('qr_deep_link_launch', QRDeepLinkLaunchWidget);
registerWidget('geolocation_prompt', GeolocationPromptWidget);
registerWidget('graph_visualization', GraphVisualizationWidget);
registerWidget('filter_state', ObjectSetFilterStateWidget);
registerWidget('command_launcher', CommandLauncherWidget);

// Fase 23 widgets:
registerWidget('action_form_config', ActionFormConfigWidget);
registerWidget('ontology_change_manager', OntologyChangeManagerWidget);
registerWidget('branch_manager', BranchManagerWidget);
registerWidget('transform_expression', TransformExpressionWidget);

// Fase 24 widgets:
registerWidget('dataset_table', DatasetTableWidget);
registerWidget('batch_transform', BatchTransformWidget);
registerWidget('sql_workbench', SqlWorkbenchWidget);
registerWidget('pipeline_builder', PipelineBuilderWidget);
registerWidget('data_expectations', DataExpectationsWidget);
registerWidget('rules_engine', RulesEngineWidget);
registerWidget('variable_transformer', VariableTransformerWidget);
registerWidget('sql_analytics', SqlAnalyticsWidget);
registerWidget('cdc_ingest', CdcIngestWidget);
registerWidget('datasource_mapper', DatasourceMapperWidget);
registerWidget('build_trigger', BuildTriggerWidget);
