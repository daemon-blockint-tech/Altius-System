/**
 * TimeSeriesWidget — renders a time series chart with timestamp-value pairs.
 *
 * Config:
 *   data: Array<{ timestamp: string | number; value: number }>
 *   — or bound variable resolving to the same shape
 *   label?: string          — series label
 *   color?: string
 *   width?: number          (default 600)
 *   height?: number         (default 300)
 *   showArea?: boolean      — fill area under the line (default true)
 *   showPoints?: boolean    — show data point markers (default true)
 *   yLabel?: string
 *   timeSpan?: 'date' | 'datetime' | 'time'  — tick format
 *
 * The chart renders as an SVG line chart with a time-based X axis.
 * This is the core of the Time Series Analysis widget and the
 * Quiver TS workflows.
 */

import { useMemo } from 'react';
import type { WidgetProps } from '../types.js';
import { timeScale, linearScale, extent, niceTicks, formatTick, formatDateTick, linePath, areaPath, colorFor } from '../chart-primitives.js';

interface TSPoint { timestamp: string | number; value: number; }
interface TimeSeriesConfig {
  data?: TSPoint[];
  label?: string;
  color?: string;
  width?: number;
  height?: number;
  showArea?: boolean;
  showPoints?: boolean;
  yLabel?: string;
  timeSpan?: 'date' | 'datetime' | 'time';
}

const MARGIN = { top: 20, right: 20, bottom: 50, left: 55 };

export function TimeSeriesWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as TimeSeriesConfig;

  const data: TSPoint[] = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable];
      if (Array.isArray(varData)) return varData as TSPoint[];
    }
    return config.data ?? [];
  }, [config.data, ctx.variables, instance.boundVariable]);

  const width = config.width ?? 600;
  const height = config.height ?? 300;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const showArea = config.showArea ?? true;
  const showPoints = config.showPoints ?? true;
  const timeSpan = config.timeSpan ?? 'date';
  const color = config.color ?? colorFor(0);

  const { points, xTicks, yTicks, xScale, yScale } = useMemo(() => {
    if (data.length === 0) {
      return { points: [] as Array<{ x: number; y: number; d: Date; v: number }>, xTicks: [] as number[], yTicks: [] as number[], xScale: (_: Date) => 0, yScale: (_: number) => 0 };
    }

    const dates = data.map((d) => new Date(d.timestamp));
    const values = data.map((d) => d.value);

    const xMinD = dates[0]!;
    const xMaxD = dates[dates.length - 1]!;
    const [yMin, yMax] = extent(values);
    const yPad = (yMax - yMin) * 0.1 || 1;
    const yLo = yMin - yPad;
    const yHi = yMax + yPad;

    const xs = timeScale(xMinD, xMaxD, 0, innerW);
    const ys = linearScale(yLo, yHi, innerH, 0);

    const pts = data.map((d, i) => ({
      x: xs(new Date(d.timestamp)),
      y: ys(d.value),
      d: dates[i]!,
      v: d.value,
    }));

    // X ticks: ~6 evenly spaced dates
    const xTickValues: number[] = [];
    const span = xMaxD.getTime() - xMinD.getTime();
    for (let i = 0; i <= 5; i++) {
      const t = xMinD.getTime() + (span * i) / 5;
      xTickValues.push(t);
    }

    return {
      points: pts,
      xTicks: xTickValues,
      yTicks: niceTicks(yLo, yHi, 5),
      xScale: xs,
      yScale: ys,
    };
  }, [data, innerW, innerH]);

  if (data.length === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No time series data</div>;
  }

  if (data.length === 1) {
    return (
      <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>
        Single data point at {new Date(data[0]!.timestamp).toLocaleString()}: {data[0]!.value}
      </div>
    );
  }

  const linePts = points.map((p) => ({ x: p.x, y: p.y }));

  return (
    <div className="ed-widget ed-time-series" data-widget-id={instance.id}>
      <svg viewBox={`0 0 ${width} ${height}`} className="ed-time-series__svg" role="img" aria-label="Time series chart">
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Y axis grid + labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yScale(t)} y2={yScale(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={-8} y={yScale(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b7280">{formatTick(t)}</text>
            </g>
          ))}

          {/* X axis labels */}
          {xTicks.map((t) => {
            const d = new Date(t);
            const x = xScale(d);
            return (
              <g key={t}>
                <line x1={x} x2={x} y1={0} y2={innerH} stroke="#f3f4f6" strokeWidth={1} />
                <text x={x} y={innerH + 18} textAnchor="middle" fontSize={10} fill="#6b7280">
                  {formatDateTick(d, timeSpan)}
                </text>
              </g>
            );
          })}

          {/* Axis lines */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />

          {/* Area */}
          {showArea && (
            <path
              d={areaPath(linePts, innerH)}
              fill={color}
              opacity={0.15}
            />
          )}

          {/* Line */}
          <path
            d={linePath(linePts)}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />

          {/* Points */}
          {showPoints && points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={color}
              className="ed-time-series__point"
            >
              <title>{`${formatDateTick(p.d, timeSpan)}: ${p.v}`}</title>
            </circle>
          ))}

          {/* Y axis label */}
          {config.yLabel && (
            <text
              x={-innerH / 2}
              y={-40}
              textAnchor="middle"
              fontSize={12}
              fill="#374151"
              transform="rotate(-90)"
            >
              {config.yLabel}
            </text>
          )}
        </g>
      </svg>
      {config.label && (
        <div className="ed-chart__legend">
          <span className="ed-chart__legend-item">
            <span className="ed-chart__legend-dot" style={{ background: color }} />
            {config.label}
          </span>
        </div>
      )}
    </div>
  );
}
