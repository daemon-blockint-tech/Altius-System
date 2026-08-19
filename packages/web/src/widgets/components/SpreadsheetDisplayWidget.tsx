/**
 * SpreadsheetDisplayWidget — renders tabular data (CSV or JSON array).
 *
 * Config:
 *   data?: Array<Record<string, unknown>>  — row data
 *   columns?: Array<{ key: string; label?: string; width?: number }>
 *   blobId?: string                         — blob ID of a CSV file
 *   attachment?: AttachmentRef
 *   pageSize?: number
 *   showHeader?: boolean
 *   sortable?: boolean
 *
 * Reads data from config, bound variable, or fetches CSV from blob store.
 */

import { useState, useMemo, useEffect } from 'react';
import type { WidgetProps } from '../types.js';
import { attachmentUrl } from '../attachment-client.js';

interface Column {
  key: string;
  label?: string;
  width?: number;
}
interface SpreadsheetConfig {
  data?: Array<Record<string, unknown>>;
  columns?: Column[];
  blobId?: string;
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  pageSize?: number;
  showHeader?: boolean;
  sortable?: boolean;
}

export function SpreadsheetDisplayWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as SpreadsheetConfig;
  const [csvData, setCsvData] = useState<Array<Record<string, unknown>> | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  // Resolve data source
  const blobId = config.blobId ?? config.attachment?.blobId;
  const boundData = instance.boundVariable ? ctx.variables[instance.boundVariable] as SpreadsheetConfig['data'] : null;
  const configData = config.data ?? null;

  // Fetch CSV if blobId is provided
  useEffect(() => {
    if (blobId && !configData && !boundData) {
      fetch(attachmentUrl(blobId, true))
        .then((r) => r.text())
        .then((text) => {
          const parsed = parseCsv(text);
          setCsvData(parsed);
        })
        .catch(() => setCsvData([]));
    }
  }, [blobId, configData, boundData]);

  const rawData = configData ?? boundData ?? csvData;
  const pageSize = config.pageSize ?? 50;

  // Derive columns from data if not provided
  const columns = useMemo(() => {
    if (config.columns) return config.columns;
    if (!rawData || rawData.length === 0) return [];
    const keys = new Set<string>();
    for (const row of rawData) {
      for (const key of Object.keys(row)) keys.add(key);
    }
    return Array.from(keys).map((k): Column => ({ key: k }));
  }, [config.columns, rawData]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!rawData) return [];
    if (!sortKey) return rawData;
    const sorted = [...rawData].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [rawData, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const pageData = sortedData.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key: string) => {
    if (!config.sortable) return;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (!rawData) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>Loading spreadsheet data...</div>;
  }
  if (rawData.length === 0) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No data</div>;
  }

  return (
    <div className="ed-widget ed-spreadsheet" data-widget-id={instance.id}>
      <div className="ed-spreadsheet__info">
        {rawData.length} rows × {columns.length} columns
      </div>
      <div className="ed-spreadsheet__container">
        <table className="ed-spreadsheet__table">
          {config.showHeader !== false && (
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={col.width ? { width: `${col.width}px` } : undefined}
                    onClick={() => handleSort(col.key)}
                    className={config.sortable ? 'ed-spreadsheet__th--sortable' : ''}
                  >
                    {col.label ?? col.key}
                    {sortKey === col.key && (
                      <span className="ed-spreadsheet__sort">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {pageData.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key}>{formatCell(row[col.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="ed-spreadsheet__pager">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function parseCsv(text: string): Array<Record<string, unknown>> {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}
