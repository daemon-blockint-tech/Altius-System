/**
 * Full-text search query builder for PostgreSQL.
 *
 * Uses ILIKE for case-insensitive substring matching across string-type
 * columns (the SPI contract: 'hospital' matches inside 'a@hospital.org').
 * Scores each row by summing matches across searched fields.
 *
 * Columns with a FULLTEXT IndexDefinition carry a pg_trgm GIN index
 * (ddl-objects.ts) which serves these ILIKE predicates; searches
 * restricted to indexed fields use it, unindexed columns fall back to
 * a scan.
 */

import type { Pool } from 'pg';
import type {
  RequestContext,
  SearchQuery,
  SearchResult,
  SearchHit,
  OntologyObject,
} from '@altius/spi';
import { snakeCase, pgIdent, fieldCol } from '../schema/type-mapping.js';
import { filterToSql } from './filter-to-sql.js';
import { PgTransaction, resolveQueryable } from '../transactions/index.js';

/** Build a qualified table name. */
function tableName(type: string, schema = 'public'): string {
  return `${pgIdent(schema)}.${pgIdent(snakeCase(type))}`;
}

/**
 * Map a snake_case database row to an OntologyObject with camelCase fields.
 * System fields (_id, _type, etc.) are mapped explicitly to preserve their
 * underscore-prefixed names — generic camelCase conversion would produce
 * wrong keys (e.g., _id → Id).
 */
function rowToObject(row: Record<string, unknown>): OntologyObject {
  const obj: OntologyObject = {
    _tenantId: row['_tenant_id'] as string,
    _type: row['_type'] as string,
    _id: row['_id'] as string,
    _version: row['_version'] as number,
    _createdAt: row['_created_at'] instanceof Date
      ? row['_created_at'].toISOString()
      : String(row['_created_at'] ?? ''),
    _updatedAt: row['_updated_at'] instanceof Date
      ? row['_updated_at'].toISOString()
      : String(row['_updated_at'] ?? ''),
  };

  if (row['_deleted_at'] != null) {
    obj._deletedAt = row['_deleted_at'] instanceof Date
      ? row['_deleted_at'].toISOString()
      : String(row['_deleted_at']);
  }

  // System columns are identified by the leading underscore, not by an
  // enumerated list. Six copies of that list existed and only object-crud
  // gained "_actor_id" when the DDL did, so the rule and its copies could
  // disagree with nothing to notice.
  //
  // CONFIRMED: with the old enumerated list the column falls through to the
  // user-property branch and the snake-to-camel mapper renames it "ActorId" —
  // a key in no schema. Pinned by traversal.test.ts; reverting the predicate
  // there yields [..., "ActorId"]. Because it has no leading underscore,
  // redactObject treats it as an ordinary field.
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('_')) {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      obj[camelKey] = value;
    }
  }

  return obj;
}

/**
 * Execute a search query against the object table.
 */
export async function searchObjects(
  pool: Pool,
  ctx: RequestContext,
  type: string,
  query: SearchQuery,
  schema = 'public',
  tx?: PgTransaction,
): Promise<SearchResult> {
  const q = resolveQueryable(pool, tx);
  const table = tableName(type, schema);

  const params: unknown[] = [ctx.tenantId];
  const whereClauses = [`"_tenant_id" = $1`, `"_deleted_at" IS NULL`];

  // Guard against empty search queries (ILIKE '%%' matches all rows)
  if (!query.query || query.query.trim().length === 0) {
    return { hits: [], totalCount: 0, hasNextPage: false };
  }

  // Build ILIKE matching for search fields.
  // Escape LIKE wildcards (% and _) in the user query so they match literally.
  const escapedQuery = query.query.replace(/[%_\\]/g, '\\$&');
  const searchPattern = `%${escapedQuery}%`;
  params.push(searchPattern);
  const patternIdx = params.length;

  // Determine which fields to search
  let searchFields: string[];
  if (query.fields && query.fields.length > 0) {
    searchFields = query.fields;
  } else {
    // Search all non-system columns. We query the column list from the table.
    // For simplicity, we'll use a subquery approach: search all text-like columns.
    // But since we don't have column metadata at runtime, use a practical fallback:
    // query information_schema once to get text columns.
    const colResult = await q.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       AND data_type IN ('text', 'character varying')
       AND column_name NOT LIKE '\\_%' ESCAPE '\\'`,
      [schema, snakeCase(type)],
    );
    searchFields = (colResult.rows as Array<{ column_name: string }>).map((r) =>
      r.column_name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
    );
  }

  if (searchFields.length === 0) {
    return { hits: [], totalCount: 0, hasNextPage: false };
  }

  // Build ILIKE OR clause and score expression
  const ilikeParts: string[] = [];
  const scoreParts: string[] = [];
  for (const field of searchFields) {
    const col = fieldCol(field);
    ilikeParts.push(`${col} ILIKE $${patternIdx} ESCAPE '\\'`);
    scoreParts.push(`CASE WHEN ${col} ILIKE $${patternIdx} ESCAPE '\\' THEN 1 ELSE 0 END`);
  }

  whereClauses.push(`(${ilikeParts.join(' OR ')})`);

  // Apply additional filter
  if (query.filter) {
    const filterFragment = filterToSql(query.filter, params.length + 1);
    if (filterFragment.text !== 'TRUE') {
      whereClauses.push(filterFragment.text);
    }
    params.push(...filterFragment.params);
  }

  const whereClause = whereClauses.join(' AND ');
  const scoreExpr = scoreParts.join(' + ');

  // Save params for a potential count-only fallback query (before LIMIT/OFFSET are pushed)
  const countParams = [...params];

  // Build pagination
  let paginationClause = '';
  if (query.limit !== undefined) {
    params.push(query.limit);
    paginationClause += ` LIMIT $${params.length}`;
  }
  if (query.offset !== undefined) {
    params.push(query.offset);
    paginationClause += ` OFFSET $${params.length}`;
  }

  const sql = `SELECT *, (${scoreExpr}) AS _search_score, COUNT(*) OVER() AS _total_count
    FROM ${table}
    WHERE ${whereClause}
    ORDER BY _search_score DESC${paginationClause}`;

  const result = await q.query(sql, params);
  const rows = result.rows as Record<string, unknown>[];

  // COUNT(*) OVER() is only present in returned rows. When offset is past
  // all results, rows is empty and we lose the count. Fall back to a
  // separate count query in that case.
  let totalCount: number;
  if (rows.length > 0) {
    totalCount = Number((rows[0] as Record<string, unknown>)['_total_count']);
  } else if ((query.offset ?? 0) > 0) {
    const countSql = `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${whereClause}`;
    const countResult = await q.query(countSql, countParams);
    totalCount = Number((countResult.rows[0] as Record<string, unknown>)['cnt']);
  } else {
    totalCount = 0;
  }
  const offset = query.offset ?? 0;
  const limit = query.limit ?? totalCount;

  const hits: SearchHit[] = rows.map((row) => {
    const score = Number(row['_search_score']);
    const obj = rowToObject(row);
    return { object: obj, score };
  });

  return {
    hits,
    totalCount,
    hasNextPage: offset + limit < totalCount,
  };
}
