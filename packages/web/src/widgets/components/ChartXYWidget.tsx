/**
 * ChartXYWidget — renders a line, scatter, or bar chart on an XY axis.
 *
 * Config:
 *   series: Array<{
 *     name: string
 *     type: 'line' | 'scatter' | 'bar'
 *     data: Array<{ x: number; y: number }>  — or bound variable
 *     color?: string
 *   }>
 *   xLabel?: string
 *   yLabel?: string
 *   xType?: 'linear' | 'time'
 *   width?: number   (default 600)
 *   height?: number  (default 400)
 *
 * Data can come from config.series or from a bound variable that
 * resolves to an array of { x, y } points.
 */

import { useMemo } from 'react';
import type { WidgetProps } from '../types.js';
import { linearScale, extent, niceTicks, formatTick, linePath, colorFor } from '../chart-primitives.js';

interface SeriesPoint { x: number; y: number; }
interface Series {
  name: string;
  type: 'line' | 'scatter' | 'bar';
  data: SeriesPoint[];
  color?: string;
}
interface ChartXYConfig {
  series: Series[];
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
}

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

export function ChartXYWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ChartXYConfig;

  // Resolve series from config or bound variable
  const series: Series[] = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable];
      if (Array.isArray(varData)) {
        return [{ name: 'Series 1', type: 'line' as const, data: varData as SeriesPoint[] }];
      }
    }
    return config.series ?? [];
  }, [config.series, ctx.variables, instance.boundVariable]);

  const width = config.width ?? 600;
  const height = config.height ?? 400;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  if (series.length === 0 || series.every((s) => s.data.length === 0)) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No data</div>;
  }

  // Compute domains
  const allPoints = series.flatMap((s) => s.data);
  const [xMin, xMax] = extent(allPoints.map((p) => p.x));
  const [yMin, yMax] = extent(allPoints.map((p) => p.y));
  const yPad = (yMax - yMin) * 0.1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const xScale = linearScale(xMin, xMax, 0, innerW);
  const yScale = linearScale(yLo, yHi, innerH, 0);
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yLo, yHi, 5);

  return (
    <div className="ed-widget ed-chart-xy" data-widget-id={instance.id}>
      <svg viewBox={`0 0 ${width} ${height}`} className="ed-chart-xy__svg" role="img" aria-label="XY chart">
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Y axis */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yScale(t)} y2={yScale(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={-8} y={yScale(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b7280">{formatTick(t)}</text>
            </g>
          ))}

          {/* X axis */}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={xScale(t)} x2={xScale(t)} y1={0} y2={innerH} stroke="#f3f4f6" strokeWidth={1} />
              <text x={xScale(t)} y={innerH + 18} textAnchor="middle" fontSize={11} fill="#6b7280">{formatTick(t)}</text>
            </g>
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />

          {/* Series */}
          {series.map((s, si) => {
            const color = s.color ?? colorFor(si);
            if (s.type === 'scatter') {
              return (
                <g key={si}>
                  {s.data.map((p, i) => (
                    <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={3} fill={color} opacity={0.8} />
                  ))}
                </g>
              );
            }
            if (s.type === 'bar') {
              const barW = innerW / s.data.length * 0.7;
              return (
                <g key={si}>
                  {s.data.map((p, i) => (
                    <rect
                      key={i}
                      x={xScale(p.x) - barW / 2}
                      y={yScale(p.y)}
                      width={barW}
                      height={innerH - yScale(p.y)}
                      fill={color}
                      opacity={0.85}
                    />
                  ))}
                </g>
              );
            }
            // line
            const pts = s.data.map((p) => ({ x: xScale(p.x), y: yScale(p.y) }));
            return (
              <g key={si}>
                <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={2} />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
                ))}
              </g>
            );
          })}

          {/* Axis labels */}
          {config.xLabel && (
            <text x={innerW / 2} y={innerH + 35} textAnchor="middle" fontSize={12} fill="#374151">{config.xLabel}</text>
          )}
          {config.yLabel && (
            <text x={-innerH / 2} y={-35} textAnchor="middle" fontSize={12} fill="#374151"
              transform="rotate(-90)" >{config.yLabel}</text>
          )}
        </g>
      </svg>
      {/* Legend */}
      {series.length > 1 && (
        <div className="ed-chart__legend">
          {series.map((s, i) => (
            <span key={i} className="ed-chart__legend-item">
              <span className="ed-chart__legend-dot" style={{ background: s.color ?? colorFor(i) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
