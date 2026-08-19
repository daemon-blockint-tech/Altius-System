/**
 * Tests for ActionLogTimelineWidget — rendering, timeline, pagination.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionLogTimelineWidget } from '../components/ActionLogTimelineWidget.js';
import type { WidgetProps } from '../types.js';

function mockProps(config: Record<string, unknown>): WidgetProps {
  return {
    instance: {
      id: 'w1',
      type: 'action_log',
      config,
    } as never,
    ctx: {
      client: {},
      variables: {},
      setVariable: vi.fn(),
      navigate: vi.fn(),
      currentPageId: 'page-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    },
  };
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ActionLogTimelineWidget', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders the action log panel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], totalCount: 0, hasMore: false }),
    });
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('Action Log (0 records)')).toBeDefined();
    });
  });

  it('loads and displays audit records', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'a1', timestamp: '2026-08-19T10:00:00Z', actorId: 'user-1',
            operationType: 'create', objectType: 'Patient', objectId: 'p1', success: true,
          },
          {
            id: 'a2', timestamp: '2026-08-19T11:00:00Z', actorId: 'user-2',
            operationType: 'action', actionType: 'DischargePatient', objectType: 'Patient', objectId: 'p2', success: false,
          },
        ],
        totalCount: 2,
        hasMore: false,
      }),
    });
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('Action Log (2 records)')).toBeDefined();
      expect(screen.getByText(/CREATE/)).toBeDefined();
      expect(screen.getByText(/ACTION.*DischargePatient/)).toBeDefined();
    });
  });

  it('shows empty state when no records', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], totalCount: 0, hasMore: false }),
    });
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('No audit records')).toBeDefined();
    });
  });

  it('shows FAILED badge for unsuccessful operations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'a1', timestamp: '2026-08-19T10:00:00Z', actorId: 'user-1',
            operationType: 'delete', objectType: 'Patient', objectId: 'p1', success: false,
          },
        ],
        totalCount: 1,
        hasMore: false,
      }),
    });
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeDefined();
    });
  });

  it('shows Load More button when hasMore is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `a${i}`, timestamp: '2026-08-19T10:00:00Z', actorId: 'u1',
          operationType: 'read', success: true,
        })),
        totalCount: 100,
        hasMore: true,
      }),
    });
    render(<ActionLogTimelineWidget {...mockProps({ limit: 50 })} />);
    await waitFor(() => {
      expect(screen.getByText(/Load More/)).toBeDefined();
    });
  });

  it('displays error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('filters by objectType in the API call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], totalCount: 0, hasMore: false }),
    });
    render(<ActionLogTimelineWidget {...mockProps({ objectType: 'Patient' })} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('objectType=Patient');
    });
  });

  it('shows actor information', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'a1', timestamp: '2026-08-19T10:00:00Z', actorId: 'dr-alice',
            actorType: 'user', operationType: 'update', success: true,
          },
        ],
        totalCount: 1,
        hasMore: false,
      }),
    });
    render(<ActionLogTimelineWidget {...mockProps({})} />);
    await waitFor(() => {
      expect(screen.getByText(/dr-alice/)).toBeDefined();
      expect(screen.getByText(/\(user\)/)).toBeDefined();
    });
  });
});
