/**
 * Decode the display claims from an access token.
 *
 * This is for SHOWING who is signed in (name, tenant, roles) in the chrome — not
 * for authorization. The gateway verifies the token's signature and enforces
 * every access decision server-side; the client never trusts these claims for
 * anything but display, so an unverified base64url decode is correct here.
 */

export interface TokenClaims {
  sub?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  /** Tenant claim — the gateway reads `tenant_id` by default. */
  tenant_id?: string;
  tenant?: string;
  /** Flat roles claim the gateway maps by default. */
  roles?: string[];
  /** Keycloak's default realm roles shape. */
  realm_access?: { roles?: string[] };
  /** NHS CIS2 roles claim. */
  nhsroles?: string | string[];
  [key: string]: unknown;
}

/** Decode a JWT's payload segment. Returns null on any malformed input. */
export function decodeJwtClaims(token: string): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

export interface Principal {
  name: string;
  email: string;
  tenant: string;
  sub: string;
  roles: string[];
}

/** Map token claims to a display principal, with safe fallbacks. */
export function principalFromClaims(claims: TokenClaims | null): Principal {
  if (!claims) {
    return { name: 'Unknown', email: '', tenant: 'default', sub: '', roles: [] };
  }
  const roles = claims.roles
    ?? claims.realm_access?.roles
    ?? (typeof claims.nhsroles === 'string' ? claims.nhsroles.split(/[,\s]+/).filter(Boolean) : claims.nhsroles)
    ?? [];
  return {
    name: claims.name ?? claims.preferred_username ?? claims.sub ?? 'Unknown',
    email: claims.email ?? '',
    tenant: claims.tenant_id ?? claims.tenant ?? 'default',
    sub: claims.sub ?? '',
    roles: Array.isArray(roles) ? roles : [],
  };
}
