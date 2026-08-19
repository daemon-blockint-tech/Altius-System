/**
 * Aggregation query builder for PostgreSQL.
 *
 * Builds and executes aggregate SQL queries (COUNT, COUNT DISTINCT, SUM, AVG,
 * MIN, MAX, STDDEV_SAMP, MEDIAN/PERCENTILE_CONT) with optional GROUP BY,
 * HAVING, filtering, ordering, and pagination.
 */

import type { Pool } from 'pg';
import type {
  RequestContext,
  AggregateQuery,
  AggregateResult,
  AggregateGroup,
  DateBucket,
  NumericBucket,
  LinkTypeDefinition,
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
  resolveLink?: (linkType: string) => LinkTypeDefinition | undefined,
): Promise<AggregateResult> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);

  if (!query.fields || query.fields.length === 0) {
    throw new Error('Aggregate query must specify at least one field');
  }

  // --- SELECT clause ---
  const selectParts: string[] = [];
  // Params for the query — tenantId is always $1. Declared here (not at
  // WHERE) because NumericBucket pushes min/max/numBuckets before the
  // WHERE clause is built.
  const baseParams: unknown[] = [ctx.tenantId];

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
  //
  // The interval is interpolated as a raw SQL string literal, so it is
  // allowlisted for the same reason ALLOWED_FNS exists below: `BucketInterval`
  // is erased at runtime and callers reach this with a plain cast (the REST
  // aggregate route does `b.interval.toLowerCase() as BucketInterval` over an
  // untrusted body), so an unchecked value closes the quote and injects
  // arbitrary SELECT expressions — which no WHERE-clause authz, redaction or
  // consent control can constrain. Only these four are listed because they are
  // what the SDL enum offers and what the memory provider implements; widening
  // the set here would silently diverge the two providers.
  const ALLOWED_BUCKET_INTERVALS = new Set(['day', 'week', 'month', 'year']);

  const bucketAliases: { alias: string; field: string }[] = [];
  if (query.buckets && query.buckets.length > 0) {
    for (const bucket of query.buckets) {
      const aliasName = bucket.alias ?? bucket.field;
      const aliasIdent = pgIdent(snakeCase(aliasName));
      const col = fieldCol(bucket.field);

      if ('interval' in bucket) {
        // DateBucket — date_trunc produces a timestamptz at the bucket boundary.
        const dateBucket = bucket as DateBucket;
        if (!ALLOWED_BUCKET_INTERVALS.has(dateBucket.interval)) {
          throw new Error(`Invalid bucket interval: ${dateBucket.interval}`);
        }
        selectParts.push(`date_trunc('${dateBucket.interval}', ${col}) AS ${aliasIdent}`);
      } else {
        // NumericBucket — width_bucket returns 1..numBuckets for in-range
        // values, 0 for below-min, numBuckets+1 for >= max. The bucket number
        // is the group key. Parameters are pushed to avoid SQL injection
        // (min/max/numBuckets come from untrusted REST/GraphQL bodies).
        const nb = bucket as NumericBucket;
        if (typeof nb.min !== 'number' || typeof nb.max !== 'number' || typeof nb.numBuckets !== 'number') {
          throw new Error('NumericBucket requires numeric min, max, and numBuckets');
        }
        if (nb.numBuckets <= 0) {
          throw new Error('NumericBucket numBuckets must be positive');
        }
        if (nb.min >= nb.max) {
          throw new Error('NumericBucket min must be less than max');
        }
        const minIdx = baseParams.length + 1;
        baseParams.push(nb.min);
        const maxIdx = baseParams.length + 1;
        baseParams.push(nb.max);
        const numIdx = baseParams.length + 1;
        baseParams.push(nb.numBuckets);
        selectParts.push(`width_bucket(${col}::numeric, $${minIdx}, $${maxIdx}, $${numIdx}) AS ${aliasIdent}`);
      }
      bucketAliases.push({ alias: aliasName, field: bucket.field });
    }
  }

  // Aggregate functions — allowlist to prevent SQL injection
  const ALLOWED_FNS = new Set([
    'count', 'sum', 'avg', 'min', 'max',
    'count_distinct', 'stddev', 'median', 'percentile',
  ]);

  // alias → the SQL aggregate expression, so HAVING can re-emit it. Postgres
  // does not accept an output-column alias in HAVING (unlike ORDER BY), so
  // referencing the alias there is a syntax error, not a shortcut.
  const aggExprByAlias = new Map<string, string>();

  for (const aggField of query.fields) {
    const fnLower = aggField.fn.toLowerCase();
    if (!ALLOWED_FNS.has(fnLower)) {
      throw new Error(`Invalid aggregate function: ${aggField.fn}`);
    }

    const alias = aggField.alias ?? `${aggField.fn}_${aggField.field}`;
    const aliasIdent = pgIdent(snakeCase(alias));

    let expr: string;
    if (fnLower === 'count') {
      expr = aggField.field === '*' ? 'COUNT(*)' : `COUNT(${fieldCol(aggField.field)})`;
    } else if (fnLower === 'count_distinct') {
      expr = aggField.field === '*'
        ? 'COUNT(*)'
        : `COUNT(DISTINCT ${fieldCol(aggField.field)})`;
    } else if (fnLower === 'stddev') {
      // SAMPLE standard deviation: NULL for a single row, which is what the
      // memory provider returns. STDDEV() is an alias for STDDEV_SAMP in
      // Postgres, spelled out here so the choice is not implicit.
      expr = `STDDEV_SAMP(${fieldCol(aggField.field)})`;
    } else if (fnLower === 'median' || fnLower === 'percentile') {
      const fraction = fnLower === 'median' ? 0.5 : aggField.percentile;
      if (typeof fraction !== 'number' || !isFinite(fraction) || fraction < 0 || fraction > 1) {
        throw new Error(`Aggregate percentile requires a fraction between 0 and 1 for field '${aggField.field}'`);
      }
      // The fraction is a bind parameter, not interpolated text.
      const fracIdx = baseParams.length + 1;
      baseParams.push(fraction);
      expr = `PERCENTILE_CONT($${fracIdx}) WITHIN GROUP (ORDER BY ${fieldCol(aggField.field)}::double precision)`;
    } else {
      expr = `${fnLower.toUpperCase()}(${fieldCol(aggField.field)})`;
    }
    aggExprByAlias.set(alias, expr);
    selectParts.push(`${expr} AS ${aliasIdent}`);
  }

  // --- WHERE clause ---
  const whereClauses = [`"_tenant_id" = $1`, `"_deleted_at" IS NULL`];

  if (query.filter) {
    const filterCtx = resolveLink ? { currentType: type, schema, resolveLink } : undefined;
    const filterFragment = filterToSql(query.filter, baseParams.length + 1, filterCtx);
    if (filterFragment.text !== 'TRUE') {
      whereClauses.push(filterFragment.text);
    }
    baseParams.push(...filterFragment.params);
  }

  const whereClause = whereClauses.join(' AND ');

  // --- HAVING clause ---
  // Predicates filter GROUPS, so they must be in the group-count subquery too;
  // otherwise totalGroups counts rows the caller can never page to.
  const HAVING_OPS: Record<string, string> = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  let havingClause = '';
  if (query.having && query.having.length > 0) {
    const parts: string[] = [];
    for (const predicate of query.having) {
      const expr = aggExprByAlias.get(predicate.alias);
      if (!expr) {
        throw new Error(`HAVING references unknown aggregate alias '${predicate.alias}'`);
      }
      const op = HAVING_OPS[predicate.operator];
      if (!op) {
        throw new Error(`Invalid HAVING operator: ${predicate.operator}`);
      }
      if (predicate.value === null) {
        parts.push(predicate.operator === 'eq' ? `${expr} IS NULL` : `${expr} IS NOT NULL`);
        continue;
      }
      const idx = baseParams.length + 1;
      baseParams.push(predicate.value);
      parts.push(`${expr} ${op} $${idx}`);
    }
    if (parts.length > 0) havingClause = ` HAVING ${parts.join(' AND ')}`;
  }

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
    const countSql = `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${table} WHERE ${whereClause}${groupByClause}${havingClause}) AS _sub`;
    const countResult = await q.query(countSql, baseParams);
    totalGroups = parseInt(String((countResult.rows[0] as Record<string, unknown>)['cnt']), 10);
  } else if (havingClause) {
    // One aggregate group, but HAVING may have removed it. Resolved from the
    // returned rows below rather than asserted as 1.
    totalGroups = -1;
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
  const sql = `SELECT ${selectParts.join(', ')} FROM ${table} WHERE ${whereClause}${groupByClause}${havingClause}${orderClause}${paginationClause}`;
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

  return { groups, totalGroups: totalGroups === -1 ? groups.length : totalGroups };
}
