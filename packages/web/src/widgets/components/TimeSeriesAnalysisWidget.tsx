/**
 * TimeSeriesAnalysisWidget — the Quiver-style time series workbench.
 *
 * Unlike the basic TimeSeriesWidget (which renders a single series),
 * this widget provides:
 *   - Multi-series overlay (compare metrics across objects)
 *   - Threshold lines (alert/warning bands)
 *   - Brush/scrub selection (zoom into a time range)
 *   - Anomaly markers (points outside thresholds)
 *   - Aggregation toggle (raw / hourly / daily)
 *   - Series toggle (show/hide individual series)
 *   - Export (CSV of visible data)
 *
 * Config:
 *   series: Array<{
 *     id: string
 *     label: string
 *     color?: string
 *     data: Array<{ timestamp: string | number; value: number }>
 *   }>
 *   thresholds?: Array<{ value: number; label?: string; severity?: 'warning' | 'alert' }>
 *   aggregation?: 'raw' | 'hourly' | 'daily'
 *   width?: number
 *   height?: number
 *   showBrush?: boolean
 *   showAnomalies?: boolean
 */

import { useMemo, useState, useCallback, useRef } from 'react';
import type { WidgetProps } from '../types.js';
import { timeScale, linearScale, extent, niceTicks, formatTick, formatDateTick, linePath, areaPath, colorFor } from '../chart-primitives.js';

interface TSPoint { timestamp: string | number; value: number; }
interface TSSeries {
  id: string;
  label: string;
  color?: string;
  data: TSPoint[];
}
interface Threshold {
  value: number;
  label?: string;
  severity?: 'warning' | 'alert';
}
interface TSAnalysisConfig {
  series?: TSSeries[];
  thresholds?: Threshold[];
  aggregation?: 'raw' | 'hourly' | 'daily';
  width?: number;
  height?: number;
  showBrush?: boolean;
  showAnomalies?: boolean;
}

const MARGIN = { top: 20, right: 60, bottom: 60, left: 60 };
const BRUSH_HEIGHT = 40;

export function TimeSeriesAnalysisWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as TSAnalysisConfig;

  const series: TSSeries[] = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable];
      if (Array.isArray(varData)) {
        return [{ id: 's1', label: 'Series 1', data: varData as TSPoint[] }];
      }
      if (varData && Array.isArray((varData as { series?: TSSeries[] }).series)) {
        return (varData as { series: TSSeries[] }).series;
      }
    }
    return config.series ?? [];
  }, [config.series, ctx.variables, instance.boundVariable]);

  const thresholds = config.thresholds ?? [];
  const width = config.width ?? 700;
  const height = config.height ?? 400;
  const showBrush = config.showBrush ?? true;
  const showAnomalies = config.showAnomalies ?? true;
  const [aggregation, setAggregation] = useState<'raw' | 'hourly' | 'daily'>(config.aggregation ?? 'raw');
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set(series.map((s) => s.id)));
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Aggregate data
  const aggregatedSeries = useMemo(() => {
    if (aggregation === 'raw') return series;
    return series.map((s) => ({
      ...s,
      data: aggregateData(s.data, aggregation),
    }));
  }, [series, aggregation]);

  // Filter by visible series
  const visibleSeriesData = useMemo(() => {
    return aggregatedSeries.filter((s) => visibleSeries.has(s.id));
  }, [aggregatedSeries, visibleSeries]);

  // Compute domains
  const { xMin, xMax, yMin, yMax, allPoints } = useMemo(() => {
    if (visibleSeriesData.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, allPoints: [] as Array<{ t: number; v: number; seriesId: string }> };
    }
    const points: Array<{ t: number; v: number; seriesId: string }> = [];
    for (const s of visibleSeriesData) {
      for (const p of s.data) {
        points.push({ t: new Date(p.timestamp).getTime(), v: p.value, seriesId: s.id });
      }
    }
    if (points.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, allPoints: [] };
    const times = points.map((p) => p.t);
    const values = points.map((p) => p.v);
    const [yLo] = extent(values);
    // Include thresholds in Y domain
    const allY = [...values, ...thresholds.map((t) => t.value)];
    const [yMinAll, yMaxAll] = extent(allY);
    const yPad = ((yMaxAll ?? 1) - (yLo ?? 0)) * 0.1 || 1;
    return {
      xMin: Math.min(...times),
      xMax: Math.max(...times),
      yMin: (yMinAll ?? 0) - yPad,
      yMax: (yMaxAll ?? 1) + yPad,
      allPoints: points,
    };
  }, [visibleSeriesData, thresholds]);

  // Apply brush range
  const effectiveXMin = brushRange ? brushRange[0] : xMin;
  const effectiveXMax = brushRange ? brushRange[1] : xMax;

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom - (showBrush ? BRUSH_HEIGHT : 0);

  const xScale = timeScale(new Date(effectiveXMin), new Date(effectiveXMax), 0, innerW);
  const yScale = linearScale(yMin, yMax, innerH, 0);
  const xTicks = niceTicks(effectiveXMin, effectiveXMax, 6);
  const yTicks = niceTicks(yMin, yMax, 5);

  // Anomalies: points outside thresholds
  const anomalies = useMemo(() => {
    if (!showAnomalies || thresholds.length === 0) return [];
    const result: Array<{ x: number; y: number; value: number; seriesId: string }> = [];
    for (const p of allPoints) {
      if (p.t < effectiveXMin || p.t > effectiveXMax) continue;
      for (const threshold of thresholds) {
        if (threshold.severity === 'alert' && p.v > threshold.value) {
          result.push({ x: xScale(new Date(p.t)), y: yScale(p.v), value: p.v, seriesId: p.seriesId });
          break;
        }
        if (threshold.severity === 'warning' && p.v > threshold.value) {
          result.push({ x: xScale(new Date(p.t)), y: yScale(p.v), value: p.v, seriesId: p.seriesId });
          break;
        }
      }
    }
    return result;
  }, [allPoints, thresholds, showAnomalies, effectiveXMin, effectiveXMax, xScale, yScale]);

  const toggleSeries = useCallback((id: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBrushStart = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width - MARGIN.left;
    const time = effectiveXMin + (x / innerW) * (effectiveXMax - effectiveXMin);
    setBrushRange([time, time]);
  }, [width, innerW, effectiveXMin, effectiveXMax]);

  const handleBrushMove = useCallback((e: React.MouseEvent) => {
    if (!brushRange || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width - MARGIN.left;
    const time = effectiveXMin + (Math.max(0, Math.min(innerW, x)) / innerW) * (effectiveXMax - effectiveXMin);
    setBrushRange((prev) => prev ? [prev[0], time] : null);
  }, [brushRange, width, innerW, effectiveXMin, effectiveXMax]);

  const handleBrushEnd = useCallback(() => {
    if (brushRange && brushRange[0] !== brushRange[1]) {
      const lo = Math.min(brushRange[0], brushRange[1]);
      const hi = Math.max(brushRange[0], brushRange[1]);
      setBrushRange([lo, hi]);
    } else {
      setBrushRange(null);
    }
  }, [brushRange]);

  const exportCSV = useCallback(() => {
    const rows = ['timestamp,value,series'];
    for (const s of visibleSeriesData) {
      for (const p of s.data) {
        rows.push(`${new Date(p.timestamp).toISOString()},${p.value},${s.id}`);
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeseries-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleSeriesData]);

  if (series.length === 0 || series.every((s) => s.data.length === 0)) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No time series data</div>;
  }

  return (
    <div className="ed-widget ed-ts-analysis" data-widget-id={instance.id}>
      {/* Toolbar */}
      <div className="ed-ts-analysis__toolbar">
        <div className="ed-ts-analysis__toolbar-group">
          <button
            className={`ed-ts-analysis__btn${aggregation === 'raw' ? ' ed-ts-analysis__btn--active' : ''}`}
            onClick={() => setAggregation('raw')}
          >Raw</button>
          <button
            className={`ed-ts-analysis__btn${aggregation === 'hourly' ? ' ed-ts-analysis__btn--active' : ''}`}
            onClick={() => setAggregation('hourly')}
          >Hourly</button>
          <button
            className={`ed-ts-analysis__btn${aggregation === 'daily' ? ' ed-ts-analysis__btn--active' : ''}`}
            onClick={() => setAggregation('daily')}
          >Daily</button>
        </div>
        {brushRange && (
          <button className="ed-ts-analysis__btn" onClick={() => setBrushRange(null)}>
            Reset zoom
          </button>
        )}
        <button className="ed-ts-analysis__btn" onClick={exportCSV}>Export CSV</button>
      </div>

      {/* Series toggles */}
      <div className="ed-ts-analysis__series-toggles">
        {series.map((s, i) => (
          <label key={s.id} className="ed-ts-analysis__series-toggle">
            <input
              type="checkbox"
              checked={visibleSeries.has(s.id)}
              onChange={() => toggleSeries(s.id)}
            />
            <span className="ed-ts-analysis__series-dot" style={{ background: s.color ?? colorFor(i) }} />
            {s.label}
          </label>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="ed-ts-analysis__svg"
        role="img"
        aria-label="Time series analysis chart"
      >
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
                  {formatDateTick(d, 'date')}
                </text>
              </g>
            );
          })}

          {/* Axis lines */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="#d1d5db" strokeWidth={1.5} />

          {/* Threshold lines */}
          {thresholds.map((t, i) => (
            <g key={i}>
              <line
                x1={0}
                x2={innerW}
                y1={yScale(t.value)}
                y2={yScale(t.value)}
                stroke={t.severity === 'alert' ? '#dc2626' : '#ca8a04'}
                strokeWidth={1.5}
                strokeDasharray="6,3"
              />
              <text
                x={innerW + 4}
                y={yScale(t.value)}
                dy="0.32em"
                fontSize={10}
                fill={t.severity === 'alert' ? '#dc2626' : '#ca8a04'}
              >
                {t.label ?? t.value}
              </text>
            </g>
          ))}

          {/* Series lines */}
          {visibleSeriesData.map((s, si) => {
            const color = s.color ?? colorFor(si);
            const pts = s.data
              .filter((p) => {
                const t = new Date(p.timestamp).getTime();
                return t >= effectiveXMin && t <= effectiveXMax;
              })
              .map((p) => ({ x: xScale(new Date(p.timestamp)), y: yScale(p.value) }));
            return (
              <g key={s.id}>
                <path d={areaPath(pts, innerH)} fill={color} opacity={0.08} />
                <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={2} />
              </g>
            );
          })}

          {/* Anomaly markers */}
          {anomalies.map((a, i) => (
            <circle
              key={i}
              cx={a.x}
              cy={a.y}
              r={5}
              fill="none"
              stroke="#dc2626"
              strokeWidth={2}
              className="ed-ts-analysis__anomaly"
            >
              <title>{`Anomaly: ${a.value}`}</title>
            </circle>
          ))}

          {/* Brush area */}
          {showBrush && (
            <g transform={`translate(0, ${innerH + 30})`}>
              <rect
                x={0}
                y={0}
                width={innerW}
                height={BRUSH_HEIGHT - 10}
                fill="#f9fafb"
                stroke="#e5e7eb"
                rx={4}
              />
              {/* Mini series for context */}
              {visibleSeriesData.map((s, si) => {
                const color = s.color ?? colorFor(si);
                const miniY = linearScale(yMin, yMax, BRUSH_HEIGHT - 14, 2);
                const pts = s.data.map((p) => ({
                  x: timeScale(new Date(xMin), new Date(xMax), 0, innerW)(new Date(p.timestamp)),
                  y: miniY(p.value),
                }));
                return (
                  <path
                    key={s.id}
                    d={linePath(pts)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                );
              })}
              {/* Brush selection rect */}
              {brushRange && (
                <rect
                  x={timeScale(new Date(xMin), new Date(xMax), 0, innerW)(new Date(Math.min(brushRange[0], brushRange[1])))}
                  y={0}
                  width={Math.abs(timeScale(new Date(xMin), new Date(xMax), 0, innerW)(new Date(brushRange[1])) - timeScale(new Date(xMin), new Date(xMax), 0, innerW)(new Date(brushRange[0])))}
                  height={BRUSH_HEIGHT - 10}
                  fill="rgba(37, 99, 235, 0.15)"
                  stroke="#2563eb"
                  strokeWidth={1}
                />
              )}
              {/* Brush interaction overlay */}
              <rect
                x={0}
                y={0}
                width={innerW}
                height={BRUSH_HEIGHT - 10}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseDown={handleBrushStart}
                onMouseMove={handleBrushMove}
                onMouseUp={handleBrushEnd}
                onMouseLeave={handleBrushEnd}
              />
            </g>
          )}
        </g>
      </svg>

      {/* Stats */}
      <div className="ed-ts-analysis__stats">
        {visibleSeriesData.map((s, i) => {
          const values = s.data.map((p) => p.value);
          if (values.length === 0) return null;
          const [min, max] = extent(values);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          return (
            <div key={s.id} className="ed-ts-analysis__stat">
              <span className="ed-ts-analysis__stat-dot" style={{ background: s.color ?? colorFor(i) }} />
              <span className="ed-ts-analysis__stat-label">{s.label}</span>
              <span className="ed-ts-analysis__stat-value">min: {formatTick(min)}</span>
              <span className="ed-ts-analysis__stat-value">avg: {formatTick(avg)}</span>
              <span className="ed-ts-analysis__stat-value">max: {formatTick(max)}</span>
            </div>
          );
        })}
        {anomalies.length > 0 && (
          <div className="ed-ts-analysis__stat ed-ts-analysis__stat--anomaly">
            <span className="ed-ts-analysis__stat-dot" style={{ background: '#dc2626' }} />
            <span className="ed-ts-analysis__stat-label">Anomalies</span>
            <span className="ed-ts-analysis__stat-value">{anomalies.length} detected</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aggregation ───────────────────────────────────────────────

function aggregateData(data: TSPoint[], agg: 'hourly' | 'daily'): TSPoint[] {
  if (data.length === 0) return [];
  const buckets = new Map<number, number[]>();
  for (const p of data) {
    const d = new Date(p.timestamp);
    let bucket: number;
    if (agg === 'hourly') {
      bucket = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    } else {
      bucket = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(p.value);
  }
  return Array.from(buckets.entries())
    .map(([ts, values]) => ({
      timestamp: ts,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
