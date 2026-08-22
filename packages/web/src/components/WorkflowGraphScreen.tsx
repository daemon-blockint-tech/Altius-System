/**
 * Workflow graph — the provenance view over `/api/v1/workflow/graph`.
 *
 * The gateway has built this graph from the lineage and audit stores since the
 * workflow routes were mounted, but nothing read it: who touched which object,
 * through which action, in what order. It is tenant-scoped server-side; this
 * screen only draws what the endpoint returns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GraphCanvas } from './GraphCanvas.js';
import { authedFetch } from '../widgets/auth-fetch.js';

interface WorkflowGraphNode {
  id: string;
  kind: string;
  label: string;
  type?: string;
}

interface WorkflowGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  timestamp?: string;
}

interface WorkflowGraphPayload {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export function WorkflowGraphScreen(): ReactNode {
  const [graph, setGraph] = useState<WorkflowGraphPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch('/api/v1/workflow/graph');
      const json = (await res.json()) as { data?: WorkflowGraphPayload; error?: { message?: string } };
      if (mine !== ticket.current) return;
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setGraph(json.data ?? { nodes: [], edges: [] });
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedNode = selected ? graph?.nodes.find(n => n.id === selected) ?? null : null;
  const selectedEdges = selected
    ? (graph?.edges ?? []).filter(e => e.from === selected || e.to === selected)
    : [];

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">INVESTIGATE · PROVENANCE</span>
        <h1 className="ed-main__title">Workflow graph</h1>
        <p className="ed-main__lede">
          Which principals, actions and objects a workflow touched, assembled
          server-side from lineage and audit records for your tenant.
        </p>
      </header>

      <div style={{ padding: '0 44px 40px' }}>
        <button type="button" onClick={() => void load()} style={{ marginBottom: 16 }}>
          Refresh
        </button>

        {status === 'error' && (
          <div role="alert" className="ed-error">
            <p>Could not load the workflow graph.</p>
            <p>{error}</p>
          </div>
        )}

        {status === 'loading' && <p className="ed-muted">Loading graph…</p>}

        {status === 'ready' && graph && (
          <>
            <h2 className="ed-subhead">
              {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'} ·{' '}
              {graph.edges.length} edge{graph.edges.length === 1 ? '' : 's'}
            </h2>

            <GraphCanvas
              label="Workflow provenance graph"
              nodes={graph.nodes.map(n => ({ id: n.id, label: n.label, kind: n.type ?? n.kind }))}
              edges={graph.edges.map(e => ({ from: e.from, to: e.to, label: e.kind }))}
              selectedId={selected}
              onNodeClick={setSelected}
            />

            {selectedNode ? (
              <>
                <h2 className="ed-subhead">{selectedNode.label}</h2>
                <p className="ed-muted">
                  <code>{selectedNode.id}</code> · {selectedNode.kind}
                  {selectedNode.type ? ` · ${selectedNode.type}` : ''}
                </p>
                <table className="ed-table">
                  <thead>
                    <tr>
                      <th scope="col">Relation</th>
                      <th scope="col">Other node</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEdges.map(e => (
                      <tr key={e.id}>
                        <td>{e.kind}</td>
                        <td><code>{e.from === selected ? e.to : e.from}</code></td>
                        <td>{e.timestamp ?? '—'}</td>
                      </tr>
                    ))}
                    {selectedEdges.length === 0 && (
                      <tr><td colSpan={3} className="ed-muted">No recorded relations.</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="ed-muted">Select a node to see what it is connected to.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
