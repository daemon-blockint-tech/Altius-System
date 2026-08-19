/**
 * ObjectViewWidget — renders a single object's properties.
 *
 * Config:
 *   objectType: string
 *   objectId: string
 *   properties: string[]   — properties to display
 */

import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types.js';

interface ObjectViewConfig {
  objectType: string;
  objectId: string;
  properties: string[];
}

export function ObjectViewWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = instance.config as unknown as ObjectViewConfig;
  const { objectType, objectId, properties } = config;

  const [obj, setObj] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = ctx.client as Record<string, unknown>;
    const accessorKey = objectType.charAt(0).toLowerCase() + objectType.slice(1);
    const accessor = client[accessorKey] as { get: (id: string) => Promise<Record<string, unknown>> } | undefined;
    if (!accessor) {
      setError(`SDK accessor "${accessorKey}" not found`);
      setLoading(false);
      return;
    }
    accessor.get(objectId)
      .then((res) => { setObj(res); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [objectType, objectId, ctx.client]);

  if (loading) return <div className="ed-widget ed-widget--loading">Loading {objectType}…</div>;
  if (error) return <div className="ed-widget ed-widget--error">{error}</div>;
  if (!obj) return <div className="ed-widget ed-widget--empty">Object not found</div>;

  return (
    <dl className="ed-widget ed-object-view" data-widget-id={instance.id}>
      {properties.map((prop) => (
        <div key={prop} className="ed-object-view__row">
          <dt className="ed-object-view__label">{prop}</dt>
          <dd className="ed-object-view__value">{formatValue(obj[prop])}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
