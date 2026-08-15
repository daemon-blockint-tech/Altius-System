/**
 * Shared utility functions for the API package.
 */

import type { ObjectType, ParsedSchema } from '@altius/odl';

/**
 * ODL scalar types that reach storage as a text column, and so can be matched
 * with the substring predicate the search path issues (`ILIKE` on Postgres).
 *
 * Everything else is either a non-text column (Int, Float, Boolean, Date,
 * DateTime, Duration) or structured JSONB (GeoPoint, JSON). Postgres has no
 * `ILIKE` operator for those, so including one turns a search into a 500
 * rather than a slow query.
 */
const TEXT_SCALARS = new Set(['String', 'ID', 'URI']);

/**
 * The fields of an ObjectType a substring search can actually be applied to.
 *
 * Excluded, and why each would otherwise break a search:
 *
 *  - `@primary` — an alias for the storage-minted `_id`, with no column of its
 *    own (the schema loader drops it when building the SPI schema). It reaches
 *    SQL as `"id"` and raises undefined_column.
 *  - `@link` / `@computed` — resolved at read time, never stored.
 *  - non-text scalars — a real column of a type `ILIKE` does not accept.
 *  - list types — stored as a single column of the element type, so a
 *    substring match against the list is not meaningful.
 *
 * Enum-typed fields ARE included: they are stored as TEXT.
 *
 * Used to bound the DEFAULT field set (when a caller names no fields). An
 * explicit list is the caller's own, and is passed through untouched so a
 * mistake surfaces rather than being silently dropped.
 */
export function searchableTextFields(obj: ObjectType, schema: ParsedSchema): Set<string> {
  const enumNames = new Set(schema.enums.map(e => e.name));
  const fields = new Set<string>();

  for (const field of obj.fields) {
    if (field.directives.some(d => d.kind === 'primary' || d.kind === 'link' || d.kind === 'computed')) {
      continue;
    }
    if (field.type.isList) continue;
    if (TEXT_SCALARS.has(field.type.name) || enumNames.has(field.type.name)) {
      fields.add(field.name);
    }
  }

  return fields;
}

/** Convert first character to lowercase. */
export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Convert PascalCase to snake_case — must match FGA codegen convention. */
export function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
