/**
 * PKCE flow and session refresh.
 *
 * The security-relevant cases are the ones worth having: state mismatch must
 * refuse the exchange (otherwise an attacker hands the browser a code of their
 * choosing and logs the user into the attacker's account), the verifier must be
 * single-use, and concurrent requests must not each spend a refresh token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { beginLogin, completeLogin, challengeFor, refreshTokens } from '../pkce.js';
import type { OidcConfig } from '../pkce.js';
import { AuthSession } from '../session.js';

const CONFIG: OidcConfig = {
  issuer: 'http://localhost:8180/auth/realms/altius',
  clientId: 'altius',
  redirectUri: 'http://localhost:5173/callback',
};

/** Minimal in-memory Storage. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function tokenResponse(body: Record<string, unknown>, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('PKCE authorize URL', () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it('sends S256 and a challenge derived from the stored verifier', async () => {
    const url = new URL(await beginLogin(CONFIG, storage));

    expect(url.origin + url.pathname).toBe(
      'http://localhost:8180/auth/realms/altius/protocol/openid-connect/auth',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    // Reusing the gateway's client id is mandatory: the audience mapper lives on
    // it, and a different client mints tokens the gateway rejects.
    expect(url.searchParams.get('client_id')).toBe('altius');

    // The challenge must actually be S256(verifier), not a second random value.
    const verifier = storage.getItem('altius.pkce.verifier')!;
    expect(url.searchParams.get('code_challenge')).toBe(await challengeFor(verifier));
  });

  it('is base64url with no padding, as the spec requires', async () => {
    const url = new URL(await beginLogin(CONFIG, storage));
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('completing the login', () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it('exchanges the code with the verifier and returns an expiry', async () => {
    await beginLogin(CONFIG, storage);
    const state = storage.getItem('altius.pkce.state')!;
    const verifier = storage.getItem('altius.pkce.verifier')!;
    const fetchMock = tokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    globalThis.fetch = fetchMock;

    const tokens = await completeLogin(
      CONFIG,
      new URLSearchParams({ code: 'the-code', state }),
      storage,
      1_000,
    );

    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000 + 3_600_000 });
    const body = new URLSearchParams(
      ((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe(verifier);
    expect(body.get('code')).toBe('the-code');
  });

  it('refuses to exchange when state does not match', async () => {
    await beginLogin(CONFIG, storage);
    globalThis.fetch = tokenResponse({ access_token: 'at' });

    await expect(
      completeLogin(CONFIG, new URLSearchParams({ code: 'c', state: 'attacker' }), storage),
    ).rejects.toThrow(/state mismatch/i);
  });

  it('consumes the verifier so a code cannot be replayed', async () => {
    await beginLogin(CONFIG, storage);
    const state = storage.getItem('altius.pkce.state')!;
    globalThis.fetch = tokenResponse({ access_token: 'at', expires_in: 60 });

    await completeLogin(CONFIG, new URLSearchParams({ code: 'c', state }), storage, 0);
    expect(storage.getItem('altius.pkce.verifier')).toBeNull();

    await expect(
      completeLogin(CONFIG, new URLSearchParams({ code: 'c', state }), storage),
    ).rejects.toThrow();
  });

  it('surfaces an IdP error rather than treating it as a missing code', async () => {
    await expect(
      completeLogin(
        CONFIG,
        new URLSearchParams({ error: 'invalid_request', error_description: 'bad redirect_uri' }),
        storage,
      ),
    ).rejects.toThrow(/bad redirect_uri/);
  });
});

describe('AuthSession', () => {
  it('returns the current token while it is still valid', async () => {
    const session = new AuthSession(CONFIG, () => 1_000);
    session.adopt({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000_000 });
    globalThis.fetch = tokenResponse({ access_token: 'should-not-be-called' });

    expect(await session.getAccessToken()).toBe('at');
  });

  it('refreshes once for concurrent callers, not once each', async () => {
    // With refresh-token rotation every extra call invalidates the previous
    // token, so a table firing several queries at once would fail all but one.
    const fetchMock = tokenResponse({ access_token: 'fresh', refresh_token: 'rt2', expires_in: 3600 });
    globalThis.fetch = fetchMock;
    const session = new AuthSession(CONFIG, () => 100_000);
    session.adopt({ accessToken: 'stale', refreshToken: 'rt', expiresAt: 100_000 });

    const [a, b, c] = await Promise.all([
      session.getAccessToken(),
      session.getAccessToken(),
      session.getAccessToken(),
    ]);

    expect([a, b, c]).toEqual(['fresh', 'fresh', 'fresh']);
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('refreshes ahead of expiry rather than at it', async () => {
    // A token that expires mid-flight fails the request it was attached to.
    globalThis.fetch = tokenResponse({ access_token: 'fresh', expires_in: 3600 });
    const session = new AuthSession(CONFIG, () => 0);
    session.adopt({ accessToken: 'stale', refreshToken: 'rt', expiresAt: 20_000 });

    expect(await session.getAccessToken()).toBe('fresh');
  });

  it('reports expiry with no refresh token instead of sending a dead one', async () => {
    const session = new AuthSession(CONFIG, () => 100_000);
    session.adopt({ accessToken: 'stale', refreshToken: null, expiresAt: 0 });

    await expect(session.getAccessToken()).rejects.toThrow(/no refresh token/i);
  });

  it('throws before login rather than sending an empty Authorization header', async () => {
    const session = new AuthSession(CONFIG);
    await expect(session.getAccessToken()).rejects.toThrow(/not authenticated/i);
  });
});

describe('session expiry', () => {
  it('signals expiry when the refresh is rejected', async () => {
    // The refresh token is spent or expired. Retrying reuses it, so this is the
    // end of the session, not a transient error — and without a signal the app
    // stays "signed in" behind a Retry that can never succeed.
    const onExpired = vi.fn();
    globalThis.fetch = tokenResponse({ error: 'invalid_grant' }, false);
    const session = new AuthSession(CONFIG, () => 100_000, onExpired);
    session.adopt({ accessToken: 'stale', refreshToken: 'rt', expiresAt: 100_000 });

    await expect(session.getAccessToken()).rejects.toThrow();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(session.isAuthenticated).toBe(false);
  });

  it('signals expiry when there is nothing to refresh with', async () => {
    const onExpired = vi.fn();
    const session = new AuthSession(CONFIG, () => 100_000, onExpired);
    session.adopt({ accessToken: 'stale', refreshToken: null, expiresAt: 0 });

    await expect(session.getAccessToken()).rejects.toThrow(/no refresh token/i);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('signals once even when several requests hit the dead session together', async () => {
    // A table firing three queries must not produce three redirects to login.
    const onExpired = vi.fn();
    globalThis.fetch = tokenResponse({ error: 'invalid_grant' }, false);
    const session = new AuthSession(CONFIG, () => 100_000, onExpired);
    session.adopt({ accessToken: 'stale', refreshToken: 'rt', expiresAt: 100_000 });

    await Promise.allSettled([
      session.getAccessToken(),
      session.getAccessToken(),
      session.getAccessToken(),
    ]);

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not signal expiry while the token is still valid', async () => {
    const onExpired = vi.fn();
    const session = new AuthSession(CONFIG, () => 1_000, onExpired);
    session.adopt({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000_000 });

    expect(await session.getAccessToken()).toBe('at');
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('refreshTokens', () => {
  it('posts the refresh grant with the client id', async () => {
    const fetchMock = tokenResponse({ access_token: 'a2', refresh_token: 'r2', expires_in: 60 });
    globalThis.fetch = fetchMock;

    const set = await refreshTokens(CONFIG, 'r1', 5_000);

    expect(set).toEqual({ accessToken: 'a2', refreshToken: 'r2', expiresAt: 65_000 });
    const body = new URLSearchParams(
      ((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('altius');
  });
});
