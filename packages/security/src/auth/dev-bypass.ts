/**
 * The unauthenticated development identity, and the gate that decides whether
 * any surface may serve it.
 *
 * Both live here because two surfaces need them and each surface having its
 * own copy is what produced the defect this file exists to close: the MCP
 * endpoint required a deliberate opt-in before falling back to this identity,
 * while the REST/GraphQL surface handed it out whenever `NODE_ENV` was merely
 * not the literal string `production`. Same identity, same fallback, two
 * different answers to "may I".
 *
 * `NODE_ENV !== 'production'` is a fail-OPEN test. It is satisfied by the
 * variable being unset, misspelled, or capitalised differently — and the
 * published api-gateway image sets no default, so `docker run` of a release
 * image with no environment served a full-admin identity to any request with
 * no Authorization header at all. Staging, UAT and demo boxes are the same
 * shape: not production, and absolutely not places to serve an admin.
 */

import type { AuthenticatedUser } from './types.js';

/**
 * Fallback identity for an unauthenticated request when the bypass is on.
 *
 * It holds every platform role, which is the point: it exists so a developer
 * can exercise the whole surface without standing up Keycloak. That is also
 * exactly why reaching it must take a deliberate act.
 */
export const DEV_USER: AuthenticatedUser = {
  id: 'dev-user',
  name: 'Development User',
  email: 'dev@altius.local',
  roles: [
    'admin',
    'clinician',
    'nurse_in_charge',
    'compliance_analyst',
    'compliance_officer',
    'bsa_officer',
    'operator',
    'governor',
    'auditor',
  ],
  groups: [],
  tenantId: 'default',
};

/**
 * Whether a surface may serve DEV_USER for a request that carried no token.
 *
 * Two conditions, both required, and both fail closed:
 *   - the surface's own opt-in flag is the exact string 'true'
 *   - NODE_ENV is not 'production'
 *
 * The flag name is per-surface (the REST/GraphQL gateway and the MCP endpoint
 * are enabled independently) but the decision is one function, so the two
 * cannot drift into disagreeing about what "development" means.
 *
 * Read per call rather than captured at import, so a test can flip it without
 * re-importing the module.
 */
export function devAuthBypassEnabled(flagEnvVar: string): boolean {
  return (
    process.env[flagEnvVar] === 'true' &&
    process.env['NODE_ENV'] !== 'production'
  );
}
