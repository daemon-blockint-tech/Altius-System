import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectTable } from './components/ObjectTable.js';
import type { Patient } from '@altius/sdk';
import { ActionPanel } from './components/ActionPanel.js';
import type { ActionSchema } from './components/ActionForm.js';
import { createClient } from './client.js';
import type { WebConfig } from './client.js';
import { AuthSession } from './auth/session.js';
import { beginLogin, completeLogin } from './auth/pkce.js';
import { isAuthFailure } from './auth/auth-failure.js';
import { decodeJwtClaims, principalFromClaims } from './auth/claims.js';
import type { Principal } from './auth/claims.js';
import { EditorialShell } from './components/EditorialShell.js';
import type { JobKey, JobGroup, PackOption, RoleOption } from './components/EditorialShell.js';
import { FacilitiesScreen } from './components/FacilitiesScreen.js';
import type { ActiveFilter, FacilityStats } from './components/FacilitiesScreen.js';
import { ShipmentsScreen } from './components/ShipmentsScreen.js';
import { PurchaseOrdersScreen } from './components/PurchaseOrdersScreen.js';
import { InventoryScreen } from './components/InventoryScreen.js';
import { ActionConsoleScreen } from './components/ActionConsoleScreen.js';
import { AuditTrailScreen } from './components/AuditTrailScreen.js';
import { OntologyExplorerScreen } from './components/OntologyExplorerScreen.js';
import { ObjectBrowserScreen } from './components/ObjectBrowserScreen.js';
import { ObjectDetailScreen } from './components/ObjectDetailScreen.js';
import { ConsentPermissionsScreen } from './components/ConsentPermissionsScreen.js';
import { GraphExplorerScreen } from './components/GraphExplorerScreen.js';
import { McpActivityScreen } from './components/McpActivityScreen.js';
import { PackManagerScreen } from './components/PackManagerScreen.js';
import { SyncHealthScreen } from './components/SyncHealthScreen.js';
import type { TraceState } from './components/TraceBar.js';

type AuthState = 'checking' | 'anonymous' | 'signed-in' | 'error';

/** Up to two initials from a display name, for the avatar chip. */
function initialsOf(name: string | undefined): string {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '··';
}

// ── Pack / job / role definitions ─────────────────────────────

const PACKS: PackOption[] = [
  { id: 'supply-chain', name: 'supply.chain', version: '0.1.0' },
  { id: 'nhs-acute', name: 'nhs.acute', version: '0.1.0' },
  { id: 'aml', name: 'aml', version: '0.1.0' },
];

const JOBS: JobGroup[] = [
  {
    key: 'OP',
    label: 'Operate',
    screens: [
      { id: 'objects', label: 'Objects' },
      { id: 'ops-map', label: 'Ops map' },
      { id: 'facilities', label: 'Facilities', count: 41 },
      { id: 'shipments', label: 'Shipments', count: 2184 },
      { id: 'purchase-orders', label: 'Purchase orders', count: 867 },
      { id: 'inventory', label: 'Inventory', count: 5402 },
      { id: 'action-console', label: 'Action console' },
    ],
  },
  {
    key: 'IN',
    label: 'Investigate',
    screens: [
      { id: 'audit-trail', label: 'Audit trail' },
      { id: 'consent-permissions', label: 'Consent & permissions' },
      { id: 'graph-explorer', label: 'Graph / link explorer' },
      { id: 'mcp-activity', label: 'MCP activity' },
    ],
  },
  {
    key: 'MO',
    label: 'Model',
    screens: [
      { id: 'ontology-explorer', label: 'Ontology / schema' },
      { id: 'pack-manager', label: 'Domain pack manager' },
    ],
  },
  {
    key: 'AD',
    label: 'Administer',
    screens: [
      { id: 'sync-health', label: 'Sync & connector health' },
      { id: 'fdp-cdm', label: 'FDP-CDM projection' },
    ],
  },
];

const ROLES: RoleOption[] = [
  { id: 'warehouse_manager', label: 'Warehouse manager' },
  { id: 'logistics_manager', label: 'Logistics manager' },
  { id: 'supply_chain_admin', label: 'Supply chain admin' },
];

