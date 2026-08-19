/**
 * ObjectListWidget — renders a compact list of objects.
 *
 * Config:
 *   objectType: string
 *   displayProperty: string  — property to show as the primary label
 *   secondaryProperty: string — property to show as secondary text
 *   pageSize: number
 */

import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types.js';

interface ObjectListConfig {
  objectType: string;
  displayProperty: string;
  secondaryProperty?: string;
  pageSize?: number;
}

export function ObjectListWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = instance.config as unknown as ObjectListConfig;
  const { objectType, displayProperty, secondaryProperty, pageSize = 50 } = config;

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = ctx.client as Record<string, unknown>;
    const accessorKey = objectType.charAt(0).toLowerCase() + objectType.slice(1);
    const accessor = client[accessorKey] as { list: (f: unknown, p: { first: number }) => Promise<{ edges: Array<{ node: Record<string, unknown> }> }> } | undefined;
    if (!accessor) {
      setError(`SDK accessor "${accessorKey}" not found`);
      setLoading(false);
      return;
    }
    accessor.list(undefined, { first: pageSize })
      .then((res) => { setRows(res.edges.map((e) => e.node)); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [objectType, pageSize, ctx.client]);

  if (loading) return <div className="ed-widget ed-widget--loading">Loading {objectType}…</div>;
  if (error) return <div className="ed-widget ed-widget--error">{error}</div>;

  return (
    <ul className="ed-widget ed-object-list" data-widget-id={instance.id}>
      {rows.map((row, i) => (
        <li key={i} className="ed-object-list__item">
          <span className="ed-object-list__primary">{String(row[displayProperty] ?? '—')}</span>
          {secondaryProperty && (
            <span className="ed-object-list__secondary">{String(row[secondaryProperty] ?? '')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
