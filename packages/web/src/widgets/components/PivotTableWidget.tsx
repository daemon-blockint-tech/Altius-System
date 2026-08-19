/**
 * PivotTableWidget — renders a pivot table with groupBy aggregations.
 *
 * Config:
 *   data: Array<Record<string, unknown>>   — or bound variable
 *   rows: string[]                          — property name(s) for row grouping
 *   columns?: string[]                      — property name(s) for column grouping
 *   value: string                           — property name to aggregate
 *   aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max'
 *   pageSize?: number
 *
 * The pivot computes row × column groupings and applies the aggregation
 * function to the value property. When no columns are specified, it
 * produces a flat grouped table (row → aggregated value).
 */

import { useMemo } from 'react';
import type { WidgetProps } from '../types.js';

interface PivotConfig {
  data?: Array<Record<string, unknown>>;
  rows: string[];
  columns?: string[];
  value?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  pageSize?: number;
}

type RowData = Array<Record<string, unknown>>;

export function PivotTableWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as PivotConfig;

  const data: RowData = useMemo(() => {
    if (instance.boundVariable) {
      const varData = ctx.variables[instance.boundVariable];
      if (Array.isArray(varData)) return varData as RowData;
    }
    return config.data ?? [];
  }, [config.data, ctx.variables, instance.boundVariable]);

  const { rows: rowDims, columns: colDims = [], value, aggregation } = config;

  const pivot = useMemo(() => {
    if (data.length === 0 || rowDims.length === 0) return null;

    // Group rows by row dimension values
    const rowGroups = new Map<string, RowData>();
    for (const row of data) {
      const key = rowDims.map((d) => String(row[d] ?? '—')).join(' / ');
      if (!rowGroups.has(key)) rowGroups.set(key, []);
      rowGroups.get(key)!.push(row);
    }

    // Get unique column values if colDims specified
    const colKeys = colDims.length > 0
      ? Array.from(new Set(data.map((r) => colDims.map((d) => String(r[d] ?? '—')).join(' / '))))
      : ['Total'];

    // Build pivot cells
    const rowKeys = Array.from(rowGroups.keys());
    const cells: Record<string, Record<string, number>> = {};

    for (const rowKey of rowKeys) {
      cells[rowKey] = {};
      const rowGroup = rowGroups.get(rowKey)!;

      if (colDims.length === 0) {
        cells[rowKey]['Total'] = aggregate(rowGroup, value, aggregation);
      } else {
        // Sub-group by column dimensions
        const colGroups = new Map<string, RowData>();
        for (const row of rowGroup) {
          const ck = colDims.map((d) => String(row[d] ?? '—')).join(' / ');
          if (!colGroups.has(ck)) colGroups.set(ck, []);
          colGroups.get(ck)!.push(row);
        }
        for (const ck of colKeys) {
          const cg = colGroups.get(ck) ?? [];
          cells[rowKey][ck] = aggregate(cg, value, aggregation);
        }
      }
    }

    // Compute column totals
    const totals: Record<string, number> = {};
    for (const ck of colKeys) {
      totals[ck] = rowKeys.reduce((sum, rk) => sum + (cells[rk]?.[ck] ?? 0), 0);
    }

    return { rowKeys, colKeys, cells, totals };
  }, [data, rowDims, colDims, value, aggregation]);

  if (!pivot) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No data or row dimensions not configured</div>;
  }

  return (
    <div className="ed-widget ed-pivot-table" data-widget-id={instance.id}>
      <table className="ed-pivot-table__table">
        <thead>
          <tr>
            <th className="ed-pivot-table__corner">{rowDims.join(' / ')}</th>
            {pivot.colKeys.map((ck) => (
              <th key={ck} className="ed-pivot-table__col-header">{ck}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivot.rowKeys.map((rk) => (
            <tr key={rk}>
              <th className="ed-pivot-table__row-header">{rk}</th>
              {pivot.colKeys.map((ck) => (
                <td key={ck} className="ed-pivot-table__cell">{formatVal(pivot.cells[rk]?.[ck])}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="ed-pivot-table__row-header">Total</th>
            {pivot.colKeys.map((ck) => (
              <td key={ck} className="ed-pivot-table__cell ed-pivot-table__cell--total">{formatVal(pivot.totals[ck])}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Aggregation ───────────────────────────────────────────────

function aggregate(rows: RowData, value: string | undefined, fn: string): number {
  if (fn === 'count') return rows.length;
  if (!value) return 0;
  const values = rows.map((r) => Number(r[value])).filter((v) => !isNaN(v));
  if (values.length === 0) return 0;
  switch (fn) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    default: return 0;
  }
}

function formatVal(v: number | undefined): string {
  if (v === undefined || v === 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(Math.abs(v) < 1 ? 2 : 0);
}
