/**
 * WorkshopBuilder — the drag-and-drop app builder.
 *
 * This is the top-level component that ties together:
 *   - BuilderToolbar (mode toggle, export, save)
 *   - PageManager (add/remove/reorder pages)
 *   - WidgetPalette (draggable widget catalog)
 *   - BuilderCanvas (drop zone with sections + widget instances)
 *   - WidgetConfigPanel (edit selected widget config)
 *
 * The builder maintains the WorkshopAppDefinition in local state.
 * All mutations (add/remove/move widgets, add/remove pages, edit
 * config) go through the builder's action methods, which produce
 * a new app definition and mark the state as dirty.
 *
 * In preview mode, the canvas renders the app via AppRenderer —
 * the same component that powers the live app — so what you see
 * in preview is exactly what users get.
 */

import { useState, useCallback, useMemo } from 'react';
import type { WorkshopAppDefinition, WorkshopWidgetInstance, WorkshopAppSection } from '../types.js';
import { BuilderToolbar } from './BuilderToolbar.js';
import { PageManager } from './PageManager.js';
import { WidgetPalette } from './WidgetPalette.js';
import { BuilderCanvas } from './BuilderCanvas.js';
import { WidgetConfigPanel } from './WidgetConfigPanel.js';

export interface WorkshopBuilderProps {
  /** Initial app definition. */
  initialApp: WorkshopAppDefinition;
  /** SDK client for preview mode. */
  client: unknown;
  /** Tenant ID. */
  tenantId: string;
  /** User ID. */
  userId: string;
  /** Called when the user saves. */
  onSave?: (app: WorkshopAppDefinition) => void;
  /** Called when the user exports. */
  onExport?: (app: WorkshopAppDefinition) => void;
  /** When true, persists the app to the backend on save. */
  persistToBackend?: boolean;
}

