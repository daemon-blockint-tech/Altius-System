/**
 * Pack manager screen — browse loaded domain packs and their types.
 *
 * Uses the GraphQL `__schema` introspection to list all types, grouped
 * by their namespace (derived from the type name pattern). Also shows
 * the pack definitions from the app's PACKS config.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface PackTypeInfo {
  objectTypes: string[];
  enumTypes: string[];
  linkTypes: string[];
  actionTypes: string[];
}

export interface PackManagerScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

export function PackManagerScreen({ endpoint, getToken }: PackManagerScreenProps): ReactNode {
  const [types, setTypes] = useState<PackTypeInfo>({ objectTypes: [], enumTypes: [], linkTypes: [], actionTypes: [] });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const fetchSchema = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          query: `query { __schema { types { name kind } } }`,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: { __schema?: { types: Array<{ name: string; kind: string }> } }; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      const allTypes = json.data?.__schema?.types ?? [];
      if (mine !== ticket.current) return;
      setTypes({
        objectTypes: allTypes.filter(t => t.kind === 'OBJECT' && !t.name.startsWith('__') && !t.name.endsWith('Connection') && !t.name.endsWith('Filter') && !t.name.endsWith('OrderBy') && !t.name.endsWith('Input') && !t.name.startsWith('Update') && !['Query', 'Mutation', 'Subscription', 'String', 'Int', 'Float', 'Boolean', 'ID'].includes(t.name)).map(t => t.name),
        enumTypes: allTypes.filter(t => t.kind === 'ENUM' && !t.name.startsWith('__')).map(t => t.name),
        linkTypes: allTypes.filter(t => t.kind === 'OBJECT' && t.name.endsWith('Link')).map(t => t.name),
        actionTypes: allTypes.filter(t => t.kind === 'OBJECT' && (t.name.endsWith('Result') || t.name.endsWith('Action'))).map(t => t.name),
      });
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken]);

  useEffect(() => { void fetchSchema(); }, [fetchSchema]);

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">MODEL · PACKS</span>
          <h1 className="ed-main__title">Domain pack manager</h1>
        </header>
        <div role="alert"><p>{error}</p><button type="button" onClick={() => void fetchSchema()}>Retry</button></div>
      </main>
    );
  }

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">MODEL · PACKS</span>
        <h1 className="ed-main__title">Domain pack manager</h1>
        <p className="ed-main__lede">
          Browse the loaded domain packs and their types. Each pack contributes
          object types, enums, links, and actions to the unified ontology.
        </p>
      </header>

                  <div className="ed-table-wrap">
        {status === 'loading' && <p aria-live="polite">Loading…</p>}

                {status === 'ready' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <h2 className="ed-subhead">
                Object types ({types.objectTypes.length})
              </h2>
              <ul>
                {types.objectTypes.map(t => <li key={t} className="ed-list-item"><code>{t}</code></li>)}
              </ul>
            </div>

            <div>
              <h2 className="ed-subhead">
                Enums ({types.enumTypes.length})
              </h2>
              <ul>
                {types.enumTypes.map(t => <li key={t} className="ed-list-item"><code>{t}</code></li>)}
              </ul>

              <h2 className="ed-subhead">
                Link types ({types.linkTypes.length})
              </h2>
              <ul>
                {types.linkTypes.map(t => <li key={t} className="ed-list-item"><code>{t}</code></li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
