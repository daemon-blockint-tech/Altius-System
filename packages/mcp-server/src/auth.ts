/**
 * Auth boundary for the MCP server.
 *
 * Extracts the OIDC bearer token from the Authorization header and validates
 * it via the same OidcAuthenticator used by the REST/GraphQL surface. An agent
 * is just another OIDC principal — no special identity, no bypass. The
 * dev-user fallback for a missing token is opt-in only (see devBypassEnabled):
 * NODE_ENV !== 'production' alone covers staging/UAT/demo boxes, which must
 * never serve an unauthenticated admin identity.
 */

import type { OidcAuthenticator, AuthenticatedUser } from '@altius/security';
import { AuthenticationError, DEV_USER, devAuthBypassEnabled } from '@altius/security';
import type { RequestContext } from '@altius/spi';

/** Dev-mode fallback user (mirrors packages/api/src/config.ts extractUser). */
const DEV_USER: AuthenticatedUser = {
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
  // No markings, deliberately: the dev fallback must not be a way past a
  // mandatory control. A deployment that configures markings denies this user
  // every marked type, which is the correct outcome for a stand-in identity.
  markings: [],
  tenantId: 'default',
};

/**
 * Whether the unauthenticated dev-user fallback may be used at all.
 *
 * Requires a deliberate opt-in (ALTIUS_MCP_DEV_AUTH_BYPASS=true) and is never
 * honoured when NODE_ENV=production. The identity and the two-condition gate
 * are shared with the REST/GraphQL surface — this file used to carry its own
 * copy of both, and the copy on the other surface was not gated at all.
 */
function devBypassEnabled(): boolean {
  return devAuthBypassEnabled('ALTIUS_MCP_DEV_AUTH_BYPASS');
}

/**
 * Result of authenticating an incoming MCP request.
 */
export interface AuthResult {
  ok: true;
  user: AuthenticatedUser;
  requestContext: RequestContext;
}

/**
 * Authenticate an incoming HTTP request to the MCP endpoint.
 *
 * @param authHeader  - raw Authorization header value (or undefined)
 * @param authenticator - configured OIDC authenticator
 * @param isDev       - dev mode; the bypass additionally requires
 *                      ALTIUS_MCP_DEV_AUTH_BYPASS=true outside production
 * @param traceId     - trace ID for the request context
 * @returns AuthResult on success, or an HTTP status code on failure (401)
 */
export async function authenticateMcpRequest(
  authHeader: string | undefined,
  authenticator: OidcAuthenticator,
  isDev: boolean,
  traceId: string,
): Promise<AuthResult | { ok: false; status: 401; message: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    if (isDev && devBypassEnabled()) {
      return {
        ok: true,
        user: DEV_USER,
        requestContext: { tenantId: DEV_USER.tenantId, traceId },
      };
    }
    return { ok: false, status: 401, message: 'Authorization header required' };
  }

  const token = authHeader.slice(7);
  try {
    const user = await authenticator.authenticate(token);
    return {
      ok: true,
      user,
      requestContext: { tenantId: user.tenantId, traceId },
    };
  } catch (err) {
    const message = err instanceof AuthenticationError ? err.message : 'Authentication failed';
    return { ok: false, status: 401, message };
  }
}
