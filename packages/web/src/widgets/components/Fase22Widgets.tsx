/**
 * Fase 22 widget implementations.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ─── 22A Mobile app launcher ─────────────────────────────────────────────

export function MobileAppLauncherWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { appId?: string };
  const [session, setSession] = useState<Record<string, unknown> | null>(null);

  const launch = useCallback(async () => {
    const res = await fetch('/api/v1/workshop/mobile/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: config.appId ?? 'app-1', device: { platform: 'ios' } }),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setSession(body['data'] as Record<string, unknown>);
    }
  }, [config.appId]);

  useEffect(() => { if (instance.config?.['autoLaunch']) launch(); }, [launch]);

  return (
    <div className="ed-widget ed-mobile-launcher" data-widget-id={instance.id}>
      <div className="ed-mobile-launcher__title">Mobile App Launcher</div>
      <button onClick={launch} type="button" className="ed-button">Launch mobile session</button>
      {session && <div data-testid="session-id">Session: {String(session['id'])}</div>}
    </div>
  );
}

// ─── 22B Viewport switcher ───────────────────────────────────────────────

export function ViewportSwitcherWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const [viewport, setViewport] = useState<string>('desktop');
  const varName = instance.boundVariable ?? 'viewport';

  const select = (v: string) => {
    setViewport(v);
    ctx.setVariable(varName, v);
  };

  return (
    <div className="ed-widget ed-viewport-switcher" data-widget-id={instance.id}>
      <div className="ed-viewport-switcher__title">Viewport</div>
      {['desktop', 'tablet', 'mobile'].map((v) => (
        <button key={v} className={v === viewport ? 'ed-button--active' : ''} onClick={() => select(v)} type="button">{v}</button>
      ))}
    </div>
  );
}

// ─── 22C QR / deep-link launch widget ────────────────────────────────────

export function QRDeepLinkLaunchWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { appId?: string };
  const [deepLink, setDeepLink] = useState<string>('');

  const generate = useCallback(async () => {
    const res = await fetch('/api/v1/workshop/mobile/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: config.appId ?? 'app-1', device: { platform: 'ios' } }),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setDeepLink(String(body['deepLink'] ?? ''));
    }
  }, [config.appId]);

  return (
    <div className="ed-widget ed-qr-launch" data-widget-id={instance.id}>
      <div className="ed-qr-launch__title">QR / Deep Link</div>
      <button onClick={generate} type="button" className="ed-button">Generate launch link</button>
      {deepLink && <div className="ed-qr-launch__link">{deepLink}</div>}
    </div>
  );
}

// ─── 22D Geolocation prompt widget ───────────────────────────────────────

export function GeolocationPromptWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const [status, setStatus] = useState<string>('prompt');
  const varName = instance.boundVariable ?? 'location';

  const request = () => {
    setStatus('granted');
    ctx.setVariable(varName, { lat: 51.5, lng: -0.1, granted: true });
  };

  return (
    <div className="ed-widget ed-geolocation-prompt" data-widget-id={instance.id}>
      <div className="ed-geolocation-prompt__title">Geolocation</div>
      <div data-testid="geo-status">{status}</div>
      <button onClick={request} type="button" className="ed-button">Allow location</button>
    </div>
  );
}

// ─── 22E Interactive graph visualization widget ──────────────────────────

export function GraphVisualizationWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { rootObjectType?: string; rootObjectId?: string };
  const [graph, setGraph] = useState<{ nodes?: unknown[]; edges?: unknown[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ontology/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootObjectType: config.rootObjectType ?? 'Patient', rootObjectId: config.rootObjectId ?? '1' }),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setGraph(body['data'] as { nodes?: unknown[]; edges?: unknown[] });
    }
  }, [config.rootObjectType, config.rootObjectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ed-widget ed-graph-viz" data-widget-id={instance.id}>
      <div className="ed-graph-viz__title">Interactive Graph</div>
      {graph && (
        <div>
          <div data-testid="node-count">{graph.nodes?.length ?? 0} nodes</div>
          <div data-testid="edge-count">{graph.edges?.length ?? 0} edges</div>
        </div>
      )}
    </div>
  );
}

// ─── 22F Object-set filter state widget ──────────────────────────────────

export function ObjectSetFilterStateWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { objectSetId?: string };
  const [state, setState] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/object-sets/${config.objectSetId ?? '1'}/filter-state`);
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setState(body['data'] as Record<string, unknown>);
    }
  }, [config.objectSetId]);

  useEffect(() => { load(); }, [load]);

  const chips = Array.isArray(state?.['chips']) ? (state?.['chips'] as unknown[]) : [];
  return (
    <div className="ed-widget ed-filter-state" data-widget-id={instance.id}>
      <div className="ed-filter-state__title">Filter State</div>
      <div data-testid="chip-count">{chips.length} chips</div>
    </div>
  );
}

// ─── 22G Cross-app command launcher widget ───────────────────────────────

export function CommandLauncherWidget({ instance }: WidgetProps): React.ReactNode {
  const [commands, setCommands] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/commands');
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setCommands(body['data'] as Record<string, unknown>[]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ed-widget ed-command-launcher" data-widget-id={instance.id}>
      <div className="ed-command-launcher__title">Command Launcher</div>
      <div data-testid="command-count">{commands.length} commands</div>
    </div>
  );
}
