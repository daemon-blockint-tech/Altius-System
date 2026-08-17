/**
 * Temporal query operations for PostgreSQL.
 *
 * Supports:
 * - Point-in-version queries (get object at version N)
 * - Point-in-time queries (get object state at timestamp T)
 *
 * Both query the *_history table which stores a snapshot of the object
 * at each version.
 */

import type { Pool } from 'pg';
import type {
  OntologyObject,
  RequestContext,
  DateTime,
} from '@altius/spi';
import { snakeCase, pgIdent } from '../schema/type-mapping.js';
import { PgTransaction, resolveQueryable } from '../transactions/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a snake_case history row to an OntologyObject.
 * History rows have the same columns as the main table plus _history_id
 * and _history_created_at, which we skip.
 */
function historyRowToObject(row: Record<string, unknown>): OntologyObject {
  const obj: OntologyObject = {
    _tenantId: row['_tenant_id'] as string,
    _type: row['_type'] as string,
    _id: row['_id'] as string,
    _version: row['_version'] as number,
    _createdAt: (row['_created_at'] as Date).toISOString() as DateTime,
    _updatedAt: (row['_updated_at'] as Date).toISOString() as DateTime,
  };

  if (row['_deleted_at'] != null) {
    obj._deletedAt = (row['_deleted_at'] as Date).toISOString() as DateTime;
  }

  // Map remaining columns (user-defined properties)
  // System columns are identified by the leading underscore, not by an
  // enumerated list. Four copies of that list existed and only one of them
  // gained "_actor_id" when the DDL did, so the other three fell through to the
  // user-property branch and surfaced it as a phantom "ActorId" — a key in no
  // schema, which redaction then treats as a normal field.
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('_')) {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      obj[camelKey] = value;
    }
  }

  return obj;
}

/** Build the history table name. */
function historyTableName(type: string, schema = 'public'): string {
  return `${pgIdent(schema)}.${pgIdent(snakeCase(type) + '_history')}`;
}

// ---------------------------------------------------------------------------
// Temporal Operations
// ---------------------------------------------------------------------------

/**
 * Get the state of an object at a specific version.
 *
 * Queries the history table for the exact version number.
 * Returns null if no history entry exists for that version.
 */
export async function getObjectAtVersion(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  version: number,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject | null> {
  const q = resolveQueryable(pool, tx);
  const table = historyTableName(type, schema);

  const sql = `SELECT * FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2 AND "_version" = $3`;
  const result = await q.query(sql, [ctx.tenantId, id, version]);

  if (result.rows.length === 0) return null;
  return historyRowToObject(result.rows[0] as Record<string, unknown>);
}

/**
 * Fetch all stored versions of an object in a single query, ordered by
 * version ascending. Replaces the N+1 loop of getObjectAtVersion calls.
 */
export async function getObjectHistory(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject[]> {
  const q = resolveQueryable(pool, tx);
  const table = historyTableName(type, schema);

  const sql = `SELECT * FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2 ORDER BY "_version" ASC`;
  const result = await q.query(sql, [ctx.tenantId, id]);

  return result.rows.map((row) => historyRowToObject(row as Record<string, unknown>));
}

/**
 * Get the state of an object at a specific point in time.
 *
 * Queries the history table for the most recent version whose object timestamp
 * (_updated_at) is at or before the given timestamp.
 *
 * Returns null if no history entry exists at or before the given time.
 */
export async function getObjectAtTime(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  timestamp: DateTime,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject | null> {
  const q = resolveQueryable(pool, tx);
  const table = historyTableName(type, schema);

  // Compare against the object's own _updated_at, not _history_created_at.
  //
  // _history_created_at is when the history ROW was inserted, always slightly
  // after the object timestamps it records. Querying at exactly an object's
  // _createdAt therefore matched nothing and returned null, and the caller got
  // "this object did not exist yet" for the moment it was created. It passed
  // only when both timestamps happened to land in the same clock resolution,
  // which is why the conformance suite failed intermittently rather than every
  // run. The memory provider has always compared object timestamps, so the two
  // providers disagreed.
  //
  // The old comment justified this as safe because callers "typically query
  // with a moment after semantics" — an assumption nothing verified, and
  // getObjectAtTime has no production caller to have exercised it.
  const sql = `SELECT * FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2 AND "_updated_at" <= $3 ORDER BY "_version" DESC LIMIT 1`;
  const result = await q.query(sql, [ctx.tenantId, id, timestamp]);

  if (result.rows.length === 0) return null;
  return historyRowToObject(result.rows[0] as Record<string, unknown>);
}
