/**
 * Translates FilterExpression trees into parameterized SQL WHERE clauses.
 *
 * All user-supplied values are passed via $N bind parameters to prevent
 * SQL injection. Column names are mapped through snakeCase + pgIdent to
 * ensure safe quoting.
 */

import type { FilterExpression, FieldPredicate, LogicalPredicate, LinkTypeDefinition } from '@altius/spi';
import { fieldCol, snakeCase, pgIdent } from '../schema/type-mapping.js';

/** Result of translating a FilterExpression. */
export interface SqlFragment {
  /** SQL text with $N placeholders. */
  text: string;
  /** Bind parameter values matching the $N placeholders. */
  params: unknown[];
}

/**
 * Context for resolving link-scoped filters (dotted field paths).
 *
 * When a FieldPredicate's `field` contains a dot (e.g. `admittedTo.name`),
 * the first segment is treated as a link type name and the remainder as a
 * field on the target object type. The filter is translated into an EXISTS
 * subquery that joins through the link table.
 *
 * Without this context, dotted fields are treated as literal column names
 * (which will fail at execution time if no such column exists — preserving
 * backward-compatible behaviour for callers that don't need link scoping).
 */
export interface FilterContext {
  /** The object type being filtered (the outer query's table). */
  currentType: string;
  /** Schema name for qualifying link/target tables. Default: 'public'. */
  schema?: string;
  /** Resolves a link type name to its definition. */
  resolveLink: (linkType: string) => LinkTypeDefinition | undefined;
}

function isFieldPredicate(f: FilterExpression): f is FieldPredicate {
  return 'field' in f && 'operator' in f;
}

function isLogicalPredicate(f: FilterExpression): f is LogicalPredicate {
  return 'and' in f || 'or' in f || 'not' in f;
}

/**
 * Translate a FilterExpression into a parameterized SQL WHERE fragment.
 *
 * @param filter  The filter tree to translate.
 * @param offset  Starting index for $N placeholders (1-based).
 * @param ctx     Optional context for resolving link-scoped filters.
 * @returns       SQL fragment with text and bind parameters.
 */
export function filterToSql(filter: FilterExpression, offset = 1, ctx?: FilterContext): SqlFragment {
  if (isFieldPredicate(filter)) {
    return fieldPredicateToSql(filter, offset, ctx);
  }
  if (isLogicalPredicate(filter)) {
    return logicalPredicateToSql(filter, offset, ctx);
  }
  // Fallback: empty filter matches everything
  return { text: 'TRUE', params: [] };
}

/**
 * Build an EXISTS subquery for a link-scoped predicate.
 *
 * Joins the link table to the target object table and applies the
 * predicate against the target field. The outer table is referenced
 * by its implicit snake_case alias.
 */
function linkScopedPredicateToSql(pred: FieldPredicate, offset: number, ctx: FilterContext, link: { linkType: string; targetField: string; linkDef: LinkTypeDefinition }): SqlFragment {
  const schema = ctx.schema ?? 'public';
  const outerAlias = snakeCase(ctx.currentType);
  const linkTable = `${pgIdent(schema)}.${pgIdent(snakeCase(link.linkType))}`;
  const targetTable = `${pgIdent(schema)}.${pgIdent(snakeCase(link.linkDef.toType))}`;

  // Determine direction: which side of the link is the outer type?
  const outerIsFrom = link.linkDef.fromType === ctx.currentType;
  const outerIsTo = link.linkDef.toType === ctx.currentType;
  if (!outerIsFrom && !outerIsTo) {
    // The link type doesn't connect to the current type — no match possible.
    return { text: 'FALSE', params: [] };
  }

  const outerLinkCol = outerIsFrom ? '_from_id' : '_to_id';
  const targetLinkCol = outerIsFrom ? '_to_id' : '_from_id';

  // Build the inner predicate (same operator logic as flat fields, but
  // against the target table's column, qualified with 't.' alias).
  const innerPred: FieldPredicate = { ...pred, field: link.targetField };
  const innerFragment = fieldPredicateToSqlFlat(innerPred, offset, 't');

  return {
    text: `EXISTS (SELECT 1 FROM ${linkTable} AS l JOIN ${targetTable} AS t ON t."_id" = l."${targetLinkCol}" AND t."_deleted_at" IS NULL WHERE l."_tenant_id" = ${outerAlias}."_tenant_id" AND l."_deleted_at" IS NULL AND l."${outerLinkCol}" = ${outerAlias}."_id" AND l."${outerLinkCol === '_from_id' ? '_from_type' : '_to_type'}" = $${offset + innerFragment.params.length} AND ${innerFragment.text})`,
    params: [...innerFragment.params, ctx.currentType],
  };
}

