/**
 * BuilderCanvas — the drop zone where widgets are arranged into sections.
 *
 * Shows the app's pages and sections. Widgets can be:
 *   - Dropped from the palette (HTML5 drag-and-drop)
 *   - Selected (click to select, shows in config panel)
 *   - Moved between sections (drag within canvas)
 *   - Deleted (click delete button on selected widget)
 *
 * In preview mode, the canvas renders the app via AppRenderer
 * instead of the editable layout.
 */

import { useState, useCallback } from 'react';
import type { WorkshopAppDefinition, WorkshopWidgetInstance, WorkshopAppSection } from '../types.js';
import { AppRenderer } from '../AppRenderer.js';

export interface BuilderCanvasProps {
  app: WorkshopAppDefinition;
  currentPageId: string;
  selectedWidgetId: string | null;
  selectedSectionId: string | null;
  mode: 'edit' | 'preview';
  client: unknown;
  tenantId: string;
  userId: string;
  /** Called when a widget is dropped onto a section. */
  onDropWidget: (sectionId: string, widgetType: string) => void;
  /** Called when a widget is selected. */
  onSelectWidget: (widgetId: string | null) => void;
  /** Called when a section is selected. */
  onSelectSection: (sectionId: string | null) => void;
  /** Called when a widget is deleted. */
  onDeleteWidget: (widgetId: string) => void;
  /** Called when a widget is moved to a different section. */
  onMoveWidget: (widgetId: string, targetSectionId: string) => void;
  /** Called when a section's layout is changed. */
  onChangeSectionLayout: (sectionId: string, layout: WorkshopAppSection['layout']) => void;
  /** Called when a section is added. */
  onAddSection: (pageId: string) => void;
  /** Called when a section is deleted. */
  onDeleteSection: (sectionId: string) => void;
}

export function BuilderCanvas({
  app,
  currentPageId,
  selectedWidgetId,
  selectedSectionId,
  mode,
  client,
  tenantId,
  userId,
  onDropWidget,
  onSelectWidget,
  onSelectSection,
  onDeleteWidget,
  onMoveWidget,
  onChangeSectionLayout,
  onAddSection,
  onDeleteSection,
}: BuilderCanvasProps): React.ReactNode {
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  const page = app.pages.find((p) => p.id === currentPageId);

  const handleDrop = useCallback((sectionId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSection(null);
    const widgetType = e.dataTransfer.getData('text/widget-type');
    const widgetId = e.dataTransfer.getData('text/widget-id');
    if (widgetType) {
      onDropWidget(sectionId, widgetType);
    } else if (widgetId) {
      onMoveWidget(widgetId, sectionId);
    }
  }, [onDropWidget, onMoveWidget]);

  if (mode === 'preview') {
    return (
      <div className="ed-builder__canvas ed-builder__canvas--preview">
        <AppRenderer app={app} client={client} tenantId={tenantId} userId={userId} />
      </div>
    );
  }

  if (!page) {
    return <div className="ed-builder__canvas ed-builder__canvas--empty">No page selected</div>;
  }

  return (
    <div className="ed-builder__canvas">
      <div className="ed-builder__canvas-page">
        <h2 className="ed-builder__canvas-page-title">{page.name}</h2>
        {page.sections.map((section) => (
          <SectionDropZone
            key={section.id}
            section={section}
            isDragOver={dragOverSection === section.id}
            isSelected={selectedSectionId === section.id}
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={onSelectWidget}
            onSelectSection={onSelectSection}
            onDrop={(e) => handleDrop(section.id, e)}
            onDragOver={(e) => { e.preventDefault(); setDragOverSection(section.id); }}
            onDragLeave={() => setDragOverSection(null)}
            onDeleteWidget={onDeleteWidget}
            onChangeLayout={(layout) => onChangeSectionLayout(section.id, layout)}
            onDeleteSection={() => onDeleteSection(section.id)}
          />
        ))}
        <button
          className="ed-builder__add-section"
          onClick={() => onAddSection(page.id)}
        >
          + Add section
        </button>
      </div>
    </div>
  );
}

// ── Section drop zone ─────────────────────────────────────────

function SectionDropZone({
  section,
  isDragOver,
  isSelected,
  selectedWidgetId,
  onSelectWidget,
  onSelectSection,
  onDrop,
  onDragOver,
  onDragLeave,
  onDeleteWidget,
  onChangeLayout,
  onDeleteSection,
}: {
  section: WorkshopAppSection;
  isDragOver: boolean;
  isSelected: boolean;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  onSelectSection: (id: string | null) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDeleteWidget: (id: string) => void;
  onChangeLayout: (layout: WorkshopAppSection['layout']) => void;
  onDeleteSection: () => void;
}): React.ReactNode {
  const layouts: WorkshopAppSection['layout'][] = ['stack', 'grid', 'tabs', 'columns', 'sidebar', 'loop'];

  return (
    <div
      className={`ed-builder__section${isDragOver ? ' ed-builder__section--drag-over' : ''}${isSelected ? ' ed-builder__section--selected' : ''}`}
      data-section-id={section.id}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={(e) => { e.stopPropagation(); onSelectSection(section.id); }}
    >
      <div className="ed-builder__section-header">
        <span className="ed-builder__section-name">{section.name ?? 'Section'}</span>
        <select
          className="ed-builder__section-layout"
          value={section.layout}
          onChange={(e) => onChangeLayout(e.target.value as WorkshopAppSection['layout'])}
          onClick={(e) => e.stopPropagation()}
        >
          {layouts.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button
          className="ed-builder__section-delete"
          onClick={(e) => { e.stopPropagation(); onDeleteSection(); }}
          title="Delete section"
        >
          ✕
        </button>
      </div>
      <div className="ed-builder__section-widgets">
        {section.widgets.length === 0 && (
          <div className="ed-builder__section-empty">Drop widgets here</div>
        )}
        {section.widgets.map((widget) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            isSelected={selectedWidgetId === widget.id}
            onSelect={() => onSelectWidget(widget.id)}
            onDelete={() => onDeleteWidget(widget.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Widget card ───────────────────────────────────────────────

function WidgetCard({
  widget,
  isSelected,
  onSelect,
  onDelete,
}: {
  widget: WorkshopWidgetInstance;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}): React.ReactNode {
  return (
    <div
      className={`ed-builder__widget-card${isSelected ? ' ed-builder__widget-card--selected' : ''}${!widget.visible ? ' ed-builder__widget-card--hidden' : ''}`}
      data-widget-id={widget.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/widget-id', widget.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="ed-builder__widget-card-header">
        <span className="ed-builder__widget-card-type">{widget.widgetType}</span>
        {widget.boundVariable && (
          <span className="ed-builder__widget-card-binding">→ {widget.boundVariable}</span>
        )}
        <button
          className="ed-builder__widget-card-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete widget"
        >
          ✕
        </button>
      </div>
      <div className="ed-builder__widget-card-config">
        {Object.keys(widget.config).length > 0
          ? `${Object.keys(widget.config).length} config prop(s)`
          : 'no config'}
      </div>
    </div>
  );
}