/**
 * Altius operational console — Editorial shell (Shell C).
 *
 * The shell wraps the existing governed data surface. Auth flow is unchanged:
 * OIDC PKCE → session → SDK client → governed GraphQL. The shell adds the
 * chrome (icon rail, sidebar, governance rail, trace bar) and the Facilities
 * screen; the patient worklist remains as the nhs.acute pack's anchor screen.
 */
export function App({ config }: { config: WebConfig }): ReactNode {
  const exchanged = useRef(false);
  const [authState, setAuthState] = useState<AuthState>(config.oidc ? 'checking' : 'anonymous');
  const session = useMemo(
    () =>
      config.oidc
        ? new AuthSession(config.oidc, Date.now, () => {
            exchanged.current = false;
            setAuthState('anonymous');
          })
        : null,
    [config.oidc],
  );

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !config.oidc || exchanged.current) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') && !params.has('error')) {
      setAuthState('anonymous');
      return;
    }
    exchanged.current = true;

    completeLogin(config.oidc, params)
      .then(tokens => {
        session.adopt(tokens);
        window.history.replaceState({}, '', window.location.pathname);
        setAuthState('signed-in');
      })
      .catch((err: unknown) => {
        setAuthError(err instanceof Error ? err.message : String(err));
        setAuthState('error');
      });
  }, [session, config.oidc]);

  const client = useMemo(
    () => createClient(config.endpoint, session && authState === 'signed-in' ? session.getAccessToken : null),
    [config.endpoint, session, authState],
  );

  useEffect(() => () => client.close(), [client]);

  // Real signed-in principal, decoded from the access token's display claims —
  // replaces the former hardcoded demo identity. Authorization is unaffected:
  // the gateway verifies the token and enforces access server-side.
  const [principal, setPrincipal] = useState<Principal | null>(null);
  useEffect(() => {
    if (authState !== 'signed-in' || !session) { setPrincipal(null); return; }
    let live = true;
    session.getAccessToken()
      .then(t => { if (live) setPrincipal(principalFromClaims(decodeJwtClaims(t))); })
      .catch(() => { if (live) setPrincipal(null); });
    return () => { live = false; };
  }, [authState, session]);

  const guardAuth = <R,>(p: Promise<R>): Promise<R> =>
    p.catch((err: unknown) => {
      if (isAuthFailure(err)) setAuthState('anonymous');
      throw err;
    });

  const loadActions = useMemo(
    () => async (): Promise<ActionSchema[]> => {
      const tools = await guardAuth(client.actions.available({ kind: 'ACTION' }));
      return tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ActionSchema['parameters'],
      }));
    },
    [client],
  );

  // ── Shell state ──────────────────────────────────────────────

  const [activePack, setActivePack] = useState('supply-chain');
  const [activeJob, setActiveJob] = useState<JobKey>('OP');
  const [activeScreen, setActiveScreen] = useState('objects');
  const [activeRole, setActiveRole] = useState('warehouse_manager');
  const [detailObject, setDetailObject] = useState<{ type: string; id: string } | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([
    { field: 'country', values: ['DE', 'NL', 'GB'] },
  ]);

  const facilityStats: FacilityStats | null =
    activeScreen === 'facilities' && activePack === 'supply-chain'
      ? { visible: 38, total: 41, disrupted: 2, meanUtilisation: 67, cdcLagSeconds: 1.8 }
      : null;

  const trace: TraceState = {
    activeStage: 'emit',
    durationMs: 41,
    auditId: '01JQ4Z…7KP',
    traceId: '4f2a…9c1',
  };

  const handleScreenSelect = (job: JobKey, screenId: string) => {
    setActiveJob(job);
    setActiveScreen(screenId);
  };

  const handleRemoveFilter = (field: string, value: string) => {
    setActiveFilters(filters =>
      filters
        .map(f =>
          f.field === field
            ? { ...f, values: f.values.filter(v => v !== value) }
            : f,
        )
        .filter(f => f.values.length > 0),
    );
  };

  const handleAddFilter = (field: string) => {
    setActiveFilters(filters => {
      if (filters.some(f => f.field === field)) return filters;
      return [...filters, { field, values: [] }];
    });
  };

  // ── Auth gates (unchanged) ───────────────────────────────────

  if (!config.oidc) {
    return (
      <main>
        <h1>Altius</h1>
        <div role="alert">
          <p>Sign-in is not configured, so this app cannot load any data.</p>
          <p>
            Set <code>VITE_OIDC_ISSUER</code> (and <code>VITE_OIDC_CLIENT_ID</code> if it is not
            <code> altius</code>) to point at your identity provider, then reload.
          </p>
        </div>
      </main>
    );
  }

  if (authState === 'checking') return <p>Signing in…</p>;

  if (authState === 'error') {
    return (
      <div role="alert">
        <p>Sign-in failed.</p>
        <p>{authError}</p>
        <button type="button" onClick={() => void startLogin()}>Try again</button>
      </div>
    );
  }

  if (session && authState === 'anonymous') {
    return (
      <main>
        <h1>Altius</h1>
        <button type="button" onClick={() => void startLogin()}>Sign in</button>
      </main>
    );
  }

  // ── Render the active screen inside the shell ────────────────

  return (
    <>
    <EditorialShell
      packs={PACKS}
      activePack={activePack}
      onPackChange={setActivePack}
      jobs={JOBS}
      activeJob={activeJob}
      activeScreen={activeScreen}
      onScreenSelect={handleScreenSelect}
      roles={ROLES}
      activeRole={activeRole}
      onRoleChange={setActiveRole}
      brand="AL"
      userInitials={initialsOf(principal?.name)}
      principal={{
        name: principal?.name ?? 'Signing in…',
        email: principal?.email ?? '',
        tenant: principal?.tenant ?? 'default',
        sub: principal?.sub ?? '',
        relationsSummary:
          principal && principal.roles.length > 0 ? (
            <>
              Holds{' '}
              {principal.roles.map((r, i) => (
                <span key={r}>
                  {i > 0 ? ', ' : ''}
                  <code>{r}</code>
                </span>
              ))}{' '}
              from the identity token; object-level relations are enforced server-side.
            </>
          ) : (
            <>No roles in the identity token.</>
          ),
      }}
      hidden={[
        {
          title: '3 rows, filtered',
          detail: (
            <>
              No <code>assigned</code> relation. Removed by the ReBAC pre-filter before the page
              was built.
            </>
          ),
        },
        {
          title: '2 fields, redacted',
          detail: (
            <>
              <code>unitCost</code> and <code>currency</code> on linked purchase orders.
              Commercial terms sit outside your relation.
            </>
          ),
        },
        {
          title: 'Consent: not applicable',
          detail: (
            <>
              No consent-gated type on this view. It engages on <code>nhs.acute</code>.
            </>
          ),
        },
      ]}
      events={[
        { time: '14:22:07', text: <>Shipment <code>SHP-8841</code> delayed</> },
        { time: '14:21:58', text: 'Inventory adjusted at Leipzig' },
        { time: '14:21:31', text: <>Hamburg Altenwerder set <code>DISRUPTED</code></> },
      ]}
      feedLive={true}
      trace={trace}
    >
      {renderScreen(
        activeScreen,
        activePack,
        client,
        facilityStats,
        activeFilters,
        handleRemoveFilter,
        handleAddFilter,
        guardAuth,
        loadActions,
        config,
        session,
        authState,
        (type: string, id: string) => setDetailObject({ type, id }),
      )}
    </EditorialShell>


    {detailObject && (
      <ObjectDetailScreen
        objectType={detailObject.type}
        objectId={detailObject.id}
        getToken={session && authState === 'signed-in' ? session.getAccessToken : null}
        onClose={() => setDetailObject(null)}
      />
)}
    </>
  );

  async function startLogin(): Promise<void> {
    if (!config.oidc) return;
    window.location.assign(await beginLogin(config.oidc));
  }
}

