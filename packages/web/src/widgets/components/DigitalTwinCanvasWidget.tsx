/**
 * DigitalTwinCanvasWidget — renders an object-backed process diagram.
 *
 * This is the Vertex-style digital twin visualization: nodes represent
 * ObjectType instances (e.g. machines, facilities, processes) and links
 * represent relationships. Unlike the basic GraphWidget, this widget:
 *   - Binds nodes to live object data (status, metrics, properties)
 *   - Supports what-if simulation overlays (scenario branching)
 *   - Supports media layers (images, video feeds on nodes)
 *   - Supports status-based styling (green = healthy, red = alert)
 *
 * Config:
 *   nodes: Array<{
 *     id: string
 *     label: string
 *     objectType?: string
 *     objectId?: string
 *     statusProperty?: string     — property to read for status color
 *     metricProperty?: string     — property to read for metric display
 *     mediaUrl?: string           — image/video overlay
 *     mediaType?: 'image' | 'video'
 *     x?: number                  — fixed position (optional)
 *     y?: number
 *     group?: string
 *   }>
 *   links: Array<{ source: string; target: string; label?: string; flowProperty?: string }>
 *   width?: number
 *   height?: number
 *   layout?: 'force' | 'circle' | 'grid' | 'fixed'
 *   scenarioMode?: boolean        — show what-if controls
 *   showMedia?: boolean           — render media overlays
 *   statusColors?: Record<string, string>  — status → color mapping
 */

import { useMemo, useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';
import { colorFor } from '../chart-primitives.js';

interface DTNode {
  id: string;
  label: string;
  objectType?: string;
  objectId?: string;
  statusProperty?: string;
  metricProperty?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  x?: number;
  y?: number;
  group?: string;
}
interface DTLink {
  source: string;
  target: string;
  label?: string;
  flowProperty?: string;
}
interface DigitalTwinConfig {
  nodes: DTNode[];
  links: DTLink[];
  width?: number;
  height?: number;
  layout?: 'force' | 'circle' | 'grid' | 'fixed';
  scenarioMode?: boolean;
  showMedia?: boolean;
  statusColors?: Record<string, string>;
}

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  healthy: '#16a34a',
  running: '#16a34a',
  ok: '#16a34a',
  warning: '#ca8a04',
  degraded: '#ca8a04',
  alert: '#dc2626',
  error: '#dc2626',
  failed: '#dc2626',
  stopped: '#6b7280',
  offline: '#6b7280',
};

interface PositionedNode extends DTNode {
  px: number;
  py: number;
}

