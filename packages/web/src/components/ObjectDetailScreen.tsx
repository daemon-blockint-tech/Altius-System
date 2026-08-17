/**
 * Object detail view — full object properties, links, and version history.
 *
 * Triggered by clicking a row in any ObjectTable. Shows:
 * 1. All object properties (including redacted/consent-restricted markers)
 * 2. Links grouped by link type (via REST /api/v1/{plural}/:id/links/:linkType)
 * 3. Version history timeline (via REST /api/v1/{plural}/:id/history)
 *
 * The REST endpoints are used directly because the generated SDK does not
 * expose links or history queries.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** A generic object with system metadata. */
interface DetailObject {
  _id: string;
  _type?: string;
  _version?: number;
  _createdAt?: string;
  _updatedAt?: string;
  _actorId?: string;
  _redactedFields?: string[] | null;
  _consentRestricted?: boolean | null;
  [key: string]: unknown;
}

interface LinkRecord {
  _id: string;
  fromObjectId: string;
  toObjectId: string;
  fromObjectType: string;
  toObjectType: string;
  properties: Record<string, unknown>;
  _redactedFields?: string[] | null;
}

interface HistoryRecord {
  _id: string;
  _version: number;
  _updatedAt: string;
  _actorId: string;
  properties: Record<string, unknown>;
}

export interface ObjectDetailScreenProps {
  /** The object type name (e.g. "Patient", "Shipment"). */
  objectType: string;
  /** The object ID. */
  objectId: string;
  /** The REST API base URL (defaults to /api/v1). */
  apiBase?: string;
  /** Auth token provider. */
  getToken: (() => Promise<string>) | null;
  /** Called when the user closes the detail view. */
  onClose: () => void;
  /** Optional: the SDK client's get() for this type. */
  getObject?: (id: string) => Promise<DetailObject | null>;
  /** Link types to fetch (from the schema). If omitted, no links are fetched. */
  linkTypes?: string[];
}

type Tab = 'properties' | 'links' | 'history';

