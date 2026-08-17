/**
 * Inventory screen — live, governed inventory record worklist for the
 * supply-chain pack.
 *
 * Uses the generic ObjectTable over the SDK's InventoryRecord accessor. The
 * stockLevel field is rendered as a coloured badge so critical/stockout
 * rows are visually distinct.
 */

import { ObjectTable } from './ObjectTable.js';
import type { Column } from './ObjectTable.js';
import type { InventoryRecord } from '@altius/sdk';
import type { Altius } from '@altius/sdk';

const COLUMNS: Column<InventoryRecord>[] = [
  { key: 'quantity', header: 'On hand', sortable: true },
  { key: 'reservedQuantity', header: 'Reserved', sortable: true },
  {
    key: 'stockLevel',
    header: 'Stock level',
    sortable: true,
    render: (row) => <StockLevelBadge level={row.stockLevel} />,
  },
  { key: 'lastCountDate', header: 'Last count', sortable: true },
];

export interface InventoryScreenProps {
  client: Altius;
  onRowClick?: (rowId: string) => void;
}

export function InventoryScreen({ client, onRowClick }: InventoryScreenProps): React.ReactNode {
  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">SUPPLY.CHAIN · OBJECT TYPE</span>
        <h1 className="ed-main__title">Inventory</h1>
        <p className="ed-main__lede">
          The inventory record worklist. Stock levels are colour-coded so critical
          and stockout items are immediately visible.
        </p>
      </header>
      <div className="ed-table-wrap">
        <ObjectTable<InventoryRecord>
          caption="Inventory records"
          columns={COLUMNS}
          load={({ first, after, orderBy }) =>
            client.inventoryRecord.list(
              undefined,
              after === undefined ? { first } : { first, after },
              undefined,
              orderBy ? { [orderBy.key]: orderBy.direction } : undefined,
            )
          }
          subscribe={(onChange, onLost, onResumed) =>
            client.inventoryRecord.onAnyChange(() => onChange(), undefined, onLost, onResumed)
          }
          {...(onRowClick ? { onRowClick } : {})}
        />
      </div>
    </main>
  );
}

function StockLevelBadge({ level }: { level: InventoryRecord['stockLevel'] }): React.ReactNode {
  if (!level) return <span data-empty="true">—</span>;
  const tone: Record<string, string> = {
    OVERSTOCKED: 'overstocked',
    ADEQUATE: 'adequate',
    LOW: 'low',
    CRITICAL: 'critical',
    STOCKOUT: 'stockout',
  };
  return (
    <span className="ed-status-badge" data-tone={tone[level] ?? 'default'}>
      {level.replace(/_/g, ' ')}
    </span>
  );
}