/**
 * Render the main content for the active screen.
 *
 * Only the Facilities screen (supply-chain pack) and the patient worklist
 * (nhs.acute pack) are wired to live data. The other nine screens render a
 * placeholder — they are defined in the sidebar so the navigation is complete,
 * but their data surfaces are future work.
 */
function renderScreen(
  screenId: string,
  packId: string,
  client: ReturnType<typeof createClient>,
  stats: FacilityStats | null,
  filters: ActiveFilter[],
  onRemoveFilter: (field: string, value: string) => void,
  onAddFilter: (field: string) => void,
  guardAuth: <R>(p: Promise<R>) => Promise<R>,
  loadActions: () => Promise<ActionSchema[]>,
  config: WebConfig,
  session: AuthSession | null,
  authState: AuthState,
  onRowClick: (type: string, id: string) => void,
): ReactNode {
  // Object browser — generic, ontology-driven worklist for any loaded pack.
  if (screenId === 'objects') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <ObjectBrowserScreen endpoint={config.endpoint} getToken={getToken} onRowClick={onRowClick} />;
  }

  // Supply-chain Facilities — the anchor screen, fully wired.
  if (screenId === 'facilities' && packId === 'supply-chain') {
    return (
      <FacilitiesScreen
        client={client}
        stats={stats}
        activeFilters={filters}
        onRemoveFilter={onRemoveFilter}
        onAddFilter={onAddFilter}
      />
    );
  }

  // Supply-chain Shipments — live shipment worklist.
  if (screenId === 'shipments' && packId === 'supply-chain') {
    return <ShipmentsScreen client={client} onRowClick={(id) => onRowClick('Shipment', id)} />;
  }

  // Supply-chain Purchase orders — live PO worklist.
  if (screenId === 'purchase-orders' && packId === 'supply-chain') {
    return <PurchaseOrdersScreen client={client} onRowClick={(id) => onRowClick('PurchaseOrder', id)} />;
  }

  // Supply-chain Inventory — live inventory record worklist.
  if (screenId === 'inventory' && packId === 'supply-chain') {
    return <InventoryScreen client={client} onRowClick={(id) => onRowClick('InventoryRecord', id)} />;
  }

  // Action console — governed action panel for the active pack.
  if (screenId === 'action-console') {
    return (
      <ActionConsoleScreen
        packLabel={packId}
        loadActions={loadActions}
        submit={(name, input) => guardAuth(client.actions.invoke(name, input))}
      />
    );
  }

  // Audit trail — governed audit log viewer.
  if (screenId === 'audit-trail') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <AuditTrailScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // Ontology explorer — schema browser.
  if (screenId === 'ontology-explorer') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <OntologyExplorerScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // Consent & permissions — consent records and relationship grants.
  if (screenId === 'consent-permissions') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <ConsentPermissionsScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // Graph explorer — traverse the object graph.
  if (screenId === 'graph-explorer') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <GraphExplorerScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // MCP activity — MCP server status and available tools.
  if (screenId === 'mcp-activity') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <McpActivityScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // Pack manager — browse loaded domain packs.

  if (screenId === 'pack-manager') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <PackManagerScreen endpoint={config.endpoint} getToken={getToken} />;
  }

  // Sync health — API health and connector status.
  if (screenId === 'sync-health') {
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    return <SyncHealthScreen getToken={getToken} />;
  }

  // NHS acute — patient worklist (the existing screen, in the shell).
  if (screenId === 'facilities' && packId === 'nhs-acute') {
    return (
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
              guardAuth(client.patient.list(
                undefined,
                after === undefined ? { first } : { first, after },
                undefined,
                orderBy ? { [orderBy.key]: orderBy.direction } : undefined,
              ))
            }
            subscribe={(onChange, onLost, onResumed) =>
              client.patient.onAnyChange(() => onChange(), undefined, onLost, onResumed)
            }
            onRowClick={(id) => onRowClick('Patient', id)}
          />
        </div>
        <div style={{ padding: '0 44px 40px', maxWidth: 1180 }}>
          <ActionPanel
            loadActions={loadActions}
            submit={(name, input) => guardAuth(client.actions.invoke(name, input))}
          />
        </div>
      </main>
    );
  }

  // Placeholder for the remaining screens.
  const allScreens = JOBS.flatMap(j => j.screens);
  const match = allScreens.find(s => s.id === screenId);
  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">{packId.toUpperCase().replace('-', '.')} · SCREEN</span>
        <h1 className="ed-main__title">{match?.label ?? screenId}</h1>
        <p className="ed-main__lede">
          This screen is defined in the navigation but its data surface is not yet wired.
          The governed API endpoints exist — this placeholder will be replaced with a live view.
        </p>
      </header>
    </main>
  );
}


