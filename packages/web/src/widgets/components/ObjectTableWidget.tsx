/**
 * ObjectTableWidget — renders an ObjectTable from a widget config.
 *
 * Config:
 *   objectType: string       — the ODL object type name (e.g. "Patient")
 *   columns: ColumnConfig[]  — column definitions
 *   pageSize: number         — page size (default 25)
 *   filter: object           — filter expression
 *   sortBy: object           — sort state
 *
 * This widget wraps the existing ObjectTable component, but drives it
 * from config rather than hardcoded props. The SDK client accessor is
 * derived from the object type name.
 */

import { ObjectTable } from '../../components/ObjectTable.js';
import type { Column, ConnectionLike } from '../../components/ObjectTable.js';
import type { WidgetProps } from '../types.js';

interface ColumnConfig {
  key: string;
  header: string;
  sortable?: boolean;
}

interface ObjectTableConfig {
  objectType: string;
  columns: ColumnConfig[];
  pageSize?: number;
  filter?: Record<string, unknown>;
  sortBy?: Record<string, 'ASC' | 'DESC'>;
}

export function ObjectTableWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = instance.config as unknown as ObjectTableConfig;
  const { objectType, columns, pageSize = 25 } = config;

  if (!objectType || !columns) {
    return <div className="ed-widget ed-widget--error">object_table: missing objectType or columns</div>;
  }

  // Derive the SDK accessor from the object type name.
  // The generated SDK exposes per-type accessors like client.patient, client.shipment, etc.
  const client = ctx.client as Record<string, unknown>;
  const accessorKey = objectType.charAt(0).toLowerCase() + objectType.slice(1);
  const accessor = client[accessorKey] as {
    list: (
      filter?: unknown,
      pagination?: { first: number; after?: string },
      _consent?: unknown,
      orderBy?: Record<string, 'ASC' | 'DESC'>,
    ) => Promise<ConnectionLike<Record<string, unknown>>>;
    onAnyChange: (
      callback: () => void,
      filter?: unknown,
      onLost?: () => void,
      onResumed?: () => void,
    ) => () => void;
  } | undefined;

  if (!accessor || typeof accessor.list !== 'function') {
    return (
      <div className="ed-widget ed-widget--error">
        object_table: SDK accessor "{accessorKey}" not found on client
      </div>
    );
  }

  const cols: Column<Record<string, unknown>>[] = columns.map((c) => ({
    key: c.key,
    header: c.header,
    sortable: c.sortable,
  }));

  return (
    <ObjectTable<Record<string, unknown>>
      caption={`${objectType} list`}
      columns={cols}
      load={({ first, after, orderBy }) =>
        accessor.list(
          config.filter,
          after === undefined ? { first } : { first, after },
          undefined,
          orderBy ? { [orderBy.key]: orderBy.direction } : config.sortBy,
        )
      }
      subscribe={(onChange, onLost, onResumed) => {
        const unsub = accessor.onAnyChange(onChange, config.filter, onLost, onResumed);
        return { unsubscribe: () => unsub() };
      }}
      pageSize={pageSize}
    />
  );
}
