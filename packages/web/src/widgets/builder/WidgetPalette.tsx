/**
 * WidgetPalette — the catalog of draggable widget types.
 *
 * Lists all registered widget types grouped by category, with
 * implemented vs. stub indicators. Each item is draggable via
 * the HTML5 drag-and-drop API — the drag payload is the widget
 * type string, which the BuilderCanvas reads on drop.
 */

import { useMemo } from 'react';
import { listRegisteredWidgets, isWidgetImplemented } from '../WidgetRegistry.js';

const CATEGORIES: Array<{ key: string; label: string; types: string[] }> = [
  { key: 'data', label: 'Data', types: ['object_table', 'object_list', 'object_view', 'property_list', 'object_set_title', 'links', 'tree_view', 'kanban'] },
  { key: 'chart', label: 'Charts', types: ['chart_xy', 'chart_pie', 'chart_bar', 'chart_vega', 'pivot_table', 'metric_card', 'waterfall', 'observability_chart', 'heatmap', 'scatter_plot'] },
  { key: 'filter', label: 'Filters', types: ['filter_list', 'object_selector', 'date_picker', 'date_range', 'search_bar', 'user_select'] },
  { key: 'input', label: 'Inputs', types: ['text_input', 'number_input', 'checkbox', 'radio_group', 'dropdown'] },
  { key: 'layout', label: 'Layout', types: ['tabs', 'stepper', 'markdown', 'header', 'spacer', 'divider', 'progress_bar', 'badge', 'tooltip', 'accordion'] },
  { key: 'action', label: 'Actions', types: ['button_group', 'action_form'] },
  { key: 'media', label: 'Media', types: ['media_preview', 'media_uploader', 'pdf_viewer', 'image_annotation', 'spreadsheet_display', 'video_player', 'audio_player'] },
  { key: 'collaboration', label: 'Collaboration', types: ['comments', 'action_log'] },
  { key: 'ai', label: 'AI', types: ['aip_chat', 'aip_generated_content'] },
  { key: 'navigation', label: 'Navigation', types: ['mobile_navbar', 'breadcrumb'] },
  { key: 'time', label: 'Time', types: ['time_series', 'gantt', 'timeline', 'calendar'] },
  { key: 'geo', label: 'Geospatial', types: ['map', 'current_location'] },
];

export interface WidgetPaletteProps {
  /** Called when a widget type drag starts. */
  onDragStart?: (widgetType: string) => void;
  /** Called when a widget type is clicked (alternative to drag). */
  onSelect?: (widgetType: string) => void;
  /** Optional filter to show only implemented widgets. */
  implementedOnly?: boolean;
}

export function WidgetPalette({ onDragStart, onSelect, implementedOnly = false }: WidgetPaletteProps): React.ReactNode {
  const registered = useMemo(() => new Set(listRegisteredWidgets()), []);

  const visibleCategories = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter((t) => {
        if (!registered.has(t)) return false;
        if (implementedOnly && !isWidgetImplemented(t)) return false;
        return true;
      }),
    })).filter((cat) => cat.types.length > 0);
  }, [registered, implementedOnly]);

  return (
    <aside className="ed-builder__palette" role="complementary" aria-label="Widget palette">
      <h3 className="ed-builder__palette-title">Widgets</h3>
      {visibleCategories.map((cat) => (
        <div key={cat.key} className="ed-builder__palette-category">
          <h4 className="ed-builder__palette-cat-label">{cat.label}</h4>
          <div className="ed-builder__palette-items">
            {cat.types.map((type) => {
              const impl = isWidgetImplemented(type);
              return (
                <button
                  key={type}
                  draggable
                  className={`ed-builder__palette-item${impl ? '' : ' ed-builder__palette-item--stub'}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/widget-type', type);
                    e.dataTransfer.effectAllowed = 'copy';
                    onDragStart?.(type);
                  }}
                  onClick={() => onSelect?.(type)}
                  title={impl ? type : `${type} (stub — not yet implemented)`}
                >
                  <span className="ed-builder__palette-item-type">{type}</span>
                  {!impl && <span className="ed-builder__palette-item-stub">stub</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
