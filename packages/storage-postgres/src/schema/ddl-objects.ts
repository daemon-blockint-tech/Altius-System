/**
 * DDL generation for ObjectType tables and history tables.
 *
 * Generates:
 * - One table per ObjectType with system columns + property columns
 * - One history table per ObjectType for temporal queries
 * - Indexes for @indexed and @unique fields
 * - Composite unique constraint on (_tenant_id, _id)
 */

import type { ObjectTypeDefinition, PropertyDefinition, IndexDefinition } from '@altius/spi';
import { pgType, pgIdent, snakeCase } from './type-mapping.js';

/** System columns present on every object table. */
const SYSTEM_COLUMNS = `
  "_tenant_id" TEXT NOT NULL,
  "_id" TEXT NOT NULL,
  "_type" TEXT NOT NULL,
  "_version" INTEGER NOT NULL DEFAULT 1,
  "_created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "_deleted_at" TIMESTAMPTZ,
  "_actor_id" TEXT`;

/**
 * Generate DDL for an ObjectType table.
 */
export function generateObjectTableDDL(
  objectType: ObjectTypeDefinition,
  schema = 'public',
  structTypeNames?: Set<string>,
): string[] {
  const tableName = snakeCase(objectType.name);
  const qualifiedTable = `${pgIdent(schema)}.${pgIdent(tableName)}`;
  const statements: string[] = [];

  // Main table
  const propertyCols = objectType.properties
    .map(p => propertyColumn(p, structTypeNames))
    .join(',\n  ');

  const mainTable = `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
  ${SYSTEM_COLUMNS.trim()},
  ${propertyCols},
  PRIMARY KEY ("_tenant_id", "_id")
);`;
  statements.push(mainTable);

  // History table
  const historyTable = `CREATE TABLE IF NOT EXISTS ${pgIdent(schema)}.${pgIdent(tableName + '_history')} (
  "_history_id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ${SYSTEM_COLUMNS.trim()},
  ${propertyCols},
  "_history_created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
  statements.push(historyTable);

  // History table index on (_tenant_id, _id, _version)
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${pgIdent('idx_' + tableName + '_history_lookup')} ON ${pgIdent(schema)}.${pgIdent(tableName + '_history')} ("_tenant_id", "_id", "_version");`
  );

  // Indexes from IndexDefinition[]
  if (objectType.indexes) {
    for (const idx of objectType.indexes) {
      statements.push(generateIndex(tableName, idx, schema));
    }
  }

  // Full-text search: for each FULLTEXT index, emit a per-field generated
  // tsvector column plus a GIN index. Field-scoped (not type-wide) so
  // search restricted to a field only matches that field's tsvector, and
  // each FULLTEXT index can carry its own language.
  //
  // The stemming language is taken from the IndexDefinition's `language`
  // field (default 'english'). It is validated as alphanumeric to prevent
  // SQL injection via the regconfig name — the value is interpolated into
  // a string literal, not parameterized, because DDL cannot use params.
  //
  // Additive: ALTER TABLE ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT
  // EXISTS. No DROP, no type change. Requires no extension beyond pg_trgm
  // (tsvector and to_tsvector are built-in).
  const fulltextIndexes = objectType.indexes?.filter(i => i.indexType === 'FULLTEXT') ?? [];
  for (const idx of fulltextIndexes) {
    const rawLang = idx.language ?? 'english';
    const lang = /^[a-zA-Z0-9_]+$/.test(rawLang) ? rawLang : 'english';
    const colName = snakeCase(idx.field);
    // Keep the leading underscore: pgIdent strips it, so quote manually.
    const ftsCol = `_fts_${colName}`;
    const ftsColQuoted = `"${ftsCol.replace(/"/g, '""')}"`;
    const colQuoted = `"${colName.replace(/"/g, '""')}"`;
    statements.push(
      `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS ${ftsColQuoted} tsvector GENERATED ALWAYS AS (to_tsvector('${lang}', coalesce(${colQuoted}, ''))) STORED;`,
    );
    statements.push(
      `CREATE INDEX IF NOT EXISTS "idx_${tableName}_${ftsCol}" ON ${qualifiedTable} USING gin (${ftsColQuoted});`,
    );
  }

  // Indexes from property directives (unique / indexed)
  for (const prop of objectType.properties) {
    const colName = snakeCase(prop.name);

    // Check if already covered by an explicit IndexDefinition
    const alreadyIndexed = objectType.indexes?.some(i => snakeCase(i.field) === colName);
    if (alreadyIndexed) continue;

    // We don't have directive info on PropertyDefinition directly,
    // but the caller can add IndexDefinitions for @indexed/@unique fields.
  }

  // Migration: add _actor_id to pre-existing tables that lack it (additive).
  // Emitted last so existing array-index-based tests stay stable.
  statements.push(
    `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS "_actor_id" TEXT;`,
  );
  statements.push(
    `ALTER TABLE ${pgIdent(schema)}.${pgIdent(tableName + '_history')} ADD COLUMN IF NOT EXISTS "_actor_id" TEXT;`,
  );

  return statements;
}

/**
 * Generate DDL for a single property column.
 */
function propertyColumn(prop: PropertyDefinition, structTypeNames?: Set<string>): string {
  const colName = pgIdent(snakeCase(prop.name));
  const colType = pgType(prop.type, prop.isList === true, structTypeNames);
  const notNull = prop.required ? ' NOT NULL' : '';
  const defaultVal = prop.defaultValue !== undefined
    ? ` DEFAULT ${pgLiteral(prop.defaultValue)}`
    : '';
  return `${colName} ${colType}${notNull}${defaultVal}`;
}

/**
 * Generate an index DDL statement.
 * Emits CREATE UNIQUE INDEX when idx.unique is set.
 */
function generateIndex(tableName: string, idx: IndexDefinition, schema: string): string {
  const colName = snakeCase(idx.field);
  const idxName = idx.unique ? `uq_${tableName}_${colName}` : `idx_${tableName}_${colName}`;
  const method = idx.indexType === 'FULLTEXT' ? 'gin' : idx.indexType.toLowerCase();
  const qualifiedTable = `${pgIdent(schema)}.${pgIdent(tableName)}`;
  const uniqueKw = idx.unique ? 'UNIQUE ' : '';

  if (idx.indexType === 'FULLTEXT') {
    // Trigram GIN, not tsvector: the runtime search path (objects/search.ts)
    // issues substring ILIKE queries per the SPI contract, which only a
    // pg_trgm index can serve. Requires CREATE EXTENSION pg_trgm (emitted
    // by generateDDL when any FULLTEXT index is present).
    return `CREATE INDEX IF NOT EXISTS ${pgIdent(idxName)} ON ${qualifiedTable} USING gin (${pgIdent(colName)} gin_trgm_ops);`;
  }

  // Unique indexes are tenant-scoped to allow the same value across tenants
  const cols = idx.unique ? `"_tenant_id", ${pgIdent(colName)}` : pgIdent(colName);
  return `CREATE ${uniqueKw}INDEX IF NOT EXISTS ${pgIdent(idxName)} ON ${qualifiedTable} USING ${method} (${cols});`;
}

/**
 * Convert a JS value to a PostgreSQL literal for DEFAULT clauses.
 */
export function pgLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}
