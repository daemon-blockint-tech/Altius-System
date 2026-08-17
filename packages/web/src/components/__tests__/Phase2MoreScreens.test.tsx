/**
 * Tests for the ObjectDetailScreen and remaining Phase 2 screens.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ObjectDetailScreen } from '../ObjectDetailScreen.js';
import { ConsentPermissionsScreen } from '../ConsentPermissionsScreen.js';
import { GraphExplorerScreen } from '../GraphExplorerScreen.js';
import { McpActivityScreen } from '../McpActivityScreen.js';
import { PackManagerScreen } from '../PackManagerScreen.js';
import { SyncHealthScreen } from '../SyncHealthScreen.js';

// Stub WebSocket
vi.stubGlobal('WebSocket', class {
  close(): void {}
  addEventListener(): void {}
  send(): void {}
  readyState = 0;
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
});

// Stub fetch
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: {} }),
});
vi.stubGlobal('fetch', mockFetch);

describe('ObjectDetailScreen', () => {
  it('renders the object type and id in the header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _id: 'pat-1', name: 'Jane', status: 'ACTIVE', _version: 3 }),
    });
    render(
      <ObjectDetailScreen
        objectType="Patient"
        objectId="pat-1"
        getToken={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('pat-1')).toBeTruthy();
    expect(screen.getByText('PATIENT')).toBeTruthy();
  });

  it('shows Properties, History tabs', () => {
    render(
      <ObjectDetailScreen
        objectType="Patient"
        objectId="pat-1"
        getToken={null}
        onClose={vi.fn()}
        getObject={async () => ({ _id: 'pat-1', name: 'Jane' })}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Properties' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'History' })).toBeTruthy();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ObjectDetailScreen
        objectType="Patient"
        objectId="pat-1"
        getToken={null}
        onClose={onClose}
        getObject={async () => ({ _id: 'pat-1', name: 'Jane' })}
      />,
    );
    const closeBtn = screen.getByLabelText('Close');
    closeBtn.click();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ConsentPermissionsScreen', () => {
  it('renders the header', () => {
    render(<ConsentPermissionsScreen endpoint="/graphql" getToken={null} />);
    expect(screen.getByText('Consent & permissions')).toBeTruthy();
  });
});

describe('GraphExplorerScreen', () => {
  it('renders the header and traverse inputs', () => {
    render(<GraphExplorerScreen endpoint="/graphql" getToken={null} />);
    expect(screen.getByText('Graph explorer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Traverse' })).toBeTruthy();
  });
});

describe('McpActivityScreen', () => {
  it('renders the header', () => {
    render(<McpActivityScreen endpoint="/graphql" getToken={null} />);
    expect(screen.getByText('MCP activity')).toBeTruthy();
  });
});

describe('PackManagerScreen', () => {
  it('renders the header', () => {
    render(<PackManagerScreen endpoint="/graphql" getToken={null} />);
    expect(screen.getByText('Domain pack manager')).toBeTruthy();
  });
});

describe('SyncHealthScreen', () => {
  it('renders the header', () => {
    render(<SyncHealthScreen getToken={null} />);
    expect(screen.getByText('Sync & connector health')).toBeTruthy();
  });
});