function fieldPredicateToSql(pred: FieldPredicate, offset: number, ctx?: FilterContext): SqlFragment {
  // Link-scoped filter: dotted field path resolved via context.
  const dot = pred.field.indexOf('.');
  if (dot > 0 && ctx) {
    const linkType = pred.field.substring(0, dot);
    const targetField = pred.field.substring(dot + 1);
    const linkDef = ctx.resolveLink(linkType);
    if (!linkDef) {
      // Dotted field + context + unknown link type → no row can match.
      // Safer than falling through to a non-existent column reference.
      return { text: 'FALSE', params: [] };
    }
    return linkScopedPredicateToSql(pred, offset, ctx, { linkType, targetField, linkDef });
  }
  return fieldPredicateToSqlFlat(pred, offset);
}

/** Flat-field predicate translation (no link scoping).
 *  @param tableAlias Optional alias prefix for the column (e.g. 't' inside EXISTS). */
function fieldPredicateToSqlFlat(pred: FieldPredicate, offset: number, tableAlias?: string): SqlFragment {
  const col = tableAlias ? `${tableAlias}.${fieldCol(pred.field)}` : fieldCol(pred.field);

  switch (pred.operator) {
    case 'eq':
      return { text: `${col} = $${offset}`, params: [pred.value] };
    case 'neq':
      // A row whose column IS NULL must satisfy `neq`. Bare `col != $1` is
      // NULL for those rows and the WHERE drops them, so "patients not
      // archived" silently omitted every patient whose status was never set —
      // while the memory provider, using JS `!==`, included them. Absent is
      // not equal to a value, and that is the reading a caller expects.
      return { text: `(${col} IS NULL OR ${col} != $${offset})`, params: [pred.value] };
    case 'gt':
      return { text: `${col} > $${offset}`, params: [pred.value] };
    case 'gte':
      return { text: `${col} >= $${offset}`, params: [pred.value] };
    case 'lt':
      return { text: `${col} < $${offset}`, params: [pred.value] };
    case 'lte':
      return { text: `${col} <= $${offset}`, params: [pred.value] };
    case 'in': {
      // value is expected to be an array
      const arr = pred.value as unknown[];
      if (!Array.isArray(arr) || arr.length === 0) {
        return { text: 'FALSE', params: [] };
      }
      const placeholders = arr.map((_, i) => `$${offset + i}`).join(', ');
      return { text: `${col} IN (${placeholders})`, params: [...arr] };
    }
    case 'contains': {
      // Escape LIKE wildcards so they match literally
      const escaped = String(pred.value).replace(/[%_\\]/g, '\\$&');
      return { text: `${col} LIKE $${offset} ESCAPE '\\'`, params: [`%${escaped}%`] };
    }
    case 'startsWith': {
      const escaped = String(pred.value).replace(/[%_\\]/g, '\\$&');
      return { text: `${col} LIKE $${offset} ESCAPE '\\'`, params: [`${escaped}%`] };
    }
    case 'exists':
      if (pred.value) {
        return { text: `${col} IS NOT NULL`, params: [] };
      }
      return { text: `${col} IS NULL`, params: [] };
    case 'within': {
      // GeoPoint is stored as JSONB {lat,lng}; bounding-box containment without
      // PostGIS by extracting the coordinates and range-checking each axis.
      const box = pred.value as { minLat: number; minLng: number; maxLat: number; maxLng: number };
      const lat = `(${col}->>'lat')::float8`;
      const lng = `(${col}->>'lng')::float8`;
      return {
        text: `(${lat} BETWEEN $${offset} AND $${offset + 1} AND ${lng} BETWEEN $${offset + 2} AND $${offset + 3})`,
        params: [box.minLat, box.maxLat, box.minLng, box.maxLng],
      };
    }
    case 'near': {
      // Haversine distance in meters: 6371000 * 2 * atan2(sqrt(a), sqrt(1-a)).
      // Params are contiguous from $offset: [queryLat, queryLng, radiusMeters].
      // (A prior version bound [lng, lat, radius] but referenced $offset+1..+3,
      //  leaving $offset+3 unbound and colliding with the next fragment's param.)
      const filter = pred.value as { lat: number; lng: number; radiusMeters: number };
      const lat = `(${col}->>'lat')::float8`;
      const lng = `(${col}->>'lng')::float8`;
      const earthR = 6371000;
      const dLat = `(RADIANS($${offset} - ${lat}))`;
      const dLng = `(RADIANS($${offset + 1} - ${lng}))`;
      const a = `SIN(${dLat}/2)*SIN(${dLat}/2) + COS(RADIANS(${lat}))*COS(RADIANS($${offset}))*SIN(${dLng}/2)*SIN(${dLng}/2)`;
      const dist = `${earthR} * 2 * ATAN2(SQRT(${a}), SQRT(1-${a}))`;
      return {
        text: `${dist} <= $${offset + 2}`,
        params: [filter.lat, filter.lng, filter.radiusMeters],
      };
    }
    case 'withinPolygon': {
      // Ray-casting in SQL: iterate polygon edges and count crossings.
      // The polygon is bound as a JSON parameter, never interpolated — a point
      // coordinate is untrusted (types are erased at the trust boundary) and a
      // string value could otherwise close the SQL literal. Coordinates are
      // coerced to numbers; a non-numeric one becomes JSON null and drops out.
      const filter = pred.value as { points: Array<{ lat: number; lng: number }> };
      const pts = filter.points;
      if (pts.length < 3) return { text: 'FALSE', params: [] };
      const lat = `(${col}->>'lat')::float8`;
      const lng = `(${col}->>'lng')::float8`;
      const polyJson = JSON.stringify(pts.map(p => [Number(p.lng), Number(p.lat)]));
      return {
        text: `EXISTS (
          WITH poly AS (SELECT $${offset}::json AS pts),
          edges AS (
            SELECT i,
              (poly.pts->i->0->>0)::float8 AS xi,
              (poly.pts->i->1->>0)::float8 AS yi,
              (poly.pts->((i+1) % json_array_length(poly.pts))->0->>0)::float8 AS xj,
              (poly.pts->((i+1) % json_array_length(poly.pts))->1->>0)::float8 AS yj
            FROM poly, generate_series(0, json_array_length(poly.pts) - 1) AS i
          )
          SELECT 1 FROM edges
          WHERE ((yi > ${lat}) != (yj > ${lat}))
            AND (${lng} < (xj - xi) * (${lat} - yi) / (yj - yi) + xi)
          HAVING COUNT(*) % 2 = 1
        )`,
        params: [polyJson],
      };
    }
    default:
      return { text: 'TRUE', params: [] };
  }
}

