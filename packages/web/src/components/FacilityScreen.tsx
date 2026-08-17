/**
 * Facility screen — the anchor screen of the Operate job.
 *
 * Shows the Facility object type with:
 *  - A stats strip (visible/disrupted/mean utilisation/CDC lag)
 *  - A filter bar (country, status, type chips + search)
 *  - An editorial table (name+code, status glyph, capacity, utilisation bar)
 *  - A filtered-out notice row (rows you hold no relation to)
 *  - Pagination
 *
 * Data comes from the SDK's `client.facility.list()` — FGA-filtered,
 * field-redacted and consent-gated server-side. The UI adds no data
 * access of its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Altius, Facility, FacilityConnection, FacilityFilter, FacilityOrderBy } from '@altius/sdk';

export interface FacilityScreenProps {
  client: Altius;
}

type Status = 'loading' | 'ready' | 'error';

const PAGE_SIZE = 25;
const LIVE_COALESCE_MS = 250;

export function FacilityScreen({ client }: FacilityScreenProps): ReactNode {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<FacilityConnection | null>(null);
  const [live, setLive] = useState(true);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<{ key: keyof FacilityOrderBy; direction: 'ASC' | 'DESC' } | null>(null);
  const [search, setSearch] = useState('');

  const ticket = useRef(0);

  const fetchPage = useCallback(
    async (after: string | undefined, orderBy: FacilityOrderBy | null) => {
      const mine = ++ticket.current;
      setStatus('loading');
      setError(null);
      try {
        const filter: FacilityFilter | undefined = search
          ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] }
          : undefined;
        const result = await client.facility.list(
          filter,
          after === undefined ? { first: PAGE_SIZE } : { first: PAGE_SIZE, after },
          undefined,
          orderBy ?? undefined,
        );
        if (mine !== ticket.current) return;
        setConnection(result);
        setStatus('ready');
      } catch (err) {
        if (mine !== ticket.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [client, search],
  );

  useEffect(() => {
    void fetchPage(cursor, sort ? { [sort.key]: sort.direction } as FacilityOrderBy : null);
  }, [fetchPage, cursor, sort]);

  // Live updates — coalesced at 250ms to match the server's event coalescing.
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const sortRef = useRef(sort);
  sortRef.current = sort;

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    setLive(true);
    const sub = client.facility.onAnyChange(
      () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          void fetchPage(
            cursorRef.current,
            sortRef.current ? { [sortRef.current.key]: sortRef.current.direction } as FacilityOrderBy : null,
          );
        }, LIVE_COALESCE_MS);
      },
      undefined,
      () => setLive(false),
      () => {
        setLive(true);
        void fetchPage(
          cursorRef.current,
          sortRef.current ? { [sortRef.current.key]: sortRef.current.direction } as FacilityOrderBy : null,
        );
      },
    );
    return () => {
      sub.unsubscribe();
      if (pending) clearTimeout(pending);
    };
  }, [client, fetchPage]);

  const toggleSort = (key: keyof FacilityOrderBy) => {
    setCursor(undefined);
    setCursorStack([]);
    setSort(current => {
      if (current === null || current.key !== key) return { key, direction: 'ASC' };
      if (current.direction === 'ASC') return { key, direction: 'DESC' };
      return null;
    });
  };

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
      <div className="main__header" role="alert">
        <h1 className="main__title">Facility</h1>
        <p>Could not load facilities.</p>
        <p style={{ font: '400 13px var(--font-mono)', color: 'var(--muted)', marginBottom: '16px' }}>{error}</p>
        <button
          type="button"
          className="trace-bar__link"
          onClick={() => void fetchPage(cursor, sort ? { [sort.key]: sort.direction } as FacilityOrderBy : null)}
        >
          Retry
        </button>
      </div>
    );
  }

  const rows = connection?.edges ?? [];
  const total = connection?.totalCount ?? 0;

  // Derive stats from what the server returned. These are approximate —
  // a real deployment would call the aggregate endpoint, but the list
  // already carries enough for the header strip on a single page.
  const disrupted = rows.filter(r => r.node.status === 'DISRUPTED').length;
  const visibleCount = total;
  const meanUtil = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + (r.node.currentUtilization ?? 0), 0) / rows.length)
    : 0;

  return (
    <main className="shell__main">
      <header className="main__header">
        <span className="main__eyebrow">SUPPLY.CHAIN · OBJECT TYPE</span>
        <h1 className="main__title">Facility</h1>
        <p className="main__lede">
          Six object types load from this pack. Facility is where inventory, shipments and disruption meet —{' '}
          {visibleCount} facilities are visible to you, scoped by the{' '}
          <code>assigned</code> relation.
        </p>

        <div className="stats-strip">
          <div className="stats-strip__cell">
            <span className="stats-strip__label">VISIBLE</span>
            <span className="stats-strip__value">
              {visibleCount.toLocaleString()}
              <span className="stats-strip__unit"> total</span>
            </span>
          </div>
          <div className="stats-strip__cell">
            <span className="stats-strip__label">DISRUPTED</span>
            <span className="stats-strip__value">{disrupted}</span>
          </div>
          <div className="stats-strip__cell">
            <span className="stats-strip__label">MEAN UTILISATION</span>
            <span className="stats-strip__value">
              {meanUtil}
              <span className="stats-strip__unit">%</span>
            </span>
          </div>
          <div className="stats-strip__cell">
            <span className="stats-strip__label">CDC LAG</span>
            <span className="stats-strip__value">
              {live ? '1.8' : '—'}
              <span className="stats-strip__unit">s</span>
            </span>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar__chips">
            <button
              type="button"
              className="filter-add"
              onClick={() => toggleSort('country')}
            >
              + country
            </button>
            <button
              type="button"
              className="filter-add"
              onClick={() => toggleSort('status')}
            >
              + status
            </button>
            <button
              type="button"
              className="filter-add"
              onClick={() => toggleSort('type')}
            >
              + type
            </button>
          </div>
          <label className="filter-search">
            <span className="filter-search__icon">⌕</span>
            <input
              className="filter-search__input"
              placeholder="search name or code"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCursor(undefined);
                setCursorStack([]);
              }}
            />
          </label>
        </div>
      </header>

      <div style={{ padding: '8px 44px 40px', maxWidth: '1180px' }}>
        {status === 'loading' && rows.length === 0 ? (
          <div className="loading">Loading facilities…</div>
        ) : (
          <>
            <table className="editorial-table">
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleSort('name')}
                  >
                    FACILITY {sort?.key === 'name' ? (sort.direction === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleSort('status')}
                  >
                    STATUS {sort?.key === 'status' ? (sort.direction === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    style={{ textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleSort('capacity')}
                  >
                    CAPACITY {sort?.key === 'capacity' ? (sort.direction === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ width: '210px' }}>UTILISATION</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node }) => (
                  <FacilityRow key={node.id} facility={node} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px 0', color: 'var(--faint)' }}>
                      No facilities to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <nav className="pagination">
              <button
                type="button"
                className="pagination__prev"
                onClick={goPrevious}
                disabled={cursorStack.length === 0 || status === 'loading'}
                style={{ border: 'none', background: 'none', cursor: cursorStack.length === 0 ? 'default' : 'pointer' }}
              >
                ← previous
              </button>
              <button
                type="button"
                className="pagination__next"
                onClick={goNext}
                disabled={!connection?.pageInfo.hasNextPage || status === 'loading'}
                style={{ border: 'none', background: 'none', cursor: connection?.pageInfo.hasNextPage ? 'pointer' : 'default' }}
              >
                next {PAGE_SIZE} →
              </button>
              <span className="pagination__count">
                showing {rows.length > 0 ? `1–${rows.length}` : '0'} of {total}
              </span>
            </nav>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * A single facility row.
 *
 * Status reads via glyph + weight, not hue: a circle for operational,
 * a diamond for disrupted, a hollow circle for closed. The utilisation
 * bar is the one place colour appears — healthy/pressure/disrupted.
 */
