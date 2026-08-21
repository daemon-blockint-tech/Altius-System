/**
 * Workshop — the app builder, wired into the console.
 *
 * The Workshop widget subsystem (builder + ~95 widget types) existed but was
 * unreachable and its REST clients sent no auth. With authedFetch registered by
 * the app, this lists the tenant's saved apps and opens the drag-drop builder to
 * create or edit one, persisting through the governed /api/v1/workshop endpoints.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { WorkshopBuilder } from '../widgets/builder/WorkshopBuilder.js';
import { listApps, getApp } from '../widgets/workshop-client.js';
import type { WorkshopAppDefinition as ClientApp } from '../widgets/workshop-client.js';
import type { WorkshopAppDefinition, WorkshopAppPage } from '../widgets/types.js';

/**
 * The client returns a loose app shape; the builder needs the strict one. The
 * server stores the full app, so filling the few missing fields is safe.
 */
function toBuilderApp(a: ClientApp, tenantId: string, userId: string): WorkshopAppDefinition {
  return {
    id: a.id,
    tenantId: (a['tenantId'] as string) ?? tenantId,
    name: a.name,
    description: a.description ?? '',
    pages: (a.pages as WorkshopAppPage[]) ?? [{ id: 'page-1', name: 'Page 1', sections: [] }],
    overlays: (a['overlays'] as unknown[]) ?? [],
    variableIds: (a['variableIds'] as string[]) ?? [],
    ownerId: a.ownerId ?? userId,
    sharedWith: a.sharedWith ?? [],
    isPublic: (a['isPublic'] as boolean) ?? false,
    version: a.version ?? 0,
    createdAt: a.createdAt ?? new Date().toISOString(),
    updatedAt: a.updatedAt ?? new Date().toISOString(),
    ...(a.header ? { header: a.header as unknown as WorkshopAppDefinition['header'] } : {}),
    ...(a.theme ? { theme: a.theme as unknown as WorkshopAppDefinition['theme'] } : {}),
  };
}

export interface WorkshopScreenProps {
  /** SDK client, used by the builder's preview mode. */
  client: unknown;
  tenantId: string;
  userId: string;
}

function blankApp(tenantId: string, userId: string): WorkshopAppDefinition {
  const now = new Date().toISOString();
  return {
    id: '',
    tenantId,
    name: 'Untitled app',
    description: '',
    pages: [{ id: 'page-1', name: 'Page 1', sections: [] }],
    overlays: [],
    variableIds: [],
    ownerId: userId,
    sharedWith: [],
    isPublic: false,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function WorkshopScreen({ client, tenantId, userId }: WorkshopScreenProps): ReactNode {
  const [apps, setApps] = useState<ClientApp[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkshopAppDefinition | null>(null);
  const ticket = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      const list = await listApps();
      if (mine !== ticket.current) return;
      setApps(list);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const open = useCallback(async (id: string) => {
    try {
      setEditing(toBuilderApp(await getApp(id), tenantId, userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tenantId, userId]);

  if (editing) {
    // The builder is a full-screen editor; render it over the shell rather than
    // squeezed into the shell's main column beside the governance rail.
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--ed-bg, #0b0b0f)', overflow: 'auto' }}>
        <div style={{ padding: '8px 16px' }}>
          <button type="button" onClick={() => { setEditing(null); void reload(); }}>← Back to apps</button>
        </div>
        <WorkshopBuilder
          initialApp={editing}
          client={client}
          tenantId={tenantId}
          userId={userId}
          persistToBackend
          onSave={() => { setEditing(null); void reload(); }}
          onExport={() => { /* export handled inside the builder */ }}
        />
      </div>
    );
  }

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">MODEL · APP BUILDER</span>
        <h1 className="ed-main__title">App Builder</h1>
        <p className="ed-main__lede">
          Build operational apps over the ontology — pages, sections and widgets,
          persisted through the governed app-builder API.
        </p>
      </header>

      <div style={{ padding: '0 44px 16px' }}>
        <button type="button" onClick={() => setEditing(blankApp(tenantId, userId))}>
          New app
        </button>
      </div>

      {status === 'error' && (
        <div role="alert" className="ed-error" style={{ margin: '0 44px' }}>
          <p>Could not load apps.</p>
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>Retry</button>
        </div>
      )}

      {status === 'ready' && (
        <div style={{ padding: '0 44px 40px' }}>
          {apps.length === 0 ? (
            <p className="ed-muted">No apps yet. Create one to get started.</p>
          ) : (
            <ul>
              {apps.map(a => (
                <li key={a.id}>
                  <button type="button" className="ed-type-btn" onClick={() => void open(a.id)}>
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