function logicalPredicateToSql(pred: LogicalPredicate, offset: number, ctx?: FilterContext): SqlFragment {
  if (pred.and && pred.and.length > 0) {
    return composeFragments(pred.and, 'AND', offset, ctx);
  }
  if (pred.or && pred.or.length > 0) {
    return composeFragments(pred.or, 'OR', offset, ctx);
  }
  if (pred.not) {
    const inner = filterToSql(pred.not, offset, ctx);
    // Same NULL asymmetry one level up: NOT(NULL) is NULL, not TRUE, so a row
    // the inner predicate could not evaluate was dropped rather than negated.
    // COALESCE gives negation the JS meaning the memory provider already had —
    // if the inner test did not hold, the negation does.
    return { text: `COALESCE(NOT (${inner.text}), TRUE)`, params: inner.params };
  }
  return { text: 'TRUE', params: [] };
}

function composeFragments(
  filters: FilterExpression[],
  operator: 'AND' | 'OR',
  offset: number,
  ctx?: FilterContext,
): SqlFragment {
  const parts: string[] = [];
  const allParams: unknown[] = [];
  let currentOffset = offset;

  for (const f of filters) {
    const fragment = filterToSql(f, currentOffset, ctx);
    parts.push(fragment.text);
    allParams.push(...fragment.params);
    currentOffset += fragment.params.length;
  }

  const text = parts.length === 1
    ? parts[0]!
    : `(${parts.join(` ${operator} `)})`;

  return { text, params: allParams };
}
