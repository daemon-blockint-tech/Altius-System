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
  /**
   * Local dev only: run anonymously against a dev gateway (ALTIUS_DEV_AUTH_BYPASS)
   * without an identity provider. Set VITE_DEV_NO_AUTH=true. App additionally
   * gates this on import.meta.env.DEV so a production bundle can never enable it.
   */
  devNoAuth: boolean;
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
  isProd = false,
): Promise<WebConfig> {
  let runtime: RuntimeConfig = {};
  let failed = false;
  try {
    const response = await fetchImpl('/config.json', { cache: 'no-store' });
    if (response.ok) runtime = (await response.json()) as RuntimeConfig;
    else failed = true;
  } catch {
    failed = true;
  }

  // A built bundle is always served by the image, whose entrypoint writes
  // /config.json unconditionally — so in production its absence means the
  // deployment is broken, and carrying on would run anonymously and have every
  // request rejected by the gateway with no explanation. Under `pnpm dev` there
  // is no container and no file, which is normal; that is the only reason this
  // could not be distinguished before.
  if (failed && isProd) {
    throw new Error(
      'Configuration could not be loaded (/config.json). The deployment is incomplete — ' +
      'the container entrypoint writes this file at start-up.',
    );
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
  // Absent OIDC config means this app has NO WAY to authenticate. It does not
  // mean requests will be accepted: the gateway refuses anonymous callers in
  // every environment, dev included —
  //   POST localhost:4099/graphql {"query":"{__typename}"}
  //   → {"errors":[{"message":"Authentication required",
  //                 "extensions":{"code":"UNAUTHENTICATED"}}]}
  // The only dev bypass that exists is MCP-only
  // (ALTIUS_MCP_DEV_AUTH_BYPASS, security/src/auth/dev-bypass.ts); nothing
  // equivalent gates GraphQL or REST.
  //
  // This used to claim the opposite — that the dev stack accepts
  // unauthenticated requests — and on that premise the app rendered its data
  // views and let every one of them fail 401, which reads as a broken app
  // rather than an unconfigured one. Null is still returned rather than
  // throwing, so the caller can say WHICH it is (see App's unconfigured
  // branch); it is a configuration state to report, not a crash.
  const oidc: OidcConfig | null = issuer
    ? { issuer, clientId, redirectUri: env['VITE_OIDC_REDIRECT_URI'] ?? origin }
    : null;

  return { endpoint, oidc, devNoAuth: env['VITE_DEV_NO_AUTH'] === 'true' };
}

export function createClient(
  endpoint: string,
  getToken: (() => Promise<string>) | null,
): Altius {
  // The SDK re-reads the provider per request and when the socket opens, so a
  // refreshed token is picked up without rebuilding the client.
  return new Altius({ endpoint, token: getToken ?? '' });
}
