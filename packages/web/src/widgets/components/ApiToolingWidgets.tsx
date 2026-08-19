/**
 * API Tooling widget implementations.
 *
 * All widgets are functional React components that render real UI
 * and, where applicable, read from or write to bound variables.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ─── 21A Data Freshness widget ───

export function DataFreshnessWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectType?: string; datasource?: string };
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const type = config.objectType ?? 'Patient';
      const res = await fetch(`/api/v1/${type.toLowerCase()}s/freshness`);
      if (res.ok) setRecord(((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>);
    } finally { setLoading(false); }
  }, [config.objectType]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="ed-widget ed-data-freshness" data-widget-id={instance.id}>
      <div className="ed-data-freshness__title">Data Freshness</div>
      {loading && <div>Loading…</div>}
      {!loading && record && (
        <div>
          <div>Object type: {String(record['objectType'])}</div>
          <div>Last synced: {String(record['lastSyncedAt'])}</div>
          <div>Records: {String(record['lastRecordCount'])}</div>
          <div>Status: {record['lastSyncSucceeded'] ? '✓ fresh' : '✗ stale'}</div>
          <button onClick={refresh} type="button" className="ed-button">Refresh</button>
        </div>
      )}
      {!loading && !record && <div className="ed-empty">No freshness record</div>}
    </div>
  );
}

// ─── 21B Ontology change history widget ───

export function OntologyChangeHistoryWidget(): React.ReactNode {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ontology/changes?limit=20');
    if (res.ok) setRecords(((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ed-widget ed-change-history">
      <div className="ed-change-history__title">Ontology Change History</div>
      <ul className="ed-list">
        {records.map((r, i) => (
          <li key={i} className="ed-list__item" onClick={() => setSelected(r)}>
            v{String(r['version'])} — {String(r['migrationClass'])} — {String(r['appliedAt'])}
          </li>
        ))}
      </ul>
      {selected && (
        <div className="ed-panel">
          <div>Diff: {String(selected['diffSummary'])}</div>
          <button onClick={async () => { await load(); setSelected(null); }} type="button" className="ed-button">Close</button>
        </div>
      )}
    </div>
  );
}

// ─── 21C Value formatting widget ───

export function ValueFormattingWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { format?: string; field?: string; objectType?: string; value?: unknown };
  const [formatted, setFormatted] = useState<Record<string, unknown> | null>(null);
  const [input, setInput] = useState<string>(String(config.value ?? ''));

  const format = useCallback(async () => {
    const type = config.objectType ?? 'Patient';
    const res = await fetch(`/api/v1/${type.toLowerCase()}s/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: config.field ?? 'value',
        rule: { kind: config.format ?? 'number', params: {} },
      }),
    });
    if (res.ok) {
      const data = ((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>;
      setFormatted(data);
    }
  }, [config.field, config.format, config.objectType]);

  useEffect(() => { format(); }, [format]);

  return (
    <div className="ed-widget ed-value-formatting" data-widget-id={instance.id}>
      <div className="ed-value-formatting__title">Value Formatting</div>
      <input type="text" value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={format} type="button" className="ed-button">Format</button>
      {formatted && (
        <div>
          <div>Kind: {String(formatted['kind'])}</div>
          <div>Text: {String(formatted['text'])}</div>
          <div>Raw: {String(formatted['raw'])}</div>
        </div>
      )}
    </div>
  );
}

// ─── 21D Design system theme widget ───

export function DesignSystemThemeWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { moduleId?: string };
  const [theme, setTheme] = useState<Record<string, unknown> | null>(null);
  const [primary, setPrimary] = useState<string>('#2563eb');

  const load = useCallback(async () => {
    const id = config.moduleId ?? 'default';
    const res = await fetch(`/api/v1/modules/${id}/theme`);
    if (res.ok) {
      const data = ((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>;
      setTheme(data);
      const p = (data?.['palette'] as Record<string, unknown> | undefined)?.['primary'];
      if (typeof p === 'string') setPrimary(p);
    }
  }, [config.moduleId]);

  const save = useCallback(async () => {
    const id = config.moduleId ?? 'default';
    await fetch(`/api/v1/modules/${id}/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: theme?.['id'] ?? 'default', palette: { primary } }),
    });
    await load();
  }, [config.moduleId, primary, theme]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ed-widget ed-theme-editor" data-widget-id={instance.id}>
      <div className="ed-theme-editor__title">Design System Theme</div>
      <label>Primary colour</label>
      <input type="color" value={primary} onChange={e => setPrimary(e.target.value)} />
      <button onClick={save} type="button" className="ed-button">Save palette</button>
      {theme && <div>Density: {String(theme['density'])} | Dark mode: {String(theme['darkMode'])}</div>}
    </div>
  );
}

// ─── 21E Function-backed widget data ───

export function FunctionBackedWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { functionName?: string; objectType?: string; objectId?: string };
  const [result, setResult] = useState<unknown>(null);

  const invoke = useCallback(async () => {
    const type = config.objectType ?? 'Patient';
    const id = config.objectId ?? '1';
    const name = config.functionName ?? 'Double';
    const res = await fetch(`/api/v1/${type.toLowerCase()}s/${id}/function/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) setResult(((await res.json()) as Record<string, unknown>)['data']);
  }, [config.functionName, config.objectId, config.objectType]);

  useEffect(() => { if (instance.config?.['autoInvoke']) invoke(); }, [invoke]);

  return (
    <div className="ed-widget ed-function-backed" data-widget-id={instance.id}>
      <div className="ed-function-backed__title">Function-backed Data</div>
      <button onClick={invoke} type="button" className="ed-button">Invoke {String(config.functionName)}</button>
      {result !== null && <pre className="ed-code">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

// ─── 21F Live data push / auto-refresh widget ───

export function LiveDataPushWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectType?: string; fields?: Array<{ field: string; fn: string }>; intervalMs?: number };
  const [data, setData] = useState<unknown>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('—');

  const poll = useCallback(async () => {
    const type = config.objectType ?? 'Patient';
    const res = await fetch(`/api/v1/${type.toLowerCase()}s/aggregate/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: config.fields ?? [{ field: 'id', fn: 'count' }] }),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setData(body['data']);
      setLastRefreshed(String(body['polledAt']));
    }
  }, [config.fields, config.objectType]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, config.intervalMs ?? 5000);
    return () => clearInterval(iv);
  }, [poll, config.intervalMs]);

  return (
    <div className="ed-widget ed-live-data" data-widget-id={instance.id}>
      <div className="ed-live-data__title">Live Data</div>
      <div>Last refreshed: {lastRefreshed}</div>
      <pre className="ed-code">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

// ─── 21G QR / camera capture widgets ───

export function QrCodeReaderWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const [scanned, setScanned] = useState<string>('');
  const [manual, setManual] = useState<string>('');

  const onManual = () => {
    setScanned(manual);
    if (instance.boundVariable) ctx.setVariable(instance.boundVariable, manual);
  };

  return (
    <div className="ed-widget ed-qr-reader" data-widget-id={instance.id}>
      <div className="ed-qr-reader__title">QR Code Reader</div>
      <video autoPlay playsInline muted className="ed-qr-reader__video" style={{ width: '100%', maxHeight: 160, background: '#000' }} />
      <input type="text" placeholder="Or enter value" value={manual} onChange={e => setManual(e.target.value)} />
      <button onClick={onManual} type="button" className="ed-button">Set</button>
      {scanned && <div className="ed-qr-reader__value">Scanned: {scanned}</div>}
    </div>
  );
}

export function CameraCaptureWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [image, setImage] = useState<string>('');

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
    } catch { /* ignore */ }
  }, []);

  const capture = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    const c = canvas.getContext('2d');
    if (c && videoRef.current) c.drawImage(videoRef.current, 0, 0);
    const data = canvas.toDataURL('image/png');
    setImage(data);
    if (instance.boundVariable) ctx.setVariable(instance.boundVariable, data);
    fetch('/api/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'camera_frame', data: { image: data } }),
    });
  }, [ctx, instance.boundVariable]);

  useEffect(() => { start(); }, [start]);

  return (
    <div className="ed-widget ed-camera-capture" data-widget-id={instance.id}>
      <div className="ed-camera-capture__title">Camera Capture</div>
      <video ref={videoRef} autoPlay playsInline muted className="ed-camera-capture__video" style={{ width: '100%', maxHeight: 160, background: '#000' }} />
      <button onClick={capture} type="button" className="ed-button">Capture</button>
      {image && <img src={image} alt="capture" style={{ maxHeight: 120 }} />}
    </div>
  );
}

