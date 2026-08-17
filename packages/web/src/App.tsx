import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ObjectTable } from './components/ObjectTable.js';
import { ActionPanel } from './components/ActionPanel.js';
import type { ActionSchema } from './components/ActionForm.js';
import { createClient } from './client.js';
import type { WebConfig } from './client.js';
import { AuthSession } from './auth/session.js';
import { beginLogin, completeLogin } from './auth/pkce.js';

type AuthState = 'checking' | 'anonymous' | 'signed-in' | 'error';

/**
 * Patient worklist.
 *
 * `load` is handed straight to the generated SDK method, so the table talks to
 * the same governed GraphQL surface as every other client: FGA-filtered,
 * field-redacted and consent-gated server-side. The UI adds no data access of
 * its own, which is what keeps the permission model in one place.
 */
export function App({ config }: { config: WebConfig }): ReactNode {
  // React 18+ runs effects twice in StrictMode; exchanging a single-use code
  // twice would fail the second time and look like a broken login. Reset on
  // expiry so a fresh login can exchange again.
  const exchanged = useRef(false);
  // Declared before the session so the expiry callback can reach it.
  const [authState, setAuthState] = useState<AuthState>(config.oidc ? 'checking' : 'anonymous');
  const session = useMemo(
    () =>
      config.oidc
        ? new AuthSession(config.oidc, Date.now, () => {
            // The session cannot be renewed. Return to the signed-out view so
            // there is a way back in — otherwise every request throws behind a
            // Retry button that can never succeed.
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
        // Drop the code and state from the address bar so a reload does not
        // retry a code that has already been spent.
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

  // Memoised so ActionPanel refetches only when the client actually changes,
  // not on every render of this component.
  const loadActions = useMemo(
    () => async (): Promise<ActionSchema[]> => {
      const tools = await client.actions.available({ kind: 'action' });
      return tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ActionSchema['parameters'],
      }));
    },
    [client],
  );

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

  return (
    <main>
      <h1>Altius</h1>
      <ObjectTable
        caption="Patients"
        columns={[
          { key: 'nhsNumber', header: 'NHS number' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'triageCategory', header: 'Triage' },
        ]}
        load={({ first, after }) =>
          client.patient.list(undefined, after === undefined ? { first } : { first, after })
        }
        subscribe={(onChange, onLost, onResumed) =>
          client.patient.onAnyChange(() => onChange(), undefined, onLost, onResumed)
        }
      />

      <ActionPanel
        loadActions={loadActions}
        submit={(name, input) => client.actions.invoke(name, input)}
      />
    </main>
  );

  async function startLogin(): Promise<void> {
    if (!config.oidc) return;
    window.location.assign(await beginLogin(config.oidc));
  }
}
