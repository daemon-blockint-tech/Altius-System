/**
 * ActionLogTimelineWidget — displays the audit trail as a timeline.
 *
 * Config:
 *   objectType?: string       — filter by object type
 *   objectId?: string         — filter by object ID
 *   actorId?: string          — filter by actor
 *   operationType?: string    — filter by operation (read/create/update/delete/action)
 *   limit?: number            — default 50, max 1000
 *   width?: number            — default 500
 *   height?: number           — default 400
 *
 * Features:
 *   - Fetches audit records from /api/v1/audit
 *   - Displays as a vertical timeline with operation-type icons
 *   - Filters by objectType, objectId, actorId, operationType
 *   - Pagination (load more)
 *   - Color-coded by operation type
 *   - Shows actor, timestamp, operation, and object
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

interface ActionLogConfig {
  objectType?: string;
  objectId?: string;
  actorId?: string;
  operationType?: string;
  limit?: number;
  width?: number;
  height?: number;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  actorId: string;
  actorType?: string;
  operationType: string;
  objectType?: string;
  objectId?: string;
  actionType?: string;
  traceId?: string;
  success: boolean;
  detail?: Record<string, unknown>;
}

const OP_COLORS: Record<string, string> = {
  read: '#6b7280',
  create: '#10b981',
  update: '#3b82f6',
  delete: '#ef4444',
  action: '#8b5cf6',
  query: '#6b7280',
  link: '#f59e0b',
  unlink: '#f59e0b',
  function: '#06b6d4',
};

const OP_ICONS: Record<string, string> = {
  read: '👁',
  create: '✚',
  update: '✎',
  delete: '✕',
  action: '⚡',
  query: '?',
  link: '🔗',
  unlink: '⊘',
  function: 'ƒ',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export function ActionLogTimelineWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ActionLogConfig;
  const width = config.width ?? 500;
  const height = config.height ?? 400;
  const limit = config.limit ?? 50;

  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildUrl = useCallback((off: number) => {
    const url = new URL('/api/v1/audit', window.location.origin);
    if (config.objectType) url.searchParams.set('objectType', config.objectType);
    if (config.objectId) url.searchParams.set('objectId', config.objectId);
    if (config.actorId) url.searchParams.set('actorId', config.actorId);
    if (config.operationType) url.searchParams.set('operationType', config.operationType);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(off));
    return url.toString();
  }, [config.objectType, config.objectId, config.actorId, config.operationType, limit]);

  const loadRecords = useCallback(async (off: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(off));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { data: AuditRecord[]; totalCount: number; hasMore: boolean };
      setRecords(prev => append ? [...prev, ...data.data] : data.data);
      setTotalCount(data.totalCount);
      setOffset(off);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    loadRecords(0, false);
  }, [loadRecords]);

  const hasMore = offset + records.length < totalCount;

  return (
    <div style={{ width, height, border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: 12, overflow: 'auto', padding: 8, boxSizing: 'border-box' }} aria-label="Action log timeline">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Action Log ({totalCount} records)</strong>
        <button onClick={() => loadRecords(0, false)} disabled={loading} style={{ fontSize: 11, padding: '2px 8px' }}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: '4px 8px', borderRadius: 4, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Timeline */}
      {records.length === 0 && !loading && (
        <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>No audit records</div>
      )}
      <div style={{ position: 'relative' }}>
        {records.map((record) => {
          const color = OP_COLORS[record.operationType] ?? '#999';
          const icon = OP_ICONS[record.operationType] ?? '•';
          return (
            <div key={record.id} style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative' }}>
              {/* Timeline dot */}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                flexShrink: 0, fontWeight: 600,
              }}>
                {icon}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, color }}>
                    {record.operationType.toUpperCase()}
                    {record.actionType ? `: ${record.actionType}` : ''}
                  </span>
                  <span style={{ color: '#999', fontSize: 10 }}>{formatTime(record.timestamp)}</span>
                </div>
                <div style={{ color: '#666', fontSize: 11 }}>
                  by {record.actorId}
                  {record.actorType ? ` (${record.actorType})` : ''}
                </div>
                {record.objectType && record.objectId && (
                  <div style={{ color: '#999', fontSize: 10 }}>
                    on {record.objectType}/{record.objectId}
                  </div>
                )}
                {!record.success && (
                  <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 600 }}>FAILED</div>
                )}
                {record.traceId && (
                  <div style={{ color: '#ccc', fontSize: 9, fontFamily: 'monospace' }}>
                    trace: {record.traceId.substring(0, 8)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && !loading && (
        <button
          onClick={() => loadRecords(offset + limit, true)}
          style={{ width: '100%', padding: '4px', fontSize: 11, border: '1px solid #ddd', background: '#f9fafb', cursor: 'pointer', borderRadius: 4 }}
        >
          Load More ({totalCount - offset - records.length} remaining)
        </button>
      )}
    </div>
  );
}
