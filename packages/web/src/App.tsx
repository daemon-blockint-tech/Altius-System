import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionSchema } from './components/ActionForm.js';
import { createClient } from './client.js';
import type { WebConfig } from './client.js';
import { AuthSession } from './auth/session.js';
import { beginLogin, completeLogin } from './auth/pkce.js';
import { isAuthFailure } from './auth/auth-failure.js';
import { decodeJwtClaims, principalFromClaims } from './auth/claims.js';
import type { Principal } from './auth/claims.js';
import { fetchPacks } from './packs.js';
import { EditorialShell } from './components/EditorialShell.js';
import type { JobKey, PackOption, RoleOption } from './components/EditorialShell.js';
import type { ActiveFilter, FacilityStats } from './components/FacilitiesScreen.js';
import { ObjectDetailScreen } from './components/ObjectDetailScreen.js';
import { setWidgetAuthProvider } from './widgets/auth-fetch.js';
import { jobsFor, findScreen, screensFor, JOB_LABELS } from './screens/registry.js';
import { QuickSearch } from './components/QuickSearch.js';
import type { QuickSearchItem } from './components/QuickSearch.js';
import { INTROSPECTION, deriveBrowsableTypes } from './components/ObjectBrowserScreen.js';
import type { IntrospectionData } from './components/ObjectBrowserScreen.js';
import type { ScreenContext } from './screens/registry.js';
import { useRoute } from './routing/useRoute.js';
import type { Route } from './routing/route.js';
import type { Crumb } from './components/Breadcrumb.js';

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
  // Local-dev anonymous mode: only when this is a DEV build AND the flag is set.
  // A production bundle has import.meta.env.DEV === false, so it can never engage.
  const devNoAuth = import.meta.env.DEV && config.devNoAuth;
  const [authState, setAuthState] = useState<AuthState>(
    config.oidc ? 'checking' : (devNoAuth ? 'signed-in' : 'anonymous'),
  );
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

  // Register the bearer token for the Workshop widget REST clients, which
  // otherwise call the gateway unauthenticated. Cleared on sign-out.
  useEffect(() => {
    setWidgetAuthProvider(session && authState === 'signed-in' ? session.getAccessToken : null);
    return () => setWidgetAuthProvider(null);
  }, [session, authState]);

  // Real signed-in principal, decoded from the access token's display claims —
  // replaces the former hardcoded demo identity. Authorization is unaffected:
  // the gateway verifies the token and enforces access server-side.
  const [principal, setPrincipal] = useState<Principal | null>(null);
  useEffect(() => {
    if (devNoAuth) {
      setPrincipal({ name: 'Dev User', email: 'dev@localhost', tenant: 'default', sub: 'dev', roles: ['admin'] });
      return;
    }
    if (authState !== 'signed-in' || !session) { setPrincipal(null); return; }
    let live = true;
    session.getAccessToken()
      .then(t => { if (live) setPrincipal(principalFromClaims(decodeJwtClaims(t))); })
      .catch(() => { if (live) setPrincipal(null); });
    return () => { live = false; };
  }, [authState, session]);

  // The actually-loaded packs, from the gateway — replaces the hardcoded list.
  // Falls back to the built-in list only while loading or if the call fails.
  const [packs, setPacks] = useState<PackOption[]>(PACKS);
  useEffect(() => {
    if (authState !== 'signed-in') return;
    const getToken = session && authState === 'signed-in' ? session.getAccessToken : null;
    let live = true;
    fetchPacks(getToken)
      .then(p => { if (live && p.length > 0) setPacks(p); })
      .catch(() => { /* keep the fallback list */ });
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

  // Where we are lives in the URL: a breadcrumb can read it, Back works, and a
  // link to a record can be sent to someone else. `route` is null when the URL
  // is not a location — the app shows a not-found screen rather than guessing.
  const { route, navigate, replace } = useRoute();
  const DEFAULT_ROUTE: Route = { pack: 'supply-chain', job: 'OP', screen: 'objects' };
  const here = route ?? DEFAULT_ROUTE;
  const activePack = here.pack;
  const activeJob = here.job;
  const activeScreen = here.screen;
  const detailObject = here.record ?? null;

  const [searchOpen, setSearchOpen] = useState(false);
  const [objectTypes, setObjectTypes] = useState<string[]>([]);

  // Cmd/Ctrl+K from anywhere. Ctrl+J is what the reference product uses, but
  // that is Chrome's Downloads shortcut on Windows and Linux.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The object types the gateway exposes — the same governed introspection the
  // object browser uses, so the search can only offer what a read would return.
  useEffect(() => {
    if (authState !== 'signed-in' && !devNoAuth) { setObjectTypes([]); return; }
    let live = true;
    const token = session && authState === 'signed-in' ? session.getAccessToken : null;
    void (async () => {
      try {
        const auth = token ? await token() : '';
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
          body: JSON.stringify({ query: INTROSPECTION }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: IntrospectionData };
        if (live && json.data) setObjectTypes(deriveBrowsableTypes(json.data).map(t => t.typeName));
      } catch {
        // A search with no types is still a search over screens.
      }
    })();
    return () => { live = false; };
  }, [authState, session, config.endpoint, devNoAuth]);

  const [activeRole, setActiveRole] = useState('warehouse_manager');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Landing on `/` is not a location; correct it to the default without
  // leaving a history entry the Back button would have to walk through.
  useEffect(() => {
    if (route === null && window.location.pathname === '/') replace(DEFAULT_ROUTE);
    // DEFAULT_ROUTE is a literal rebuilt each render; its value never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, replace]);

  // No fabricated facility stats — the Facilities screen renders without a stats
  // banner until a real source is wired (a placeholder banner invented numbers).
  const facilityStats: FacilityStats | null = null;

  /**
   * The path to here, read off the URL. Each crumb navigates to the location
   * it names, so the record view has a way back that is not the browser's.
   */
  const jobs = jobsFor(activePack);
  const screen = findScreen(activePack, activeScreen);


  const crumbs = (): Crumb[] => {
    const job = jobs.find(j => j.key === activeJob);
    const screen = job?.screens.find(sc => sc.id === activeScreen);
    const packName = packs.find(p => p.id === activePack)?.name ?? activePack;

    const path: Crumb[] = [
      { label: packName },
      { label: job?.label ?? activeJob, onClick: () => handleScreenSelect(activeJob, job?.screens[0]?.id ?? activeScreen) },
      {
        label: screen?.label ?? activeScreen,
        ...(detailObject ? { onClick: closeRecord } : {}),
      },
    ];
    if (detailObject) path.push({ label: `${detailObject.type} ${detailObject.id}` });
    return path;
  };

  const handleScreenSelect = (job: JobKey, screenId: string): void => {
    navigate({ pack: activePack, job, screen: screenId });
  };

  const setActivePack = (pack: string): void => {
    navigate({ pack, job: activeJob, screen: activeScreen });
  };

  /** Open a record over the current screen — its own address, so it is linkable. */
  const openRecord = (type: string, id: string): void => {
    navigate({ pack: activePack, job: activeJob, screen: activeScreen, record: { type, id } });
  };

  const closeRecord = (): void => {
    navigate({ pack: activePack, job: activeJob, screen: activeScreen });
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

  if (!config.oidc && !devNoAuth) {
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

  // The role selector reflects the roles the identity token actually grants —
  // roles are server-enforced, so this shows reality rather than a fixed list.
  /**
   * What the search can reach: the screens this pack renders, and the object
   * types this deployment exposes. Both are real — nothing is listed that
   * clicking it cannot open.
   */
  const searchItems: QuickSearchItem[] = [
    ...screensFor(activePack).map(sc => ({
      kind: 'screen' as const,
      id: sc.id,
      label: sc.label,
      context: JOB_LABELS[sc.job],
    })),
    ...objectTypes.map(name => ({
      kind: 'type' as const,
      id: name,
      label: name,
      context: 'Object browser',
    })),
  ];

  const pickSearchResult = (item: QuickSearchItem): void => {
    setSearchOpen(false);
    if (item.kind === 'screen') {
      const def = findScreen(activePack, item.id);
      if (def) handleScreenSelect(def.job, def.id);
      return;
    }
    // An object type opens the browser, which is where types are listed.
    handleScreenSelect('OP', 'objects');
  };

  const screenContext: ScreenContext = {
    packId: activePack,
    client,
    config,
    principal,
    getToken: session && authState === 'signed-in' ? session.getAccessToken : null,
    guardAuth,
    loadActions,
    openRecord,
    filters: activeFilters,
    onAddFilter: handleAddFilter,
    onRemoveFilter: handleRemoveFilter,
    facilityStats,
  };

  const roleOptions = principal && principal.roles.length > 0
    ? principal.roles.map(r => ({ id: r, label: r }))
    : ROLES;

  return (
    <>
    <EditorialShell
      packs={packs}
      activePack={activePack}
      onPackChange={setActivePack}
      jobs={jobs}
      activeJob={activeJob}
      activeScreen={activeScreen}
      onScreenSelect={handleScreenSelect}
      roles={roleOptions}
      activeRole={roleOptions.some(r => r.id === activeRole) ? activeRole : (roleOptions[0]?.id ?? activeRole)}
      onRoleChange={setActiveRole}
      crumbs={crumbs()}
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
      hidden={[]}
      events={[]}
      feedLive={false}
      trace={null}
    >
      {screen
        ? screen.render(screenContext)
        : (
          <main className="ed-main">
            <header className="ed-main__header">
              <span className="ed-main__eyebrow">NOT FOUND</span>
              <h1 className="ed-main__title">No screen at this address</h1>
              <p className="ed-main__lede">
                <code>{window.location.pathname}</code> does not name a screen the{' '}
                <strong>{packs.find(p => p.id === activePack)?.name ?? activePack}</strong> pack can show.
                Pick one from the navigation, or switch pack.
              </p>
            </header>
          </main>
        )}
    </EditorialShell>


    <QuickSearch
      open={searchOpen}
      items={searchItems}
      onClose={() => setSearchOpen(false)}
      onPick={pickSearchResult}
    />

    {detailObject && (
      <ObjectDetailScreen
        objectType={detailObject.type}
        objectId={detailObject.id}
        getToken={session && authState === 'signed-in' ? session.getAccessToken : null}
        onClose={closeRecord}
      />
)}
    </>
  );

  async function startLogin(): Promise<void> {
    if (!config.oidc) return;
    window.location.assign(await beginLogin(config.oidc));
  }
}
