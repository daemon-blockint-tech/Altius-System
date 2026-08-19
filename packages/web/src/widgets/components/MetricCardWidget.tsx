/**
 * MetricCardWidget — displays a single metric value with label and optional trend.
 *
 * Config:
 *   label: string
 *   value: string | number       — static value, or
 *   boundVariable: string        — variable name for dynamic value (overrides value)
 *   format: 'number' | 'currency' | 'percent' | 'text'
 *   trend?: { direction: 'up' | 'down' | 'flat'; percent: number }
 */

import type { WidgetProps } from '../types.js';

interface MetricCardConfig {
  label: string;
  value?: string | number;
  format?: 'number' | 'currency' | 'percent' | 'text';
  trend?: { direction: 'up' | 'down' | 'flat'; percent: number };
}

export function MetricCardWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MetricCardConfig;
  const rawValue = instance.boundVariable
    ? ctx.variables[instance.boundVariable]
    : config.value;

  const formatted = formatMetric(rawValue, config.format ?? 'text');
  const trend = config.trend;

  return (
    <div className="ed-widget ed-metric-card" data-widget-id={instance.id}>
      <span className="ed-metric-card__label">{config.label ?? 'Metric'}</span>
      <span className="ed-metric-card__value">{formatted}</span>
      {trend && (
        <span
          className="ed-metric-card__trend"
          data-direction={trend.direction}
        >
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '—'}
          {Math.abs(trend.percent)}%
        </span>
      )}
    </div>
  );
}

function formatMetric(val: unknown, format: string): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return String(val);
  switch (format) {
    case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    case 'percent': return `${num.toFixed(1)}%`;
    case 'number': return new Intl.NumberFormat('en-US').format(num);
    default: return String(val);
  }
}
