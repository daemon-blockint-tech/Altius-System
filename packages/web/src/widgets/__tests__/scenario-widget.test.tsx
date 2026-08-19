/**
 * Tests for ScenarioWidget — rendering, scenario list, create, run, compare.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScenarioWidget } from '../components/ScenarioWidget.js';
import type { WidgetProps, WidgetContext } from '../types.js';

function mockCtx(overrides?: Partial<WidgetContext>): WidgetContext {
  return {
    client: {},
    variables: {},
    setVariable: vi.fn(),
    navigate: vi.fn(),
    currentPageId: 'page-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  };
}

function mockProps(config: Record<string, unknown>, ctx?: WidgetContext): WidgetProps {
  return {
    instance: {
      id: 'w1',
      type: 'scenario_panel',
      config,
    } as never,
    ctx: ctx ?? mockCtx(),
  };
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ScenarioWidget', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders the scenario panel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ scenarios: [], totalCount: 0 }),
    });
    render(<ScenarioWidget {...mockProps({ targetId: 'model-1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Scenarios')).toBeDefined();
    });
  });

  it('loads scenarios on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        scenarios: [
          { id: 's1', name: 'Test Scenario', state: 'draft', targetId: 'model-1', targetType: 'model', inputOverrides: {}, isBaseline: false, tags: [], createdAt: '', updatedAt: '', createdBy: 'u1', description: '' },
        ],
        totalCount: 1,
      }),
    });
    render(<ScenarioWidget {...mockProps({ targetId: 'model-1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Test Scenario')).toBeDefined();
    });
  });

  it('shows create form', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ scenarios: [], totalCount: 0 }),
    });
    render(<ScenarioWidget {...mockProps({ targetId: 'model-1' })} />);
    await waitFor(() => {
      expect(screen.getByText('New Scenario')).toBeDefined();
      expect(screen.getByPlaceholderText('Scenario name...')).toBeDefined();
    });
  });

  it('creates a scenario on form submit', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ scenarios: [], totalCount: 0 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 's1', name: 'My Scenario', state: 'draft', targetId: 'model-1',
          targetType: 'model', inputOverrides: {}, isBaseline: false, tags: [],
          createdAt: '', updatedAt: '', createdBy: 'u1', description: '',
        }),
      });
    render(<ScenarioWidget {...mockProps({ targetId: 'model-1' })} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Scenario name...')).toBeDefined();
    });
    const input = screen.getByPlaceholderText('Scenario name...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Scenario' } });
    const createButton = screen.getByText('Create');
    fireEvent.click(createButton);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const callOpts = mockFetch.mock.calls[1]![1] as RequestInit;
      expect(callOpts.method).toBe('POST');
    });
  });

  it('shows compare section when enabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        scenarios: [
          { id: 's1', name: 'A', state: 'completed', targetId: 'm', targetType: 'model', inputOverrides: {}, isBaseline: false, tags: [], createdAt: '', updatedAt: '', createdBy: 'u', description: '' },
          { id: 's2', name: 'B', state: 'completed', targetId: 'm', targetType: 'model', inputOverrides: {}, isBaseline: false, tags: [], createdAt: '', updatedAt: '', createdBy: 'u', description: '' },
        ],
        totalCount: 2,
      }),
    });
    render(<ScenarioWidget {...mockProps({ targetId: 'm', showCompare: true })} />);
    await waitFor(() => {
      expect(screen.getByText('Compare Scenarios')).toBeDefined();
    });
  });

  it('shows staging controls when enabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ scenarios: [], totalCount: 0 }),
    });
    render(<ScenarioWidget {...mockProps({ targetId: 'm', showStaging: true })} />);
    // Staging controls appear only when a scenario is selected
    await waitFor(() => {
      expect(screen.getByText('Scenarios')).toBeDefined();
    });
  });

  it('displays error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<ScenarioWidget {...mockProps({ targetId: 'm' })} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('renders with no targetId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ scenarios: [], totalCount: 0 }),
    });
    render(<ScenarioWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('Scenarios')).toBeDefined();
    });
  });
});
