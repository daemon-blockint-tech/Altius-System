/**
 * Shipments screen — live, governed shipment worklist for the supply-chain pack.
 *
 * Uses the generic ObjectTable over the SDK's Shipment accessor. Reads are
 * FGA-filtered, field-redacted and consent-gated server-side — the UI adds no
 * data access of its own. Live updates are via the SDK's onAnyChange
 * subscription, coalesced by ObjectTable so a bulk write is one refetch.
 */

import { ObjectTable } from './ObjectTable.js';
import type { Column } from './ObjectTable.js';
import type { Shipment } from '@altius/sdk';
import type { Altius } from '@altius/sdk';

const COLUMNS: Column<Shipment>[] = [
  { key: 'trackingNumber', header: 'Tracking #', sortable: true },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: 'transportMode', header: 'Mode', sortable: true },
  { key: 'quantity', header: 'Qty', sortable: true },
  { key: 'estimatedArrival', header: 'ETA', sortable: true },
  { key: 'actualArrival', header: 'Arrived', sortable: true },
];

export interface ShipmentsScreenProps {
  client: Altius;
  onRowClick?: (rowId: string) => void;
}

export function ShipmentsScreen({ client, onRowClick }: ShipmentsScreenProps): React.ReactNode {
  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">SUPPLY.CHAIN · OBJECT TYPE</span>
        <h1 className="ed-main__title">Shipments</h1>
        <p className="ed-main__lede">
          The shipment worklist. Reads are FGA-filtered, field-redacted and consent-gated
          server-side — the UI adds no data access of its own.
        </p>
      </header>
      <div className="ed-table-wrap">
        <ObjectTable<Shipment>
          caption="Shipments"
          columns={COLUMNS}
          load={({ first, after, orderBy }) =>
            client.shipment.list(
              undefined,
              after === undefined ? { first } : { first, after },
              undefined,
              orderBy ? { [orderBy.key]: orderBy.direction } : undefined,
            )
          }
          subscribe={(onChange, onLost, onResumed) =>
            client.shipment.onAnyChange(() => onChange(), undefined, onLost, onResumed)
          }
          {...(onRowClick ? { onRowClick } : {})}
        />
      </div>
    </main>
  );
}

/**
 * A coloured badge for shipment status. The status values are the ODL enum
 * ShipmentStatus: PENDING, IN_TRANSIT, DELAYED, CUSTOMS_HOLD, DELIVERED, LOST.
 */
function StatusBadge({ status }: { status: Shipment['status'] }): React.ReactNode {
  if (!status) return <span data-empty="true">—</span>;
  const tone: Record<string, string> = {
    PENDING: 'pending',
    IN_TRANSIT: 'transit',
    DELAYED: 'delayed',
    CUSTOMS_HOLD: 'hold',
    DELIVERED: 'delivered',
    LOST: 'lost',
  };
  return (
    <span className="ed-status-badge" data-tone={tone[status] ?? 'default'}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
