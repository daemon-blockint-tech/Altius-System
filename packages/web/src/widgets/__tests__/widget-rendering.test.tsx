/**
 * Tests for the widget rendering system.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetRenderer } from '../WidgetRenderer.js';
import { SectionRenderer } from '../SectionRenderer.js';
import { AppRenderer } from '../AppRenderer.js';
import { getWidget, isWidgetImplemented, listRegisteredWidgets } from '../WidgetRegistry.js';
import type { WidgetContext, WorkshopWidgetInstance, WorkshopAppDefinition } from '../types.js';

// ── Test context ──────────────────────────────────────────────

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

// ── WidgetRegistry ────────────────────────────────────────────

describe('WidgetRegistry', () => {
  it('registers 69 widget types', () => {
    const types = listRegisteredWidgets();
    expect(types.length).toBe(87);
  });

  it('marks implemented widgets as implemented', () => {
    expect(isWidgetImplemented('object_table')).toBe(true);
    expect(isWidgetImplemented('markdown')).toBe(true);
    expect(isWidgetImplemented('action_form')).toBe(true);
  });

  it('marks formerly-stubbed widgets as implemented after Phase 20', () => {
    expect(isWidgetImplemented('chart_bar')).toBe(true);
    expect(isWidgetImplemented('heatmap')).toBe(true);
    expect(isWidgetImplemented('aip_chat')).toBe(true);
  });

  it('returns undefined for unknown widget types', () => {
    expect(getWidget('nonexistent_widget')).toBeUndefined();
    expect(isWidgetImplemented('nonexistent_widget')).toBe(false);
  });
});

// ── WidgetRenderer ────────────────────────────────────────────

describe('WidgetRenderer', () => {
  it('renders nothing for invisible widgets', () => {
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'markdown',
      config: { content: '# Hello' },
      visible: false,
    };
    const { container } = render(<WidgetRenderer instance={instance} ctx={makeCtx()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a placeholder for unknown widget types', () => {
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'totally_unknown',
      config: {},
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx()} />);
    expect(screen.getByText('totally_unknown')).toBeTruthy();
  });

  it('renders a markdown widget', () => {
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'markdown',
      config: { content: '# Test Heading' },
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx()} />);
    expect(screen.getByText('Test Heading').tagName).toBe('H1');
  });

  it('renders a metric card widget', () => {
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'metric_card',
      config: { label: 'Total Patients', value: 42, format: 'number' },
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx()} />);
    expect(screen.getByText('Total Patients')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders a header widget', () => {
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'header',
      config: { title: 'My Page', subtitle: 'A subtitle' },
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx()} />);
    expect(screen.getByText('My Page')).toBeTruthy();
    expect(screen.getByText('A subtitle')).toBeTruthy();
  });

  it('renders a button group widget that updates variables on click', () => {
    const setVariable = vi.fn();
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'button_group',
      config: {
        buttons: [
          { label: 'Set filter', variableName: 'status', variableValue: 'active' },
        ],
      },
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx({ setVariable })} />);
    const btn = screen.getByText('Set filter');
    fireEvent.click(btn);
    expect(setVariable).toHaveBeenCalledWith('status', 'active');
  });

  it('renders a text input widget that updates variables on change', () => {
    const setVariable = vi.fn();
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'text_input',
      config: { label: 'Name', placeholder: 'Enter name' },
      boundVariable: 'name',
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx({ setVariable })} />);
    const input = screen.getByPlaceholderText('Enter name');
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(setVariable).toHaveBeenCalledWith('name', 'Alice');
  });

  it('renders a checkbox widget that toggles a boolean variable', () => {
    const setVariable = vi.fn();
    const instance: WorkshopWidgetInstance = {
      id: 'w1',
      widgetType: 'checkbox',
      config: { label: 'Active' },
      boundVariable: 'isActive',
      visible: true,
    };
    render(<WidgetRenderer instance={instance} ctx={makeCtx({ setVariable })} />);
    const checkbox = screen.getByLabelText('Active');
    fireEvent.click(checkbox);
    expect(setVariable).toHaveBeenCalledWith('isActive', true);
  });
});

// ── SectionRenderer ───────────────────────────────────────────

describe('SectionRenderer', () => {
  it('renders a stack layout', () => {
    const section = {
      id: 's1',
      layout: 'stack' as const,
      widgets: [
        { id: 'w1', widgetType: 'header', config: { title: 'Section Title' }, visible: true },
        { id: 'w2', widgetType: 'markdown', config: { content: 'Content' }, visible: true },
      ],
    };
    render(<SectionRenderer section={section} ctx={makeCtx()} />);
    expect(screen.getByText('Section Title')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('renders a grid layout', () => {
    const section = {
      id: 's1',
      layout: 'grid' as const,
      layoutParams: { columns: 3, gap: '20px' },
      widgets: [
        { id: 'w1', widgetType: 'metric_card', config: { label: 'A', value: 1 }, visible: true },
        { id: 'w2', widgetType: 'metric_card', config: { label: 'B', value: 2 }, visible: true },
        { id: 'w3', widgetType: 'metric_card', config: { label: 'C', value: 3 }, visible: true },
      ],
    };
    render(<SectionRenderer section={section} ctx={makeCtx()} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('renders a tabs layout with switchable tabs', () => {
    const section = {
      id: 's1',
      layout: 'tabs' as const,
      layoutParams: { tabs: ['Overview', 'Details'] },
      widgets: [
        { id: 'w1', widgetType: 'markdown', config: { content: 'Overview content' }, visible: true },
        { id: 'w2', widgetType: 'markdown', config: { content: 'Details content' }, visible: true },
      ],
    };
    render(<SectionRenderer section={section} ctx={makeCtx()} />);
    expect(screen.getByText('Overview content')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByText('Details content')).toBeTruthy();
  });

  it('renders a loop layout iterating over a variable', () => {
    const section = {
      id: 's1',
      layout: 'loop' as const,
      loopConfig: { variableName: 'items', itemVariableName: 'item' },
      widgets: [
        {
          id: 'w1',
          widgetType: 'metric_card',
          config: { label: 'Item', format: 'text' },
          boundVariable: 'item',
          visible: true,
        },
      ],
    };
    render(
      <SectionRenderer
        section={section}
        ctx={makeCtx({ variables: { items: ['Apple', 'Banana', 'Cherry'] } })}
      />,
    );
    // The loop renders 3 items
    const items = screen.getAllByText('Item');
    expect(items.length).toBe(3);
  });
});

// ── AppRenderer ───────────────────────────────────────────────

describe('AppRenderer', () => {
  const testApp: WorkshopAppDefinition = {
    id: 'app-1',
    tenantId: 'test-tenant',
    name: 'Test App',
    description: 'A test app',
    pages: [
      {
        id: 'page-1',
        name: 'Home',
        sections: [
          {
            id: 's1',
            layout: 'stack',
            widgets: [
              { id: 'w1', widgetType: 'header', config: { title: 'Welcome' }, visible: true },
              { id: 'w2', widgetType: 'markdown', config: { content: 'Hello world' }, visible: true },
            ],
          },
        ],
        navigation: { title: 'Home' },
      },
      {
        id: 'page-2',
        name: 'Metrics',
        sections: [
          {
            id: 's2',
            layout: 'grid',
            layoutParams: { columns: 2 },
            widgets: [
              { id: 'w3', widgetType: 'metric_card', config: { label: 'Total', value: 100 }, visible: true },
              { id: 'w4', widgetType: 'metric_card', config: { label: 'Active', value: 42 }, visible: true },
            ],
          },
        ],
        navigation: { title: 'Metrics' },
      },
    ],
    header: { title: 'Test App', subtitle: 'Demo' },
    overlays: [],
    variableIds: [],
    ownerId: 'user-1',
    sharedWith: [],
    isPublic: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('renders the app header', () => {
    render(
      <AppRenderer app={testApp} client={{}} tenantId="test" userId="user-1" />,
    );
    expect(screen.getByText('Test App')).toBeTruthy();
    expect(screen.getByText('Demo')).toBeTruthy();
  });

  it('renders the first page by default', () => {
    render(
      <AppRenderer app={testApp} client={{}} tenantId="test" userId="user-1" />,
    );
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders navigation buttons for all pages', () => {
    render(
      <AppRenderer app={testApp} client={{}} tenantId="test" userId="user-1" />,
    );
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Metrics' })).toBeTruthy();
  });

  it('navigates to another page on nav click', () => {
    render(
      <AppRenderer app={testApp} client={{}} tenantId="test" userId="user-1" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }));
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders empty state for app with no pages', () => {
    const emptyApp: WorkshopAppDefinition = {
      ...testApp,
      pages: [],
    };
    render(
      <AppRenderer app={emptyApp} client={{}} tenantId="test" userId="user-1" />,
    );
    expect(screen.getByText('This app has no pages.')).toBeTruthy();
  });
});
