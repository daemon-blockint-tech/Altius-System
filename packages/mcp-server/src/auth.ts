/**
 * Auth boundary for the MCP server.
 *
 * Extracts the OIDC bearer token from the Authorization header and validates
 * it via the same OidcAuthenticator used by the REST/GraphQL surface. An agent
 * is just another OIDC principal — no special identity, no bypass. In dev mode
 * (isDev=true), a missing token resolves to the dev-user identity, mirroring
 * the API gateway's extractUser behavior.
 */

import type { OidcAuthenticator, AuthenticatedUser } from '@altius/security';
import { AuthenticationError } from '@altius/security';
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
  tenantId: 'default',
};

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
 * @param isDev       - whether dev-mode auth bypass is allowed
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
    if (isDev) {
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
