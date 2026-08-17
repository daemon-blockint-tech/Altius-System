/**
 * Translates FilterExpression trees into parameterized SQL WHERE clauses.
 *
 * All user-supplied values are passed via $N bind parameters to prevent
 * SQL injection. Column names are mapped through snakeCase + pgIdent to
 * ensure safe quoting.
 */

import type { FilterExpression, FieldPredicate, LogicalPredicate } from '@altius/spi';
import { fieldCol } from '../schema/type-mapping.js';

/** Result of translating a FilterExpression. */
export interface SqlFragment {
  /** SQL text with $N placeholders. */
  text: string;
  /** Bind parameter values matching the $N placeholders. */
  params: unknown[];
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
 * @returns       SQL fragment with text and bind parameters.
 */
export function filterToSql(filter: FilterExpression, offset = 1): SqlFragment {
  if (isFieldPredicate(filter)) {
    return fieldPredicateToSql(filter, offset);
  }
  if (isLogicalPredicate(filter)) {
    return logicalPredicateToSql(filter, offset);
  }
  // Fallback: empty filter matches everything
  return { text: 'TRUE', params: [] };
}

function fieldPredicateToSql(pred: FieldPredicate, offset: number): SqlFragment {
  const col = fieldCol(pred.field);

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
    default:
      return { text: 'TRUE', params: [] };
  }
}

function logicalPredicateToSql(pred: LogicalPredicate, offset: number): SqlFragment {
  if (pred.and && pred.and.length > 0) {
    return composeFragments(pred.and, 'AND', offset);
  }
  if (pred.or && pred.or.length > 0) {
    return composeFragments(pred.or, 'OR', offset);
  }
  if (pred.not) {
    const inner = filterToSql(pred.not, offset);
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
): SqlFragment {
  const parts: string[] = [];
  const allParams: unknown[] = [];
  let currentOffset = offset;

  for (const f of filters) {
    const fragment = filterToSql(f, currentOffset);
    parts.push(fragment.text);
    allParams.push(...fragment.params);
    currentOffset += fragment.params.length;
  }

  const text = parts.length === 1
    ? parts[0]!
    : `(${parts.join(` ${operator} `)})`;

  return { text, params: allParams };
}
