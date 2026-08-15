/**
 * ReBAC authorization service via OpenFGA.
 *
 * Implements relationship-based access control per spec Section 7.1.
 * Provides check, listObjects, writeRelationship, deleteRelationship,
 * field-level redaction, and permission batching.
 */

import { getTracer, withSpan, createLogger } from "@altius/observability";

import type {
  FieldPermissionConfig,
  RedactionResult,
} from "./types.js";
import { AuthorizationError } from "./types.js";

const authzLogger = createLogger("authorization-service");

/**
 * True when OpenFGA rejected the request because the relation is not defined on
 * the type in the loaded authorization model (HTTP 400 validation_error, e.g.
 * `relation 'enzyme#viewer' not found`).
 *
 * This means the deployed model is missing a relation the runtime needs — a
 * configuration defect, most often a domain pack whose `permissions/*.fga`
 * override omitted a relation. It is permanent, so it must not be reported as a
 * retryable server error.
 */
function isUndefinedRelationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("not found") && message.includes("relation");
}

/** Warn once per relation+type so a model gap is visible without flooding logs. */
const reportedUndefinedRelations = new Set<string>();

/** Warn once per tenant so a store-mapping gap is visible without flooding logs. */
const reportedUnknownTenants = new Set<string>();
function logUnknownTenant(tenantId: string): void {
  if (reportedUnknownTenants.has(tenantId)) return;
  reportedUnknownTenants.add(tenantId);
  authzLogger.error(
    { tenantId },
    `Tenant '${tenantId}' has no OpenFGA store configured — denying all authorization. ` +
      `Add it to OPENFGA_STORE_IDS (tenant=storeId,...). There is deliberately no ` +
      `fallback store: serving an unmapped tenant from another tenant's store would ` +
      `let a tuple granted there authorize the same object id here.`,
  );
}
function logUndefinedRelation(relation: string, target: string, error: unknown): void {
  const key = `${relation}@${target.split(":")[0]}`;
  if (reportedUndefinedRelations.has(key)) return;
  reportedUndefinedRelations.add(key);
  authzLogger.error(
    { relation, target, err: error instanceof Error ? error.message : String(error) },
    `Authorization model is missing relation '${relation}' for '${target.split(":")[0]}' — ` +
      `denying access. Declare it in the domain pack's permissions/*.fga (a pack override ` +
      `REPLACES the generated type block, so it must re-declare every relation the type needs).`,
  );
}

const tracer = getTracer("security", "authz");

/**
 * Minimal interface for OpenFGA client operations.
 *
 * Abstracts the @openfga/sdk OpenFgaClient to enable testing without
 * a running OpenFGA server. Production code passes the real SDK client;
 * tests can provide a stub implementation.
 */
export interface OpenFgaClientInterface {
  check(body: {
    user: string;
    relation: string;
    object: string;
  }): Promise<{ allowed?: boolean }>;

  listObjects(body: {
    user: string;
    relation: string;
    type: string;
  }): Promise<{ objects?: string[] }>;

  writeTuples(tuples: Array<{
    user: string;
    relation: string;
    object: string;
  }>): Promise<unknown>;

  deleteTuples(tuples: Array<{
    user: string;
    relation: string;
    object: string;
  }>): Promise<unknown>;
}

/**
 * Resolves the OpenFGA client (i.e. the store) serving a tenant.
 *
 * Tenant isolation is by STORE: one OpenFGA store per tenant, so no two tenants
 * share a tuple namespace. This matters because object ids are unique PER
 * TENANT, not globally — the storage primary key is (_tenant_id, _id). In a
 * single shared store a tuple minted for `patient:123` by a granter in tenant A
 * also authorizes the unrelated `patient:123` in tenant B, and the storage layer
 * then faithfully serves tenant B's row.
 *
 * Returns undefined when the tenant has no configured store. Callers MUST treat
 * that as deny — never as "use some other store".
 */
export type FgaClientResolver = (
  tenantId: string,
) => Promise<OpenFgaClientInterface | undefined>;

/**
 * Authorization service implementing ReBAC via OpenFGA.
 *
 * Usage:
 * ```ts
 * const authz = new AuthorizationService(fgaClient, [patientFieldConfig]);
 * const allowed = await authz.check("user:alice", "viewer", "patient:123", "tenant-a");
 * const patients = await authz.listObjects("user:alice", "viewer", "patient", "tenant-a");
 * const result = authz.redactFields("user:alice", ["nurse"], "patient", patientObj);
 * ```
 *
 * `tenantId` is the LAST parameter of every tuple-touching method, and required.
 * Last rather than first on purpose: these methods take otherwise-interchangeable
 * strings, so a tenant-first signature would let an un-migrated 3-argument call
 * still compile with the arguments silently shifted. Appending it makes every
 * missed call site an arity error at build time instead.
 */
export class AuthorizationService {
  private readonly resolveClient: FgaClientResolver;
  private readonly fieldConfigs: Map<string, FieldPermissionConfig>;

