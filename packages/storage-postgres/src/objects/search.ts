/**
 * Full-text search query builder for PostgreSQL.
 *
 * Uses ILIKE for case-insensitive substring matching across string-type
 * columns (the SPI contract: 'hospital' matches inside 'a@hospital.org').
 * Scores each row by summing per-field match quality — exact 3, prefix 2,
 * substring 1 — so an incidental substring cannot outrank an exact hit.
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
import { parseSearchQuery, type SearchTerm } from '@altius/spi';
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

  const parsed = parseSearchQuery(query.query);
  if (parsed.required.length === 0 && parsed.orGroups.length === 0) {
    // Only exclusions or empty — no positive match possible.
    return { hits: [], totalCount: 0, hasNextPage: false };
  }

  // Determine which fields to search
  let searchFields: string[];
  if (query.fields && query.fields.length > 0) {
    searchFields = query.fields;
  } else {
    // Search all non-system text columns.
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

  // Build SQL for the parsed query.
  // Each term (required/excluded/orGroup) is matched against the OR of
  // ILIKE across all search fields. Escape LIKE wildcards in the term.
  const fieldCols = searchFields.map((f) => fieldCol(f));

  /** Build "(col1 ILIKE $n OR col2 ILIKE $n OR ...)" and push the param. */
  const buildTermMatch = (term: SearchTerm): string => {
    const escaped = term.value.replace(/[%_\\]/g, '\\$&');
    params.push(`%${escaped}%`);
    const idx = params.length;
    const parts = fieldCols.map((c) => `${c} ILIKE $${idx} ESCAPE '\\'`);
    return `(${parts.join(' OR ')})`;
  };

  /** Build a score contribution for a term across all fields.
   *  Per-field: exact=3, prefix=2, substring=1 for words; phrase=3 (contiguous). */
  const buildTermScore = (term: SearchTerm): string => {
    const escaped = term.value.replace(/[%_\\]/g, '\\$&');
    // substring pattern (already used by buildTermMatch, but score needs its own param slots)
    params.push(`%${escaped}%`);
    const subIdx = params.length;
    // exact pattern (no wildcards)
    params.push(escaped);
    const exactIdx = params.length;
    // prefix pattern
    params.push(`${escaped}%`);
    const prefixIdx = params.length;
    const parts = fieldCols.map((c) => {
      if (term.kind === 'phrase') {
        return `CASE WHEN ${c} ILIKE $${subIdx} ESCAPE '\\' THEN 3 ELSE 0 END`;
      }
      return `CASE` +
        ` WHEN ${c} ILIKE $${exactIdx} ESCAPE '\\' THEN 3` +
        ` WHEN ${c} ILIKE $${prefixIdx} ESCAPE '\\' THEN 2` +
        ` WHEN ${c} ILIKE $${subIdx} ESCAPE '\\' THEN 1` +
        ` ELSE 0 END`;
    });
    return parts.join(' + ');
  };

  // Required: AND of (term matches any field)
  const requiredClauses = parsed.required.map(buildTermMatch);
  if (requiredClauses.length > 0) {
    whereClauses.push(`(${requiredClauses.join(' AND ')})`);
  }

  // Excluded: no field may match (NOT (any field ILIKE))
  for (const term of parsed.excluded) {
    const match = buildTermMatch(term);
    whereClauses.push(`NOT ${match}`);
  }

  // OR groups: at least one group must match (all terms in it match)
  if (parsed.orGroups.length > 0) {
    const groupClauses = parsed.orGroups.map((group) => {
      const termMatches = group.map(buildTermMatch);
      return `(${termMatches.join(' AND ')})`;
    });
    whereClauses.push(`(${groupClauses.join(' OR ')})`);
  }

  // Score: sum of all term scores (required + orGroup matches)
  const scoreParts: string[] = [];
  for (const term of parsed.required) scoreParts.push(buildTermScore(term));
  for (const group of parsed.orGroups) {
    for (const term of group) scoreParts.push(buildTermScore(term));
  }
  const scoreExpr = scoreParts.length > 0 ? scoreParts.join(' + ') : '0';

  // Apply additional filter
  if (query.filter) {
    const filterFragment = filterToSql(query.filter, params.length + 1);
    if (filterFragment.text !== 'TRUE') {
      whereClauses.push(filterFragment.text);
    }
    params.push(...filterFragment.params);
  }

  const whereClause = whereClauses.join(' AND ');

  // Save params for a potential count-only fallback query, BEFORE the
  // LIMIT/OFFSET params are pushed.
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
