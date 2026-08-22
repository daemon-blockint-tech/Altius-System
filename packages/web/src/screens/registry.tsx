/**
 * Every screen declares itself here: what it is called, which job it belongs
 * to, which packs can show it, and how to render it.
 *
 * What this replaces was a `renderScreen` function taking fourteen positional
 * arguments and branching through a chain of
 * `if (screenId === 'x' && packId === 'y')`. Two costs followed from that
 * shape. Adding a screen meant adding a fifteenth argument. And the navigation
 * was a separate hand-written constant, so it listed screens the renderer would
 * not draw — four of them, which rendered a "not yet wired" placeholder to
 * anyone who switched away from the supply-chain pack.
 *
 * Deriving the navigation from this list removes that class of lie: a screen
 * the active pack cannot show is not in the nav, because the nav is the list.
 */

import type { ReactNode } from 'react';
import type { Altius, Patient } from '@altius/sdk';
import type { WebConfig } from '../client.js';
import type { Principal } from '../auth/claims.js';
import type { JobKey, JobGroup } from '../components/EditorialShell.js';
import type { ActionSchema } from '../components/ActionForm.js';
import type { ActiveFilter, FacilityStats } from '../components/FacilitiesScreen.js';
import { ObjectTable } from '../components/ObjectTable.js';
import { ActionPanel } from '../components/ActionPanel.js';
import { FacilitiesScreen } from '../components/FacilitiesScreen.js';
import { ShipmentsScreen } from '../components/ShipmentsScreen.js';
import { PurchaseOrdersScreen } from '../components/PurchaseOrdersScreen.js';
import { InventoryScreen } from '../components/InventoryScreen.js';
import { ActionConsoleScreen } from '../components/ActionConsoleScreen.js';
import { AuditTrailScreen } from '../components/AuditTrailScreen.js';
import { OntologyExplorerScreen } from '../components/OntologyExplorerScreen.js';
import { ObjectBrowserScreen } from '../components/ObjectBrowserScreen.js';
import { ConsentPermissionsScreen } from '../components/ConsentPermissionsScreen.js';
import { GraphExplorerScreen } from '../components/GraphExplorerScreen.js';
import { WorkflowGraphScreen } from '../components/WorkflowGraphScreen.js';
import { McpActivityScreen } from '../components/McpActivityScreen.js';
import { PackManagerScreen } from '../components/PackManagerScreen.js';
import { SyncHealthScreen } from '../components/SyncHealthScreen.js';
import { WorkshopScreen } from '../components/WorkshopScreen.js';

/** Everything a screen may need, passed as one value rather than fourteen. */
export interface ScreenContext {
  packId: string;
  client: Altius;
  config: WebConfig;
  principal: Principal | null;
  /** Null unless signed in — screens that read must handle that. */
  getToken: (() => Promise<string>) | null;
  guardAuth: <R>(p: Promise<R>) => Promise<R>;
  loadActions: () => Promise<ActionSchema[]>;
  /** Open a record at its own address. */
  openRecord: (type: string, id: string) => void;
  filters: ActiveFilter[];
  onAddFilter: (field: string) => void;
  onRemoveFilter: (field: string, value: string) => void;
  facilityStats: FacilityStats | null;
}

export interface ScreenDef {
  id: string;
  label: string;
  job: JobKey;
  /** Packs that can show this screen. Absent means every pack. */
  packs?: readonly string[];
  render: (ctx: ScreenContext) => ReactNode;
}

export const JOB_LABELS: Record<JobKey, string> = {
  OP: 'Operate',
  IN: 'Investigate',
  MO: 'Model',
  AD: 'Administer',
};

/** Job order in the rail. */
const JOB_ORDER: readonly JobKey[] = ['OP', 'IN', 'MO', 'AD'];

