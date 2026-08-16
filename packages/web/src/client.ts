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
