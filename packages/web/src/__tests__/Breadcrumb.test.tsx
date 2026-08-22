import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from '../components/Breadcrumb.js';

describe('Breadcrumb', () => {
  it('renders the path and navigates from an earlier step', () => {
    const goToScreen = vi.fn();
    render(<Breadcrumb items={[
      { label: 'supply.chain' },
      { label: 'Operate', onClick: goToScreen },
      { label: 'Objects', onClick: goToScreen },
      { label: 'Shipment SHP-001' },
    ]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Objects' }));
    expect(goToScreen).toHaveBeenCalledTimes(1);
  });

  it('renders the last crumb as text, not a link to where you already are', () => {
    render(<Breadcrumb items={[
      { label: 'Operate', onClick: () => {} },
      // A caller may hand the current location an onClick; it is still not a
      // control, because clicking it would do nothing.
      { label: 'Objects', onClick: () => {} },
    ]} />);

    expect(screen.queryByRole('button', { name: 'Objects' })).toBeNull();
    expect(screen.getByText('Objects').getAttribute('aria-current')).toBe('page');
  });

  it('renders nothing when there is no path', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
