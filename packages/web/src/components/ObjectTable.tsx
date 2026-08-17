/**
 * Object table — the read surface every operational view is built on.
 *
 * Generic over the SDK's Connection shape rather than over one object type, so
 * a Patient list and a Bed list are the same component with different columns.
 * Paging is cursor-based because that is what the API exposes; `list()` accepts
 * only `{first, after}`, so "previous" is served from a client-side cursor
 * stack rather than a `before` argument that does not exist.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Fields every read surface stamps on a row (see objectToGraphQL). */
export interface RowMetadata {
  _redactedFields?: string[] | null;
  _consentRestricted?: boolean | null;
}

export interface Column<T> {
  /** Property name. Matched against `_redactedFields`, so it must be the
   *  schema field name, not a display alias. */
  key: string;
  header: string;
  /** Defaults to reading `row[key]` and stringifying it. */
  render?: (row: T) => ReactNode;
}

/** The subset of the SDK's generated `FooConnection` this component needs. */
export interface ConnectionLike<T> {
  edges: Array<{ node: T; cursor: string }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

export interface ObjectTableProps<T> {
  /** Table caption. Required — a data table without one is unusable by screen reader. */
  caption: string;
  columns: Column<T>[];
  load: (pagination: { first: number; after?: string }) => Promise<ConnectionLike<T>>;
  pageSize?: number;
  /** Stable row identity. Defaults to `row.id`. */
  rowKey?: (row: T) => string;
  /**
   * Live updates. Given a callback to invoke on each change event, returns
   * something to unsubscribe with — the shape the SDK's `onAnyChange` returns.
   *
   * The event payload is deliberately not passed through. A change is a signal
   * to re-read, not data to merge: which rows belong on this page is decided by
   * server-side filtering, authorization, redaction and cursor position, so
   * patching a row in place would drift from what the server would actually
   * return — including showing a row the caller may no longer see.
   */
  subscribe?: (
    onChange: () => void,
    onLost: () => void,
    onResumed: () => void,
  ) => { unsubscribe(): void };
}

type Status = 'loading' | 'ready' | 'error';

const DEFAULT_PAGE_SIZE = 25;

/**
 * How long to gather change events before re-reading.
 *
 * Long enough that a bulk write collapses into one refetch, short enough that a
 * single edit still feels immediate to the person who made it.
 */
const LIVE_COALESCE_MS = 250;

export function ObjectTable<T extends RowMetadata>({
  caption,
  columns,
  load,
  pageSize = DEFAULT_PAGE_SIZE,
  rowKey,
  subscribe,
}: ObjectTableProps<T>): ReactNode {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionLike<T> | null>(null);
  /** False once a live stream has dropped; there is no reconnect. */
  const [live, setLive] = useState(true);

  // Cursors of the pages BEFORE the current one. Pushed on next, popped on
  // previous. `undefined` at the bottom is the first page.
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // A slow first page must not overwrite a faster second one. Every load takes
  // a ticket and only the newest ticket is allowed to commit.
  const ticket = useRef(0);

  const fetchPage = useCallback(
    async (after: string | undefined) => {
      const mine = ++ticket.current;
      setStatus('loading');
      setError(null);
      try {
        const result = await load(after === undefined ? { first: pageSize } : { first: pageSize, after });
        if (mine !== ticket.current) return;
        setConnection(result);
        setStatus('ready');
      } catch (err) {
        if (mine !== ticket.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [load, pageSize],
  );

  useEffect(() => {
    void fetchPage(cursor);
  }, [fetchPage, cursor]);

  // Read by the live-update effect so that changing page does not tear down and
  // re-establish the subscription — the socket should outlive paging.
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    if (!subscribe) return;

    let pending: ReturnType<typeof setTimeout> | null = null;
    setLive(true);
    const subscription = subscribe(() => {
      // Coalesce: a bulk write emits one event per row, and refetching per
      // event would put the table into a refresh loop under load.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void fetchPage(cursorRef.current);
      }, LIVE_COALESCE_MS);
    }, () => {
      // Dropped. Say so rather than let a stale table look current.
      setLive(false);
    }, () => {
      // Re-established. Re-read rather than just clearing the notice: the
      // events that happened while the socket was down are gone, so the page
      // on screen may already be wrong.
      setLive(true);
      void fetchPage(cursorRef.current);
    });

    return () => {
      subscription.unsubscribe();
      if (pending) clearTimeout(pending);
    };
  }, [subscribe, fetchPage]);

  const goNext = () => {
    const end = connection?.pageInfo.endCursor;
    if (!end) return;
    setCursorStack(stack => [...stack, cursor]);
    setCursor(end);
  };

  const goPrevious = () => {
    setCursorStack(stack => {
      if (stack.length === 0) return stack;
      setCursor(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  };

  if (status === 'error') {
    return (
      <div role="alert">
        <p>Could not load {caption}.</p>
        <p>{error}</p>
        <button type="button" onClick={() => void fetchPage(cursor)}>
          Retry
        </button>
      </div>
    );
  }

  const rows = connection?.edges ?? [];
  const identity = rowKey ?? ((row: T) => String((row as Record<string, unknown>)['id'] ?? ''));

  return (
    <div>
      <table>
        <caption>
          {caption}
          {connection ? ` — ${connection.totalCount} total` : ''}
        </caption>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node }) => (
            <tr key={identity(node)}>
              {columns.map(col => (
                <td key={col.key}>{renderCell(node, col)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Announced politely so a screen reader hears the page change without
          losing the user's place in the table. */}
      {subscribe && !live ? (
        <p role="status" data-live-lost="true">
          Live updates disconnected — this list may be out of date. Reload to resume.
        </p>
      ) : null}

      <p aria-live="polite">
        {status === 'loading' ? 'Loading…' : rows.length === 0 ? `No ${caption} to show.` : ''}
      </p>

      <nav aria-label={`${caption} pagination`}>
        <button type="button" onClick={goPrevious} disabled={cursorStack.length === 0 || status === 'loading'}>
          Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!connection?.pageInfo.hasNextPage || status === 'loading'}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

/**
 * A redacted value and an absent value must not look the same.
 *
 * The server nulls fields the caller may not see and lists them in
 * `_redactedFields`. Rendering both as blank would make "you are not allowed to
 * see this" indistinguishable from "nobody recorded this" — in a clinical list
 * that is a safety problem, not a cosmetic one, because the second reading
 * invites someone to fill the gap in.
 */
function renderCell<T extends RowMetadata>(row: T, col: Column<T>): ReactNode {
  // Checked before redaction and before the null check, because the server
  // nulls EVERY non-primary field when consent is withheld
  // (resolver-generator.ts:384-387, :742-747). Falling through would draw the
  // whole row as "not recorded" — a claim about the data rather than about
  // permission, and the one that invites someone to fill the gap in.
  if (row._consentRestricted) {
    return (
      <span data-consent-restricted="true" title="Withheld: the subject has not consented to this use">
        consent withheld
      </span>
    );
  }

  const redacted = row._redactedFields?.includes(col.key) ?? false;
  if (redacted) {
    return (
      <span data-redacted="true" title="Hidden by field-level permissions">
        redacted
      </span>
    );
  }

  if (col.render) return col.render(row);

  const value = (row as Record<string, unknown>)[col.key];
  if (value === null || value === undefined) {
    return <span data-empty="true">—</span>;
  }
  return String(value);
}