  /**
   * Per-request field permission cache.
   * Key: `${userId}|${sortedRoles}|${objectType}`
   * Value: set of visible field names.
   *
   * Cleared at the start of each GraphQL request via the Apollo context
   * factory in server.ts. REST and FHIR routes should do the same.
   *
   * Deliberately NOT keyed by tenant: the value is a pure function of the
   * deployment-wide field permission config and the (roles, objectType) pair,
   * both of which are already in the key — roles come from the caller's own
   * verified token, so two same-named users in different tenants with different
   * roles land on different keys anyway. Adding tenant would only lower the hit
   * rate. Revisit if field permission configs ever become per-tenant.
   */
  private fieldCache = new Map<string, Set<string>>();

  constructor(
    client: OpenFgaClientInterface | FgaClientResolver,
    fieldPermissions: FieldPermissionConfig[] = [],
  ) {
    // A bare client is a single-store deployment: every tenant resolves to it.
    // Multi-tenant deployments pass a resolver returning that tenant's own store
    // (or undefined, which denies) — see createFgaClientRegistry in the API package.
    this.resolveClient =
      typeof client === "function" ? client : async () => client;
    this.fieldConfigs = new Map();
    for (const config of fieldPermissions) {
      this.fieldConfigs.set(config.objectType, config);
    }
  }

  /**
   * Resolve the tenant's store client, logging (once) when a tenant has none.
   *
   * Every caller must treat undefined as DENY. Falling back to a default store
   * would silently restore the cross-tenant hole that per-tenant stores close.
   */
  private async clientFor(tenantId: string): Promise<OpenFgaClientInterface | undefined> {
    const client = tenantId ? await this.resolveClient(tenantId) : undefined;
    if (!client) logUnknownTenant(tenantId || "(empty)");
    return client;
  }

  /**
   * Check if a user has a particular relation with an object.
   *
   * Maps to OpenFGA Check API: check(user:X, relation, object:Y)
   * per Section 7.1.4.
   *
   * @param user - OpenFGA user string, e.g. "user:alice"
   * @param relation - Relation to check, e.g. "viewer"
   * @param resource - OpenFGA object string, e.g. "patient:123"
   * @param tenantId - Tenant whose store answers the check
   * @returns true if the relationship holds
   */
  async check(user: string, relation: string, resource: string, tenantId: string): Promise<boolean> {
    return withSpan(tracer, "authz.check", {}, async () => {
      const client = await this.clientFor(tenantId);
      if (!client) return false; // unmapped tenant → no store → deny
      try {
        const result = await client.check({
          user,
          relation,
          object: resource,
        });
        return result.allowed === true;
      } catch (error: unknown) {
        // A relation the model does not define is a deployment/model defect, not
        // a transient failure: OpenFGA answers with a 400 validation error, which
        // would otherwise surface as a RETRYABLE 500 on every read. Fail closed
        // (deny) so a model gap degrades to "no access" rather than an outage.
        if (isUndefinedRelationError(error)) {
          logUndefinedRelation(relation, resource, error);
          return false;
        }
        throw this.wrapError("CHECK_FAILED", error);
      }
    });
  }

  /**
   * List objects of a given type that a user has a relation to.
   *
   * Maps to OpenFGA ListObjects API for batch pre-filtering
   * per Section 7.1.5. Returns object IDs (e.g., ["patient:1", "patient:2"]).
   *
   * @param user - OpenFGA user string, e.g. "user:alice"
   * @param relation - Relation to query, e.g. "viewer"
   * @param type - Object type, e.g. "patient"
   * @param tenantId - Tenant whose store answers the query
   * @returns Array of full object identifiers
   */
  async listObjects(user: string, relation: string, type: string, tenantId: string): Promise<string[]> {
    return withSpan(tracer, "authz.listObjects", {}, async () => {
      const client = await this.clientFor(tenantId);
      if (!client) return []; // unmapped tenant → no store → nothing authorized
      try {
        const result = await client.listObjects({
          user,
          relation,
          type,
        });
        return result.objects ?? [];
      } catch (error: unknown) {
        // Same model-gap handling as check(): an undefined relation yields an
        // empty authorized set (deny-all) instead of a retryable 500.
        if (isUndefinedRelationError(error)) {
          logUndefinedRelation(relation, type, error);
          return [];
        }
        throw this.wrapError("LIST_OBJECTS_FAILED", error);
      }
    });
  }

