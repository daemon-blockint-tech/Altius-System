/**
 * GraphWidget — renders a node-link graph (Vertex-style).
 *
 * Config:
 *   nodes: Array<{ id: string; label: string; type?: string; group?: string }>
 *   links: Array<{ source: string; target: string; label?: string }>
 *   width?: number    (default 600)
 *   height?: number   (default 400)
 *   layout?: 'force' | 'circle' | 'grid'
 *
 * The force layout is a simplified spring-embedder: nodes repel each
 * other, links act as springs. It runs for a fixed number of iterations
 * at render time (no animation loop) to keep the component deterministic
 * and testable.
 *
 * Interaction: click a node to select it; selected node is highlighted
 * and its neighbors are emphasized. This is the core of the Vertex graph
 * exploration UX.
 */

import { useMemo, useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';
import { colorFor } from '../chart-primitives.js';

interface GraphNode { id: string; label: string; type?: string; group?: string; }
interface GraphLink { source: string; target: string; label?: string; }
interface GraphConfig {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
  layout?: 'force' | 'circle' | 'grid';
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function GraphWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as GraphConfig;

  const { nodes: rawNodes, links: rawLinks } = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable] as { nodes?: GraphNode[]; links?: GraphLink[] } | undefined;
      if (varData) return { nodes: varData.nodes ?? [], links: varData.links ?? [] };
    }
    return { nodes: config.nodes ?? [], links: config.links ?? [] };
  }, [config.nodes, config.links, ctx.variables, instance.boundVariable]);

  const width = config.width ?? 600;
  const height = config.height ?? 400;
  const layout = config.layout ?? 'force';

  const [selected, setSelected] = useState<string | null>(null);

  const positionedNodes = useMemo(() => {
    return computeLayout(rawNodes, rawLinks, width, height, layout);
  }, [rawNodes, rawLinks, width, height, layout]);

  if (rawNodes.length === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No graph data</div>;
  }

  // Compute neighbors of selected node
  const neighbors = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>([selected]);
    for (const link of rawLinks) {
      if (link.source === selected) set.add(link.target);
      if (link.target === selected) set.add(link.source);
    }
    return set;
  }, [selected, rawLinks]);

  const nodeById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const n of positionedNodes) m.set(n.id, n);
    return m;
  }, [positionedNodes]);

  const onNodeClick = useCallback((id: string) => {
    setSelected((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="ed-widget ed-graph" data-widget-id={instance.id}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="ed-graph__svg"
        role="img"
        aria-label="Node-link graph"
      >
        {/* Links */}
        {rawLinks.map((link, i) => {
          const src = nodeById.get(link.source);
          const tgt = nodeById.get(link.target);
          if (!src || !tgt) return null;
          const isActive = !selected || selected === link.source || selected === link.target;
          return (
            <g key={i}>
              <line
                x1={src.x} y1={src.y}
                x2={tgt.x} y2={tgt.y}
                stroke={isActive ? '#9ca3af' : '#e5e7eb'}
                strokeWidth={isActive ? 1.5 : 1}
              />
              {link.label && isActive && (
                <text
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2}
                  textAnchor="middle"
                  dy="0.32em"
                  fontSize={9}
                  fill="#6b7280"
                  className="ed-graph__link-label"
                >
                  {link.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positionedNodes.map((node, i) => {
          const isSelected = node.id === selected;
          const isNeighbor = neighbors.has(node.id);
          const dim = selected && !isNeighbor;
          const color = colorFor(node.group ? hashStr(node.group) : i);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="ed-graph__node"
              onClick={() => onNodeClick(node.id)}
              style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1 }}
            >
              <circle
                r={isSelected ? 10 : 7}
                fill={isSelected ? color : '#fff'}
                stroke={color}
                strokeWidth={isSelected ? 3 : 2}
              />
              <text
                y={-12}
                textAnchor="middle"
                fontSize={10}
                fill="#374151"
                fontWeight={isSelected ? 600 : 400}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      {selected && (
        <div className="ed-graph__detail">
          <strong>{rawNodes.find((n) => n.id === selected)?.label}</strong>
          <span> · {neighbors.size - 1} neighbor(s)</span>
        </div>
      )}
    </div>
  );
}

// ── Layout algorithms ─────────────────────────────────────────

function computeLayout(
  nodes: GraphNode[],
  links: GraphLink[],
  width: number,
  height: number,
  layout: 'force' | 'circle' | 'grid',
): PositionedNode[] {
  if (nodes.length === 0) return [];

  if (layout === 'circle') {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - 40;
    return nodes.map((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 };
    });
  }

  if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const cellW = width / cols;
    const cellH = height / Math.ceil(nodes.length / cols);
    return nodes.map((n, i) => ({
      ...n,
      x: (i % cols) * cellW + cellW / 2,
      y: Math.floor(i / cols) * cellH + cellH / 2,
      vx: 0,
      vy: 0,
    }));
  }

  // Force layout (simplified spring-embedder)
  return forceLayout(nodes, links, width, height);
}

function forceLayout(
  nodes: GraphNode[],
  links: GraphLink[],
  width: number,
  height: number,
): PositionedNode[] {
  const N = nodes.length;
  const positioned: PositionedNode[] = nodes.map((n) => ({
    ...n,
    x: width / 2 + (Math.random() - 0.5) * width * 0.6,
    y: height / 2 + (Math.random() - 0.5) * height * 0.6,
    vx: 0,
    vy: 0,
  }));

  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  const linkPairs = links
    .map((l) => [idIndex.get(l.source), idIndex.get(l.target)] as const)
    .filter(([s, t]) => s !== undefined && t !== undefined) as Array<[number, number]>;

  // Simulation parameters
  const REPULSION = 800;
  const SPRING = 0.08;
  const SPRING_LENGTH = 80;
  const DAMPING = 0.85;
  const CENTER_FORCE = 0.02;
  const ITERATIONS = 200;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion (all pairs)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const ni = positioned[i]!;
        const nj = positioned[j]!;
        const dx = ni.x - nj.x;
        const dy = ni.y - nj.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        ni.vx += fx;
        ni.vy += fy;
        nj.vx -= fx;
        nj.vy -= fy;
      }
    }

    // Spring (links)
    for (const [s, t] of linkPairs) {
      const ns = positioned[s]!;
      const nt = positioned[t]!;
      const dx = nt.x - ns.x;
      const dy = nt.y - ns.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - SPRING_LENGTH) * SPRING;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      ns.vx += fx;
      ns.vy += fy;
      nt.vx -= fx;
      nt.vy -= fy;
    }

    // Center gravity + integrate
    for (const n of positioned) {
      n.vx += (width / 2 - n.x) * CENTER_FORCE;
      n.vy += (height / 2 - n.y) * CENTER_FORCE;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      // Keep in bounds
      n.x = Math.max(30, Math.min(width - 30, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
    }
  }

  return positioned;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
