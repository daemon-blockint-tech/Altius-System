/**
 * Aggregation query builder for PostgreSQL.
 *
 * Builds and executes aggregate SQL queries (COUNT, SUM, AVG, MIN, MAX)
 * with optional GROUP BY, filtering, ordering, and pagination.
 */

import type { Pool } from 'pg';
import type {
  RequestContext,
  AggregateQuery,
  AggregateResult,
  AggregateGroup,
} from '@altius/spi';
import { snakeCase, pgIdent, fieldCol, fieldColName } from '../schema/type-mapping.js';
import { filterToSql } from './filter-to-sql.js';
import { PgTransaction, resolveQueryable } from '../transactions/index.js';

/** Build a qualified table name. */
function tableName(type: string, schema = 'public'): string {
  return `${pgIdent(schema)}.${pgIdent(snakeCase(type))}`;
}

/**
 * Execute an aggregation query against the object table.
 */
export async function aggregateObjects(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  query: AggregateQuery,
  schema = 'public',
  tx?: PgTransaction,
): Promise<AggregateResult> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);

  if (!query.fields || query.fields.length === 0) {
    throw new Error('Aggregate query must specify at least one field');
  }

  // --- SELECT clause ---
  const selectParts: string[] = [];

  // Group-by columns
  if (query.groupBy && query.groupBy.length > 0) {
    for (const field of query.groupBy) {
      const col = fieldCol(field);
      selectParts.push(`${col} AS ${col}`);
    }
  }

  // Date bucket columns — date_trunc produces a timestamptz at the bucket
  // boundary, which becomes a group key. The alias is the key name in the
  // result (defaults to the field name).
  const bucketAliases: { alias: string; field: string }[] = [];
  if (query.buckets && query.buckets.length > 0) {
    for (const bucket of query.buckets) {
      const col = fieldCol(bucket.field);
      const aliasName = bucket.alias ?? bucket.field;
      const aliasIdent = pgIdent(snakeCase(aliasName));
      selectParts.push(`date_trunc('${bucket.interval}', ${col}) AS ${aliasIdent}`);
      bucketAliases.push({ alias: aliasName, field: bucket.field });
    }
  }

  // Aggregate functions — allowlist to prevent SQL injection
  const ALLOWED_FNS = new Set(['count', 'sum', 'avg', 'min', 'max']);

  for (const aggField of query.fields) {
    const fnLower = aggField.fn.toLowerCase();
    if (!ALLOWED_FNS.has(fnLower)) {
      throw new Error(`Invalid aggregate function: ${aggField.fn}`);
    }

    const alias = aggField.alias ?? `${aggField.fn}_${aggField.field}`;
    const aliasIdent = pgIdent(snakeCase(alias));

    if (fnLower === 'count') {
      if (aggField.field === '*') {
        selectParts.push(`COUNT(*) AS ${aliasIdent}`);
      } else {
        selectParts.push(`COUNT(${fieldCol(aggField.field)}) AS ${aliasIdent}`);
      }
    } else {
      const col = fieldCol(aggField.field);
      const fnUpper = fnLower.toUpperCase();
      selectParts.push(`${fnUpper}(${col}) AS ${aliasIdent}`);
    }
  }

  // --- WHERE clause ---
  const baseParams: unknown[] = [ctx.tenantId];
  const whereClauses = [`"_tenant_id" = $1`, `"_deleted_at" IS NULL`];

  if (query.filter) {
    const filterFragment = filterToSql(query.filter, baseParams.length + 1);
    if (filterFragment.text !== 'TRUE') {
      whereClauses.push(filterFragment.text);
    }
    baseParams.push(...filterFragment.params);
  }

  const whereClause = whereClauses.join(' AND ');

  // --- GROUP BY clause ---
  let groupByClause = '';
  const groupCols: string[] = [];
  if (query.groupBy && query.groupBy.length > 0) {
    groupCols.push(...query.groupBy.map((f) => fieldCol(f)));
  }
  if (bucketAliases.length > 0) {
    groupCols.push(...bucketAliases.map((b) => pgIdent(snakeCase(b.alias))));
  }
  if (groupCols.length > 0) {
    groupByClause = ` GROUP BY ${groupCols.join(', ')}`;
  }

  // --- ORDER BY clause ---
  let orderClause = '';
  if (query.orderBy && query.orderBy.length > 0) {
    const orderParts = query.orderBy.map(
      (o) => `${fieldCol(o.field)} ${o.direction === 'desc' ? 'DESC' : 'ASC'}`,
    );
    orderClause = ` ORDER BY ${orderParts.join(', ')}`;
  }

  // Total group count (before LIMIT/OFFSET).
  // When no GROUP BY or buckets are used, there is always exactly one aggregate group.
  const hasGrouping = (query.groupBy && query.groupBy.length > 0) || bucketAliases.length > 0;
  let totalGroups: number;
  if (hasGrouping) {
    const countSql = `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${table} WHERE ${whereClause}${groupByClause}) AS _sub`;
    const countResult = await q.query(countSql, baseParams);
    totalGroups = parseInt(String((countResult.rows[0] as Record<string, unknown>)['cnt']), 10);
  } else {
    totalGroups = 1;
  }

  // --- LIMIT / OFFSET ---
  let paginationClause = '';
  const allParams = [...baseParams];
  if (query.limit !== undefined) {
    allParams.push(query.limit);
    paginationClause += ` LIMIT $${allParams.length}`;
  }
  if (query.offset !== undefined) {
    allParams.push(query.offset);
    paginationClause += ` OFFSET $${allParams.length}`;
  }

  // --- Execute ---
  const sql = `SELECT ${selectParts.join(', ')} FROM ${table} WHERE ${whereClause}${groupByClause}${orderClause}${paginationClause}`;
  const result = await q.query(sql, allParams);

  // --- Map rows to AggregateGroup[] ---
  const groupByFields = query.groupBy ?? [];
  const groups: AggregateGroup[] = (result.rows as Record<string, unknown>[]).map((row) => {
    const keys: Record<string, unknown> = {};
    for (const field of groupByFields) {
      const col = fieldColName(field);
      keys[field] = row[col] ?? null;
    }
    // Bucket keys — date_trunc returns a Date (timestamptz → JS Date via pg)
    for (const bucket of query.buckets ?? []) {
      const aliasName = bucket.alias ?? bucket.field;
      const col = snakeCase(aliasName);
      keys[aliasName] = row[col] ?? null;
    }

    const values: Record<string, number | null> = {};
    for (const aggField of query.fields) {
      const alias = aggField.alias ?? `${aggField.fn}_${aggField.field}`;
      const col = snakeCase(alias);
      const rawVal = row[col];
      if (rawVal === null || rawVal === undefined) {
        values[alias] = null;
      } else {
        // MIN/MAX are the only aggregates Postgres accepts on a non-numeric
        // column — SUM/AVG raise "function sum(text) does not exist" in the
        // database first. Number() then turned a timestamptz into an epoch
        // millisecond count and text into NaN, neither of which fits
        // AggregateGroup.values (Record<string, number | null>) and neither
        // of which the memory provider produces. Reject instead, matching it.
        // The numeric column types the DDL emits (INTEGER, DOUBLE PRECISION)
        // arrive from pg as JS numbers, whereas COUNT/SUM return bigint and
        // AVG returns numeric — both as strings — so the check applies to
        // MIN/MAX only and the Number() conversion stays for the rest.
        if (
          (aggField.fn.toLowerCase() === 'min' || aggField.fn.toLowerCase() === 'max') &&
          typeof rawVal !== 'number'
        ) {
          throw new Error(
            `Aggregate ${aggField.fn} on non-numeric field '${aggField.field}'`,
          );
        }
        values[alias] = Number(rawVal);
      }
    }

    return { keys, values };
  });

  return { groups, totalGroups };
}
