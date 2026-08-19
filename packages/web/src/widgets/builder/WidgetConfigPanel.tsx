/**
 * WidgetConfigPanel — edit the selected widget's configuration.
 *
 * Shows:
 *   - Widget type (read-only)
 *   - Bound variable (editable text input)
 *   - Visibility toggle
 *   - Config properties (JSON editor — a textarea with parse/validate)
 *   - Display optimization settings (pageSize, density)
 *
 * The config is edited as JSON because widget configs are heterogeneous
 * (each widget type has its own config schema). A future enhancement
 * could generate a form from the WidgetCatalogEntry.configSchema.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WorkshopWidgetInstance } from '../types.js';

export interface WidgetConfigPanelProps {
  widget: WorkshopWidgetInstance | null;
  onChange: (updates: Partial<WorkshopWidgetInstance>) => void;
  onDelete: () => void;
}

export function WidgetConfigPanel({ widget, onChange, onDelete }: WidgetConfigPanelProps): React.ReactNode {
  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (widget) {
      setConfigText(JSON.stringify(widget.config ?? {}, null, 2));
      setConfigError(null);
    }
  }, [widget?.id, widget?.config]);

  const applyConfig = useCallback(() => {
    if (!widget) return;
    try {
      const parsed = JSON.parse(configText);
      onChange({ config: parsed });
      setConfigError(null);
    } catch (e) {
      setConfigError(String(e instanceof Error ? e.message : e));
    }
  }, [configText, onChange, widget]);

  if (!widget) {
    return (
      <aside className="ed-builder__config-panel ed-builder__config-panel--empty">
        <h3 className="ed-builder__config-panel-title">Widget config</h3>
        <p className="ed-builder__config-panel-empty">Select a widget to edit its configuration.</p>
      </aside>
    );
  }

  return (
    <aside className="ed-builder__config-panel" role="complementary" aria-label="Widget configuration">
      <h3 className="ed-builder__config-panel-title">Widget config</h3>

      <div className="ed-builder__config-field">
        <label className="ed-builder__config-label">Type</label>
        <span className="ed-builder__config-value">{widget.widgetType}</span>
      </div>

      <div className="ed-builder__config-field">
        <label className="ed-builder__config-label" htmlFor="widget-bound-var">Bound variable</label>
        <input
          id="widget-bound-var"
          type="text"
          className="ed-builder__config-input"
          value={widget.boundVariable ?? ''}
          onChange={(e) => onChange({ boundVariable: e.target.value || undefined })}
          placeholder="variable name"
        />
      </div>

      <div className="ed-builder__config-field">
        <label className="ed-builder__config-label">
          <input
            type="checkbox"
            checked={widget.visible}
            onChange={(e) => onChange({ visible: e.target.checked })}
          />
          Visible
        </label>
      </div>

      <div className="ed-builder__config-field">
        <label className="ed-builder__config-label">Config (JSON)</label>
        <textarea
          className="ed-builder__config-textarea"
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          rows={12}
          spellCheck={false}
        />
        {configError && (
          <span className="ed-builder__config-error">{configError}</span>
        )}
        <button
          className="ed-builder__config-apply"
          onClick={applyConfig}
          disabled={!configText}
        >
          Apply config
        </button>
      </div>

      {widget.displayOptimization && (
        <div className="ed-builder__config-field">
          <label className="ed-builder__config-label" htmlFor="widget-page-size">Page size</label>
          <input
            id="widget-page-size"
            type="number"
            className="ed-builder__config-input"
            value={widget.displayOptimization.pageSize ?? 25}
            onChange={(e) => onChange({
              displayOptimization: {
                ...widget.displayOptimization,
                pageSize: Number(e.target.value),
              },
            })}
          />
        </div>
      )}

      <button
        className="ed-builder__config-delete"
        onClick={onDelete}
      >
        Delete widget
      </button>
    </aside>
  );
}