export const SCREENS: readonly ScreenDef[] = [
  // ── Operate ──
  {
    id: 'objects',
    label: 'Objects',
    job: 'OP',
    render: ctx => (
      <ObjectBrowserScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} onRowClick={ctx.openRecord} />
    ),
  },
  {
    id: 'facilities',
    label: 'Facilities',
    job: 'OP',
    packs: ['supply-chain'],
    render: ctx => (
      <FacilitiesScreen
        client={ctx.client}
        stats={ctx.facilityStats}
        activeFilters={ctx.filters}
        onRemoveFilter={ctx.onRemoveFilter}
        onAddFilter={ctx.onAddFilter}
      />
    ),
  },
  {
    id: 'shipments',
    label: 'Shipments',
    job: 'OP',
    packs: ['supply-chain'],
    render: ctx => <ShipmentsScreen client={ctx.client} onRowClick={id => ctx.openRecord('Shipment', id)} />,
  },
  {
    id: 'purchase-orders',
    label: 'Purchase orders',
    job: 'OP',
    packs: ['supply-chain'],
    render: ctx => <PurchaseOrdersScreen client={ctx.client} onRowClick={id => ctx.openRecord('PurchaseOrder', id)} />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    job: 'OP',
    packs: ['supply-chain'],
    render: ctx => <InventoryScreen client={ctx.client} onRowClick={id => ctx.openRecord('InventoryRecord', id)} />,
  },
  {
    // Its own id rather than a second meaning for `facilities`: the old switch
    // rendered two unrelated screens for one nav entry depending on the pack,
    // so a link to /facilities meant different things to different people.
    id: 'patients',
    label: 'Patients',
    job: 'OP',
    packs: ['nhs-acute'],
    render: ctx => (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">NHS.ACUTE · OBJECT TYPE</span>
          <h1 className="ed-main__title">Patients</h1>
          <p className="ed-main__lede">
            The patient worklist. Reads are FGA-filtered, field-redacted and consent-gated
            server-side — the UI adds no data access of its own.
          </p>
        </header>
        <div className="ed-table-wrap">
          <ObjectTable<Patient>
            caption="Patients"
            columns={[
              { key: 'nhsNumber', header: 'NHS number', sortable: true },
              { key: 'name', header: 'Name', sortable: true },
              { key: 'status', header: 'Status', sortable: true },
              { key: 'triageCategory', header: 'Triage', sortable: true },
            ]}
            load={({ first, after, orderBy }) =>
              ctx.guardAuth(ctx.client.patient.list(
                undefined,
                after === undefined ? { first } : { first, after },
                undefined,
                orderBy ? { [orderBy.key]: orderBy.direction } : undefined,
              ))
            }
            subscribe={(onChange, onLost, onResumed) =>
              ctx.client.patient.onAnyChange(() => onChange(), undefined, onLost, onResumed)
            }
            onRowClick={id => ctx.openRecord('Patient', id)}
          />
        </div>
        <div className="al-screen-pad">
          <ActionPanel
            loadActions={ctx.loadActions}
            submit={(name, input) => ctx.guardAuth(ctx.client.actions.invoke(name, input))}
          />
        </div>
      </main>
    ),
  },
  {
    id: 'action-console',
    label: 'Action console',
    job: 'OP',
    render: ctx => (
      <ActionConsoleScreen
        packLabel={ctx.packId}
        loadActions={ctx.loadActions}
        submit={(name, input) => ctx.guardAuth(ctx.client.actions.invoke(name, input))}
      />
    ),
  },

  // ── Investigate ──
  {
    id: 'audit-trail',
    label: 'Audit trail',
    job: 'IN',
    render: ctx => <AuditTrailScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },
  {
    id: 'consent-permissions',
    label: 'Consent & permissions',
    job: 'IN',
    render: ctx => <ConsentPermissionsScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },
  {
    id: 'graph-explorer',
    label: 'Graph / link explorer',
    job: 'IN',
    render: ctx => <GraphExplorerScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },
  {
    id: 'workflow-graph',
    label: 'Workflow graph',
    job: 'IN',
    render: () => <WorkflowGraphScreen />,
  },
  {
    id: 'mcp-activity',
    label: 'MCP activity',
    job: 'IN',
    render: ctx => <McpActivityScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },

  // ── Model ──
  {
    id: 'ontology-explorer',
    label: 'Ontology / schema',
    job: 'MO',
    render: ctx => <OntologyExplorerScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },
  {
    id: 'pack-manager',
    label: 'Domain pack manager',
    job: 'MO',
    render: ctx => <PackManagerScreen endpoint={ctx.config.endpoint} getToken={ctx.getToken} />,
  },
  {
    id: 'workshop',
    label: 'App builder',
    job: 'MO',
    render: ctx => (
      <WorkshopScreen
        client={ctx.client}
        tenantId={ctx.principal?.tenant ?? 'default'}
        userId={ctx.principal?.sub ?? ''}
      />
    ),
  },

  // ── Administer ──
  {
    id: 'sync-health',
    label: 'Sync & connector health',
    job: 'AD',
    render: ctx => <SyncHealthScreen getToken={ctx.getToken} />,
  },
];

/** Screens the given pack can actually show. */
export function screensFor(packId: string): ScreenDef[] {
  return SCREENS.filter(s => !s.packs || s.packs.includes(packId));
}

/** One entry per screen the pack can show, or undefined if it cannot. */
export function findScreen(packId: string, screenId: string): ScreenDef | undefined {
  return screensFor(packId).find(s => s.id === screenId);
}

/**
 * Navigation for a pack: jobs in rail order, each with its available screens.
 * A job with nothing to show for this pack is left out rather than rendered
 * empty.
 */
export function jobsFor(packId: string): JobGroup[] {
  const available = screensFor(packId);
  return JOB_ORDER
    .map(key => ({
      key,
      label: JOB_LABELS[key],
      screens: available.filter(s => s.job === key).map(s => ({ id: s.id, label: s.label })),
    }))
    .filter(group => group.screens.length > 0);
}
