/**
 * Configuration for the app.
 *
 * The GraphQL endpoint defaults to a RELATIVE path. Vite inlines env vars at
 * build time, so an absolute endpoint means one bundle per environment and a
 * build that silently succeeds while producing something that throws on first
 * paint. A relative default makes the same artifact promotable from staging to
 * production, and it is what the deployment can actually guarantee — whatever
 * serves the bundle proxies /graphql to the gateway.
 *
 * OIDC settings have no safe default and are required in production: guessing
 * an issuer would send a user's credentials to the wrong host.
 */

import { Altius } from '@altius/sdk';
import type { OidcConfig } from './auth/pkce.js';

export interface WebConfig {
  endpoint: string;
  oidc: OidcConfig | null;
}

/** Shape written by docker-entrypoint.sh and served from the image. */
interface RuntimeConfig {
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcRedirectUri?: string;
}

/**
 * Resolve config at startup, preferring what the container wrote.
 *
 * vite inlines VITE_* at build time, so relying on them alone pins the bundle
 * to one environment. /config.json is written per container, which is what
 * makes a single image promotable. The build-time values remain the fallback so
 * `pnpm dev` works with no container involved.
 *
 * A missing or unparseable /config.json is NOT fatal: against the dev stack
 * there is no OIDC to configure, and failing startup over an absent optional
 * file would be worse than running the way the dev stack expects.
 */
export async function loadConfig(
  env: Record<string, string | undefined>,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebConfig> {
  let runtime: RuntimeConfig = {};
  try {
    const response = await fetchImpl('/config.json', { cache: 'no-store' });
    if (response.ok) runtime = (await response.json()) as RuntimeConfig;
  } catch {
    // Left empty on purpose — see above.
  }

  return readConfig(
    {
      ...env,
      // Runtime wins: the container knows which environment it is in, the
      // build does not. Empty strings are treated as unset so an unconfigured
      // container falls back rather than half-configuring OIDC.
      ...(runtime.oidcIssuer ? { VITE_OIDC_ISSUER: runtime.oidcIssuer } : {}),
      ...(runtime.oidcClientId ? { VITE_OIDC_CLIENT_ID: runtime.oidcClientId } : {}),
      ...(runtime.oidcRedirectUri ? { VITE_OIDC_REDIRECT_URI: runtime.oidcRedirectUri } : {}),
    },
    origin,
  );
}

export function readConfig(
  env: Record<string, string | undefined>,
  origin: string,
): WebConfig {
  const endpoint = env['VITE_ALTIUS_ENDPOINT'] ?? '/graphql';

  const issuer = env['VITE_OIDC_ISSUER'];
  const clientId = env['VITE_OIDC_CLIENT_ID'] ?? 'altius';
  // Absent OIDC config is legitimate against the dev stack, which runs with
  // NODE_ENV=development and accepts unauthenticated requests. Returning null
  // rather than throwing keeps `pnpm dev` working without a Keycloak, while
  // production is covered by the gateway refusing anonymous callers.
  const oidc: OidcConfig | null = issuer
    ? { issuer, clientId, redirectUri: env['VITE_OIDC_REDIRECT_URI'] ?? origin }
    : null;

  return { endpoint, oidc };
}

export function createClient(
  endpoint: string,
  getToken: (() => Promise<string>) | null,
): Altius {
  // The SDK re-reads the provider per request and when the socket opens, so a
  // refreshed token is picked up without rebuilding the client.
  return new Altius({ endpoint, token: getToken ?? '' });
}