export function DigitalTwinCanvasWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as DigitalTwinConfig;
  const width = config.width ?? 700;
  const height = config.height ?? 500;
  const layout = config.layout ?? 'force';
  const scenarioMode = config.scenarioMode ?? false;
  const showMedia = config.showMedia ?? false;
  const statusColors = { ...DEFAULT_STATUS_COLORS, ...config.statusColors };

  const [selected, setSelected] = useState<string | null>(null);
  const [scenarioOverrides, setScenarioOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [scenarioActive, setScenarioActive] = useState(false);

  const { nodes, links } = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable] as { nodes?: DTNode[]; links?: DTLink[] } | undefined;
      if (varData) return { nodes: varData.nodes ?? [], links: varData.links ?? [] };
    }
    return { nodes: config.nodes ?? [], links: config.links ?? [] };
  }, [config.nodes, config.links, ctx.variables, instance.boundVariable]);

  const positionedNodes = useMemo(() => {
    return computeDTLayout(nodes, links, width, height, layout);
  }, [nodes, links, width, height, layout]);

  const nodeById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const n of positionedNodes) m.set(n.id, n);
    return m;
  }, [positionedNodes]);

  const getStatusColor = useCallback((node: DTNode): string => {
    if (!node.statusProperty) return colorFor(0);
    // Check scenario override first
    const override = scenarioActive ? scenarioOverrides[node.id] : null;
    const statusValue = String(override?.[node.statusProperty] ?? 'unknown').toLowerCase();
    return statusColors[statusValue] ?? '#6b7280';
  }, [scenarioActive, scenarioOverrides, statusColors]);

  const getMetricValue = useCallback((node: DTNode): string | null => {
    if (!node.metricProperty) return null;
    const override = scenarioActive ? scenarioOverrides[node.id] : null;
    const val = override?.[node.metricProperty];
    if (val !== undefined && val !== null) return String(val);
    return null;
  }, [scenarioActive, scenarioOverrides]);

  const handleScenarioOverride = useCallback((nodeId: string, property: string, value: unknown) => {
    setScenarioOverrides((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], [property]: value },
    }));
  }, []);

  const selectedNode = selected ? nodeById.get(selected) : null;

  if (nodes.length === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No digital twin data</div>;
  }

  return (
    <div className="ed-widget ed-digital-twin" data-widget-id={instance.id}>
      {scenarioMode && (
        <div className="ed-digital-twin__scenario-bar">
          <button
            className={`ed-digital-twin__scenario-btn${scenarioActive ? ' ed-digital-twin__scenario-btn--active' : ''}`}
            onClick={() => setScenarioActive((v) => !v)}
          >
            {scenarioActive ? '▶ What-if: ON' : '⏸ What-if: OFF'}
          </button>
          {scenarioActive && Object.keys(scenarioOverrides).length > 0 && (
            <button
              className="ed-digital-twin__scenario-btn"
              onClick={() => setScenarioOverrides({})}
            >
              Reset overrides
            </button>
          )}
          {scenarioActive && (
            <span className="ed-digital-twin__scenario-count">
              {Object.keys(scenarioOverrides).length} override(s)
            </span>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="ed-digital-twin__svg" role="img" aria-label="Digital twin process diagram">
        {/* Links */}
        {links.map((link, i) => {
          const src = nodeById.get(link.source);
          const tgt = nodeById.get(link.target);
          if (!src || !tgt) return null;
          const isActive = !selected || selected === link.source || selected === link.target;
          return (
            <g key={i}>
              <line
                x1={src.px} y1={src.py}
                x2={tgt.px} y2={tgt.py}
                stroke={isActive ? '#9ca3af' : '#e5e7eb'}
                strokeWidth={2}
                markerEnd="url(#dt-arrow)"
              />
              {link.label && isActive && (
                <text
                  x={(src.px + tgt.px) / 2}
                  y={(src.py + tgt.py) / 2}
                  textAnchor="middle"
                  dy="-0.3em"
                  fontSize={9}
                  fill="#6b7280"
                  className="ed-digital-twin__link-label"
                >
                  {link.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Arrow marker definition */}
        <defs>
          <marker id="dt-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#9ca3af" />
          </marker>
        </defs>
        {/* Nodes */}
        {positionedNodes.map((node) => {
          const isSelected = node.id === selected;
          const color = getStatusColor(node);
          const metric = getMetricValue(node);
          return (
            <g
              key={node.id}
              transform={`translate(${node.px}, ${node.py})`}
              className="ed-digital-twin__node"
              onClick={() => setSelected((prev) => (prev === node.id ? null : node.id))}
              style={{ cursor: 'pointer' }}
            >
              {/* Media overlay */}
              {showMedia && node.mediaUrl && node.mediaType === 'image' && (
                <image
                  href={node.mediaUrl}
                  x={-20}
                  y={-20}
                  width={40}
                  height={40}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath="circle(20px at 0 0)"
                />
              )}
              {/* Status circle */}
              <circle
                r={isSelected ? 22 : 18}
                fill={color}
                fillOpacity={0.15}
                stroke={color}
                strokeWidth={isSelected ? 3 : 2}
              />
              {/* Inner node */}
              <circle r={isSelected ? 12 : 9} fill={color} />
              {/* Label */}
              <text
                y={isSelected ? -28 : -22}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isSelected ? 600 : 400}
                fill="#374151"
              >
                {node.label}
              </text>
              {/* Metric */}
              {metric && (
                <text
                  y={isSelected ? 30 : 24}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  className="ed-digital-twin__metric"
                >
                  {metric}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Detail panel for selected node */}
      {selectedNode && (
        <div className="ed-digital-twin__detail">
          <div className="ed-digital-twin__detail-header">
            <strong>{selectedNode.label}</strong>
            {selectedNode.objectType && (
              <span className="ed-digital-twin__detail-type">{selectedNode.objectType}</span>
            )}
          </div>
          {selectedNode.statusProperty && (
            <div className="ed-digital-twin__detail-row">
              <span className="ed-digital-twin__detail-label">Status:</span>
              <span
                className="ed-digital-twin__detail-status"
                style={{ color: getStatusColor(selectedNode) }}
              >
                {String(scenarioActive ? (scenarioOverrides[selectedNode.id]?.[selectedNode.statusProperty] ?? '—') : 'live')}
              </span>
            </div>
          )}
          {selectedNode.metricProperty && (
            <div className="ed-digital-twin__detail-row">
              <span className="ed-digital-twin__detail-label">{selectedNode.metricProperty}:</span>
              <span>{getMetricValue(selectedNode) ?? '—'}</span>
            </div>
          )}
          {/* What-if override controls */}
          {scenarioMode && scenarioActive && selectedNode.statusProperty && (
            <div className="ed-digital-twin__whatif">
              <label className="ed-digital-twin__whatif-label">Override {selectedNode.statusProperty}:</label>
              <select
                className="ed-digital-twin__whatif-select"
                value={String(scenarioOverrides[selectedNode.id]?.[selectedNode.statusProperty] ?? '')}
                onChange={(e) => handleScenarioOverride(selectedNode.id, selectedNode.statusProperty!, e.target.value)}
              >
                <option value="">— no override —</option>
                <option value="healthy">healthy</option>
                <option value="warning">warning</option>
                <option value="alert">alert</option>
                <option value="stopped">stopped</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────

function computeDTLayout(
  nodes: DTNode[],
  links: DTLink[],
  width: number,
  height: number,
  layout: 'force' | 'circle' | 'grid' | 'fixed',
): PositionedNode[] {
  if (nodes.length === 0) return [];

  if (layout === 'fixed') {
    return nodes.map((n) => ({
      ...n,
      px: n.x ?? width / 2,
      py: n.y ?? height / 2,
    }));
  }

  if (layout === 'circle') {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - 50;
    return nodes.map((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      return { ...n, px: cx + r * Math.cos(angle), py: cy + r * Math.sin(angle) };
    });
  }

  if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const cellW = width / cols;
    const cellH = height / Math.ceil(nodes.length / cols);
    return nodes.map((n, i) => ({
      ...n,
      px: (i % cols) * cellW + cellW / 2,
      py: Math.floor(i / cols) * cellH + cellH / 2,
    }));
  }

  // Force layout (simplified)
  return forceDTLayout(nodes, links, width, height);
}

function forceDTLayout(
  nodes: DTNode[],
  links: DTLink[],
  width: number,
  height: number,
): PositionedNode[] {
  const positioned: PositionedNode[] = nodes.map((n) => ({
    ...n,
    px: width / 2 + (Math.random() - 0.5) * width * 0.5,
    py: height / 2 + (Math.random() - 0.5) * height * 0.5,
  }));

  const idIndex = new Map<string, number>();
  nodes.forEach((n, i) => idIndex.set(n.id, i));

  const linkPairs = links
    .map((l) => [idIndex.get(l.source), idIndex.get(l.target)] as const)
    .filter(([s, t]) => s !== undefined && t !== undefined) as Array<[number, number]>;

  const REPULSION = 1200;
  const SPRING = 0.06;
  const SPRING_LENGTH = 100;
  const DAMPING = 0.85;
  const CENTER_FORCE = 0.02;
  const ITERATIONS = 200;

  const velocities = nodes.map(() => ({ vx: 0, vy: 0 }));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const dx = positioned[i]!.px - positioned[j]!.px;
        const dy = positioned[i]!.py - positioned[j]!.py;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        velocities[i]!.vx += fx;
        velocities[i]!.vy += fy;
        velocities[j]!.vx -= fx;
        velocities[j]!.vy -= fy;
      }
    }

    for (const [s, t] of linkPairs) {
      const dx = positioned[t]!.px - positioned[s]!.px;
      const dy = positioned[t]!.py - positioned[s]!.py;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - SPRING_LENGTH) * SPRING;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      velocities[s]!.vx += fx;
      velocities[s]!.vy += fy;
      velocities[t]!.vx -= fx;
      velocities[t]!.vy -= fy;
    }

    for (let i = 0; i < positioned.length; i++) {
      const n = positioned[i]!;
      const v = velocities[i]!;
      v.vx += (width / 2 - n.px) * CENTER_FORCE;
      v.vy += (height / 2 - n.py) * CENTER_FORCE;
      v.vx *= DAMPING;
      v.vy *= DAMPING;
      n.px += v.vx;
      n.py += v.vy;
      n.px = Math.max(40, Math.min(width - 40, n.px));
      n.py = Math.max(40, Math.min(height - 40, n.py));
    }
  }

  return positioned;
}
