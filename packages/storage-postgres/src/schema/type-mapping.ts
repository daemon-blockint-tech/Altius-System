/**
 * Maps ODL/SPI property types to PostgreSQL column types.
 */

const ODL_TO_PG: Record<string, string> = {
  // Scalars
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'DOUBLE PRECISION',
  Boolean: 'BOOLEAN',
  ID: 'TEXT',

  // Date/time
  DateTime: 'TIMESTAMPTZ',
  Date: 'DATE',
  Time: 'TIME',
  Duration: 'INTERVAL',

  // JSON / untyped
  JSON: 'JSONB',

  // Structured scalar — stored as JSONB to preserve the {lat, lng} shape
  // the memory provider exposes as a JS object. TEXT would round-trip a
  // string, diverging from memory on every read.
  GeoPoint: 'JSONB',

  // NHS-specific scalars mapped to TEXT (stored as validated strings)
  NHSNumber: 'TEXT',
  ODS: 'TEXT',
  SNOMED: 'TEXT',
  Email: 'TEXT',
  Phone: 'TEXT',
  URL: 'TEXT',
  Markdown: 'TEXT',
};

/**
 * Case-folded view of ODL_TO_PG, plus the long-form spellings an SPI caller
 * may use where they are not just a case variant of the ODL name.
 *
 * `PropertyDefinition.type` is an unconstrained `string` in the SPI, so no
 * canonical vocabulary exists: ODL emits `Int`/`String`, while a hand-written
 * SPI schema may say `integer`/`string`. An unmatched name silently became
 * TEXT, so a numeric property landed as a text column and SUM/AVG failed at
 * query time — a divergence from the memory provider that nothing caught.
 * Accepting both spellings is strictly more permissive and does not decide
 * which one the SPI should bless.
 */
const PG_BY_LOWER: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ODL_TO_PG).map(([k, v]) => [k.toLowerCase(), v])),
  integer: 'INTEGER',
  bool: 'BOOLEAN',
  text: 'TEXT',
  timestamp: 'TIMESTAMPTZ',
};

/**
 * Convert an ODL/SPI property type name to a PostgreSQL column type.
 * Matching is case-insensitive. Unknown types default to TEXT (enum types,
 * custom scalars). Struct types (passed via `structTypeNames`) map to JSONB
 * to preserve their nested object shape.
 */
export function pgType(odlType: string, isList = false, structTypeNames?: Set<string>): string {
  // Struct types are stored as JSONB to preserve their nested object shape.
  if (structTypeNames?.has(odlType)) {
    return isList ? 'JSONB[]' : 'JSONB';
  }
  const base = ODL_TO_PG[odlType] ?? PG_BY_LOWER[odlType.toLowerCase()] ?? 'TEXT';
  // A list property becomes a Postgres array of the element type, so the value
  // round-trips as the array it was written as. Flattening it to the scalar
  // type silently stored only what the driver could coerce.
  return isList ? `${base}[]` : base;
}

/**
 * Convert an SPI IndexType to PostgreSQL index method.
 */
export function pgIndexMethod(indexType: string): string {
  switch (indexType) {
    case 'BTREE':
      return 'btree';
    case 'HASH':
      return 'hash';
    case 'GIN':
      return 'gin';
    case 'GIST':
      return 'gist';
    case 'FULLTEXT':
      return 'gin'; // GIN with tsvector for full-text search
    default:
      return 'btree';
  }
}

/**
 * Sanitize an identifier for PostgreSQL (lowercase snake_case, quoted if needed).
 */
export function pgIdent(name: string): string {
  // Convert PascalCase/camelCase to snake_case
  const snake = name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  // Escape embedded double-quotes per SQL standard (double them),
  // then wrap in double-quotes to avoid reserved word conflicts.
  const escaped = snake.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Create an unquoted snake_case version for use in index/constraint names.
 */
export function snakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Return the unquoted PostgreSQL column name for a field.
 * System fields (prefixed with _) convert the body from camelCase to snake_case
 * while preserving the leading underscore:
 *   _createdAt → _created_at, _tenantId → _tenant_id, _id → _id
 * User fields go through standard snakeCase conversion.
 */
export function fieldColName(field: string): string {
  if (field.startsWith('_')) {
    const body = field.slice(1);
    return `_${body.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
  }
  return snakeCase(field);
}

/**
 * Quote a field name as a PostgreSQL column identifier.
 * Uses fieldColName for the mapping, then wraps in double-quotes.
 */
export function fieldCol(field: string): string {
  const col = fieldColName(field);
  const escaped = col.replace(/"/g, '""');
  return `"${escaped}"`;
}
