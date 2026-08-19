/**
 * Tests for chart & graph widgets (Phase 2).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetRenderer } from '../WidgetRenderer.js';
import { isWidgetImplemented, listRegisteredWidgets } from '../WidgetRegistry.js';
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

function makeWidget(type: string, config: Record<string, unknown>, boundVariable?: string): WorkshopWidgetInstance {
  return {
    id: `w-${type}`,
    widgetType: type,
    config,
    boundVariable,
    visible: true,
  };
}

// ── Registry counts ───────────────────────────────────────────

describe('Phase 2 widget registry', () => {
  // Phase 20 added 6 more widgets (5 extra + 28 stubs replaced) bringing total to 69.
  it('registers 87 widget types total', () => {
    expect(listRegisteredWidgets().length).toBe(87);
  });

  it('marks chart widgets as implemented', () => {
    expect(isWidgetImplemented('chart_xy')).toBe(true);
    expect(isWidgetImplemented('chart_pie')).toBe(true);
    expect(isWidgetImplemented('pivot_table')).toBe(true);
    expect(isWidgetImplemented('time_series')).toBe(true);
  });

  it('marks graph widget (graph) as implemented', () => {
    expect(isWidgetImplemented('graph')).toBe(true);
  });

  it('marks map widget as implemented', () => {
    expect(isWidgetImplemented('map')).toBe(true);
  });

  it('marks Phase 20 chart types as implemented (no longer stubs)', () => {
    expect(isWidgetImplemented('chart_bar')).toBe(true);
    expect(isWidgetImplemented('chart_vega')).toBe(true);
    expect(isWidgetImplemented('heatmap')).toBe(true);
    expect(isWidgetImplemented('scatter_plot')).toBe(true);
    expect(isWidgetImplemented('waterfall')).toBe(true);
    expect(isWidgetImplemented('observability_chart')).toBe(true);
  });
});

// ── ChartXYWidget ─────────────────────────────────────────────

describe('ChartXYWidget', () => {
  it('renders a line chart from config series', () => {
    const widget = makeWidget('chart_xy', {
      series: [
        {
          name: 'Sales',
          type: 'line',
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
            { x: 3, y: 15 },
          ],
        },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Should have a path for the line
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders a scatter chart', () => {
    const widget = makeWidget('chart_xy', {
      series: [
        {
          name: 'Points',
          type: 'scatter',
          data: [
            { x: 1, y: 5 },
            { x: 2, y: 10 },
          ],
        },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('renders a bar chart', () => {
    const widget = makeWidget('chart_xy', {
      series: [
        {
          name: 'Bars',
          type: 'bar',
          data: [
            { x: 1, y: 30 },
            { x: 2, y: 50 },
          ],
        },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2);
  });

  it('renders empty state when no data', () => {
    const widget = makeWidget('chart_xy', { series: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget(
      'chart_xy',
      {},
      'chartData',
    );
    const ctx = makeCtx({
      variables: {
        chartData: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
        ],
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders a legend when multiple series', () => {
    const widget = makeWidget('chart_xy', {
      series: [
        { name: 'A', type: 'line', data: [{ x: 1, y: 1 }] },
        { name: 'B', type: 'line', data: [{ x: 1, y: 2 }] },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });
});

// ── ChartPieWidget ────────────────────────────────────────────

describe('ChartPieWidget', () => {
  it('renders a pie chart from config data', () => {
    const widget = makeWidget('chart_pie', {
      data: [
        { label: 'A', value: 30 },
        { label: 'B', value: 40 },
        { label: 'C', value: 30 },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const slices = svg!.querySelectorAll('path');
    expect(slices.length).toBe(3);
  });

  it('renders a donut chart with center total', () => {
    const widget = makeWidget('chart_pie', {
      data: [
        { label: 'A', value: 50 },
        { label: 'B', value: 50 },
      ],
      donut: true,
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Donut center text shows total
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('renders empty state when all values are zero', () => {
    const widget = makeWidget('chart_pie', {
      data: [
        { label: 'A', value: 0 },
        { label: 'B', value: 0 },
      ],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('All values are zero')).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget('chart_pie', {}, 'pieData');
    const ctx = makeCtx({
      variables: {
        pieData: [
          { label: 'X', value: 10 },
          { label: 'Y', value: 20 },
        ],
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    const slices = container.querySelectorAll('svg path');
    expect(slices.length).toBe(2);
  });
});

// ── PivotTableWidget ──────────────────────────────────────────

describe('PivotTableWidget', () => {
  it('renders a pivot table with row grouping and sum aggregation', () => {
    const widget = makeWidget('pivot_table', {
      data: [
        { region: 'North', product: 'A', sales: 100 },
        { region: 'North', product: 'B', sales: 200 },
        { region: 'South', product: 'A', sales: 150 },
        { region: 'South', product: 'B', sales: 250 },
      ],
      rows: ['region'],
      value: 'sales',
      aggregation: 'sum',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    // Should have North=300, South=400
    expect(screen.getByText('North')).toBeTruthy();
    expect(screen.getByText('South')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('400')).toBeTruthy();
    // Total row — use getAllByText since "Total" appears as both column key and row header
    const totals = screen.getAllByText('Total');
    expect(totals.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('700')).toBeTruthy();
  });

  it('renders a pivot table with row × column grouping', () => {
    const widget = makeWidget('pivot_table', {
      data: [
        { region: 'North', product: 'A', sales: 100 },
        { region: 'North', product: 'B', sales: 200 },
        { region: 'South', product: 'A', sales: 150 },
        { region: 'South', product: 'B', sales: 250 },
      ],
      rows: ['region'],
      columns: ['product'],
      value: 'sales',
      aggregation: 'sum',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Column headers: A, B
    const aHeaders = screen.getAllByText('A');
    const bHeaders = screen.getAllByText('B');
    expect(aHeaders.length).toBeGreaterThan(0);
    expect(bHeaders.length).toBeGreaterThan(0);
  });

  it('renders count aggregation', () => {
    const widget = makeWidget('pivot_table', {
      data: [
        { region: 'North', sales: 100 },
        { region: 'North', sales: 200 },
        { region: 'South', sales: 150 },
      ],
      rows: ['region'],
      aggregation: 'count',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // North has 2 rows, South has 1
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders empty state when no data', () => {
    const widget = makeWidget('pivot_table', {
      data: [],
      rows: ['region'],
      aggregation: 'sum',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No data or row dimensions not configured')).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget('pivot_table', { rows: ['cat'], aggregation: 'count' }, 'pivotData');
    const ctx = makeCtx({
      variables: {
        pivotData: [
          { cat: 'X', val: 1 },
          { cat: 'Y', val: 2 },
        ],
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('table')).toBeTruthy();
  });
});

// ── GraphWidget ───────────────────────────────────────────────

describe('GraphWidget', () => {
  it('renders a graph with nodes and links', () => {
    const widget = makeWidget('graph', {
      nodes: [
        { id: 'a', label: 'Node A' },
        { id: 'b', label: 'Node B' },
        { id: 'c', label: 'Node C' },
      ],
      links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      layout: 'circle',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // 3 nodes = 3 circles, 2 links = 2 lines
    const circles = svg!.querySelectorAll('circle');
    const lines = svg!.querySelectorAll('line');
    expect(circles.length).toBe(3);
    expect(lines.length).toBe(2);
  });

  it('renders node labels', () => {
    const widget = makeWidget('graph', {
      nodes: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
      links: [{ source: 'a', target: 'b' }],
      layout: 'circle',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('highlights neighbors on node click', () => {
    const widget = makeWidget('graph', {
      nodes: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
      ],
      links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      layout: 'circle',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    // Click on Alpha
    const alphaText = screen.getByText('Alpha');
    const alphaGroup = alphaText.closest('g');
    fireEvent.click(alphaGroup!);
    // Should show detail panel with neighbor count
    expect(screen.getByText(/1 neighbor/)).toBeTruthy();
  });

  it('renders empty state when no nodes', () => {
    const widget = makeWidget('graph', { nodes: [], links: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No graph data')).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget('graph', {}, 'graphData');
    const ctx = makeCtx({
      variables: {
        graphData: {
          nodes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
          links: [{ source: 'x', target: 'y' }],
        },
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('supports grid layout', () => {
    const widget = makeWidget('graph', {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
      links: [],
      layout: 'grid',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelectorAll('circle').length).toBe(4);
  });
});

// ── TimeSeriesWidget ──────────────────────────────────────────

describe('TimeSeriesWidget', () => {
  it('renders a time series line chart', () => {
    const widget = makeWidget('time_series', {
      data: [
        { timestamp: '2026-01-01', value: 10 },
        { timestamp: '2026-01-02', value: 20 },
        { timestamp: '2026-01-03', value: 15 },
        { timestamp: '2026-01-04', value: 25 },
      ],
      label: 'Daily sales',
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Should have a line path
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    // Should have data point circles
    const circles = svg!.querySelectorAll('circle');
    expect(circles.length).toBe(4);
  });

  it('renders area fill by default', () => {
    const widget = makeWidget('time_series', {
      data: [
        { timestamp: '2026-01-01', value: 10 },
        { timestamp: '2026-01-02', value: 20 },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const paths = container.querySelectorAll('svg path');
    // Area path + line path = 2 paths
    expect(paths.length).toBe(2);
  });

  it('hides area when showArea is false', () => {
    const widget = makeWidget('time_series', {
      data: [
        { timestamp: '2026-01-01', value: 10 },
        { timestamp: '2026-01-02', value: 20 },
      ],
      showArea: false,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const paths = container.querySelectorAll('svg path');
    // Only line path, no area
    expect(paths.length).toBe(1);
  });

  it('renders empty state when no data', () => {
    const widget = makeWidget('time_series', { data: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No time series data')).toBeTruthy();
  });

  it('renders single point message', () => {
    const widget = makeWidget('time_series', {
      data: [{ timestamp: '2026-01-01', value: 42 }],
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText(/Single data point/)).toBeTruthy();
  });

  it('renders from a bound variable', () => {
    const widget = makeWidget('time_series', {}, 'tsData');
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

  it('renders label in legend', () => {
    const widget = makeWidget('time_series', {
      data: [
        { timestamp: '2026-01-01', value: 10 },
        { timestamp: '2026-01-02', value: 20 },
      ],
      label: 'Temperature',
    });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Temperature')).toBeTruthy();
  });
});
