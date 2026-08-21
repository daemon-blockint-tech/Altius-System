/**
 * Sync health screen — shows connector and sync pipeline status.
 *
 * Queries the /health endpoint for overall API health, and the
 * /admin/packs endpoint for connector counts. The sync scheduler
 * is gated by SYNC_SCHEDULER_ENABLED — this screen reports whether
 * sync is running and shows connector manifests.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface HealthStatus {
  status: string;
  uptime?: number;
  version?: string;
}

interface PackInfo {
  name: string;
  version: string;
  namespace: string;
  description: string | null;
  external: boolean;
  objectTypes: number;
  linkTypes: number;
  actionTypes: number;
  functionTypes: number;
  connectors: number;
  permissions: number;
}

export interface SyncHealthScreenProps {
  getToken: (() => Promise<string>) | null;
}

export function SyncHealthScreen({ getToken }: SyncHealthScreenProps): ReactNode {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const fetchAll = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    try {
      const token = getToken ? await getToken() : '';
      const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };

      // Health endpoint (no auth needed)
      const healthRes = await fetch('/health', { headers });
      if (healthRes.ok) {
        setHealth((await healthRes.json()) as HealthStatus);
      }

      // Admin packs (pod-internal, may be blocked in prod)
      const packsRes = await fetch('/admin/packs', { headers });
      if (packsRes.ok) {
        const json = (await packsRes.json()) as { packs: PackInfo[] };
        if (mine !== ticket.current) return;
        setPacks(json.packs ?? []);
      }

      if (mine !== ticket.current) return;
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [getToken]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const totalConnectors = packs.reduce((sum, p) => sum + p.connectors, 0);

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">ADMINISTER · SYNC</span>
          <h1 className="ed-main__title">Sync & connector health</h1>
        </header>
        <div role="alert"><p>{error}</p><button type="button" onClick={() => void fetchAll()}>Retry</button></div>
      </main>
    );
  }

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">ADMINISTER · SYNC</span>
        <h1 className="ed-main__title">Sync & connector health</h1>
        <p className="ed-main__lede">
          API health, loaded packs, and connector counts. The sync scheduler is
          gated by <code>SYNC_SCHEDULER_ENABLED</code> — if not set, connectors
          are declared but not actively polling.
        </p>
      </header>

                  <div className="ed-table-wrap">
        {health && (
          <div style={{ marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <strong>API status: </strong>
              <span className="ed-status-badge" data-tone={health.status === 'ok' ? 'delivered' : 'lost'}>
                {health.status}
              </span>
            </div>
            {health.uptime !== undefined && <div><strong>Uptime:</strong> {Math.round(health.uptime)}s</div>}
            {health.version && <div><strong>Version:</strong> {health.version}</div>}
          </div>
        )}

                <h2 className="ed-subhead">
          Domain packs ({packs.length}) — {totalConnectors} connectors
        </h2>

        {status === 'loading' && <p aria-live="polite">Loading…</p>}

        {packs.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Pack</th>
                <th scope="col">Version</th>
                <th scope="col">Namespace</th>
                <th scope="col">Objects</th>
                <th scope="col">Links</th>
                <th scope="col">Actions</th>
                <th scope="col">Functions</th>
                <th scope="col">Connectors</th>
                <th scope="col">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {packs.map(pack => (
                <tr key={pack.name}>
                  <td><strong>{pack.name}</strong>{pack.description && <div style={{ fontSize: '0.85em', opacity: 0.6 }}>{pack.description}</div>}</td>
                  <td>{pack.version}</td>
                  <td><code>{pack.namespace}</code></td>
                  <td>{pack.objectTypes}</td>
                  <td>{pack.linkTypes}</td>
                  <td>{pack.actionTypes}</td>
                  <td>{pack.functionTypes}</td>
                  <td>
                    <span className="ed-status-badge" data-tone={pack.connectors > 0 ? 'confirmed' : 'default'}>
                      {pack.connectors}
                    </span>
                  </td>
                  <td>{pack.permissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {status === 'ready' && packs.length === 0 && (
          <p style={{ opacity: 0.5 }}>
            No pack info available. The /admin/packs endpoint is pod-internal —
            it may be blocked in production. Connector status requires the sync
            scheduler to be enabled.
          </p>
        )}
      </div>
    </main>
  );
}
