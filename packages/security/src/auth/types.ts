/**
 * Authentication types for the Altius security layer.
 *
 * Aligns with the AuditActor type from @altius/spi (Section 7.2)
 * to ensure authenticated users can be directly mapped to audit records.
 */

/** A successfully authenticated user with resolved platform identity. */
export interface AuthenticatedUser {
  /** OIDC subject claim (unique user identifier). */
  id: string;
  /** Display name from OIDC profile claims. */
  name: string;
  /** Email from OIDC profile claims. */
  email: string;
  /** Platform roles resolved from token claims. */
  roles: string[];
  /** Group memberships from token claims. */
  groups: string[];
  /** Tenant identifier (from claim or configured mapping). */
  tenantId: string;
  /**
   * Mandatory access-control markings this caller holds.
   *
   * Sourced from a token claim, not from platform state: marking eligibility
   * usually reflects a process outside the platform (clearance, training,
   * contract), and the identity provider is where that lives. Absent claim
   * means an empty list, which denies every marked resource — markings are a
   * restriction, so the safe default is to hold none.
   *
   * Optional so an identity built by a path that predates markings still
   * compiles; omitting it denies every marked type rather than granting one,
   * so forgetting to populate it fails closed.
   */
  markings?: string[];
}

/** Platform identity derived from authentication, compatible with AuditActor. */
export interface PlatformIdentity {
  type: "user";
  id: string;
  roles: string[];
}

/** Configuration for OIDC authentication. */
export interface OidcConfig {
  /** OIDC issuer URL (used to validate `iss` claim). */
  issuer: string;
  /** Expected audience (used to validate `aud` claim). */
  clientId: string;
  /** JWKS endpoint for signature verification. */
  jwksUri: string;
  /** Claim name for tenant ID. Defaults to 'tenant_id'. */
  tenantClaim?: string;
  /** Default tenant ID when claim is not present. */
  defaultTenantId?: string;
  /** Role mapping configuration. */
  roleMapping?: RoleMappingConfig;
  /** Claim name carrying the caller's markings. Defaults to 'markings'. */
  markingsClaim?: string;
  /**
   * Resolves store-administered marking memberships for the caller.
   * Effective markings = token claims ∪ memberships, THEN scoped-session
   * narrowing. The store only ADDS markings, so a resolver error falls back
   * to token claims alone (logged) — additive grants must not zero out
   * IdP-attested claims, while scoped sessions still fail closed.
   */
  markingMembershipResolver?: (tenantId: string, userId: string) => Promise<string[]>;
  /**
   * Resolves the caller's active scoped session, if any. Wired by the host to
   * ScopedSessionStore.getActiveForUser — typed structurally so this package
   * stays free of an SPI dependency. When a session is returned, the caller's
   * effective markings on every request are restricted to the session's
   * allowed subset minus its exclusions (Foundry scoped-sessions semantics).
   * A resolver error fails closed to zero markings.
   */
  scopedSessionResolver?: (
    tenantId: string,
    userId: string,
  ) => Promise<{ allowedMarkings: string[]; excludedMarkings?: string[] } | null>;
}

/** Maps token claim values to platform roles. */
export interface RoleMappingConfig {
  /** The claim name containing roles. Defaults to 'roles'. */
  claimName: string;
  /** Map of claim values to platform role names. */
  mappings: Record<string, string>;
}

/** Errors specific to authentication failures. */
export class AuthenticationError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.retryable = retryable;
  }
}
