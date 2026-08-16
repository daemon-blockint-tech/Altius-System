/**
 * Object CRUD operations for PostgreSQL + Apache AGE.
 *
 * Every operation:
 * - Enforces tenant isolation via _tenant_id
 * - Maintains version history in the *_history table
 * - Maintains an AGE graph vertex for graph traversal
 * - Accepts an optional PgTransaction for transactional batching
 */

import type { Pool } from 'pg';
import type {
  OntologyObject,
  RequestContext,
  FilterExpression,
  QueryOptions,
  ObjectPage,
  DateTime,
} from '@altius/spi';
import { snakeCase, pgIdent, fieldCol } from '../schema/type-mapping.js';
import { filterToSql } from './filter-to-sql.js';
import { PgTransaction, resolveQueryable } from '../transactions/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


let _counter = 0;
function genId(): string {
  return `pg_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

function now(): DateTime {
  return new Date().toISOString() as DateTime;
}

/**
 * Map a snake_case database row to an OntologyObject with camelCase
 * system fields. Non-system columns are mapped back to camelCase property
 * names.
 */
function rowToObject(row: Record<string, unknown>): OntologyObject {
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

  if (row['_actor_id'] != null) {
    obj._actorId = row['_actor_id'] as string;
  }

  // Map remaining columns (user-defined properties)
  const systemCols = new Set([
    '_tenant_id', '_id', '_type', '_version',
    '_created_at', '_updated_at', '_deleted_at', '_actor_id',
    // History-table bookkeeping. Absent from the live table, so this is a
    // no-op for a normal query — but an as-of query reads the history table,
    // and without these two the caller would get `historyId` and
    // `historyCreatedAt` as if they were declared properties.
    '_history_id', '_history_created_at',
  ]);
  for (const [key, value] of Object.entries(row)) {
    if (!systemCols.has(key)) {
      // Convert snake_case column back to camelCase property name
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      obj[camelKey] = value;
    }
  }

  return obj;
}

/** Build a qualified table name. */
function tableName(type: string, schema = 'public'): string {
  return `${pgIdent(schema)}.${pgIdent(snakeCase(type))}`;
}

/** Build the history table name. */
function historyTableName(type: string, schema = 'public'): string {
  return `${pgIdent(schema)}.${pgIdent(snakeCase(type) + '_history')}`;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Create a new ontology object.
 *
 * 1. INSERT into type table
 * 2. INSERT snapshot into history table
 */
export async function createObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  properties: Record<string, unknown>,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject> {
  const q = resolveQueryable(pool, tx);
  const id = genId();
  const timestamp = now();

  // Build column names and values for user properties
  const propEntries = Object.entries(properties);
  const systemCols = ['"_tenant_id"', '"_id"', '"_type"', '"_version"', '"_created_at"', '"_updated_at"', '"_actor_id"'];
  const systemVals = [ctx.tenantId, id, type, 1, timestamp, timestamp, ctx.actorId ?? null];

  const propCols = propEntries.map(([k]) => pgIdent(snakeCase(k)));
  // Serialize objects/arrays as JSON strings for JSONB columns —
  // the pg driver does not auto-serialize non-primitive values.
  // Dates must pass through for TIMESTAMPTZ columns.
  const propVals = propEntries.map(([, v]) =>
    v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v,
  );

  const allCols = [...systemCols, ...propCols];
  const allVals = [...systemVals, ...propVals];
  const placeholders = allVals.map((_, i) => `$${i + 1}`);

  const table = tableName(type, schema);
  const insertSql = `INSERT INTO ${table} (${allCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

  const result = await q.query(insertSql, allVals);
  const row = result.rows[0] as Record<string, unknown>;
  const obj = rowToObject(row);

  // Insert history snapshot
  await insertHistory(q, type, row, schema);

  // Create AGE vertex

  return obj;
}

/**
 * Get an object by type and id. Returns null if not found.
 * Includes _deletedAt if soft-deleted (caller decides visibility).
 */
export async function getObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject | null> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);
  const sql = `SELECT * FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2`;

  let result;
  try {
    result = await q.query(sql, [ctx.tenantId, id]);
  } catch (err) {
    // An unknown ObjectType has no table, so Postgres raises undefined_table
    // (42P01). Reading an object of a type that does not exist is "not found",
    // the same answer the memory provider gives — and letting the raw message
    // ("relation \"public.foo\" does not exist") escape would leak the storage
    // engine's vocabulary through the SPI to every caller above it.
    if (isUndefinedTable(err)) return null;
    throw err;
  }

  if (result.rows.length === 0) return null;
  return rowToObject(result.rows[0] as Record<string, unknown>);
}

/** Postgres undefined_table (42P01): the type has no backing table. */
function isUndefinedTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/** Postgres undefined_column (42703): the filter names a property that does not exist. */
function isUndefinedColumn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42703';
}

/**
 * Update an existing object's properties.
 *
 * 1. UPDATE type table, increment _version
 * 2. INSERT new snapshot into history table
 * 3. Update AGE vertex properties
 */
