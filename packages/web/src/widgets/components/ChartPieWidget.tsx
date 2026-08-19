/**
 * ChartPieWidget — renders a pie or donut chart.
 *
 * Config:
 *   data: Array<{ label: string; value: number; color?: string }>
 *   donut?: boolean       — render as donut (hole in center)
 *   innerRadius?: number  — donut hole ratio (0-1, default 0.5)
 *   width?: number        (default 400)
 *   height?: number       (default 400)
 *   showLabels?: boolean  — render labels on slices
 */

import { useMemo } from 'react';
import type { WidgetProps } from '../types.js';
import { arcPath, colorFor } from '../chart-primitives.js';

interface PieSlice { label: string; value: number; color?: string; }
interface ChartPieConfig {
  data: PieSlice[];
  donut?: boolean;
  innerRadius?: number;
  width?: number;
  height?: number;
  showLabels?: boolean;
}

export function ChartPieWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ChartPieConfig;

  const data: PieSlice[] = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable];
      if (Array.isArray(varData)) return varData as PieSlice[];
    }
    return config.data ?? [];
  }, [config.data, ctx.variables, instance.boundVariable]);

  const width = config.width ?? 400;
  const height = config.height ?? 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 20;
  const innerR = config.donut ? radius * (config.innerRadius ?? 0.5) : 0;
  const showLabels = config.showLabels ?? true;

  if (data.length === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No data</div>;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>All values are zero</div>;
  }

  let angle = 0;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const labelR = radius + 15;
    const labelRad = (midAngle - 90) * Math.PI / 180;
    const labelX = cx + labelR * Math.cos(labelRad);
    const labelY = cy + labelR * Math.sin(labelRad);
    return {
      ...d,
      startAngle,
      endAngle,
      midAngle,
      labelX,
      labelY,
      color: d.color ?? colorFor(i),
      percent: (d.value / total) * 100,
    };
  });

  return (
    <div className="ed-widget ed-chart-pie" data-widget-id={instance.id}>
      <svg viewBox={`0 0 ${width} ${height}`} className="ed-chart-pie__svg" role="img" aria-label="Pie chart">
        {slices.map((s, i) => (
          <g key={i}>
            <path
              d={arcPath(cx, cy, radius, s.startAngle, s.endAngle)}
              fill={s.color}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {config.donut && (
              <path
                d={arcPath(cx, cy, innerR, s.startAngle, s.endAngle)}
                fill="var(--ed-surface, #fff)"
                stroke="none"
              />
            )}
            {showLabels && s.percent > 3 && (
              <text
                x={s.labelX}
                y={s.labelY}
                textAnchor="middle"
                dy="0.32em"
                fontSize={11}
                fill="#374151"
              >
                {s.label} ({s.percent.toFixed(0)}%)
              </text>
            )}
          </g>
        ))}
        {config.donut && (
          <text x={cx} y={cy} textAnchor="middle" dy="0.32em" fontSize={20} fontWeight={600} fill="#111">
            {formatTotal(total)}
          </text>
        )}
      </svg>
      {/* Legend */}
      <div className="ed-chart__legend">
        {slices.map((s, i) => (
          <span key={i} className="ed-chart__legend-item">
            <span className="ed-chart__legend-dot" style={{ background: s.color }} />
            {s.label}: {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatTotal(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}
