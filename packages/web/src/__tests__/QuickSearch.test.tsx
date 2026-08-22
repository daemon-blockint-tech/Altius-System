/**
 * Keyboard-first is the point of the pattern: if arrow keys and enter do not
 * work, it is a slower way to click something.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickSearch } from '../components/QuickSearch.js';
import type { QuickSearchItem } from '../components/QuickSearch.js';

const ITEMS: QuickSearchItem[] = [
  { kind: 'screen', id: 'objects', label: 'Objects', context: 'Operate' },
  { kind: 'screen', id: 'audit-trail', label: 'Audit trail', context: 'Investigate' },
  { kind: 'screen', id: 'workshop', label: 'App builder', context: 'Model' },
  { kind: 'type', id: 'Shipment', label: 'Shipment', context: 'Object browser' },
  { kind: 'type', id: 'Supplier', label: 'Supplier', context: 'Object browser' },
];

function open(onPick = vi.fn(), onClose = vi.fn()) {
  render(<QuickSearch open items={ITEMS} onPick={onPick} onClose={onClose} />);
  return { onPick, onClose, input: screen.getByLabelText('Search screens and object types') };
}

describe('QuickSearch', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<QuickSearch open={false} items={ITEMS} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('matches on substring across screens and types', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'ship' } });

    expect(screen.getByText('Shipment')).toBeTruthy();
    expect(screen.queryByText('Audit trail')).toBeNull();
  });

  it('ranks a label match above one that only matched on context', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'a' } });

    const labels = screen.getAllByRole('option').map(o => o.textContent);
    // "App builder" and "Audit trail" start with the query. "Objects" matches
    // only through its job, "Operate", so it belongs last — otherwise typing a
    // screen's name can rank something you did not name above it.
    expect(labels.slice(0, 2).join(' ')).toContain('App builder');
    expect(labels.slice(0, 2).join(' ')).toContain('Audit trail');
    expect(labels[labels.length - 1]).toContain('Objects');
  });

  it('narrows to one kind with a filter chip', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Object types' }));

    expect(screen.getByText('Shipment')).toBeTruthy();
    expect(screen.queryByText('Audit trail')).toBeNull();
  });

  it('moves with the arrow keys and opens with enter', () => {
    const { onPick, input } = open();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit-trail' }));
  });

  it('does not walk past either end of the list', () => {
    const { onPick, input } = open();
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'Supplier' }));
  });

  it('closes on escape', () => {
    const { onClose, input } = open();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when nothing matches, naming what was typed', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches “zzzz”/)).toBeTruthy();
  });
});
