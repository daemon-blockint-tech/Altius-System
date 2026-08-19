/**
 * Tests for the Workshop module builder (Phase 3).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WorkshopBuilder, createEmptyApp } from '../builder/index.js';
import type { WorkshopAppDefinition } from '../types.js';

function makeTestApp(): WorkshopAppDefinition {
  return {
    id: 'app-test',
    tenantId: 'test-tenant',
    name: 'Test App',
    description: 'A test app',
    pages: [
      {
        id: 'page-1',
        name: 'Home',
        sections: [
          {
            id: 'sec-1',
            layout: 'stack',
            widgets: [
              { id: 'w-1', widgetType: 'header', config: { title: 'Hello' }, visible: true },
              { id: 'w-2', widgetType: 'markdown', config: { content: 'World' }, visible: true },
            ],
          },
        ],
      },
      {
        id: 'page-2',
        name: 'Metrics',
        sections: [
          {
            id: 'sec-2',
            layout: 'grid',
            layoutParams: { columns: 2 },
            widgets: [],
          },
        ],
      },
    ],
    overlays: [],
    variableIds: [],
    ownerId: 'user-1',
    sharedWith: [],
    isPublic: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/** Get the builder canvas element (excludes palette and page manager). */
function getCanvas() {
  return document.querySelector('.ed-builder__canvas')!;
}

/** Get the page manager element. */
function getPageManager() {
  return document.querySelector('.ed-builder__page-manager')!;
}

/** Get the widget palette element. */
function getPalette() {
  return document.querySelector('.ed-builder__palette')!;
}

// ── WorkshopBuilder ───────────────────────────────────────────

