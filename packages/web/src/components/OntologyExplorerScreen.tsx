/**
 * Ontology explorer — schema browser for the loaded domain packs.
 *
 * Uses GraphQL introspection (__schema) to list all object types, their
 * fields, and directives. This is the same metadata the generated SDK is
 * built from, but viewed at runtime so an operator can explore the ontology
 * without reading ODL files.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type GqlTypeRef = { name: string | null; kind: string; ofType: GqlTypeRef | null };

interface SchemaField {
  name: string;
  type: GqlTypeRef;
  description: string | null;
}

interface SchemaType {
  name: string;
  kind: string;
  description: string | null;
  fields: SchemaField[] | null;
}

interface IntrospectionResult {
  __schema: {
    types: SchemaType[];
  };
}

const INTROSPECTION_QUERY = `
  query {
    __schema {
      types {
        name
        kind
        description
        fields {
          name
          description
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
`;

export interface OntologyExplorerScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

export function OntologyExplorerScreen({ endpoint, getToken }: OntologyExplorerScreenProps): ReactNode {
  const [types, setTypes] = useState<SchemaType[]>([]);
  const [selectedType, setSelectedType] = useState<SchemaType | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const ticket = useRef(0);

  const fetchSchema = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: IntrospectionResult; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      const allTypes = json.data?.__schema?.types ?? [];
      // Filter to user-defined types (skip __ prefixes and GraphQL built-ins)
      const userTypes = allTypes.filter(
        (t) =>
          !t.name.startsWith('__') &&
          !['String', 'Int', 'Float', 'Boolean', 'ID', 'Query', 'Mutation', 'Subscription'].includes(t.name) &&
          (t.kind === 'OBJECT' || t.kind === 'ENUM' || t.kind === 'INTERFACE' || t.kind === 'INPUT_OBJECT'),
      );
      if (mine !== ticket.current) return;
      setTypes(userTypes);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken]);

  useEffect(() => {
    void fetchSchema();
  }, [fetchSchema]);

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">MODEL · ONTOLOGY</span>
          <h1 className="ed-main__title">Ontology explorer</h1>
        </header>
        <div role="alert">
          <p>Could not load schema.</p>
          <p>{error}</p>
          <button type="button" onClick={() => void fetchSchema()}>Retry</button>
        </div>
      </main>
    );
  }

  const objectTypes = types.filter((t) => t.kind === 'OBJECT' && !t.name.endsWith('Connection') && !t.name.endsWith('Filter') && !t.name.endsWith('OrderBy') && !t.name.endsWith('Input') && !t.name.startsWith('Update') && !t.name.startsWith('Search'));
  const enums = types.filter((t) => t.kind === 'ENUM');
  const interfaces = types.filter((t) => t.kind === 'INTERFACE');

  const filteredObjects = filter
    ? objectTypes.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : objectTypes;

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">MODEL · ONTOLOGY</span>
        <h1 className="ed-main__title">Ontology explorer</h1>
        <p className="ed-main__lede">
          Browse the loaded ontology — object types, enums, and interfaces from all
          active domain packs. Click a type to see its fields.
        </p>
      </header>

      <div style={{ padding: '0 44px 16px' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter types…"
          style={{ width: '100%', maxWidth: 400 }}
        />
      </div>

      <div style={{ padding: '0 44px 40px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Type list */}
        <div>
          <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Object types ({filteredObjects.length})
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredObjects.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => setSelectedType(t)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 12px',
                    background: selectedType?.name === t.name ? 'var(--ed-surface-raised, #e8e8e8)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>

          {enums.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>
                Enums ({enums.length})
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {enums.map((t) => (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setSelectedType(t)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: selectedType?.name === t.name ? 'var(--ed-surface-raised, #e8e8e8)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        font: 'inherit',
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {interfaces.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>
                Interfaces ({interfaces.length})
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {interfaces.map((t) => (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setSelectedType(t)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: selectedType?.name === t.name ? 'var(--ed-surface-raised, #e8e8e8)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        font: 'inherit',
                      }}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedType ? (
            <div>
              <h2 style={{ marginBottom: 4 }}>{selectedType.name}</h2>
              <span className="ed-main__eyebrow" style={{ display: 'block', marginBottom: 16 }}>
                {selectedType.kind}
              </span>
              {selectedType.description && (
                <p style={{ opacity: 0.7, marginBottom: 16 }}>{selectedType.description}</p>
              )}
              {selectedType.fields && selectedType.fields.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Type</th>
                      <th scope="col">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedType.fields
                      .filter((f) => !f.name.startsWith('_'))
                      .map((f) => (
                        <tr key={f.name}>
                          <td><code>{f.name}</code></td>
                          <td><code>{typeLabel(f.type)}</code></td>
                          <td>{f.description ?? <span data-empty="true">—</span>}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p>No fields.</p>
              )}
            </div>
          ) : (
            <p style={{ opacity: 0.5 }}>Select a type to see its fields.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function typeLabel(type: GqlTypeRef): string {
  if (type.name) return type.name;
  if (type.ofType?.name) return type.ofType.name;
  if (type.ofType) return typeLabel(type.ofType);
  return type.kind;
}
