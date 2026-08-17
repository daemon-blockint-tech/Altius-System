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
import { EditorialShell } from './components/EditorialShell.js';
import type { JobKey, JobGroup, PackOption, RoleOption } from './components/EditorialShell.js';
import { FacilitiesScreen } from './components/FacilitiesScreen.js';
import type { ActiveFilter, FacilityStats } from './components/FacilitiesScreen.js';
import type { TraceState } from './components/TraceBar.js';

type AuthState = 'checking' | 'anonymous' | 'signed-in' | 'error';

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
  const [activeScreen, setActiveScreen] = useState('facilities');
  const [activeRole, setActiveRole] = useState('warehouse_manager');
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
      brand="SC"
      userInitials="JO"
      principal={{
        name: 'Joy Okafor',
        email: 'j.okafor@trust.example',
        tenant: 'acme-eu',
        sub: '4f2a…9c1',
        relationsSummary: (
          <>
            Holds <code>warehouse_manager</code> on 4 facilities and{' '}
            <code>viewer</code> everywhere it derives.
          </>
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
      )}
    </EditorialShell>
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
): ReactNode {
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

  // Placeholder for the other nine screens.
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