  /**
   * Write a relationship tuple (e.g., assign nurse to ward).
   *
   * @param user - OpenFGA user string, e.g. "user:alice"
   * @param relation - Relation to write, e.g. "assigned"
   * @param resource - OpenFGA object string, e.g. "ward:cardiology"
   * @param tenantId - Tenant whose store receives the tuple
   */
  async writeRelationship(user: string, relation: string, resource: string, tenantId: string): Promise<void> {
    return withSpan(tracer, "authz.writeRelationship", {}, async () => {
      const client = await this.clientFor(tenantId);
      // Throw rather than no-op: a grant the caller believes succeeded but that
      // landed nowhere is worse than a visible failure.
      if (!client) throw new AuthorizationError("UNKNOWN_TENANT", `No OpenFGA store configured for tenant '${tenantId}'`);
      try {
        await client.writeTuples([{
          user,
          relation,
          object: resource,
        }]);
      } catch (error: unknown) {
        throw this.wrapError("WRITE_FAILED", error);
      }
    });
  }

  /**
   * Delete a relationship tuple.
   *
   * @param user - OpenFGA user string, e.g. "user:alice"
   * @param relation - Relation to remove, e.g. "assigned"
   * @param resource - OpenFGA object string, e.g. "ward:cardiology"
   * @param tenantId - Tenant whose store loses the tuple
   */
  async deleteRelationship(user: string, relation: string, resource: string, tenantId: string): Promise<void> {
    return withSpan(tracer, "authz.deleteRelationship", {}, async () => {
      const client = await this.clientFor(tenantId);
      // Same as writeRelationship: a revoke that silently did nothing would leave
      // access in place while reporting success.
      if (!client) throw new AuthorizationError("UNKNOWN_TENANT", `No OpenFGA store configured for tenant '${tenantId}'`);
      try {
        await client.deleteTuples([{
          user,
          relation,
          object: resource,
        }]);
      } catch (error: unknown) {
        throw this.wrapError("DELETE_FAILED", error);
      }
    });
  }

  /**
   * Compute which fields are visible to a user for a given object type,
   * based on their roles/relations.
   *
   * Uses the field permission configuration and caches results
   * per (user, role-set, objectType) within a request per Section 7.1.5.
   *
   * @param userId - The user identifier (without "user:" prefix)
   * @param roles - The user's resolved platform roles
   * @param objectType - The object type (e.g., "patient")
   * @returns Set of visible field names, or undefined if no config exists
   */
  getVisibleFields(userId: string, roles: string[], objectType: string): Set<string> | undefined {
    const config = this.fieldConfigs.get(objectType);
    if (!config) {
      return undefined;
    }

    // Check cache
    const cacheKey = this.buildFieldCacheKey(userId, roles, objectType);
    const cached = this.fieldCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Compute visible fields: union of all fields from matching relations + alwaysVisible
    const visible = new Set<string>(config.alwaysVisible);

    for (const role of roles) {
      const fields = config.fieldsByRelation[role];
      if (fields) {
        for (const field of fields) {
          visible.add(field);
        }
      }
    }

    // Cache for this request
    this.fieldCache.set(cacheKey, visible);
    return visible;
  }

  /**
   * Redact fields on an object based on user permissions.
   *
   * Sets impermissible fields to null and populates _redactedFields
   * per Section 7.1.3.
   *
   * @param userId - The user identifier
   * @param roles - The user's resolved platform roles
   * @param objectType - The object type (e.g., "patient")
   * @param obj - The data object to redact
   * @returns Redacted object with _redactedFields array
   */
  redactFields<T extends Record<string, unknown>>(
    userId: string,
    roles: string[],
    objectType: string,
    obj: T,
  ): RedactionResult<T> {
    const visible = this.getVisibleFields(userId, roles, objectType);

    // If no field config, no redaction needed
    if (!visible) {
      return {
        data: { ...obj },
        _redactedFields: [],
      };
    }

    const redactedFields: string[] = [];
    // SEC-14: Deep clone to avoid mutating caller's nested objects
    const result = structuredClone(obj) as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
      // System fields (_id, _version, _updatedAt, etc.) are never redacted —
      // they are internal metadata required by downstream mappers (e.g. FHIR resource.id/meta).
      if (key.startsWith('_')) continue;
      if (!visible.has(key)) {
        result[key] = null;
        redactedFields.push(key);
      }
    }

    return {
      data: result as T,
      _redactedFields: redactedFields,
    };
  }

  /**
   * Redact fields on a list of objects.
   *
   * Leverages field-level caching: the visible field set is computed once
   * per (user, role-set, objectType) and reused for all objects in the list.
   */
  redactFieldsBatch<T extends Record<string, unknown>>(
    userId: string,
    roles: string[],
    objectType: string,
    objects: T[],
  ): RedactionResult<T>[] {
    return objects.map(obj => this.redactFields(userId, roles, objectType, obj));
  }

  /**
   * Clear the per-request field permission cache.
   * Call this at the start of each API request.
   */
  clearFieldCache(): void {
    this.fieldCache.clear();
  }

  private buildFieldCacheKey(userId: string, roles: string[], objectType: string): string {
    const sortedRoles = [...roles].sort().join(",");
    return `${userId}|${sortedRoles}|${objectType}`;
  }

  private wrapError(code: string, error: unknown): AuthorizationError {
    const message = error instanceof Error ? error.message : String(error);
    return new AuthorizationError(code, message);
  }
}
