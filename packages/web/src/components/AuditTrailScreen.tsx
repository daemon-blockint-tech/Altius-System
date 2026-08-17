/**
 * Audit trail screen — governed audit log viewer.
 *
 * Queries the GraphQL `auditRecords` endpoint directly (the SDK does not
 * expose audit queries). Pagination is offset-based, matching the API's
 * `limit`/`offset` parameters. The filter bar lets the user narrow by
 * actor, object type, operation type, and time range.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Subset of AuditRecord from the generated GraphQL schema. */
interface AuditRecord {
  id: string;
  timestamp: string;
  traceId: string;
  actor: {
    type: string;
    id: string;
    roles: string[];
    ip: string | null;
  };
  operation: {
    type: string;
    objectType: string | null;
    objectId: string | null;
    actionType: string | null;
    actionId: string | null;
    functionName: string | null;
  };
  detail: {
    denialReason: string | null;
    consentDecision: string | null;
  } | null;
}

interface AuditPage {
  records: AuditRecord[];
  totalCount: number;
  hasMore: boolean;
}

export interface AuditTrailScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

const PAGE_SIZE = 25;

const AUDIT_QUERY = `
  query($filter: AuditFilter, $limit: Int, $offset: Int) {
    auditRecords(filter: $filter, limit: $limit, offset: $offset) {
      records {
        id
        timestamp
        traceId
        actor { type id roles ip }
        operation { type objectType objectId actionType actionId functionName }
        detail { denialReason consentDecision }
      }
      totalCount
      hasMore
    }
  }
`;

export function AuditTrailScreen({ endpoint, getToken }: AuditTrailScreenProps): ReactNode {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filterObjectType, setFilterObjectType] = useState('');
  const [filterOperation, setFilterOperation] = useState('');
  const ticket = useRef(0);

  const fetchPage = useCallback(
    async (pageOffset: number) => {
      const mine = ++ticket.current;
      setStatus('loading');
      setError(null);
      try {
        const token = getToken ? await getToken() : '';
        const filter: Record<string, string> = {};
        if (filterObjectType) filter.objectType = filterObjectType;
        if (filterOperation) filter.operationType = filterOperation;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: AUDIT_QUERY,
            variables: { filter, limit: PAGE_SIZE, offset: pageOffset },
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as { data?: { auditRecords?: AuditPage }; errors?: unknown[] };
        if (json.errors) throw new Error(JSON.stringify(json.errors));
        const page = json.data?.auditRecords;
        if (!page) throw new Error('No audit data returned');
        if (mine !== ticket.current) return;
        setRecords(page.records);
        setTotalCount(page.totalCount);
        setHasMore(page.hasMore);
        setStatus('ready');
      } catch (err) {
        if (mine !== ticket.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [endpoint, getToken, filterObjectType, filterOperation],
  );

  useEffect(() => {
    void fetchPage(offset);
  }, [fetchPage, offset]);

  const applyFilter = () => {
    setOffset(0);
    void fetchPage(0);
  };

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">GOVERNANCE · AUDIT</span>
          <h1 className="ed-main__title">Audit trail</h1>
        </header>
        <div role="alert">
          <p>Could not load audit records.</p>
          <p>{error}</p>
          <button type="button" onClick={() => void fetchPage(offset)}>Retry</button>
        </div>
      </main>
    );
  }

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">GOVERNANCE · AUDIT</span>
        <h1 className="ed-main__title">Audit trail</h1>
        <p className="ed-main__lede">
          Every governed write and denial is recorded here — who, what, when, and why.
          Denials are logged too, not just successes.
        </p>
      </header>

      <div className="ed-filter-bar" style={{ padding: '0 44px 16px', display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <label>
          Object type
          <input
            type="text"
            value={filterObjectType}
            onChange={(e) => setFilterObjectType(e.target.value)}
            placeholder="e.g. Patient, Shipment"
          />
        </label>
        <label>
          Operation
          <input
            type="text"
            value={filterOperation}
            onChange={(e) => setFilterOperation(e.target.value)}
            placeholder="e.g. ACTION, READ"
          />
        </label>
        <button type="button" onClick={applyFilter}>Apply filter</button>
      </div>

      <div className="ed-table-wrap">
        <table>
          <caption>Audit records — {totalCount} total</caption>
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Actor</th>
              <th scope="col">Operation</th>
              <th scope="col">Object</th>
              <th scope="col">Action / Function</th>
              <th scope="col">Trace ID</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.id}>
                <td>{formatTime(rec.timestamp)}</td>
                <td>
                  <span title={rec.actor.roles.join(', ')}>
                    {rec.actor.id}
                  </span>
                  {rec.actor.ip && (
                    <span style={{ display: 'block', fontSize: '0.8em', opacity: 0.6 }}>
                      {rec.actor.ip}
                    </span>
                  )}
                </td>
                <td>
                  <span className="ed-status-badge" data-tone={rec.operation.type === 'DENY' ? 'lost' : 'default'}>
                    {rec.operation.type}
                  </span>
                </td>
                <td>
                  {rec.operation.objectType ? (
                    <>
                      {rec.operation.objectType}
                      {rec.operation.objectId && (
                        <span style={{ display: 'block', fontSize: '0.8em', opacity: 0.6 }}>
                          {rec.operation.objectId}
                        </span>
                      )}
                    </>
                  ) : (
                    <span data-empty="true">—</span>
                  )}
                </td>
                <td>
                  {rec.operation.actionType ?? rec.operation.functionName ?? (
                    <span data-empty="true">—</span>
                  )}
                </td>
                <td>
                  <code style={{ fontSize: '0.8em' }}>{rec.traceId.slice(0, 12)}…</code>
                </td>
                <td>
                  {rec.detail?.denialReason && (
                    <span data-redacted="true" title="Denial reason">
                      Denied: {rec.detail.denialReason}
                    </span>
                  )}
                  {rec.detail?.consentDecision && (
                    <span title="Consent decision">
                      Consent: {rec.detail.consentDecision}
                    </span>
                  )}
                  {!rec.detail?.denialReason && !rec.detail?.consentDecision && (
                    <span data-empty="true">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p aria-live="polite">
        {status === 'loading' ? 'Loading…' : records.length === 0 ? 'No audit records to show.' : ''}
      </p>

      <nav aria-label="Audit trail pagination" style={{ padding: '0 44px 40px' }}>
        <button
          type="button"
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0 || status === 'loading'}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={!hasMore || status === 'loading'}
        >
          Next
        </button>
      </nav>
    </main>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