describe('WorkshopBuilder', () => {
  it('renders the toolbar with app name', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    expect(screen.getByText('Test App')).toBeTruthy();
  });

  it('renders the page manager with all pages', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    const pm = getPageManager();
    expect(within(pm as HTMLElement).getByText('Home')).toBeTruthy();
    expect(within(pm as HTMLElement).getByText('Metrics')).toBeTruthy();
  });

  it('renders widget palette with categories', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    const palette = getPalette();
    expect(within(palette as HTMLElement).getByText('Widgets')).toBeTruthy();
    expect(within(palette as HTMLElement).getByText('Data')).toBeTruthy();
    expect(within(palette as HTMLElement).getByText('Charts')).toBeTruthy();
  });

  it('renders existing widgets in the canvas', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    const canvas = getCanvas();
    // Widget cards show their type in the canvas
    expect(within(canvas as HTMLElement).getByText('header')).toBeTruthy();
    expect(within(canvas as HTMLElement).getByText('markdown')).toBeTruthy();
  });

  it('shows "Drop widgets here" for empty sections', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Page 1 is current — it has widgets, so no "Drop widgets here"
    // Switch to page 2 which has an empty section
    const pm = getPageManager();
    fireEvent.click(within(pm as HTMLElement).getByText('Metrics'));
    const canvas = getCanvas();
    expect(within(canvas as HTMLElement).getByText('Drop widgets here')).toBeTruthy();
  });

  it('adds a new page on "+ Page" click', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    fireEvent.click(screen.getByText('+ Page'));
    // Should now have 3 pages — the new one is "Page 3"
    const pm = getPageManager();
    expect(within(pm as HTMLElement).getByText('Page 3')).toBeTruthy();
  });

  it('adds a new section on "+ Add section" click', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Switch to page 2 which has 1 empty section
    const pm = getPageManager();
    fireEvent.click(within(pm as HTMLElement).getByText('Metrics'));
    // Add a section
    fireEvent.click(screen.getByText('+ Add section'));
    // Should now have 2 sections on page 2
    const canvas = getCanvas();
    const sections = canvas.querySelectorAll('[data-section-id]');
    expect(sections.length).toBe(2);
  });

  it('selects a widget on click', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Click on the header widget card
    const headerCard = document.querySelector('[data-widget-id="w-1"]')!;
    fireEvent.click(headerCard);
    // Config panel should show the widget type
    const configPanel = document.querySelector('.ed-builder__config-panel')!;
    expect(within(configPanel as HTMLElement).getByText('header')).toBeTruthy();
  });

  it('deletes a widget on delete button click', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Find the delete button on the first widget card
    const headerCard = document.querySelector('[data-widget-id="w-1"]')!;
    const deleteBtn = headerCard.querySelector('.ed-builder__widget-card-delete')!;
    fireEvent.click(deleteBtn);
    // header widget should be gone from the canvas
    const canvas = getCanvas();
    expect(within(canvas as HTMLElement).queryByText('header')).toBeNull();
  });

  it('deletes a section on section delete button', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Find the section delete button for sec-1
    const sectionEl = document.querySelector('[data-section-id="sec-1"]')!;
    const deleteBtn = sectionEl.querySelector('.ed-builder__section-delete')!;
    fireEvent.click(deleteBtn);
    // The section should be gone
    expect(document.querySelector('[data-section-id="sec-1"]')).toBeNull();
  });

  it('switches to preview mode', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Click Preview button
    fireEvent.click(screen.getByText('Preview'));
    // In preview mode, the app renders via AppRenderer
    // The header widget should render as actual content, not a card
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('switches back to edit mode', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    fireEvent.click(screen.getByText('Preview'));
    expect(screen.getByText('Hello')).toBeTruthy();
    fireEvent.click(screen.getByText('Edit'));
    // Back in edit mode — widget cards should be visible again
    const canvas = getCanvas();
    expect(within(canvas as HTMLElement).getByText('header')).toBeTruthy();
  });

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn();
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" onSave={onSave} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].name).toBe('Test App');
  });

  it('calls onExport when export button is clicked', () => {
    const onExport = vi.fn();
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" onExport={onExport} />);
    fireEvent.click(screen.getByText('Export'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('creates a new app on "New" button click', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    fireEvent.click(screen.getByText('New'));
    // New app should be "Untitled app"
    expect(screen.getByText('Untitled app')).toBeTruthy();
  });

  it('shows dirty indicator after making changes', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Initially no dirty indicator
    expect(screen.queryByText('●')).toBeNull();
    // Add a page
    fireEvent.click(screen.getByText('+ Page'));
    // Dirty indicator should appear
    expect(screen.getByText('●')).toBeTruthy();
  });

  it('clears dirty indicator after save', () => {
    const onSave = vi.fn();
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" onSave={onSave} />);
    fireEvent.click(screen.getByText('+ Page'));
    expect(screen.getByText('●')).toBeTruthy();
    fireEvent.click(screen.getByText('Save'));
    expect(screen.queryByText('●')).toBeNull();
  });

  it('changes section layout via dropdown', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Find the layout selector for sec-1
    const sectionEl = document.querySelector('[data-section-id="sec-1"]')!;
    const layoutSelect = sectionEl.querySelector('.ed-builder__section-layout') as HTMLSelectElement;
    fireEvent.change(layoutSelect, { target: { value: 'grid' } });
    // The section should now have layout="grid" — check the select value
    expect(layoutSelect.value).toBe('grid');
  });

  it('renames a page via the rename input', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    const renameInput = screen.getByLabelText('Rename Home') as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'Dashboard' } });
    // The rename input should have the new value
    expect(renameInput.value).toBe('Dashboard');
  });

  it('moves a page up', () => {
    render(<WorkshopBuilder initialApp={makeTestApp()} client={{}} tenantId="t" userId="u" />);
    // Find the page list items
    const pageItems = document.querySelectorAll('.ed-builder__page-item');
    expect(pageItems.length).toBe(2);
    // The first page's up button should be disabled
    const firstUpBtn = pageItems[0]!.querySelector('.ed-builder__page-move[title="Move up"]') as HTMLButtonElement;
    expect(firstUpBtn.disabled).toBe(true);
    // The second page's up button should be enabled
    const secondUpBtn = pageItems[1]!.querySelector('.ed-builder__page-move[title="Move up"]') as HTMLButtonElement;
    expect(secondUpBtn.disabled).toBe(false);
  });
});

// ── createEmptyApp ────────────────────────────────────────────

describe('createEmptyApp', () => {
  it('creates an app with one page and one section', () => {
    const app = createEmptyApp('tenant-1', 'user-1', 'My App');
    expect(app.name).toBe('My App');
    expect(app.pages.length).toBe(1);
    expect(app.pages[0]!.sections.length).toBe(1);
    expect(app.pages[0]!.sections[0]!.widgets.length).toBe(0);
    expect(app.tenantId).toBe('tenant-1');
    expect(app.ownerId).toBe('user-1');
  });

  it('creates unique IDs', () => {
    const app1 = createEmptyApp('t', 'u');
    const app2 = createEmptyApp('t', 'u');
    expect(app1.id).not.toBe(app2.id);
    expect(app1.pages[0]!.id).not.toBe(app2.pages[0]!.id);
  });
});
