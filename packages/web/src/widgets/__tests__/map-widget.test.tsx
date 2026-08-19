/**
 * Tests for MapWidget — rendering, markers, geocode, radius search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapWidget } from '../components/MapWidget.js';
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
      type: 'map',
      config,
      boundVariable: config.boundVariable as string | undefined,
    } as never,
    ctx: ctx ?? mockCtx(),
  };
}

// Mock fetch for geocode/radius search
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MapWidget', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders a map container with SVG', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300 })} />);
    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('400');
    expect(svg!.getAttribute('height')).toBe('300');
  });

  it('renders markers from variable data', () => {
    const ctx = mockCtx({
      variables: {
        Hospital_data: [
          { _id: 'h1', location: { lat: 51.5, lng: -0.1 } },
          { _id: 'h2', location: { lat: 51.51, lng: -0.11 } },
        ],
      },
    });
    render(
      <MapWidget
        {...mockProps(
          {
            width: 400,
            height: 300,
            dataSources: [{ objectType: 'Hospital', geometryField: 'location' }],
          },
          ctx,
        )}
      />,
    );
    const circles = document.querySelectorAll('svg circle');
    // 2 markers (plus any radius circle if search is enabled, but it's not by default)
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('renders zoom controls', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300 })} />);
    expect(screen.getByLabelText('Zoom in')).toBeDefined();
    expect(screen.getByLabelText('Zoom out')).toBeDefined();
  });

  it('zooms in and out via controls', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300, zoom: 10 })} />);
    const zoomIn = screen.getByLabelText('Zoom in');
    fireEvent.click(zoomIn);
    // The zoom level should increase — we can check the status bar text
    const statusBar = screen.getByText(/z\d+/);
    expect(statusBar.textContent).toMatch(/z1[12]/);
  });

  it('shows geocode search bar when enabled', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300, enableGeocode: true })} />);
    expect(screen.getByPlaceholderText('Search address...')).toBeDefined();
  });

  it('shows radius search controls when enabled', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300, enableRadiusSearch: true })} />);
    expect(screen.getByLabelText('Search radius')).toBeDefined();
  });

  it('does not show geocode bar by default', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300 })} />);
    expect(screen.queryByPlaceholderText('Search address...')).toBeNull();
  });

  it('handles geocode search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: 'London',
        results: [
          { label: 'London, UK', coordinates: { lat: 51.5074, lng: -0.1278 }, type: 'city', confidence: 0.9 },
        ],
      }),
    });
    render(<MapWidget {...mockProps({ width: 400, height: 300, enableGeocode: true })} />);
    const input = screen.getByPlaceholderText('Search address...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'London' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]![0]).toContain('/geo/geocode');
    });
  });

  it('writes to bound variable when marker is clicked', () => {
    const setVariable = vi.fn();
    const ctx = mockCtx({
      variables: {
        Hospital_data: [
          { _id: 'h1', location: { lat: 51.5, lng: -0.1 } },
        ],
      },
      setVariable,
    });
    render(
      <MapWidget
        {...mockProps(
          {
            width: 400,
            height: 300,
            dataSources: [{ objectType: 'Hospital', geometryField: 'location' }],
            boundVariable: 'selectedHospital',
          },
          ctx,
        )}
      />,
    );
    // Click the first marker circle (not a radius circle)
    const markerGroups = document.querySelectorAll('svg g[style*="cursor: pointer"]');
    expect(markerGroups.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(markerGroups[0]!);
    expect(setVariable).toHaveBeenCalledWith('selectedHospital', expect.objectContaining({
      objectId: 'h1',
      objectType: 'Hospital',
    }));
  });

  it('displays loading state during geocode', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<MapWidget {...mockProps({ width: 400, height: 300, enableGeocode: true })} />);
    const input = screen.getByPlaceholderText('Search address...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Paris' } });
    const goButton = screen.getByText('Go');
    fireEvent.click(goButton);
    expect(screen.getByText('...')).toBeDefined();
    resolveFetch({ ok: true, json: async () => ({ query: 'Paris', results: [] }) });
    await waitFor(() => {
      expect(screen.queryByText('...')).toBeNull();
    });
  });

  it('uses default center when not specified', () => {
    render(<MapWidget {...mockProps({ width: 400, height: 300 })} />);
    // The map should render without errors using the default center
    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders with custom tile URL', () => {
    render(
      <MapWidget
        {...mockProps({
          width: 400,
          height: 300,
          tileUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
        })}
      />,
    );
    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});