let idCounter = 0;
function genId(prefix: string): string {
  idCounter++;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function WorkshopBuilder({
  initialApp,
  client,
  tenantId,
  userId,
  onSave,
  onExport,
  persistToBackend = false,
}: WorkshopBuilderProps): React.ReactNode {
  const [app, setApp] = useState<WorkshopAppDefinition>(initialApp);
  const [currentPageId, setCurrentPageId] = useState(initialApp.pages[0]?.id ?? '');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [dirty, setDirty] = useState(false);

  // ── Derived state ──

  const selectedWidget = useMemo(() => {
    if (!selectedWidgetId) return null;
    for (const page of app.pages) {
      for (const section of page.sections) {
        const widget = section.widgets.find((w) => w.id === selectedWidgetId);
        if (widget) return widget;
      }
    }
    return null;
  }, [app, selectedWidgetId]);

  // ── Helpers ──

  const updateApp = useCallback((fn: (app: WorkshopAppDefinition) => WorkshopAppDefinition) => {
    setApp((prev) => fn(prev));
    setDirty(true);
  }, []);

  const findSection = useCallback((app: WorkshopAppDefinition, sectionId: string) => {
    for (const page of app.pages) {
      const section = page.sections.find((s) => s.id === sectionId);
      if (section) return { page, section };
    }
    return null;
  }, []);

  // ── Widget actions ──

  const handleDropWidget = useCallback((sectionId: string, widgetType: string) => {
    updateApp((prev) => {
      const result = findSection(prev, sectionId);
      if (!result) return prev;
      const { page } = result;
      const newWidget: WorkshopWidgetInstance = {
        id: genId('w'),
        widgetType,
        config: {},
        visible: true,
      };
      return {
        ...prev,
        pages: prev.pages.map((p) =>
          p.id !== page.id ? p : {
            ...p,
            sections: p.sections.map((s) =>
              s.id !== sectionId ? s : { ...s, widgets: [...s.widgets, newWidget] }
            ),
          }
        ),
      };
    });
  }, [findSection, updateApp]);

  const handleMoveWidget = useCallback((widgetId: string, targetSectionId: string) => {
    updateApp((prev) => {
      let movedWidget: WorkshopWidgetInstance | null = null;
      const pagesWithoutWidget = prev.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => {
          const widget = s.widgets.find((w) => w.id === widgetId);
          if (widget) {
            movedWidget = widget;
            return { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) };
          }
          return s;
        }),
      }));
      if (!movedWidget) return prev;
      return {
        ...prev,
        pages: pagesWithoutWidget.map((p) => ({
          ...p,
          sections: p.sections.map((s) =>
            s.id !== targetSectionId ? s : { ...s, widgets: [...s.widgets, movedWidget!] }
          ),
        })),
      };
    });
  }, [updateApp]);

  const handleDeleteWidget = useCallback((widgetId: string) => {
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => ({
          ...s,
          widgets: s.widgets.filter((w) => w.id !== widgetId),
        })),
      })),
    }));
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  }, [selectedWidgetId, updateApp]);

  const handleUpdateWidget = useCallback((updates: Partial<WorkshopWidgetInstance>) => {
    if (!selectedWidgetId) return;
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => ({
          ...s,
          widgets: s.widgets.map((w) =>
            w.id !== selectedWidgetId ? w : { ...w, ...updates }
          ),
        })),
      })),
    }));
  }, [selectedWidgetId, updateApp]);

  // ── Section actions ──

  const handleAddSection = useCallback((pageId: string) => {
    const sectionId = genId('s');
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id !== pageId ? p : {
          ...p,
          sections: [...p.sections, {
            id: sectionId,
            layout: 'stack',
            widgets: [],
          }],
        }
      ),
    }));
    setSelectedSectionId(sectionId);
  }, [updateApp]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => ({
        ...p,
        sections: p.sections.filter((s) => s.id !== sectionId),
      })),
    }));
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
  }, [selectedSectionId, updateApp]);

  const handleChangeSectionLayout = useCallback((sectionId: string, layout: WorkshopAppSection['layout']) => {
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id !== sectionId ? s : { ...s, layout }
        ),
      })),
    }));
  }, [updateApp]);

  // ── Page actions ──

  const handleAddPage = useCallback(() => {
    const pageId = genId('p');
    const pageName = `Page ${app.pages.length + 1}`;
    updateApp((prev) => ({
      ...prev,
      pages: [...prev.pages, {
        id: pageId,
        name: pageName,
        sections: [{
          id: genId('s'),
          layout: 'stack',
          widgets: [],
        }],
      }],
    }));
    setCurrentPageId(pageId);
  }, [app.pages.length, updateApp]);

  const handleRenamePage = useCallback((pageId: string, name: string) => {
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => p.id !== pageId ? p : { ...p, name }),
    }));
  }, [updateApp]);

  const handleDeletePage = useCallback((pageId: string) => {
    if (app.pages.length <= 1) return;
    updateApp((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== pageId),
    }));
    if (currentPageId === pageId) {
      const remaining = app.pages.filter((p) => p.id !== pageId);
      setCurrentPageId(remaining[0]?.id ?? '');
    }
  }, [app.pages, currentPageId, updateApp]);

  const handleMovePage = useCallback((pageId: string, direction: 'up' | 'down') => {
    updateApp((prev) => {
      const pages = [...prev.pages];
      const i = pages.findIndex((p) => p.id === pageId);
      if (i < 0) return prev;
      const swap = direction === 'up' ? i - 1 : i + 1;
      if (swap < 0 || swap >= pages.length) return prev;
      [pages[i], pages[swap]] = [pages[swap]!, pages[i]!];
      return { ...prev, pages };
    });
  }, [updateApp]);

  // ── Toolbar actions ──

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    onSave?.(app);
    if (persistToBackend) {
      setSaving(true);
      setSaveError(null);
      try {
        const { updateApp } = await import('../workshop-client.js');
        await updateApp(app.id, app as unknown as Record<string, unknown>);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    }
    setDirty(false);
  }, [app, onSave, persistToBackend]);

  const handleExport = useCallback(() => {
    onExport?.(app);
  }, [app, onExport]);

  const handleNewApp = useCallback(() => {
    const newApp: WorkshopAppDefinition = {
      id: genId('app'),
      tenantId,
      name: 'Untitled app',
      description: '',
      pages: [{
        id: genId('p'),
        name: 'Page 1',
        sections: [{
          id: genId('s'),
          layout: 'stack',
          widgets: [],
        }],
      }],
      overlays: [],
      variableIds: [],
      ownerId: userId,
      sharedWith: [],
      isPublic: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setApp(newApp);
    setCurrentPageId(newApp.pages[0]!.id);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setDirty(true);
  }, [tenantId, userId]);

  return (
    <div className="ed-builder">
      <BuilderToolbar
        appName={app.name}
        mode={mode}
        onToggleMode={() => setMode((m) => m === 'edit' ? 'preview' : 'edit')}
        onExport={handleExport}
        onSave={handleSave}
        onNewApp={handleNewApp}
        dirty={dirty || saving}
      />
      {saveError && (
        <div style={{ background: '#fee', color: '#c00', padding: '4px 8px', fontSize: 12 }}>
          Save error: {saveError}
        </div>
      )}
      <div className="ed-builder__body">
        <div className="ed-builder__sidebar-left">
          <PageManager
            app={app}
            currentPageId={currentPageId}
            onSelectPage={setCurrentPageId}
            onAddPage={handleAddPage}
            onRenamePage={handleRenamePage}
            onDeletePage={handleDeletePage}
            onMovePage={handleMovePage}
          />
        </div>
        <BuilderCanvas
          app={app}
          currentPageId={currentPageId}
          selectedWidgetId={selectedWidgetId}
          selectedSectionId={selectedSectionId}
          mode={mode}
          client={client}
          tenantId={tenantId}
          userId={userId}
          onDropWidget={handleDropWidget}
          onSelectWidget={(id) => { setSelectedWidgetId(id); setSelectedSectionId(null); }}
          onSelectSection={(id) => { setSelectedSectionId(id); setSelectedWidgetId(null); }}
          onDeleteWidget={handleDeleteWidget}
          onMoveWidget={handleMoveWidget}
          onChangeSectionLayout={handleChangeSectionLayout}
          onAddSection={handleAddSection}
          onDeleteSection={handleDeleteSection}
        />
        {mode === 'edit' && (
          <div className="ed-builder__sidebar-right">
            <WidgetPalette />
            <WidgetConfigPanel
              widget={selectedWidget}
              onChange={handleUpdateWidget}
              onDelete={() => selectedWidgetId && handleDeleteWidget(selectedWidgetId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: create an empty app definition ────────────────────

export function createEmptyApp(tenantId: string, userId: string, name = 'Untitled app'): WorkshopAppDefinition {
  return {
    id: genId('app'),
    tenantId,
    name,
    description: '',
    pages: [{
      id: genId('p'),
      name: 'Page 1',
      sections: [{
        id: genId('s'),
        layout: 'stack',
        widgets: [],
      }],
    }],
    overlays: [],
    variableIds: [],
    ownerId: userId,
    sharedWith: [],
    isPublic: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
