/**
 * Tests for Phase 4 widgets (mobile, digital twin, TS analysis).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WidgetRenderer } from '../WidgetRenderer.js';
import { isWidgetImplemented, listRegisteredWidgets } from '../WidgetRegistry.js';
import { MobileAppLauncher } from '../builder/index.js';
import type { WidgetContext, WorkshopWidgetInstance, WorkshopAppDefinition } from '../types.js';

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

function makeWidget(type: string, config: Record<string, unknown>, boundVariable?: string): WorkshopWidgetInstance {
  return { id: `w-${type}`, widgetType: type, config, boundVariable, visible: true };
}

// ── Registry counts ───────────────────────────────────────────

describe('Phase 4 widget registry', () => {
  it('registers 111 widget types total', () => {
    expect(listRegisteredWidgets().length).toBe(111);
  });

  it('marks Phase 4 widgets as implemented', () => {
    expect(isWidgetImplemented('mobile_navbar')).toBe(true);
    expect(isWidgetImplemented('current_location')).toBe(true);
    expect(isWidgetImplemented('digital_twin')).toBe(true);
    expect(isWidgetImplemented('time_series_analysis')).toBe(true);
  });
});

// ── MobileNavbarWidget ────────────────────────────────────────

describe('MobileNavbarWidget', () => {
  it('renders navigation items', () => {
    const widget = makeWidget('mobile_navbar', {
      items: [
        { label: 'Home', pageId: 'p1', icon: '⌂' },
        { label: 'Settings', pageId: 'p2', icon: '⚙' },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('⌂')).toBeTruthy();
  });

  it('writes selected page to bound variable on click', () => {
    const setVariable = vi.fn();
    const navigate = vi.fn();
    const widget = makeWidget('mobile_navbar', {
      items: [{ label: 'Page 2', pageId: 'p2' }],
    }, 'currentPage');
    render(<WidgetRenderer instance={widget} ctx={makeCtx({ setVariable, navigate })} />);
    fireEvent.click(screen.getByText('Page 2'));
    expect(setVariable).toHaveBeenCalledWith('currentPage', 'p2');
    expect(navigate).toHaveBeenCalledWith('p2');
  });

  it('renders empty state when no items', () => {
    const widget = makeWidget('mobile_navbar', { items: [] });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const nav = container.querySelector('.ed-mobile-nav');
    expect(nav).toBeTruthy();
    expect(nav!.children.length).toBe(0);
  });
});

// ── CurrentLocationWidget ─────────────────────────────────────

describe('CurrentLocationWidget', () => {
  it('renders with locate button', () => {
    const widget = makeWidget('current_location', { label: 'My Location' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('My Location')).toBeTruthy();
    expect(screen.getByText('Locate')).toBeTruthy();
  });

  it('renders empty state before location is requested', () => {
    const widget = makeWidget('current_location', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText(/Click "Locate"/)).toBeTruthy();
  });
});

// ── DigitalTwinCanvasWidget ───────────────────────────────────

describe('DigitalTwinCanvasWidget', () => {
  const dtConfig = {
    nodes: [
      { id: 'm1', label: 'Machine 1', statusProperty: 'status', metricProperty: 'temperature' },
      { id: 'm2', label: 'Machine 2', statusProperty: 'status', metricProperty: 'temperature' },
      { id: 'm3', label: 'Machine 3', statusProperty: 'status' },
    ],
    links: [
      { source: 'm1', target: 'm2', label: 'feeds' },
      { source: 'm2', target: 'm3', label: 'outputs' },
    ],
    layout: 'circle',
    scenarioMode: true,
  };

  it('renders nodes and links', () => {
    const widget = makeWidget('digital_twin', dtConfig);
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // 3 nodes (each has 2 circles: status + inner)
    const circles = svg!.querySelectorAll('circle');
    expect(circles.length).toBe(6);
    // 2 links = 2 lines
    const lines = svg!.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('renders node labels', () => {
    const widget = makeWidget('digital_twin', dtConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Machine 1')).toBeTruthy();
    expect(screen.getByText('Machine 2')).toBeTruthy();
    expect(screen.getByText('Machine 3')).toBeTruthy();
  });

  it('renders scenario bar when scenarioMode is enabled', () => {
    const widget = makeWidget('digital_twin', dtConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText(/What-if/)).toBeTruthy();
  });

  it('toggles scenario mode on click', () => {
    const widget = makeWidget('digital_twin', dtConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const btn = screen.getByText(/What-if/);
    fireEvent.click(btn);
    expect(screen.getByText(/What-if: ON/)).toBeTruthy();
  });

  it('shows detail panel on node click', () => {
    const widget = makeWidget('digital_twin', dtConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Click on Machine 1 label
    fireEvent.click(screen.getByText('Machine 1'));
    expect(screen.getByText('Status:')).toBeTruthy();
  });

  it('renders empty state when no nodes', () => {
    const widget = makeWidget('digital_twin', { nodes: [], links: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No digital twin data')).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget('digital_twin', {}, 'dtData');
    const ctx = makeCtx({
      variables: {
        dtData: {
          nodes: [{ id: 'x', label: 'Node X' }],
          links: [],
        },
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('supports fixed layout', () => {
    const widget = makeWidget('digital_twin', {
      nodes: [
        { id: 'a', label: 'A', x: 100, y: 100 },
        { id: 'b', label: 'B', x: 300, y: 200 },
      ],
      links: [{ source: 'a', target: 'b' }],
      layout: 'fixed',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelectorAll('circle').length).toBe(4);
  });
});

// ── TimeSeriesAnalysisWidget ──────────────────────────────────

describe('TimeSeriesAnalysisWidget', () => {
  const tsConfig = {
    series: [
      {
        id: 's1',
        label: 'Temperature',
        data: [
          { timestamp: '2026-01-01', value: 20 },
          { timestamp: '2026-01-02', value: 25 },
          { timestamp: '2026-01-03', value: 30 },
          { timestamp: '2026-01-04', value: 35 },
        ],
      },
      {
        id: 's2',
        label: 'Pressure',
        data: [
          { timestamp: '2026-01-01', value: 100 },
          { timestamp: '2026-01-02', value: 110 },
          { timestamp: '2026-01-03', value: 105 },
        ],
      },
    ],
    thresholds: [
      { value: 32, label: 'Warning', severity: 'warning' },
      { value: 38, label: 'Alert', severity: 'alert' },
    ],
  };

  it('renders multi-series chart with SVG', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Should have paths for each series (area + line = 2 per series)
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  it('renders series toggle checkboxes', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Series toggles are in the toggles div
    const toggles = container.querySelector('.ed-ts-analysis__series-toggles');
    expect(toggles).toBeTruthy();
    expect(toggles!.querySelectorAll('.ed-ts-analysis__series-toggle').length).toBe(2);
  });

  it('renders aggregation buttons', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Raw')).toBeTruthy();
    expect(screen.getByText('Hourly')).toBeTruthy();
    expect(screen.getByText('Daily')).toBeTruthy();
  });

  it('renders threshold labels', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('Alert')).toBeTruthy();
  });

  it('renders export button', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Export CSV')).toBeTruthy();
  });

  it('renders stats (min/avg/max)', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getAllByText(/min:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/avg:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/max:/). length).toBeGreaterThan(0);
  });

  it('renders empty state when no data', () => {
    const widget = makeWidget('time_series_analysis', { series: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No time series data')).toBeTruthy();
  });

  it('renders from a bound variable (array)', () => {
    const widget = makeWidget('time_series_analysis', {}, 'tsData');
    const ctx = makeCtx({
      variables: {
        tsData: [
          { timestamp: '2026-01-01', value: 10 },
          { timestamp: '2026-01-02', value: 20 },
        ],
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders from a bound variable (series object)', () => {
    const widget = makeWidget('time_series_analysis', {}, 'tsData');
    const ctx = makeCtx({
      variables: {
        tsData: {
          series: [
            { id: 'x', label: 'X', data: [{ timestamp: '2026-01-01', value: 5 }] },
          ],
        },
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('toggles aggregation to daily', () => {
    const widget = makeWidget('time_series_analysis', tsConfig);
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    fireEvent.click(screen.getByText('Daily'));
    // The Daily button should now be active
    const dailyBtn = screen.getByText('Daily');
    expect(dailyBtn.className).toContain('ed-ts-analysis__btn--active');
  });
});

// ── MobileAppLauncher ─────────────────────────────────────────

describe('MobileAppLauncher', () => {
  function makeApp(): WorkshopAppDefinition {
    return {
      id: 'app-m',
      tenantId: 't',
      name: 'Mobile App',
      description: '',
      pages: [
        { id: 'p1', name: 'Home', sections: [{ id: 's1', layout: 'stack', widgets: [{ id: 'w1', widgetType: 'header', config: { title: 'Mobile Home' }, visible: true }] }] },
        { id: 'p2', name: 'Settings', sections: [{ id: 's2', layout: 'stack', widgets: [] }] },
      ],
      overlays: [],
      variableIds: [],
      ownerId: 'u',
      sharedWith: [],
      isPublic: false,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
  }

  it('renders the mobile frame with app content', () => {
    render(<MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" />);
    expect(screen.getByText('Mobile Home')).toBeTruthy();
  });

  it('renders bottom navigation by default', () => {
    const { container } = render(<MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" />);
    const nav = container.querySelector('.ed-mobile__nav');
    expect(nav).toBeTruthy();
    expect(within(nav as HTMLElement).getByText('Home')).toBeTruthy();
    expect(within(nav as HTMLElement).getByText('Settings')).toBeTruthy();
  });

  it('navigates between pages on nav click', () => {
    const { container } = render(<MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" />);
    const nav = container.querySelector('.ed-mobile__nav')!;
    fireEvent.click(within(nav as HTMLElement).getByText('Settings'));
    // After clicking Settings, the nav should show Settings as active
    const activeItem = nav.querySelector('.ed-mobile__nav-item--active');
    expect(activeItem).toBeTruthy();
  });

  it('hides navigation when navPosition is hidden', () => {
    const { container } = render(
      <MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" navPosition="hidden" />
    );
    expect(container.querySelector('.ed-mobile__nav')).toBeNull();
  });

  it('renders QR reader button when enabled', () => {
    render(
      <MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" qrReaderEnabled />
    );
    expect(screen.getByLabelText('QR code reader')).toBeTruthy();
  });

  it('renders geolocation button when enabled', () => {
    render(
      <MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" geolocationEnabled />
    );
    expect(screen.getByLabelText('Geolocation')).toBeTruthy();
  });

  it('opens QR overlay on button click', () => {
    render(
      <MobileAppLauncher app={makeApp()} client={{}} tenantId="t" userId="u" qrReaderEnabled />
    );
    fireEvent.click(screen.getByLabelText('QR code reader'));
    expect(screen.getByText('QR Code Scanner')).toBeTruthy();
  });
});
