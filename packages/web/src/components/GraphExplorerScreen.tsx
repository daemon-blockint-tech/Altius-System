/**
 * Graph explorer — traverse the object graph from a starting object.
 *
 * Uses the GraphQL `traverse{Type}` query to walk links from a starting
 * object. Shows nodes and edges in a simple list-based layout — a full
 * force-directed graph visualization is a future UI enhancement, but the
 * data is live and governed.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface TraversalNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

interface TraversalEdge {
  from: string;
  to: string;
  linkType: string;
}

interface TraversalResult {
  nodes: TraversalNode[];
  edges: TraversalEdge[];
  totalCount: number;
}

export interface GraphExplorerScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

export function GraphExplorerScreen({ endpoint, getToken }: GraphExplorerScreenProps): ReactNode {
  const [startType, setStartType] = useState('Patient');
  const [startId, setStartId] = useState('');
  const [linkType, setLinkType] = useState('AdmittedTo');
  const [direction, setDirection] = useState('OUTBOUND');
  const [result, setResult] = useState<TraversalResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const traverse = useCallback(async () => {
    if (!startId) return;
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      const token = getToken ? await getToken() : '';
      const queryName = `traverse${startType}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          query: `query($startId: ID!, $steps: [TraversalStepInput!]!, $limit: Int) { ${queryName}(startId: $startId, steps: $steps, limit: $limit) { nodes { id type properties } edges { from to linkType } totalCount } }`,
          variables: {
            startId,
            steps: [{ linkType, direction }],
            limit: 50,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: Record<string, TraversalResult>; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      const data = json.data?.[queryName];
      if (mine !== ticket.current) return;
      setResult(data ?? null);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken, startType, startId, linkType, direction]);

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">INVESTIGATE · GRAPH</span>
        <h1 className="ed-main__title">Graph explorer</h1>
        <p className="ed-main__lede">
          Traverse the object graph from a starting object. Each traversal step follows
          a link type in a direction — the result is FGA-scoped and field-redacted.
        </p>
      </header>

            <div className="ed-table-wrap">
        <div
          className="ed-filter-bar"
          style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 24 }}
        >
          <label>
            Start type
            <input type="text" value={startType} onChange={(e) => setStartType(e.target.value)} placeholder="Patient" />
          </label>
          <label>
            Start ID
            <input type="text" value={startId} onChange={(e) => setStartId(e.target.value)} placeholder="pat-001" />
          </label>
          <label>
            Link type
            <input type="text" value={linkType} onChange={(e) => setLinkType(e.target.value)} placeholder="AdmittedTo" />
          </label>
          <label>
            Direction
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="OUTBOUND">OUTBOUND</option>
              <option value="INBOUND">INBOUND</option>
            </select>
          </label>
          <button type="button" onClick={() => void traverse()}>Traverse</button>
        </div>

        {status === 'error' && <div role="alert"><p>{error}</p></div>}
        {status === 'loading' && <p aria-live="polite">Traversing…</p>}

        {result && status === 'ready' && (
          <div>
                        <h2 className="ed-subhead">
              Nodes ({result.nodes.length}) — {result.totalCount} total
            </h2>
            <table className="ed-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Properties</th>
                </tr>
              </thead>
              <tbody>
                {result.nodes.map((node) => (
                  <tr key={node.id}>
                    <td><code>{node.id}</code></td>
                    <td>{node.type}</td>
                    <td>
                      <pre style={{ fontSize: '0.85em', margin: 0, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {JSON.stringify(node.properties, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

                        <h2 className="ed-subhead">
              Edges ({result.edges.length})
            </h2>
            <table className="ed-table">
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Link type</th>
                </tr>
              </thead>
              <tbody>
                {result.edges.map((edge, i) => (
                  <tr key={i}>
                    <td><code>{edge.from}</code></td>
                    <td><code>{edge.to}</code></td>
                    <td>{edge.linkType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status === 'idle' && <p style={{ opacity: 0.5 }}>Enter a start type and ID, then click Traverse.</p>}
      </div>
    </main>
  );
}
