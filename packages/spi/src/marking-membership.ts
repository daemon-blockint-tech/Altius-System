/**
 * Per-user marking memberships — the runtime half of mandatory access control.
 *
 * Marking DEFINITIONS are governance-as-code (declared in packs, like object
 * types); WHO holds a marking is runtime state administered through this
 * store. Effective markings on a request = token claims ∪ store memberships,
 * then narrowed by any active scoped session — the union happens once at the
 * authentication funnel so every surface (REST/GraphQL/MCP/CDM) agrees.
 */
export interface MarkingMembership {
  tenantId: string;
  userId: string;
  marking: string;
  grantedBy: string;
  grantedAt: string;
}

export interface MarkingMembershipStore {
  /** Idempotent: granting an existing membership updates grantedBy/At. */
  grant(tenantId: string, userId: string, marking: string, grantedBy: string): Promise<MarkingMembership>;
  /** Idempotent: revoking a non-membership is a no-op returning false. */
  revoke(tenantId: string, userId: string, marking: string): Promise<boolean>;
  /** All markings this user holds via the store (not token claims). */
  listForUser(tenantId: string, userId: string): Promise<string[]>;
  /** Members of one marking, paged. */
  listMembers(tenantId: string, marking: string, opts?: { limit?: number; offset?: number }): Promise<MarkingMembership[]>;
}
