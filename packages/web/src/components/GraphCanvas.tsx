/**
 * Graph canvas — node-link view for the governed graphs the platform already
 * serves: object traversals (GraphQL `traverse*`) and the workflow/lineage
 * provenance graph (`/api/v1/workflow/graph`).
 *
 * The layout is deterministic and layered — depth from the roots on the x
 * axis, siblings stacked on y — so the same graph always draws the same way
 * and a screenshot is comparable between runs. No physics, no drag: these
 * graphs are read-only evidence, and a force simulation would move the nodes
 * out from under whoever is reading them.
 *
 * Plain SVG for the edges with absolutely-positioned cards for the nodes, so
 * node labels stay real text (selectable, themeable, wrapping) instead of
 * SVG <text> the theme cannot style.
 */

import type { ReactNode } from 'react';

export interface GraphCanvasNode {
  id: string;
  label: string;
  /** Free-form category — drives the accent colour and the node's caption. */
  kind?: string;
}

export interface GraphCanvasEdge {
  from: string;
  to: string;
  label?: string;
}

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 60;
const GAP_X = 72;
const GAP_Y = 20;
const PAD = 24;

export interface Placement {
  id: string;
  x: number;
  y: number;
}

export interface GraphLayout {
  placements: Placement[];
  width: number;
  height: number;
}

/**
 * Layer nodes by their longest path from a root.
 *
 * Roots are the nodes nothing points at; a graph that is all cycles has none,
 * so the first node is used instead — otherwise a cyclic graph would render
 * nothing at all. Depth is capped at the node count, which is the longest
 * possible acyclic path and therefore also the termination guard for cycles.
 */
export function layoutGraph(nodes: GraphCanvasNode[], edges: GraphCanvasEdge[]): GraphLayout {
  if (nodes.length === 0) return { placements: [], width: 0, height: 0 };

  const known = new Set(nodes.map(n => n.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    // Edges to or from nodes outside the returned set (a truncated traversal,
    // or a node the caller is not allowed to see) do not affect the layout.
    if (!known.has(e.from) || !known.has(e.to) || e.from === e.to) continue;
    const list = outgoing.get(e.from);
    if (list) list.push(e.to);
    else outgoing.set(e.from, [e.to]);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const depth = new Map<string, number>(nodes.map(n => [n.id, 0]));
  const roots = nodes.filter(n => (indegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const queue = roots.length > 0 ? [...roots] : [nodes[0]!.id];
  const maxDepth = nodes.length - 1;

  while (queue.length > 0) {
    const id = queue.shift()!;
    const here = depth.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      const candidate = here + 1;
      if (candidate > maxDepth) continue; // cycle guard, and the deepest a DAG can go
      if (candidate > (depth.get(next) ?? 0)) {
        depth.set(next, candidate);
        queue.push(next);
      }
    }
  }

  // Column order follows the input order, so the caller controls the reading
  // order within a layer.
  const columns = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const col = columns.get(d);
    if (col) col.push(n.id);
    else columns.set(d, [n.id]);
  }

  const placements: Placement[] = [];
  let widest = 0;
  for (const [d, ids] of columns) {
    ids.forEach((id, row) => {
      placements.push({
        id,
        x: PAD + d * (NODE_WIDTH + GAP_X),
        y: PAD + row * (NODE_HEIGHT + GAP_Y),
      });
    });
    widest = Math.max(widest, ids.length);
  }

  const depths = [...columns.keys()];
  const lastColumn = depths.length > 0 ? Math.max(...depths) : 0;
  return {
    placements,
    width: PAD * 2 + (lastColumn + 1) * NODE_WIDTH + lastColumn * GAP_X,
    height: PAD * 2 + widest * NODE_HEIGHT + Math.max(0, widest - 1) * GAP_Y,
  };
}

/** Cubic bezier between two placed nodes, left edge to right edge. */
function edgePath(from: Placement, to: Placement): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const mid = (x2 - x1) * 0.5;
  return `M${x1},${y1} C${x1 + mid},${y1} ${x2 - mid},${y2} ${x2},${y2}`;
}

export interface GraphCanvasProps {
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
  /** Highlighted node, e.g. the traversal root or the selected node. */
  selectedId?: string | null;
  onNodeClick?: (id: string) => void;
  /** Accessible name for the scroll region. */
  label: string;
}

export function GraphCanvas({ nodes, edges, selectedId, onNodeClick, label }: GraphCanvasProps): ReactNode {
  const layout = layoutGraph(nodes, edges);
  const byId = new Map(layout.placements.map(p => [p.id, p]));

  if (nodes.length === 0) {
    return <p className="ed-muted">No nodes to draw.</p>;
  }

  return (
    <div className="al-graph" role="group" aria-label={label} tabIndex={0}>
      <div className="al-graph__content" style={{ width: layout.width, height: layout.height }}>
        <svg className="al-graph__edges" width={layout.width} height={layout.height} aria-hidden="true">
          {edges.map((e, i) => {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return null;
            return (
              <path key={`${e.from}->${e.to}:${i}`} className="al-graph__edge" d={edgePath(from, to)} />
            );
          })}
        </svg>

        {nodes.map(node => {
          const at = byId.get(node.id);
          if (!at) return null;
          const selected = node.id === selectedId;
          return (
            <button
              key={node.id}
              type="button"
              className={`al-graph__node${selected ? ' al-graph__node--selected' : ''}`}
              style={{ left: at.x, top: at.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
              onClick={() => onNodeClick?.(node.id)}
              aria-pressed={selected}
            >
              {node.kind && <span className="al-graph__node-kind">{node.kind}</span>}
              <span className="al-graph__node-label">{node.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
