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
  _consentRestricted?: boolean | null;
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

  it('distinguishes a consent-restricted row from one with no data', async () => {
    // When consent is denied the server sets _consentRestricted and nulls every
    // non-primary field (resolver-generator.ts:384-387, :742-747). Drawing those
    // as "—" reads as "this patient has no recorded name or status", which is a
    // different and dangerous claim from "you are not permitted to see this".
    const load = vi.fn().mockResolvedValue(
      connection([{ id: 'p-1', name: null, status: null, _consentRestricted: true }]),
    );

    const { container } = render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);
    await waitFor(() => expect(container.querySelector('[data-consent-restricted]')).not.toBeNull());

    expect(container.querySelector('[data-consent-restricted]')?.textContent).toBe('consent withheld');
    // Not the "not recorded" marker, and not the redaction marker either — the
    // three are different reasons a value is absent.
    expect(container.querySelector('[data-empty]')).toBeNull();
    expect(container.querySelector('[data-redacted]')).toBeNull();
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

  it('re-reads the current page when a change event arrives', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]))
      .mockResolvedValueOnce(connection([{ id: 'p-1', name: 'Alice', status: 'DISCHARGED' }]));
    let emit = () => {};
    const subscribe = vi.fn((onChange: () => void) => {
      emit = onChange;
      return { unsubscribe: vi.fn() };
    });

    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} subscribe={subscribe} />);
    await waitFor(() => expect(screen.getByText('ACTIVE')).toBeDefined());

    emit();
    // Re-reading rather than patching is the point: what belongs on this page is
    // the server's decision, not something the client can derive from an event.
    await waitFor(() => expect(screen.getByText('DISCHARGED')).toBeDefined());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces a burst of events into one re-read', async () => {
    const load = vi.fn().mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    let emit = () => {};
    const subscribe = vi.fn((onChange: () => void) => {
      emit = onChange;
      return { unsubscribe: vi.fn() };
    });

    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} subscribe={subscribe} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(load).toHaveBeenCalledTimes(1);

    // A bulk write emits one event per row; refetching per event would put the
    // table into a refresh loop.
    for (let i = 0; i < 25; i++) emit();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 60));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says so when the live stream drops, rather than looking current', async () => {
    // The SDK clears subscriptions on socket close and does not reconnect, so a
    // table that stays silent here is stale while appearing live — worse than
    // an error, because there is no signal at all.
    const load = vi.fn().mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    let lose = () => {};
    const subscribe = vi.fn((_onChange: () => void, onLost: () => void) => {
      lose = onLost;
      return { unsubscribe: vi.fn() };
    });

    const { container } = render(
      <ObjectTable caption="Patients" columns={COLUMNS} load={load} subscribe={subscribe} />,
    );
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(container.querySelector('[data-live-lost]')).toBeNull();

    lose();
    await waitFor(() => expect(container.querySelector('[data-live-lost]')).not.toBeNull());
    expect(screen.getByText(/may be out of date/)).toBeDefined();
  });

  it('re-reads when the stream resumes, not just clearing the notice', async () => {
    // Events during the outage are gone, so the page on screen may already be
    // wrong; clearing the warning without re-reading hides that.
    const load = vi
      .fn()
      .mockResolvedValueOnce(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]))
      .mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'DISCHARGED' }]));
    let lose = () => {};
    let resume = () => {};
    const subscribe = vi.fn((_c: () => void, onLost: () => void, onResumed: () => void) => {
      lose = onLost;
      resume = onResumed;
      return { unsubscribe: vi.fn() };
    });

    const { container } = render(
      <ObjectTable caption="Patients" columns={COLUMNS} load={load} subscribe={subscribe} />,
    );
    await waitFor(() => expect(screen.getByText('ACTIVE')).toBeDefined());

    lose();
    await waitFor(() => expect(container.querySelector('[data-live-lost]')).not.toBeNull());

    resume();
    await waitFor(() => expect(screen.getByText('DISCHARGED')).toBeDefined());
    expect(container.querySelector('[data-live-lost]')).toBeNull();
  });

  it('unsubscribes on unmount so a closed table stops holding the stream', async () => {
    const load = vi.fn().mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => ({ unsubscribe }));

    const { unmount } = render(
      <ObjectTable caption="Patients" columns={COLUMNS} load={load} subscribe={subscribe} />,
    );
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('does not subscribe at all when no stream is supplied', async () => {
    const load = vi.fn().mockResolvedValue(connection([{ id: 'p-1', name: 'Alice', status: 'ACTIVE' }]));
    render(<ObjectTable caption="Patients" columns={COLUMNS} load={load} />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    await new Promise(r => setTimeout(r, 60));
    expect(load).toHaveBeenCalledTimes(1);
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