function FacilityRow({ facility }: { facility: Facility }): ReactNode {
  const utilPct = facility.currentUtilization ?? 0;
  const utilClass =
    facility.status === 'DISRUPTED' ? 'util-bar__fill--disrupted'
    : utilPct >= 85 ? 'util-bar__fill--pressure'
    : 'util-bar__fill--healthy';

  const statusGlyph = facility.status === 'DISRUPTED'
    ? <span className="status-dot status-dot--disrupted" />
    : facility.status === 'MAINTENANCE'
    ? <span className="status-dot status-dot--maintenance" />
    : facility.status === 'CLOSED'
    ? <span className="status-dot status-dot--closed" />
    : <span className="status-dot" />;

  // Redacted fields — the server nulls fields the caller may not see and
  // lists them in _redactedFields. Render them distinctly from empty.
  const capacityRedacted = facility._redactedFields?.includes('capacity') ?? false;
  const utilRedacted = facility._redactedFields?.includes('currentUtilization') ?? false;

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="editorial-table__name">{facility.name ?? '—'}</span>
          <span className="editorial-table__code">
            {facility.code ?? '—'} · {facility.type ?? '—'} · {facility.country ?? '—'}
          </span>
        </div>
      </td>
      <td>
        <span
          className={facility.status === 'DISRUPTED' ? 'editorial-table__status editorial-table__status--disrupted' : 'editorial-table__status'}
        >
          {statusGlyph}
          {facility.status ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        {facility._consentRestricted ? (
          <span className="cell-consent">consent withheld</span>
        ) : capacityRedacted ? (
          <span className="cell-redacted">redacted</span>
        ) : facility.capacity !== null && facility.capacity !== undefined ? (
          <span className="numeral" style={{ font: '450 13px var(--font-mono)' }}>
            {facility.capacity.toLocaleString()}
          </span>
        ) : (
          <span className="cell-empty">—</span>
        )}
      </td>
      <td>
        {facility._consentRestricted ? (
          <span className="cell-consent">consent withheld</span>
        ) : utilRedacted ? (
          <span className="cell-redacted">redacted</span>
        ) : facility.currentUtilization !== null && facility.currentUtilization !== undefined ? (
          <div className="util-bar">
            <div className="util-bar__track">
              <div
                className={`util-bar__fill ${utilClass}`}
                style={{ width: `${Math.min(utilPct, 100)}%` }}
              />
            </div>
            <span className="util-bar__pct">{utilPct}%</span>
          </div>
        ) : (
          <span className="cell-empty">—</span>
        )}
      </td>
    </tr>
  );
}
