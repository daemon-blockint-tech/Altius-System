/**
 * Purchase orders screen — live, governed PO worklist for the supply-chain pack.
 *
 * Uses the generic ObjectTable over the SDK's PurchaseOrder accessor. The
 * `unitCost` and `currency` fields are subject to field-level redaction
 * (commercial terms), so the table renders the redacted marker rather than
 * a blank when the viewer lacks the relation.
 */

import { ObjectTable } from './ObjectTable.js';
import type { Column } from './ObjectTable.js';
import type { PurchaseOrder } from '@altius/sdk';
import type { Altius } from '@altius/sdk';

const COLUMNS: Column<PurchaseOrder>[] = [
  { key: 'orderNumber', header: 'Order #', sortable: true },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: 'quantity', header: 'Qty', sortable: true },
  { key: 'unitCost', header: 'Unit cost', sortable: true },
  { key: 'currency', header: 'Currency' },
  { key: 'requestedDeliveryDate', header: 'Requested delivery', sortable: true },
];

export interface PurchaseOrdersScreenProps {
  client: Altius;
  onRowClick?: (rowId: string) => void;
}

export function PurchaseOrdersScreen({ client, onRowClick }: PurchaseOrdersScreenProps): React.ReactNode {
  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">SUPPLY.CHAIN · OBJECT TYPE</span>
        <h1 className="ed-main__title">Purchase orders</h1>
        <p className="ed-main__lede">
          The purchase order worklist. Commercial terms (unit cost, currency) are
          field-level redacted when the viewer lacks the required relation.
        </p>
      </header>
      <div className="ed-table-wrap">
        <ObjectTable<PurchaseOrder>
          caption="Purchase orders"
          columns={COLUMNS}
          load={({ first, after, orderBy }) =>
            client.purchaseOrder.list(
              undefined,
              after === undefined ? { first } : { first, after },
              undefined,
              orderBy ? { [orderBy.key]: orderBy.direction } : undefined,
            )
          }
          subscribe={(onChange, onLost, onResumed) =>
            client.purchaseOrder.onAnyChange(() => onChange(), undefined, onLost, onResumed)
          }
          {...(onRowClick ? { onRowClick } : {})}
        />
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: PurchaseOrder['status'] }): React.ReactNode {
  if (!status) return <span data-empty="true">—</span>;
  const tone: Record<string, string> = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CONFIRMED: 'confirmed',
    IN_PRODUCTION: 'production',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  };
  return (
    <span className="ed-status-badge" data-tone={tone[status] ?? 'default'}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