// ─── 21H Visual ontology manager widget ───

export function VisualOntologyManagerWidget(): React.ReactNode {
  const [types, setTypes] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ontology/manager/types');
    if (res.ok) setTypes(((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ed-widget ed-ontology-manager">
      <div className="ed-ontology-manager__title">Ontology Manager</div>
      <ul className="ed-list">
        {types.map((t, i) => (
          <li key={i} className="ed-list__item">{String(t['name'])} — {String(t['displayName'])}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── 21I Ontology metadata catalog widget ───

export function OntologyMetadataCatalogWidget(): React.ReactNode {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);

  const search = useCallback(async () => {
    const res = await fetch(`/api/v1/ontology/metadata/search?q=${encodeURIComponent(query)}`);
    if (res.ok) setResults(((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>[]);
  }, [query]);

  useEffect(() => { search(); }, [search]);

  return (
    <div className="ed-widget ed-ontology-catalog">
      <div className="ed-ontology-catalog__title">Ontology Catalog</div>
      <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search types…" />
      <button onClick={search} type="button" className="ed-button">Search</button>
      <ul className="ed-list">
        {results.map((r, i) => (
          <li key={i} className="ed-list__item">{String(r['name'])}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── 21J Kiosk mode widget ───

export function KioskModeWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectTypes?: string[]; durationSeconds?: number; location?: string };
  const [session, setSession] = useState<Record<string, unknown> | null>(null);

  const launch = useCallback(async () => {
    const res = await fetch('/api/v1/kiosk/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Kiosk',
        location: config.location ?? 'default',
        permissions: { objectTypes: config.objectTypes ?? ['Patient'], readOnly: true },
        durationSeconds: config.durationSeconds ?? 3600,
      }),
    });
    if (res.ok) setSession(((await res.json()) as Record<string, unknown>)['data'] as Record<string, unknown>);
  }, [config.durationSeconds, config.location, config.objectTypes]);

  useEffect(() => {
    if (instance.config?.['autoLaunch']) launch();
  }, [launch]);

  return (
    <div className="ed-widget ed-kiosk" data-widget-id={instance.id}>
      <div className="ed-kiosk__title">Kiosk Mode</div>
      <button onClick={launch} type="button" className="ed-button">Launch read-only session</button>
      {session && (
        <div>
          <div>Session: {String(session['id'])}</div>
          <div>Expires: {String(session['expiresAt'])}</div>
          <div>Allowed: {Array.isArray(session['permissions']) ? session['permissions'].join(', ') : String(session['permissions'])}</div>
        </div>
      )}
    </div>
  );
}
