/**
 * User directory service — lists platform users for User Select widgets
 * and user-picker UIs.
 *
 * A minimal service that returns user identity information. Deployments
 * plug in a concrete implementation backed by the identity provider
 * (Keycloak, OIDC, LDAP, etc.). The default in-memory implementation
 * is seeded from authenticated users.
 */

import type { RequestContext } from './ontology.js';

/** A platform user visible in the user directory. */
export interface DirectoryUser {
  /** Unique user identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Email address. */
  email: string;
  /** Roles assigned to the user. */
  roles: string[];
  /** Groups the user belongs to. */
  groups: string[];
  /** Tenant scope. */
  tenantId: string;
  /** Whether the user account is active. */
  active: boolean;
}

/** Options for listing users. */
export interface ListUsersOptions {
  /** Search query (matches name or email, case-insensitive). */
  q?: string;
  /** Filter by role. */
  role?: string;
  /** Filter by group. */
  group?: string;
  /** Maximum results to return. */
  limit?: number;
  /** Pagination offset. */
  offset?: number;
  /** Include inactive users. */
  includeInactive?: boolean;
}

/** Result of listing users. */
export interface ListUsersResult {
  users: DirectoryUser[];
  totalCount: number;
}

/**
 * User directory service — provides user lookup for User Select widgets.
 */
export interface UserDirectoryService {
  /** List users in the caller's tenant, optionally filtered. */
  list(ctx: RequestContext, options?: ListUsersOptions): Promise<ListUsersResult>;
  /** Get a single user by ID. Returns null if not found or not in tenant. */
  get(ctx: RequestContext, id: string): Promise<DirectoryUser | null>;
  /** Get users by a set of IDs (e.g. for resolving @-mentions). */
  getMany(ctx: RequestContext, ids: string[]): Promise<DirectoryUser[]>;
}
