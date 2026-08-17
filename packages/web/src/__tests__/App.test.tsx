/**
 * The unconfigured-app state.
 *
 * With no OIDC configured the app has no way to obtain a credential, and the
 * gateway refuses anonymous callers in every environment — dev included:
 *
 *   POST localhost:4099/graphql {"query":"{__typename}"}
 *   → {"errors":[{"message":"Authentication required",
 *                 "extensions":{"code":"UNAUTHENTICATED"}}]}
 *
 * It used to render the worklist anyway, on a comment in client.ts claiming the
 * dev stack accepted unauthenticated requests. Every widget then failed 401
 * behind its own Retry button, and the signed-out branch was unreachable
 * because it is guarded on `session &&` — so an unconfigured app was
 * indistinguishable from a broken one, with no sign-in affordance anywhere.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App.js';

// The SDK opens a WebSocket on subscribe; jsdom has no implementation and the
// table subscribes as soon as it renders. Only needed for the configured case.
vi.stubGlobal('WebSocket', class {
  close(): void {}
  addEventListener(): void {}
  send(): void {}
  readyState = 0;
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
});

describe('App with no OIDC configured', () => {
  it('says sign-in is unconfigured instead of rendering data that cannot load', () => {
    render(<App config={{ endpoint: '/graphql', oidc: null }} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Sign-in is not configured');
    // Names the variable to set, because "not configured" without the remedy
    // just relocates the dead end.
    expect(alert.textContent).toContain('VITE_OIDC_ISSUER');
  });

  it('renders no data widgets at all', () => {
    render(<App config={{ endpoint: '/graphql', oidc: null }} />);

    // No table, and no Retry button — the two things that made the old screen
    // read as a broken app rather than an unconfigured one.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('does not offer a Sign in button it could not honour', () => {
    // There is no issuer to redirect to, so a sign-in button would fail on
    // click. startLogin() already returns early in that case; not drawing the
    // button is the honest version of the same fact.
    render(<App config={{ endpoint: '/graphql', oidc: null }} />);
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });
});
