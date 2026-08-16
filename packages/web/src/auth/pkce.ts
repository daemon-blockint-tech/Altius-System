/**
 * OAuth 2.0 authorization-code flow with PKCE, against the shipped Keycloak.
 *
 * No dependency: the whole of PKCE is a random string, a SHA-256, and base64url,
 * all of which `crypto.subtle` already provides. An OIDC library here would be
 * ~40 lines of logic wrapped in a supply-chain surface that sees every token.
 *
 * Two constraints are load-bearing and non-obvious, both verified against the
 * shipped realm (Orion/keycloak/altius-realm.json):
 *
 *  1. The gateway must be sent the ACCESS token, never the ID token. The realm's
 *     audience, tenant_id and roles mappers all set `id.token.claim: false`, so
 *     an ID token carries none of them and fails the gateway's audience and
 *     MISSING_TENANT checks.
 *  2. The SPA must reuse client id `altius`. The audience mapper lives on that
 *     client, and the gateway binds its expected audience to OIDC_CLIENT_ID, so
 *     a separate `altius-web` client would mint tokens with `aud: account`
 *     that the gateway rejects.
 */

export interface OidcConfig {
  /** e.g. http://localhost:8180/auth/realms/altius */
  issuer: string;
  /** Must be the client the gateway's audience is bound to. */
  clientId: string;
  /** Where Keycloak sends the browser back. Must be registered on the client. */
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

const VERIFIER_KEY = 'altius.pkce.verifier';
const STATE_KEY = 'altius.pkce.state';

/** Keycloak's default access-token lifespan, used only if the IdP omits expires_in. */
const FALLBACK_LIFETIME_S = 300;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizeEndpoint(config: OidcConfig): string {
  return `${config.issuer}/protocol/openid-connect/auth`;
}

export function tokenEndpoint(config: OidcConfig): string {
  return `${config.issuer}/protocol/openid-connect/token`;
}

/**
 * Build the authorize URL and persist the verifier and state for the return leg.
 *
 * The verifier has to survive a full-page redirect, so it goes in sessionStorage
 * rather than memory. That is the standard trade and is bounded: it is scoped to
 * the tab, cleared the moment the code is exchanged, and useless without the
 * matching authorization code.
 */
export async function beginLogin(
  config: OidcConfig,
  storage: Storage = sessionStorage,
): Promise<string> {
  const verifier = randomString();
  const state = randomString(16);
  storage.setItem(VERIFIER_KEY, verifier);
  storage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: 'openid',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  });
  return `${authorizeEndpoint(config)}?${params.toString()}`;
}

function toTokenSet(body: TokenResponse, now: number): TokenSet {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: now + (body.expires_in ?? FALLBACK_LIFETIME_S) * 1000,
  };
}

async function postForm(url: string, form: URLSearchParams, now: number): Promise<TokenSet> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!response.ok) {
    // The body carries Keycloak's `error_description`, which is the only thing
    // that distinguishes a misregistered redirect URI from an expired code.
    const detail = await response.text().catch(() => '');
    throw new Error(`Token request failed: ${response.status} ${response.statusText} ${detail}`.trim());
  }
  return toTokenSet((await response.json()) as TokenResponse, now);
}

/**
 * Exchange the authorization code for tokens.
 *
 * Rejects when `state` does not match what we stored: without that check an
 * attacker can hand the browser a code of their choosing and log the user into
 * the attacker's account (CSRF on the login itself).
 */
export async function completeLogin(
  config: OidcConfig,
  params: URLSearchParams,
  storage: Storage = sessionStorage,
  now: number = Date.now(),
): Promise<TokenSet> {
  const error = params.get('error');
  if (error) {
    throw new Error(`Authorization failed: ${error} ${params.get('error_description') ?? ''}`.trim());
  }

  const code = params.get('code');
  if (!code) throw new Error('Authorization response carried no code.');

  const expectedState = storage.getItem(STATE_KEY);
  if (!expectedState || params.get('state') !== expectedState) {
    throw new Error('Authorization state mismatch — refusing to exchange the code.');
  }

  const verifier = storage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('No PKCE verifier for this login — start the login again.');

  // Single-use: a verifier left behind is a replay primitive.
  storage.removeItem(VERIFIER_KEY);
  storage.removeItem(STATE_KEY);

  return postForm(
    tokenEndpoint(config),
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
    now,
  );
}

export async function refreshTokens(
  config: OidcConfig,
  refreshToken: string,
  now: number = Date.now(),
): Promise<TokenSet> {
  return postForm(
    tokenEndpoint(config),
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
    now,
  );
}