export async function updateObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  properties: Record<string, unknown>,
  schema = 'public',
  tx?: PgTransaction,
  expectedVersion?: number,
): Promise<OntologyObject> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);
  const timestamp = now();

  // Build SET clause for user properties
  const propEntries = Object.entries(properties);
  const setClauses: string[] = [
    `"_version" = "_version" + 1`,
    `"_updated_at" = $1`,
    `"_actor_id" = $2`,
  ];
  const params: unknown[] = [timestamp, ctx.actorId ?? null];
  let paramIdx = 3;

  for (const [key, value] of propEntries) {
    setClauses.push(`${pgIdent(snakeCase(key))} = $${paramIdx}`);
    // Serialize objects/arrays as JSON strings for JSONB columns
    params.push(value !== null && typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value);
    paramIdx++;
  }

  // WHERE clause params
  params.push(ctx.tenantId); // $paramIdx
  const tenantParam = paramIdx++;
  params.push(id); // $paramIdx
  const idParam = paramIdx++;

  let whereClause = `"_tenant_id" = $${tenantParam} AND "_id" = $${idParam} AND "_deleted_at" IS NULL`;
  if (expectedVersion !== undefined) {
    params.push(expectedVersion);
    whereClause += ` AND "_version" = $${paramIdx}`;
  }

  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClause} RETURNING *`;

  const result = await q.query(sql, params);
  if (result.rows.length === 0) {
    if (expectedVersion !== undefined) {
      // Follow-up SELECT to distinguish not-found vs version-mismatch
      const check = await q.query(
        `SELECT "_version" FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2 AND "_deleted_at" IS NULL`,
        [ctx.tenantId, id],
      );
      if (check.rows.length === 0) {
        const err = new Error(`Object ${type}:${id} not found or deleted`) as Error & { code: string };
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
      const currentVersion = (check.rows[0] as Record<string, unknown>)['_version'];
      const err = new Error(`Object ${type}:${id} version mismatch (expected ${expectedVersion}, current ${currentVersion})`) as Error & { code: string };
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    throw new Error(`Object ${type}:${id} not found or is deleted`);
  }

  const row = result.rows[0] as Record<string, unknown>;
  const obj = rowToObject(row);

  // Insert history snapshot
  await insertHistory(q, type, row, schema);

  // Update AGE vertex

  return obj;
}

/**
 * Soft-delete: SET _deleted_at = now(). Keeps AGE vertex (marks as deleted).
 */
export async function softDeleteObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  schema = 'public',
  tx?: PgTransaction,
): Promise<void> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);
  const timestamp = now();

  const sql = `UPDATE ${table} SET "_deleted_at" = $1, "_version" = "_version" + 1, "_updated_at" = $1, "_actor_id" = $4 WHERE "_tenant_id" = $2 AND "_id" = $3 AND "_deleted_at" IS NULL RETURNING *`;

  const result = await q.query(sql, [timestamp, ctx.tenantId, id, ctx.actorId ?? null]);
  if (result.rows.length === 0) {
    throw new Error(`Object ${type}:${id} not found or already deleted`);
  }

  // Insert history snapshot for the soft-delete event
  await insertHistory(q, type, result.rows[0] as Record<string, unknown>, schema);
}

/**
 * Restore a soft-deleted object: SET _deleted_at = NULL, advance _version.
 * Throws if the object is not soft-deleted (either not found or already live).
 */
export async function restoreObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  schema = 'public',
  tx?: PgTransaction,
): Promise<OntologyObject> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);
  const timestamp = now();

  const sql = `UPDATE ${table} SET "_deleted_at" = NULL, "_version" = "_version" + 1, "_updated_at" = $1, "_actor_id" = $4 WHERE "_tenant_id" = $2 AND "_id" = $3 AND "_deleted_at" IS NOT NULL RETURNING *`;

  const result = await q.query(sql, [timestamp, ctx.tenantId, id, ctx.actorId ?? null]);
  if (result.rows.length === 0) {
    throw new Error(`Object ${type}:${id} not found or not deleted`);
  }

  const row = result.rows[0] as Record<string, unknown>;
  const restored = rowToObject(row);
  // Insert history snapshot for the restore event
  await insertHistory(q, type, row, schema);
  return restored;
}

/**
 * Hard-delete: DELETE from type table, history, and AGE vertex + edges.
 */
export async function hardDeleteObject(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  id: string,
  schema = 'public',
  tx?: PgTransaction,
): Promise<void> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);
  const historyTable = historyTableName(type, schema);

  // Delete from history table first (no FK, but logical ordering)
  await q.query(
    `DELETE FROM ${historyTable} WHERE "_tenant_id" = $1 AND "_id" = $2`,
    [ctx.tenantId, id],
  );

  // Delete from main table — idempotent (no-throw if missing, per SPI contract)
  const result = await q.query(
    `DELETE FROM ${table} WHERE "_tenant_id" = $1 AND "_id" = $2`,
    [ctx.tenantId, id],
  );

  // If object existed, also clean up AGE vertex (and all connected edges)
  if (result.rowCount && result.rowCount > 0) {
  }
}

/**
 * Query objects with filter expression, pagination, and sorting.
 * Excludes soft-deleted objects by default.
 */
export async function queryObjects(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  filter: FilterExpression,
  options?: QueryOptions,
  schema = 'public',
  tx?: PgTransaction,
): Promise<ObjectPage> {
  const q = resolveQueryable(pool, tx);

  // `asOfVersion` is well defined for ONE object (getObjectAtVersion) and not
  // for a set: versions are per-object, so "every Patient at version 3" has no
  // answer for a patient that only ever reached version 2. Refuse it loudly
  // rather than invent a reading — an as-of query that silently returns
  // current rows looks exactly like real historical data. The memory provider
  // refuses with the same message.
  if (options?.asOfVersion !== undefined) {
    throw new Error(
      'QueryOptions.asOfVersion is not supported on collection queries: version numbers are per-object. ' +
      'Use getObjectAtVersion for a single object, or asOfTime for a set.',
    );
  }

  // Base params: tenant isolation
  const baseParams: unknown[] = [ctx.tenantId];
  const whereClauses = [`"_tenant_id" = $1`];

  // As-of reads come from the history table: one row per object, its newest
  // version at or before the instant. An object created later has no such row
  // and is absent (it did not exist yet); one deleted earlier comes back
  // carrying _deleted_at, so the soft-delete clause below drops it exactly as
  // it would today. The filter then runs against the historical values, which
  // is the whole point — "who was DISCHARGED last Tuesday" must be evaluated
  // against Tuesday's rows, not today's.
  let table: string;
  if (options?.asOfTime) {
    baseParams.push(options.asOfTime);
    const history = historyTableName(type, schema);
    table = `(SELECT DISTINCT ON ("_id") * FROM ${history} ` +
      `WHERE "_tenant_id" = $1 AND "_updated_at" <= $2 ` +
      `ORDER BY "_id", "_version" DESC) AS asof`;
  } else {
    table = tableName(type, schema);
  }

  // Soft-delete exclusion (default: exclude)
  if (!options?.includeDeleted) {
    whereClauses.push(`"_deleted_at" IS NULL`);
  }

  // User filter translation (offset by existing params)
  const filterFragment = filterToSql(filter, baseParams.length + 1);
  if (filterFragment.text !== 'TRUE') {
    whereClauses.push(filterFragment.text);
  }
  const allParams = [...baseParams, ...filterFragment.params];

  const whereClause = whereClauses.join(' AND ');

  // Count query for totalCount
  const countSql = `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${whereClause}`;
  let countResult;
  try {
    countResult = await q.query(countSql, allParams);
  } catch (err) {
    // A filter naming a property that does not exist raises undefined_column
    // (42703); an unknown ObjectType raises undefined_table (42P01). Both are
    // answered with an empty page, matching the memory provider — and keeping
    // Postgres's own error text ('column "nonexistent" does not exist') from
    // escaping through the SPI to callers that know nothing about SQL.
    //
    // Note this makes a typo'd filter field return "no matches" rather than an
    // error. That is the conformance suite's contract, not a preference; if it
    // should fail loudly instead, that is a contract change to make in the
    // suite and both providers together.
    if (isUndefinedColumn(err) || isUndefinedTable(err)) {
      return { items: [], totalCount: 0, hasNextPage: false };
    }
    throw err;
  }
  const totalCount = parseInt(String((countResult.rows[0] as Record<string, unknown>)['cnt']), 10);

  // Order by
  let orderClause = '';
  if (options?.orderBy && options.orderBy.length > 0) {
    const orderParts = options.orderBy.map(
      (o) => `${fieldCol(o.field)} ${o.direction === 'desc' ? 'DESC' : 'ASC'}`,
    );
    orderClause = ` ORDER BY ${orderParts.join(', ')}`;
  }

  // Pagination — PERF-01: enforce maximum limit to prevent DoS
  const MAX_QUERY_LIMIT = 1000;
  const limit = Math.min(options?.limit ?? 100, MAX_QUERY_LIMIT);
  const offset = options?.offset ?? 0;
  const paginationParams = [...allParams, limit, offset];
  const limitParam = `$${allParams.length + 1}`;
  const offsetParam = `$${allParams.length + 2}`;

  const dataSql = `SELECT * FROM ${table} WHERE ${whereClause}${orderClause} LIMIT ${limitParam} OFFSET ${offsetParam}`;
  const dataResult = await q.query(dataSql, paginationParams);

  const items = (dataResult.rows as Record<string, unknown>[]).map(
    (row) => rowToObject(row),
  );

  return {
    items,
    totalCount,
    hasNextPage: offset + limit < totalCount,
  };
}

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

async function insertHistory(
  q: Pool | import('pg').PoolClient,
  type: string,
  row: Record<string, unknown>,
  schema: string,
): Promise<void> {
  const table = historyTableName(type, schema);

  // Copy all columns except _history_id (auto-generated)
  const entries = Object.entries(row);
  const cols = entries.map(([k]) => `"${k}"`);
  // Serialize objects/arrays for JSONB columns (pg driver returns JSONB as JS objects)
  const vals = entries.map(([, v]) =>
    v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v,
  );
  const placeholders = vals.map((_, i) => `$${i + 1}`);

  await q.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    vals,
  );
}


