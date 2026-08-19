/**
 * Phase20ExtraWidgets — additional widgets for saved views, edit history,
 * platform resource browser, and embedding.
 *
 *   SavedViewsWidget     — saved view management with per-user state
 *   EditHistoryWidget    — per-object version history with field-level diff
 *   ResourceBrowserWidget — platform resource browser (files/projects)
 *   IframeWidget         — embed external content via iframe
 *   AppPairingWidget     — cross-app communication and shared state
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ── Saved Views Widget ──

export function SavedViewsWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectType?: string; views?: Array<{ id: string; name: string; filter?: Record<string, unknown>; isDefault?: boolean }> };
  const [views, setViews] = useState(config.views ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(views.find(v => v.isDefault)?.id ?? views[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const selected = views.find(v => v.id === selectedId);

  const applyView = useCallback((id: string) => {
    setSelectedId(id);
    const view = views.find(v => v.id === id);
    if (view?.filter && instance.boundVariable) {
      ctx.setVariable(instance.boundVariable, view.filter);
    }
  }, [views, instance.boundVariable, ctx]);

  const createView = useCallback(() => {
    if (!newName.trim()) return;
    const newView = { id: `view-${Date.now()}`, name: newName, isDefault: false };
    setViews(prev => [...prev, newView]);
    setNewName('');
    setShowCreate(false);
  }, [newName]);

  const deleteView = useCallback((id: string) => {
    setViews(prev => prev.filter(v => v.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4 }} aria-label="Saved views">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong>Saved Views</strong>
        <button onClick={() => setShowCreate(!showCreate)} style={{ fontSize: 10, padding: '2px 6px' }}>+ New</button>
      </div>
      {showCreate && (
        <div style={{ marginBottom: 4, display: 'flex', gap: 4 }}>
          <input
            type="text"
            placeholder="View name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createView()}
            style={{ flex: 1, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 2, fontSize: 11 }}
            aria-label="New view name"
          />
          <button onClick={createView} style={{ fontSize: 10, padding: '2px 8px' }}>Save</button>
        </div>
      )}
      <div style={{ maxHeight: 120, overflow: 'auto' }}>
        {views.length === 0 ? (
          <div style={{ color: '#999', padding: 4 }}>No saved views</div>
        ) : (
          views.map(v => (
            <div key={v.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 8px', cursor: 'pointer', borderRadius: 2,
              background: selectedId === v.id ? '#eff6ff' : 'transparent',
            }} onClick={() => applyView(v.id)}>
              <span>{v.name}{v.isDefault && <span style={{ fontSize: 9, color: '#999' }}> (default)</span>}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteView(v.id); }} style={{ fontSize: 10, border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
            </div>
          ))
        )}
      </div>
      {selected?.filter && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#666' }}>
          Filter: {JSON.stringify(selected.filter)}
        </div>
      )}
    </div>
  );
}

// ── Edit History Widget ──

interface HistoryEntry {
  version: number;
  timestamp: string;
  actorId: string;
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
}

export function EditHistoryWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectType?: string; objectId?: string; history?: HistoryEntry[] };
  const [history, setHistory] = useState<HistoryEntry[]>(config.history ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.objectType || !config.objectId) return;
    setLoading(true);
    fetch(`/api/v1/${config.objectType.toLowerCase()}s/${encodeURIComponent(config.objectId)}/history`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        // Transform API response to HistoryEntry format
        const entries: HistoryEntry[] = (data.history ?? data ?? []).map((e: Record<string, unknown>, i: number) => ({
          version: e._version as number ?? i + 1,
          timestamp: e._updatedAt as string ?? e.timestamp as string ?? '',
          actorId: e._actorId as string ?? e.actorId as string ?? 'unknown',
          changes: e.changes as HistoryEntry['changes'] ?? [],
        }));
        setHistory(entries);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [config.objectType, config.objectId]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4, maxHeight: 300, overflow: 'auto' }} aria-label="Edit history">
      <strong>Edit History</strong>
      {loading && <div style={{ color: '#999' }}>Loading...</div>}
      {error && <div style={{ color: '#c00' }}>{error}</div>}
      {!loading && !error && history.length === 0 && <div style={{ color: '#999' }}>No history</div>}
      {history.map((entry, i) => (
        <div key={i} style={{ marginTop: 8, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>v{entry.version}</span>
            <span style={{ fontSize: 10, color: '#999' }}>{entry.timestamp}</span>
          </div>
          <div style={{ fontSize: 10, color: '#666' }}>by {entry.actorId}</div>
          {entry.changes.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {entry.changes.map((c, j) => (
                <div key={j} style={{ fontSize: 10, display: 'flex', gap: 4 }}>
                  <span style={{ color: '#666' }}>{c.field}:</span>
                  <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{String(c.oldValue)}</span>
                  <span>→</span>
                  <span style={{ color: '#10b981' }}>{String(c.newValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Platform Resource Browser Widget ──

interface ResourceItem {
  id: string;
  name: string;
  kind: string;
  path: string;
  size?: number;
  mimeType?: string;
  tags?: string[];
}

export function ResourceBrowserWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { basePath?: string; filterKind?: string };
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/v1/resources', window.location.origin);
      if (config.basePath) url.searchParams.set('path', config.basePath);
      if (config.filterKind) url.searchParams.set('kind', config.filterKind);
      if (search) url.searchParams.set('search', search);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { resources: ResourceItem[] };
      setResources(data.resources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [config.basePath, config.filterKind, search]);

  useEffect(() => { loadResources(); }, [loadResources]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4, maxHeight: 300, overflow: 'auto' }} aria-label="Resource browser">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong>Resources</strong>
        <button onClick={loadResources} disabled={loading} style={{ fontSize: 10, padding: '2px 6px' }}>{loading ? '...' : 'Refresh'}</button>
      </div>
      <input
        type="text"
        placeholder="Search resources..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '4px', border: '1px solid #ddd', borderRadius: 4, marginBottom: 4, boxSizing: 'border-box' }}
        aria-label="Resource search"
      />
      {error && <div style={{ color: '#c00', marginBottom: 4 }}>{error}</div>}
      {resources.length === 0 && !loading && !error && <div style={{ color: '#999' }}>No resources</div>}
      {resources.map(r => (
        <div
          key={r.id}
          onClick={() => instance.boundVariable && ctx.setVariable(instance.boundVariable, r.id)}
          style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 2, display: 'flex', justifyContent: 'space-between' }}
          onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'}
          onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
        >
          <div>
            <span style={{ fontSize: 10, color: '#999', marginRight: 4 }}>[{r.kind}]</span>
            {r.name}
          </div>
          {r.size !== undefined && <span style={{ fontSize: 10, color: '#999' }}>{(r.size / 1024).toFixed(1)} KB</span>}
        </div>
      ))}
    </div>
  );
}

// ── Iframe Widget ──

export function IframeWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { url?: string; title?: string; width?: number; height?: number; sandbox?: string[] };
  const sandbox = config.sandbox?.join(' ');
  return (
    <div style={{ padding: 4, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Iframe embed">
      {config.title && <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{config.title}</div>}
      {config.url ? (
        <iframe
          src={config.url}
          title={config.title ?? 'Embedded content'}
          width={config.width ?? 400}
          height={config.height ?? 300}
          sandbox={sandbox}
          style={{ border: '1px solid #e5e7eb', borderRadius: 4 }}
        />
      ) : (
        <div style={{ color: '#999', padding: 16, textAlign: 'center', border: '1px dashed #e5e7eb', borderRadius: 4 }}>
          No URL configured
        </div>
      )}
    </div>
  );
}

// ── App Pairing Widget ──

export function AppPairingWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { pairedApps?: Array<{ id: string; name: string; sharedStateKeys?: string[] }> };
  const pairedApps = config.pairedApps ?? [];
  const [sharedState, setSharedState] = useState<Record<string, unknown>>({});

  const syncState = useCallback((key: string, value: unknown) => {
    setSharedState(prev => ({ ...prev, [key]: value }));
    if (instance.boundVariable) {
      ctx.setVariable(instance.boundVariable, { ...sharedState, [key]: value });
    }
  }, [instance.boundVariable, ctx, sharedState]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4 }} aria-label="App pairing">
      <strong>App Pairing</strong>
      {pairedApps.length === 0 ? (
        <div style={{ color: '#999', marginTop: 4 }}>No paired apps</div>
      ) : (
        <div style={{ marginTop: 4 }}>
          {pairedApps.map(app => (
            <div key={app.id} style={{ marginBottom: 4, padding: 4, border: '1px solid #f3f4f6', borderRadius: 2 }}>
              <div style={{ fontWeight: 600 }}>{app.name}</div>
              {app.sharedStateKeys?.map(key => (
                <div key={key} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#666' }}>{key}:</span>
                  <input
                    type="text"
                    value={String(sharedState[key] ?? '')}
                    onChange={(e) => syncState(key, e.target.value)}
                    style={{ flex: 1, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 2, fontSize: 10 }}
                    aria-label={`Shared state: ${key}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