export function ObjectDetailScreen({
  objectType,
  objectId,
  apiBase = '/api/v1',
  getToken,
  onClose,
  getObject,
  linkTypes = [],
}: ObjectDetailScreenProps): ReactNode {
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [obj, setObj] = useState<DetailObject | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, LinkRecord[]>>({});
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const ticket = useRef(0);

  const plural = objectType.toLowerCase() + 's';

  const fetchObject = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      let result: DetailObject | null = null;
      if (getObject) {
        result = await getObject(objectId);
      } else {
        const token = getToken ? await getToken() : '';
        const response = await fetch(`${apiBase}/${plural}/${objectId}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        result = (await response.json()) as DetailObject;
      }
      if (mine !== ticket.current) return;
      setObj(result);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [apiBase, plural, objectId, getToken, getObject]);

  useEffect(() => {
    void fetchObject();
  }, [fetchObject]);

  const fetchLinks = useCallback(async () => {
    if (linkTypes.length === 0) return;
    setLinksLoading(true);
    try {
      const token = getToken ? await getToken() : '';
      const results: Record<string, LinkRecord[]> = {};
      for (const lt of linkTypes) {
        const response = await fetch(
          `${apiBase}/${plural}/${objectId}/links/${lt}`,
          { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
        );
        if (response.ok) {
          const json = (await response.json()) as { links?: LinkRecord[] };
          results[lt] = json.links ?? [];
        }
      }
      setLinks(results);
    } catch {
      // Best-effort — links are supplementary
    } finally {
      setLinksLoading(false);
    }
  }, [apiBase, plural, objectId, getToken, linkTypes]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch(
        `${apiBase}/${plural}/${objectId}/history`,
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      );
      if (response.ok) {
        const json = (await response.json()) as { history?: HistoryRecord[] };
        setHistory(json.history ?? []);
      }
    } catch {
      // Best-effort
    } finally {
      setHistoryLoading(false);
    }
  }, [apiBase, plural, objectId, getToken]);

  useEffect(() => {
    if (activeTab === 'links' && Object.keys(links).length === 0 && !linksLoading) {
      void fetchLinks();
    }
    if (activeTab === 'history' && history.length === 0 && !historyLoading) {
      void fetchHistory();
    }
  }, [activeTab, links, history, linksLoading, historyLoading, fetchLinks, fetchHistory]);

  if (status === 'error') {
    return (
      <div className="ed-detail-overlay" role="dialog" aria-label={`${objectType} detail`}>
        <div className="ed-detail-panel">
          <div className="ed-detail-header">
            <h2>{objectType} {objectId}</h2>
            <button type="button" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div role="alert">
            <p>Could not load {objectType}.</p>
            <p>{error}</p>
            <button type="button" onClick={() => void fetchObject()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const systemFields = new Set(['_id', '_type', '_version', '_createdAt', '_updatedAt', '_actorId', '_redactedFields', '_consentRestricted']);
  const properties = obj
    ? Object.entries(obj).filter(([k]) => !systemFields.has(k))
    : [];

  return (
    <div className="ed-detail-overlay" role="dialog" aria-label={`${objectType} detail`}>
      <div className="ed-detail-panel">
        <div className="ed-detail-header">
          <div>
            <span className="ed-main__eyebrow">{objectType.toUpperCase()}</span>
            <h2>{objectId}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {obj?._consentRestricted && (
          <div className="ed-detail-banner" data-tone="consent">
            Consent withheld — fields may be null because the subject has not consented.
          </div>
        )}

        <div className="ed-detail-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'properties'}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          {linkTypes.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'links'}
              onClick={() => setActiveTab('links')}
            >
              Links ({linkTypes.length})
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        <div className="ed-detail-body">
          {status === 'loading' && <p aria-live="polite">Loading…</p>}

          {activeTab === 'properties' && obj && (
            <table>
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {properties.map(([key, value]) => {
                  const redacted = obj._redactedFields?.includes(key);
                  return (
                    <tr key={key}>
                      <td><code>{key}</code></td>
                      <td>
                        {redacted ? (
                          <span data-redacted="true" title="Hidden by field-level permissions">
                            redacted
                          </span>
                        ) : value === null || value === undefined ? (
                          <span data-empty="true">—</span>
                        ) : typeof value === 'object' ? (
                          <pre style={{ fontSize: '0.85em', margin: 0 }}>
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeTab === 'links' && (
            <div>
              {linksLoading && <p aria-live="polite">Loading links…</p>}
              {!linksLoading && Object.entries(links).map(([lt, records]) => (
                <div key={lt}>
                  <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {lt} ({records.length})
                  </h3>
                  {records.length === 0 ? (
                    <p style={{ opacity: 0.5 }}>No {lt} links.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">From</th>
                          <th scope="col">To</th>
                          <th scope="col">Properties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((link) => (
                          <tr key={link._id}>
                            <td>{link.fromObjectType} {link.fromObjectId}</td>
                            <td>{link.toObjectType} {link.toObjectId}</td>
                            <td>
                              {Object.keys(link.properties).length > 0 ? (
                                <pre style={{ fontSize: '0.85em', margin: 0 }}>
                                  {JSON.stringify(link.properties, null, 2)}
                                </pre>
                              ) : (
                                <span data-empty="true">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {historyLoading && <p aria-live="polite">Loading history…</p>}
              {!historyLoading && history.length === 0 && (
                <p style={{ opacity: 0.5 }}>No version history available.</p>
              )}
              {!historyLoading && history.length > 0 && (
                <ol className="ed-history-timeline">
                  {history.map((rec) => (
                    <li key={rec._id} className="ed-history-item">
                      <span className="ed-history-version">v{rec._version}</span>
                      <span className="ed-history-time">{formatTime(rec._updatedAt)}</span>
                      <span className="ed-history-actor">{rec._actorId}</span>
                      <details>
                        <summary>Properties</summary>
                        <pre style={{ fontSize: '0.85em' }}>
                          {JSON.stringify(rec.properties, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {obj && (
          <div className="ed-detail-footer">
            <span>Version {obj._version ?? '—'}</span>
            {obj._createdAt && <span>Created {formatTime(obj._createdAt)}</span>}
            {obj._updatedAt && <span>Updated {formatTime(obj._updatedAt)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
