/**
 * Audit trail types for the Altius platform (Section 7.2).
 *
 * Defines the AuditStore SPI for persisting immutable audit records
 * and the AuditQuery interface for retrieving them.
 */

import type { AuditRecord } from "@altius/spi";

/** Filter criteria for querying audit records. */
export interface AuditQueryFilter {
  /** Scope to one tenant. Callers serving HTTP must always set this. */
  tenantId?: string;
  /** Filter by actor ID. */
  actorId?: string;
  /** Filter by actor type. */
  actorType?: "user" | "system" | "connector";
  /** Filter by operation object type. */
  objectType?: string;
  /** Filter by operation object ID. */
  objectId?: string;
  /** Filter by action type. */
  actionType?: string;
  /** Filter by operation type. */
  operationType?:
    | "read"
    | "create"
    | "update"
    | "delete"
    | "action"
    | "query"
    | "link"
    | "unlink";
  /** Filter by OpenTelemetry trace ID. */
  traceId?: string;
  /** Start of time range (inclusive, ISO 8601). */
  from?: string;
  /** End of time range (inclusive, ISO 8601). */
  to?: string;
}

/** Page controls for an audit query. */
export interface AuditQueryOptions {
  /** Maximum records to return. Implementations apply their own ceiling. */
  limit?: number;
  /** Records to skip before the page starts. */
  offset?: number;
}

/**
 * Storage interface for audit records.
 *
 * Implementations MUST enforce immutability: records are append-only
 * and cannot be modified or deleted. The PostgreSQL implementation
 * uses a table with no UPDATE/DELETE grants.
 *
 * Implementations MUST also order by timestamp descending and apply
 * limit/offset themselves. Paging in the caller does not work: the store is
 * the only layer that knows the true size of the matching set, so a caller
 * that fetches-then-slices reports a total bounded by whatever the store
 * happened to return.
 */
export interface AuditStore {
  /** Append an audit record to the store. */
  append(record: AuditRecord): Promise<void>;

  /**
   * Query audit records matching the given filter, most recent first.
   * Returns at most `options.limit` records starting at `options.offset`.
   */
  query(filter: AuditQueryFilter, options?: AuditQueryOptions): Promise<AuditRecord[]>;

  /**
   * Total records matching the filter, ignoring limit/offset.
   *
   * Separate from query() so a page can report an honest total: the page
   * length only ever tells you how big the page was.
   */
  count(filter: AuditQueryFilter): Promise<number>;
}
