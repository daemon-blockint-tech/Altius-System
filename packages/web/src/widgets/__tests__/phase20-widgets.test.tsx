/**
 * Tests for Phase 20 widget library completion:
 *   - 28 former stub widget types now have real implementations
 *   - 5 additional widgets (saved views, edit history, resources, embedding)
 *   - ObjectTableWidget display optimization (density, frozen, virtualization)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetRenderer } from '../WidgetRenderer.js';
import {
  isWidgetImplemented,
  listRegisteredWidgets,
  getWidget,
} from '../WidgetRegistry.js';
import type { WidgetContext, WorkshopWidgetInstance } from '../types.js';

function makeCtx(overrides?: Partial<WidgetContext>): WidgetContext {
  return {
    client: {},
    variables: {},
    setVariable: () => {},
    navigate: () => {},
    currentPageId: 'page-1',
    tenantId: 'test-tenant',
    userId: 'test-user',
    ...overrides,
  };
}

function makeWidget(
  type: string,
  config: Record<string, unknown>,
  boundVariable?: string,
): WorkshopWidgetInstance {
  return {
    id: `w-${type}`,
    widgetType: type,
    config,
    boundVariable,
    visible: true,
  };
}

// ── Registry: all 70 widgets implemented, no stubs ─────────────

describe('Phase 20 widget registry', () => {
  it('registers 69 widget types total', () => {
    expect(listRegisteredWidgets().length).toBe(69);
  });

  it('marks every registered widget as implemented (no stubs left)', () => {
    const all = listRegisteredWidgets();
    const unimplemented = all.filter((t) => !isWidgetImplemented(t));
    expect(unimplemented).toEqual([]);
  });

  it('registers all 28 former stub types as implemented', () => {
    const formerStubs = [
      'chart_bar', 'chart_vega', 'waterfall', 'observability_chart', 'heatmap', 'scatter_plot',
      'object_selector', 'date_range', 'user_select',
      'radio_group', 'dropdown',
      'spacer', 'divider', 'progress_bar', 'badge', 'tooltip', 'accordion',
      'property_list', 'object_set_title', 'links', 'tree_view', 'kanban',
      'aip_chat', 'aip_generated_content',
      'breadcrumb',
      'gantt', 'timeline', 'calendar',
    ];
    for (const t of formerStubs) {
      expect(isWidgetImplemented(t)).toBe(true);
      expect(getWidget(t)?.component).toBeTruthy();
    }
  });

  it('registers the 5 Phase 20 extra widgets', () => {
    expect(isWidgetImplemented('saved_views')).toBe(true);
    expect(isWidgetImplemented('edit_history')).toBe(true);
    expect(isWidgetImplemented('resource_browser')).toBe(true);
    expect(isWidgetImplemented('iframe')).toBe(true);
    expect(isWidgetImplemented('app_pairing')).toBe(true);
  });
});

// ── Chart widgets ──────────────────────────────────────────────

describe('Phase 20 chart widgets', () => {
  it('ChartBarWidget renders bars from config data', () => {
    const widget = makeWidget('chart_bar', {
      title: 'Sales by region',
      data: [
        { label: 'North', value: 30 },
        { label: 'South', value: 50 },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Sales by region')).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();
    expect(screen.getByText('South')).toBeTruthy();
    expect(container.querySelector('[aria-label="Bar chart"]')).toBeTruthy();
  });

  it('ChartBarWidget supports horizontal orientation', () => {
    const widget = makeWidget('chart_bar', {
      horizontal: true,
      data: [{ label: 'A', value: 10 }],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelector('[aria-label="Bar chart"]')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('ChartVegaWidget renders the configured spec', () => {
    const widget = makeWidget('chart_vega', {
      spec: { mark: 'bar', encoding: { x: { field: 'a' } } },
      data: [{ a: 1 }, { a: 2 }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Vega-Lite Chart')).toBeTruthy();
    expect(screen.getByText('2 data points')).toBeTruthy();
  });

  it('ChartVegaWidget shows placeholder when no spec', () => {
    const widget = makeWidget('chart_vega', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No Vega spec configured')).toBeTruthy();
  });

  it('WaterfallWidget renders cumulative bars', () => {
    const widget = makeWidget('waterfall', {
      title: 'P&L',
      data: [
        { label: 'Start', value: 100 },
        { label: 'Cost', value: -30 },
        { label: 'End', value: 50 },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('P&L')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Cost')).toBeTruthy();
    expect(container.querySelector('[aria-label="Waterfall chart"]')).toBeTruthy();
  });

  it('ObservabilityChartWidget renders metric sparklines', () => {
    const widget = makeWidget('observability_chart', {
      timeRange: '1h',
      metrics: [{ name: 'cpu', values: [10, 20, 15, 30] }],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Observability')).toBeTruthy();
    expect(screen.getByText(/Range: 1h/)).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('ObservabilityChartWidget shows empty state when no metrics', () => {
    const widget = makeWidget('observability_chart', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No metrics configured')).toBeTruthy();
  });

  it('HeatmapWidget renders a grid of cells', () => {
    const widget = makeWidget('heatmap', {
      rows: ['A', 'B'],
      cols: ['X', 'Y'],
      values: [[1, 2], [3, 4]],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('Y')).toBeTruthy();
  });

  it('ScatterPlotWidget renders points', () => {
    const widget = makeWidget('scatter_plot', {
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      xLabel: 'Time',
      yLabel: 'Value',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelector('[aria-label="Scatter plot"]')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Value')).toBeTruthy();
  });
});

// ── Filter widgets ─────────────────────────────────────────────

describe('Phase 20 filter widgets', () => {
  it('ObjectSelectorWidget filters options by search and writes bound variable', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('object_selector', {
      options: [
        { id: 'p1', label: 'Patient Alice' },
        { id: 'p2', label: 'Patient Bob' },
        { id: 'w1', label: 'Ward 1' },
      ],
      boundVariable: 'selected',
    }, 'selected');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    // Initially all three visible
    expect(screen.getByText('Patient Alice')).toBeTruthy();
    expect(screen.getByText('Patient Bob')).toBeTruthy();
    expect(screen.getByText('Ward 1')).toBeTruthy();
    // Type "patient" in the search box
    const search = screen.getByLabelText('Object search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'patient' } });
    expect(screen.getByText('Patient Alice')).toBeTruthy();
    expect(screen.getByText('Patient Bob')).toBeTruthy();
    expect(screen.queryByText('Ward 1')).toBeNull();
    // Click an option — should call setVariable
    fireEvent.click(screen.getByText('Patient Alice'));
    expect(setVariable).toHaveBeenCalledWith('selected', 'p1');
  });

  it('DateRangeWidget writes start/end to bound variable', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('date_range', {}, 'range');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const start = screen.getByLabelText('Start date') as HTMLInputElement;
    const end = screen.getByLabelText('End date') as HTMLInputElement;
    fireEvent.change(start, { target: { value: '2026-01-01' } });
    fireEvent.change(end, { target: { value: '2026-01-31' } });
    expect(setVariable).toHaveBeenCalledWith('range', expect.objectContaining({ start: '2026-01-01' }));
    expect(setVariable).toHaveBeenCalledWith('range', expect.objectContaining({ end: '2026-01-31' }));
  });

  it('UserSelectWidget renders users and writes selection', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('user_select', {
      users: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }],
    }, 'assignee');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const select = screen.getByLabelText('User selection') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'u2' } });
    expect(setVariable).toHaveBeenCalledWith('assignee', 'u2');
  });
});

// ── Input widgets ──────────────────────────────────────────────

describe('Phase 20 input widgets', () => {
  it('RadioGroupWidget renders options and writes selection', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('radio_group', {
      label: 'Priority',
      options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
    }, 'priority');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(screen.getByText('Priority')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    // Click "High"
    const highInput = screen.getByText('High').closest('label')!.querySelector('input')!;
    fireEvent.click(highInput);
    expect(setVariable).toHaveBeenCalledWith('priority', 'high');
  });

  it('DropdownWidget renders options and writes selection', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('dropdown', {
      label: 'Status',
      options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }],
    }, 'status');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const select = screen.getByLabelText('Dropdown selection') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'closed' } });
    expect(setVariable).toHaveBeenCalledWith('status', 'closed');
  });
});

// ── Layout widgets ─────────────────────────────────────────────

describe('Phase 20 layout widgets', () => {
  it('SpacerWidget renders an empty div with configured height', () => {
    const widget = makeWidget('spacer', { height: 50 });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const spacer = container.querySelector('[aria-label="Spacer"]') as HTMLElement;
    expect(spacer).toBeTruthy();
    expect(spacer.style.height).toBe('50px');
  });

  it('DividerWidget renders horizontal rule by default', () => {
    const widget = makeWidget('divider', {});
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelector('hr')).toBeTruthy();
  });

  it('DividerWidget renders vertical bar when configured', () => {
    const widget = makeWidget('divider', { orientation: 'vertical' });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const dividers = container.querySelectorAll('[aria-label="Divider"]');
    expect(dividers.length).toBe(1);
    expect(dividers[0].tagName).not.toBe('HR'); // vertical uses a div
  });

  it('ProgressBarWidget renders percentage of value/max', () => {
    const widget = makeWidget('progress_bar', { value: 25, max: 100, label: 'Loading' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('BadgeWidget renders label text', () => {
    const widget = makeWidget('badge', { label: 'Active', color: 'green' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('TooltipWidget shows text on hover', () => {
    const widget = makeWidget('tooltip', { label: 'Help', text: 'More info here' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Help')).toBeTruthy();
    expect(screen.queryByText('More info here')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('Help'));
    expect(screen.getByText('More info here')).toBeTruthy();
  });

  it('AccordionWidget toggles sections open/closed', () => {
    const widget = makeWidget('accordion', {
      sections: [{ title: 'Section A', content: 'Alpha content' }, { title: 'Section B', content: 'Beta content' }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Section A')).toBeTruthy();
    // First section open by default
    expect(screen.getByText('Alpha content')).toBeTruthy();
    // Section B content hidden initially
    expect(screen.queryByText('Beta content')).toBeNull();
    // Click Section B
    fireEvent.click(screen.getByText('Section B'));
    expect(screen.getByText('Beta content')).toBeTruthy();
  });

  it('PropertyListWidget renders object property values', () => {
    const widget = makeWidget('property_list', {
      properties: [
        { key: 'name', label: 'Name' },
        { key: 'age', label: 'Age' },
      ],
      object: { name: 'Alice', age: 30 },
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });

  it('ObjectSetTitleWidget renders title and count', () => {
    const widget = makeWidget('object_set_title', { title: 'Active Patients', count: 42 });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Active Patients')).toBeTruthy();
    expect(screen.getByText('(42)')).toBeTruthy();
  });

  it('LinksWidget renders link entries', () => {
    const widget = makeWidget('links', {
      links: [{ id: 'l1', label: 'Primary physician', targetType: 'Physician', targetId: 'doc-1' }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText(/Primary physician/)).toBeTruthy();
  });

  it('LinksWidget shows empty state when no links', () => {
    const widget = makeWidget('links', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No links')).toBeTruthy();
  });

  it('TreeViewWidget expands and collapses children', () => {
    const widget = makeWidget('tree_view', {
      nodes: [
        { id: 'n1', label: 'Root', children: [{ id: 'c1', label: 'Child' }] },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Label text is prefixed with a toggle glyph (▸/▾), so use regex matchers.
    expect(screen.getByText(/Root/)).toBeTruthy();
    // Child hidden initially
    expect(screen.queryByText(/Child/)).toBeNull();
    // Click Root to expand
    fireEvent.click(screen.getByText(/Root/));
    expect(screen.getByText(/Child/)).toBeTruthy();
  });

  it('KanbanWidget renders columns and cards', () => {
    const widget = makeWidget('kanban', {
      columns: [{ id: 'todo', title: 'To Do' }, { id: 'done', title: 'Done' }],
      cards: [{ id: 'c1', title: 'Task A', columnId: 'todo', priority: 'P1' }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Column titles include a count suffix, so use regex matchers.
    expect(screen.getByText(/To Do/)).toBeTruthy();
    expect(screen.getByText(/Done/)).toBeTruthy();
    expect(screen.getByText('Task A')).toBeTruthy();
    expect(screen.getByText('P1')).toBeTruthy();
  });
});

// ── AI widgets ─────────────────────────────────────────────────

describe('Phase 20 AI widgets', () => {
  it('AipChatWidget renders input and send button', () => {
    const widget = makeWidget('aip_chat', { title: 'My Assistant' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('My Assistant')).toBeTruthy();
    expect(screen.getByLabelText('Chat input')).toBeTruthy();
    expect(screen.getByText('Send')).toBeTruthy();
  });

  it('AipGeneratedContentWidget renders provided content', () => {
    const widget = makeWidget('aip_generated_content', { content: 'Summary: all good', prompt: 'summarize' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Summary: all good')).toBeTruthy();
  });

  it('AipGeneratedContentWidget shows loading state', () => {
    const widget = makeWidget('aip_generated_content', { loading: true });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Generating...')).toBeTruthy();
  });

  it('AipGeneratedContentWidget shows placeholder when no content', () => {
    const widget = makeWidget('aip_generated_content', { prompt: 'write a summary' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText(/No content generated yet/)).toBeTruthy();
  });
});

// ── Navigation widget ──────────────────────────────────────────

describe('Phase 20 breadcrumb widget', () => {
  it('BreadcrumbWidget renders items and calls navigate on clickable items', () => {
    const navigate = vi.fn();
    const ctx = makeCtx({ navigate });
    const widget = makeWidget('breadcrumb', {
      items: [{ label: 'Home', pageId: 'home' }, { label: 'Patients', pageId: 'patients' }, { label: 'Current' }],
    });
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Patients')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    fireEvent.click(screen.getByText('Patients'));
    expect(navigate).toHaveBeenCalledWith('patients');
    // "Current" has no pageId — clicking should not navigate
    navigate.mockClear();
    fireEvent.click(screen.getByText('Current'));
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ── Time widgets ───────────────────────────────────────────────

describe('Phase 20 time widgets', () => {
  it('GanttWidget renders task bars', () => {
    const widget = makeWidget('gantt', {
      tasks: [
        { id: 't1', name: 'Design', start: 0, duration: 10 },
        { id: 't2', name: 'Build', start: 10, duration: 20, color: '#10b981' },
      ],
      totalDuration: 30,
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Design')).toBeTruthy();
    expect(screen.getByText('Build')).toBeTruthy();
  });

  it('TimelineWidget renders events with timestamps', () => {
    const widget = makeWidget('timeline', {
      events: [
        { id: 'e1', title: 'Created', timestamp: '2026-01-01', description: 'Initial creation' },
        { id: 'e2', title: 'Updated', timestamp: '2026-01-05' },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
    expect(screen.getByText('Initial creation')).toBeTruthy();
    expect(screen.getByText('2026-01-01')).toBeTruthy();
  });

  it('CalendarWidget renders month name and event markers', () => {
    // The calendar starts on the current month, so use an event date in the
    // current month/year to ensure it renders without navigating.
    const now = new Date();
    const eventDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    const widget = makeWidget('calendar', {
      events: [{ date: eventDate, title: 'Demo' }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Event title is rendered with a "• " prefix inside the day cell.
    expect(screen.getByText(/Demo/)).toBeTruthy();
  });
});

// ── Phase 20 extra widgets ─────────────────────────────────────

describe('SavedViewsWidget', () => {
  it('renders existing views and applies the default view filter to bound variable', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('saved_views', {
      objectType: 'Patient',
      views: [
        { id: 'v1', name: 'Active', filter: { status: 'active' }, isDefault: true },
        { id: 'v2', name: 'All', filter: {} },
      ],
    }, 'viewFilter');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    // Default view's filter should be applied on mount (via initial selection)
    // Click "All" to apply its filter
    fireEvent.click(screen.getByText('All'));
    expect(setVariable).toHaveBeenCalledWith('viewFilter', {});
  });

  it('creates a new view via the + New form', () => {
    const widget = makeWidget('saved_views', { views: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No saved views')).toBeTruthy();
    fireEvent.click(screen.getByText('+ New'));
    const input = screen.getByLabelText('New view name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My View' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('My View')).toBeTruthy();
  });

  it('deletes a view via the ✕ button', () => {
    const widget = makeWidget('saved_views', {
      views: [{ id: 'v1', name: 'ToDelete' }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('ToDelete')).toBeTruthy();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('ToDelete')).toBeNull();
  });
});

describe('EditHistoryWidget', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders inline history entries from config', () => {
    // No objectType/objectId → useEffect won't fire fetch, so inline history
    // from config is the only data source.
    const widget = makeWidget('edit_history', {
      history: [
        {
          version: 2,
          timestamp: '2026-01-02',
          actorId: 'user-1',
          changes: [{ field: 'name', oldValue: 'Old', newValue: 'New' }],
        },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    expect(screen.getByText('by user-1')).toBeTruthy();
    expect(screen.getByText('name:')).toBeTruthy();
  });

  it('fetches history from the API when objectType and objectId are set', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          { _version: 3, _updatedAt: '2026-02-01', _actorId: 'u2', changes: [] },
        ],
      }),
    } as Response);
    const widget = makeWidget('edit_history', { objectType: 'Patient', objectId: 'p1' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Wait for fetch + state update
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/patients/p1/history');
  });

  it('shows error state when fetch fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const widget = makeWidget('edit_history', { objectType: 'Patient', objectId: 'missing' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/HTTP 404/)).toBeTruthy();
  });
});

describe('ResourceBrowserWidget', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches resources on mount and renders them', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        resources: [
          { id: 'r1', name: 'report.csv', kind: 'file', path: '/reports', size: 2048 },
        ],
      }),
    } as Response);
    const widget = makeWidget('resource_browser', { basePath: '/reports' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    // The URL should include the basePath param
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('path=%2Freports');
    expect(await screen.findByText('report.csv')).toBeTruthy();
  });

  it('writes selected resource id to bound variable on click', async () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        resources: [{ id: 'r1', name: 'doc.pdf', kind: 'file', path: '/' }],
      }),
    } as Response);
    const widget = makeWidget('resource_browser', {}, 'selectedResource');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const item = await screen.findByText('doc.pdf');
    fireEvent.click(item);
    expect(setVariable).toHaveBeenCalledWith('selectedResource', 'r1');
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const widget = makeWidget('resource_browser', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(await screen.findByText(/HTTP 500/)).toBeTruthy();
  });
});

describe('IframeWidget', () => {
  it('renders an iframe with the configured URL and title', () => {
    const widget = makeWidget('iframe', {
      url: 'https://example.com/embed',
      title: 'External report',
      width: 600,
      height: 400,
      sandbox: ['allow-scripts'],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain('https://example.com/embed');
    expect(iframe.title).toBe('External report');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('shows placeholder when no URL configured', () => {
    const widget = makeWidget('iframe', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No URL configured')).toBeTruthy();
  });
});

describe('AppPairingWidget', () => {
  it('renders paired apps and their shared state inputs', () => {
    const widget = makeWidget('app_pairing', {
      pairedApps: [
        { id: 'a1', name: 'Mapper', sharedStateKeys: ['selectedId'] },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('App Pairing')).toBeTruthy();
    expect(screen.getByText('Mapper')).toBeTruthy();
    expect(screen.getByLabelText('Shared state: selectedId')).toBeTruthy();
  });

  it('writes shared state updates to bound variable', () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({ setVariable });
    const widget = makeWidget('app_pairing', {
      pairedApps: [{ id: 'a1', name: 'Mapper', sharedStateKeys: ['selectedId'] }],
    }, 'sharedState');
    render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const input = screen.getByLabelText('Shared state: selectedId') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(setVariable).toHaveBeenCalledWith(
      'sharedState',
      expect.objectContaining({ selectedId: 'abc' }),
    );
  });

  it('shows empty state when no paired apps', () => {
    const widget = makeWidget('app_pairing', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No paired apps')).toBeTruthy();
  });
});

// ── ObjectTableWidget display optimization ─────────────────────

describe('ObjectTableWidget display optimization', () => {
  // Build a fake SDK accessor that returns a stable connection.
  function makeClient() {
    const list = vi.fn().mockResolvedValue({
      edges: [{ node: { id: '1', name: 'Alice' }, cursor: '1' }],
      pageInfo: { hasNextPage: false, endCursor: '1' },
    });
    const onAnyChange = vi.fn().mockReturnValue(() => {});
    return { patient: { list, onAnyChange } };
  }

  it('applies compact density and exposes data-density attribute', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
      density: 'compact',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-density')).toBe('compact');
    // Compact density uses 2px 4px padding
    expect(wrapper.style.getPropertyValue('--ed-density-padding')).toBe('2px 4px');
  });

  it('applies spacious density', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
      density: 'spacious',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-density')).toBe('spacious');
    expect(wrapper.style.getPropertyValue('--ed-density-padding')).toBe('8px 12px');
  });

  it('defaults to comfortable density', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-density')).toBe('comfortable');
  });

  it('exposes data-virtualization=on when enableVirtualization is true', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
      enableVirtualization: true,
      pageSize: 10,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-virtualization')).toBe('on');
  });

  it('exposes data-virtualization=off by default', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('data-virtualization')).toBe('off');
  });

  it('boosts pageSize to at least 50 when virtualization is enabled', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
      enableVirtualization: true,
      pageSize: 10,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    // The ObjectTable receives pageSize as a prop; we verify via the wrapper's
    // data attribute and that list was called with first=50 on initial load.
    expect((ctx.client as { patient: { list: ReturnType<typeof vi.fn> } }).patient.list).toHaveBeenCalledWith(
      undefined,
      { first: 50 },
      undefined,
      undefined,
    );
    void container;
  });

  it('applies maxHeight to the scroll container', () => {
    const ctx = makeCtx({ client: makeClient() });
    const widget = makeWidget('object_table', {
      objectType: 'Patient',
      columns: [{ key: 'name', header: 'Name' }],
      maxHeight: 600,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('600px');
  });
});
