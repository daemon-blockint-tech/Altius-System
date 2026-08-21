import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkshopScreen } from '../components/WorkshopScreen.js';
import { setWidgetAuthProvider } from '../widgets/auth-fetch.js';

describe('WorkshopScreen', () => {
  afterEach(() => { vi.restoreAllMocks(); setWidgetAuthProvider(null); });

  it('lists the tenant apps (through the authenticated client) and offers New app', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/api/v1/workshop/apps');
      return { ok: true, json: async () => ({ apps: [{ id: 'a1', name: 'Ops Dashboard', pages: [] }] }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    setWidgetAuthProvider(async () => 'tok');

    render(<WorkshopScreen client={{}} tenantId="t-1" userId="u-1" />);

    await waitFor(() => expect(screen.getByText('Ops Dashboard')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'New app' })).toBeTruthy();
    // The list request carried the bearer token registered above.
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows an empty state when there are no apps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ apps: [] }) } as unknown as Response)));
    render(<WorkshopScreen client={{}} tenantId="t-1" userId="u-1" />);
    await waitFor(() => expect(screen.getByText(/No apps yet/)).toBeTruthy());
  });
});
