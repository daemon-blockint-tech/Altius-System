/**
 * ObjectTable behaviour.
 *
 * The redaction case is the one that matters most: the server nulls fields the
 * caller may not see and names them in `_redactedFields`. If the table renders
 * that the same as a genuinely empty value, "not allowed to see" reads as "not
 * recorded" — which in a clinical list invites someone to fill the gap in.
 *
 * Paging is exercised through the real cursor contract (`{first, after}`),
 * because "previous" is a client-side cursor stack — the API has no `before`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ObjectTable } from '../ObjectTable.js';
import type { ConnectionLike } from '../ObjectTable.js';

interface Patient {
  id: string;
  name: string | null;
  status: string | null;
  _redactedFields?: string[] | null;
}

function connection(nodes: Patient[], opts: { hasNextPage?: boolean; endCursor?: string } = {}): ConnectionLike<Patient> {
  return {
    edges: nodes.map((node, i) => ({ node, cursor: `c${i}` })),
    pageInfo: {
      hasNextPage: opts.hasNextPage ?? false,
      hasPreviousPage: false,
      startCursor: nodes.length ? 'c0' : null,
      endCursor: opts.endCursor ?? (nodes.length ? `c${nodes.length - 1}` : null),
    },
    totalCount: nodes.length,
  };
}

const COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status' },
];

describe('ObjectTable', () => {
  it('renders rows and the total count', async () => {
    const load = vi.fn().mockResolvedValue(
      connection([
        { id: 'p-1', name: 'Alice', status: 'ACTIVE' },
        { id: 'p-2', name: 'Bob', status: 'DISCHARGED' },
      ]),
    );

    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByText('DISCHARGED')).toBeDefined();
    expect(screen.getByText(/2 total/)).toBeDefined();
  });

  it('distinguishes a redacted value from an absent one', async () => {
    const load = vi.fn().mockResolvedValue(
      connection([
        // `name` is hidden by field permissions; `status` was simply never set.
        { id: 'p-1', name: null, status: null, _redactedFields: ['name'] },
      ]),
    );

    const { container } = render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);
    await waitFor(() => expect(container.querySelector('[data-redacted]')).not.toBeNull());

    expect(container.querySelector('[data-redacted]')?.textContent).toBe('redacted');
    // The un-set field must NOT be labelled redacted — that would overstate the
    // access control and hide a genuine data gap.
    const empty = container.querySelector('[data-empty]');
    expect(empty?.textContent).toBe('—');
    expect(container.querySelectorAll('[data-redacted]').length).toBe(1);
  });

  it('pages forward with the end cursor and back without one', async () => {
    const page1 = connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }], {
      hasNextPage: true,
      endCursor: 'cursor-1',
    });
    const page2 = connection([{ id: 'p-2', name: 'Bob', status: 'ACTIVE' }]);
    const load = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2).mockResolvedValueOnce(page1);

    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} pageSize={1} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    // First page must not send a cursor at all.
    expect(load).toHaveBeenNthCalledWith(1, { first: 1 });

    screen.getByRole('button', { name: 'Next' }).click();
    await waitFor(() => expect(screen.getByText('Bob')).toBeDefined());
    expect(load).toHaveBeenNthCalledWith(2, { first: 1, after: 'cursor-1' });

    screen.getByRole('button', { name: 'Previous' }).click();
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    // Back to the first page means no cursor again, not `after: undefined`.
    expect(load).toHaveBeenNthCalledWith(3, { first: 1 });
  });

  it('disables Next on the last page and Previous on the first', async () => {
    const load = vi.fn().mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
  });

  it('surfaces a load failure with a retry rather than an empty table', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('GraphQL errors: Access denied'))
      .mockResolvedValueOnce(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));

    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    // An empty table would read as "no patients", which is a different and
    // dangerous statement from "the query failed".
    expect(screen.getByText(/Access denied/)).toBeDefined();

    screen.getByRole('button', { name: 'Retry' }).click();
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
  });

  it('ignores a slow page that resolves after a newer one', async () => {
    let resolveFirst: ((c: ConnectionLike<Patient>) => void) | undefined;
    const slow = new Promise<ConnectionLike<Patient>>(res => {
      resolveFirst = res;
    });
    const slowLoad = vi.fn().mockReturnValue(slow);
    const fastLoad = vi.fn().mockResolvedValue(connection([{ id: 'p-2', name: 'Bob', status: 'ACTIVE' }]));

    const { rerender } = render(<ObjectTable caption="Patients" columns={COLUMNS} load={slowLoad} />);
    // A NEW load identity is what re-fires the effect — rerendering with the
    // same function would not start a second request at all.
    rerender(<ObjectTable caption="Patients" columns={COLUMNS} load={fastLoad} />);
    await waitFor(() => expect(screen.getByText('Bob')).toBeDefined());

    resolveFirst?.(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    await new Promise(r => setTimeout(r, 10));

    // The stale response must not replace the newer page.
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob')).toBeDefined();
  });
});
