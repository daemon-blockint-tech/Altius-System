/**
 * The single Altius client for the app.
 *
 * Endpoint and token come from the environment at build time. The token is
 * deliberately NOT defaulted: a bundle that silently ships with no credential
 * fails at the first query with an opaque 401, whereas failing here names the
 * missing variable. Real OIDC login replaces the injected token later; the
 * client surface does not change when it does.
 */

import { Altius } from '@altius/sdk';

export interface WebConfig {
  endpoint: string;
  token: string;
}

export function readConfig(env: Record<string, string | undefined>): WebConfig {
  const endpoint = env['VITE_ALTIUS_ENDPOINT'];
  if (!endpoint) {
    throw new Error('VITE_ALTIUS_ENDPOINT is not set — the UI has no API to talk to.');
  }
  return { endpoint, token: env['VITE_ALTIUS_TOKEN'] ?? '' };
}

export function createClient(config: WebConfig): Altius {
  return new Altius({ endpoint: config.endpoint, token: config.token });
}
