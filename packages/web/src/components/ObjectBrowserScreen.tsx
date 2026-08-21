/**
 * Object browser — a generic, ontology-driven worklist for ANY loaded pack.
 *
 * Unlike the pack-specific screens (which bind to generated SDK methods for a
 * fixed set of types), this discovers the object types at runtime by GraphQL
 * introspection and lists any of them through a query built from the schema.
 * That makes it a real operator surface for whatever ontology is deployed, not
 * just the three bundled packs.
 *
 * Reads stay governed server-side: the query selects `_redactedFields` and
 * `_consentRestricted`, and ObjectTable renders "redacted" / "consent withheld"
 * distinctly from an empty value — the UI adds no data access of its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectTable } from './ObjectTable.js';
import type { RowMetadata, ConnectionLike } from './ObjectTable.js';

/** One introspected object type the browser can list. */
export interface BrowsableType {
  /** ObjectType name (e.g. "Patient"). */
  typeName: string;
  /** The Query field that lists it (e.g. "patients"). */
  listField: string;
  /** Scalar/enum field names selectable into a table row. */
  scalarFields: string[];
}

type Row = Record<string, unknown> & RowMetadata;

interface TypeRef {
  name: string | null;
  kind: string;
  ofType: TypeRef | null;
}

/** Unwrap NON_NULL / LIST wrappers to the leaf {name, kind}. */
function leaf(ref: TypeRef | null): { name: string | null; kind: string } {
  let cur = ref;
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST') && cur.ofType) cur = cur.ofType;
  return { name: cur?.name ?? null, kind: cur?.kind ?? 'SCALAR' };
}

const INTROSPECTION = `
  query {
    __schema {
      queryType { fields { name type { name kind ofType { name kind ofType { name kind } } } } }
      types {
        name kind
        fields { name type { name kind ofType { name kind ofType { name kind } } } }
      }
    }
  }
`;

interface IntrospectedField { name: string; type: TypeRef }
interface IntrospectedType { name: string; kind: string; fields: IntrospectedField[] | null }
interface IntrospectionData {
  __schema: {
    queryType: { fields: IntrospectedField[] };
    types: IntrospectedType[];
  };
}

/**
 * Discover the object types this deployment exposes and, for each, the Query
 * field that lists it and its scalar/enum fields. Robust to pack differences:
 * it reads the actual schema rather than guessing pluralisation.
 */
export function deriveBrowsableTypes(data: IntrospectionData): BrowsableType[] {
  const typeByName = new Map(data.__schema.types.map(t => [t.name, t]));
  const out: BrowsableType[] = [];
  for (const q of data.__schema.queryType.fields) {
    const ret = leaf(q.type);
    // List queries return `<Type>Connection`.
    if (!ret.name || !ret.name.endsWith('Connection')) continue;
    const typeName = ret.name.slice(0, -'Connection'.length);
    const t = typeByName.get(typeName);
    if (!t || t.kind !== 'OBJECT' || !t.fields) continue;
    const scalarFields = t.fields
      .filter(f => !f.name.startsWith('_'))
      .filter(f => {
        const l = leaf(f.type);
        return l.kind === 'SCALAR' || l.kind === 'ENUM';
      })
      .map(f => f.name);
    out.push({ typeName, listField: q.name, scalarFields });
  }
  out.sort((a, b) => a.typeName.localeCompare(b.typeName));
  return out;
}

async function gql<T>(endpoint: string, getToken: (() => Promise<string>) | null, query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = getToken ? await getToken() : '';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  if (!json.data) throw new Error('No data');
  return json.data;
}

export interface ObjectBrowserScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
  /** Open the detail view for a clicked row. */
  onRowClick: (type: string, id: string) => void;
}

export function ObjectBrowserScreen({ endpoint, getToken, onRowClick }: ObjectBrowserScreenProps): ReactNode {
  const [types, setTypes] = useState<BrowsableType[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      const data = await gql<IntrospectionData>(endpoint, getToken, INTROSPECTION);
      if (mine !== ticket.current) return;
      const derived = deriveBrowsableTypes(data);
      setTypes(derived);
      setSelected(prev => prev ?? derived[0]?.typeName ?? null);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => types.find(t => t.typeName === selected) ?? null, [types, selected]);

  const loadPage = useCallback(
    async (pagination: { first: number; after?: string }): Promise<ConnectionLike<Row>> => {
      if (!active) return { edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: 0 };
      // Cap the selection to the first handful of scalar fields for readability;
      // the detail view shows everything.
      const cols = active.scalarFields.slice(0, 6);
      const selection = ['_id', '_redactedFields', '_consentRestricted', ...cols].join(' ');
      const query = `query($first: Int, $after: String) {
        ${active.listField}(first: $first, after: $after) {
          totalCount
          pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
          edges { cursor node { ${selection} } }
        }
      }`;
      const data = await gql<Record<string, ConnectionLike<Row>>>(endpoint, getToken, query, {
        first: pagination.first,
        after: pagination.after ?? null,
      });
      return data[active.listField]!;
    },
    [active, endpoint, getToken],
  );

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">OPERATE · OBJECTS</span>
          <h1 className="ed-main__title">Object browser</h1>
        </header>
        <div role="alert" className="ed-error">
          <p>Could not load the ontology.</p>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      </main>
    );
  }

  if (status === 'loading' && types.length === 0) {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">OPERATE · OBJECTS</span>
          <h1 className="ed-main__title">Object browser</h1>
        </header>
        <p className="ed-muted" style={{ padding: '0 44px' }}>Discovering object types…</p>
      </main>
    );
  }

  const shown = filter ? types.filter(t => t.typeName.toLowerCase().includes(filter.toLowerCase())) : types;
  const columns = active
    ? active.scalarFields.slice(0, 6).map(f => ({ key: f, header: f }))
    : [];

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">OPERATE · OBJECTS</span>
        <h1 className="ed-main__title">Object browser</h1>
        <p className="ed-main__lede">
          Every object type in the loaded ontology, discovered at runtime. Reads are
          FGA-filtered, field-redacted and consent-gated server-side.
        </p>
      </header>

      <div style={{ padding: '0 44px 40px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
        <div>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter types…"
            aria-label="Filter object types"
            style={{ width: '100%', marginBottom: 12 }}
          />
          <h2 className="ed-subhead">Object types ({shown.length})</h2>
          <ul>
            {shown.map(t => (
              <li key={t.typeName}>
                <button
                  type="button"
                  onClick={() => setSelected(t.typeName)}
                  className={`ed-type-btn${selected === t.typeName ? ' ed-type-btn--selected' : ''}`}
                >
                  {t.typeName}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {active ? (
            <div className="ed-table-wrap">
              <ObjectTable<Row>
                key={active.typeName}
                caption={active.typeName}
                columns={columns}
                load={loadPage}
                rowKey={row => String(row['_id'] ?? '')}
                onRowClick={id => onRowClick(active.typeName, id)}
              />
            </div>
          ) : (
            <p className="ed-muted">No object types are exposed by this deployment.</p>
          )}
        </div>
      </div>
    </main>
  );
}
