/**
 * Tests for the new Phase 2 screens.
 *
 * Each screen is tested with a mocked SDK client to verify it renders
 * without crashing and shows the right header/caption. The ObjectTable
 * component is already tested separately; these tests verify the screen
 * wiring, not the table internals.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipmentsScreen } from '../ShipmentsScreen.js';
import { PurchaseOrdersScreen } from '../PurchaseOrdersScreen.js';
import { InventoryScreen } from '../InventoryScreen.js';
import { ActionConsoleScreen } from '../ActionConsoleScreen.js';

// Stub WebSocket — the SDK opens one on subscribe
vi.stubGlobal('WebSocket', class {
  close(): void {}
  addEventListener(): void {}
  send(): void {}
  readyState = 0;
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
});

function mockClient() {
  return {
    shipment: {
      list: vi.fn().mockResolvedValue({ edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: 0 }),
      onAnyChange: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    },
    purchaseOrder: {
      list: vi.fn().mockResolvedValue({ edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: 0 }),
      onAnyChange: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    },
    inventoryRecord: {
      list: vi.fn().mockResolvedValue({ edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: 0 }),
      onAnyChange: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    },
  };
}

describe('ShipmentsScreen', () => {
  it('renders the header and table caption', () => {
    render(<ShipmentsScreen client={mockClient() as unknown as never} />);
    expect(screen.getByRole('heading', { name: 'Shipments' })).toBeTruthy();
    expect(screen.getByRole('caption')).toBeTruthy();
    expect(screen.getByText('Tracking #')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('calls the SDK shipment.list on mount', async () => {
    const client = mockClient();
    render(<ShipmentsScreen client={client as unknown as never} />);
    expect(client.shipment.list).toHaveBeenCalled();
  });
});

describe('PurchaseOrdersScreen', () => {
  it('renders the header and table caption', () => {
    render(<PurchaseOrdersScreen client={mockClient() as unknown as never} />);
    expect(screen.getByRole('heading', { name: 'Purchase orders' })).toBeTruthy();
    expect(screen.getByText('Order #')).toBeTruthy();
    expect(screen.getByText('Unit cost')).toBeTruthy();
  });

  it('calls the SDK purchaseOrder.list on mount', async () => {
    const client = mockClient();
    render(<PurchaseOrdersScreen client={client as unknown as never} />);
    expect(client.purchaseOrder.list).toHaveBeenCalled();
  });
});

describe('InventoryScreen', () => {
  it('renders the header and table caption', () => {
    render(<InventoryScreen client={mockClient() as unknown as never} />);
    expect(screen.getByText('Inventory')).toBeTruthy();
    expect(screen.getByText('On hand')).toBeTruthy();
    expect(screen.getByText('Stock level')).toBeTruthy();
  });

  it('calls the SDK inventoryRecord.list on mount', async () => {
    const client = mockClient();
    render(<InventoryScreen client={client as unknown as never} />);
    expect(client.inventoryRecord.list).toHaveBeenCalled();
  });
});

describe('ActionConsoleScreen', () => {
  it('renders the header', () => {
    render(
      <ActionConsoleScreen
        packLabel="supply-chain"
        loadActions={vi.fn().mockResolvedValue([])}
        submit={vi.fn()}
      />,
    );
    expect(screen.getByText('Action console')).toBeTruthy();
    expect(screen.getByText('SUPPLY.CHAIN · GOVERNED ACTIONS')).toBeTruthy();
  });
});
