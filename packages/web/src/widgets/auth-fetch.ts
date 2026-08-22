/**
 * Authenticated fetch for the Workshop widget REST clients.
 *
 * The six clients (workshop, timeseries, scenario, comments, geospatial,
 * attachment) called the gateway with no Authorization header, so every request
 * was rejected 401 — the whole Workshop subsystem could not reach the API. Route
 * them through authedFetch, which attaches the bearer token the app registers
 * once at sign-in, rather than threading a token through 50+ call sites.
 */

let tokenProvider: (() => Promise<string>) | null = null;

/** Register (or clear) the token source. Called by the app when auth changes. */
export function setWidgetAuthProvider(provider: (() => Promise<string>) | null): void {
  tokenProvider = provider;
}

/** fetch with the registered bearer token attached, preserving any other init. */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenProvider ? await tokenProvider() : '';
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
