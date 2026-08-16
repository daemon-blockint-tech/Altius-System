/**
 * Additive schema reconciliation.
 *
 * generateDDL emits `CREATE TABLE IF NOT EXISTS`, so a new ObjectType lands on
 * a deployed database but a new *property* on an existing type never does — its
 * column is only in the CREATE statement, which no longer runs. Before this,
 * applySchema detected the resulting DDL drift and threw ("increment schema
 * version"), which no operator could act on because the version is a constant.
 *
 * This plans the missing-column half of that problem against the live database,
 * which is the authority on current state. Only additive, non-destructive
 * statements are emitted (ALTER TABLE ... ADD COLUMN). Anything that would
 * rewrite or discard existing data — a type change, or a NOT NULL column with
 * no default on a populated table — is reported as blocked and left for the
 * approved-migration path, never applied silently.
 */

import type { OntologySchema, PropertyDefinition } from '@altius/spi';
import { pgIdent, pgType, snakeCase } from './type-mapping.js';
import { pgLiteral } from './ddl-objects.js';

export interface AdditiveMigrationPlan {
  /** ALTER TABLE ... ADD COLUMN statements, safe to run on populated tables. */
  statements: string[];
  /** Changes that cannot be applied additively, each with the reason. */
  blocked: string[];
}

/** Minimal query surface — satisfied by both Pool and PoolClient. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Normalise a Postgres column type to the spelling information_schema reports,
 * so a declared type can be compared against a live column.
 */
function canonicalPgType(pg: string): string {
  const t = pg.toUpperCase();
  if (t === 'TIMESTAMPTZ') return 'timestamp with time zone';
  if (t === 'INTERVAL') return 'interval';
  if (t === 'TIME') return 'time without time zone';
  return t.toLowerCase();
}

interface DesiredTable {
  table: string;
  properties: readonly PropertyDefinition[];
  /** History tables carry the same property columns but never NOT NULL data. */
  isHistory: boolean;
}

function desiredTables(schema: OntologySchema): DesiredTable[] {
  const tables: DesiredTable[] = [];
  for (const ot of schema.objectTypes) {
    const table = snakeCase(ot.name);
    tables.push({ table, properties: ot.properties, isHistory: false });
    tables.push({ table: `${table}_history`, properties: ot.properties, isHistory: true });
  }
  for (const lt of schema.linkTypes) {
    if (lt.properties?.length) {
      tables.push({ table: snakeCase(lt.name), properties: lt.properties, isHistory: false });
    }
  }
  return tables;
}

/**
 * Diff the declared schema against the live database and return the additive
 * statements that would reconcile them, plus anything that cannot be reconciled
 * without an approved migration.
 *
 * Tables that do not exist yet are skipped — `CREATE TABLE IF NOT EXISTS`
 * already covers those. Columns present in the database but absent from the
 * schema are left alone: dropping them is destructive and out of scope here.
 */
export async function planAdditiveMigration(
  db: Queryable,
  schema: OntologySchema,
  dataSchema = 'public',
): Promise<AdditiveMigrationPlan> {
  const plan: AdditiveMigrationPlan = { statements: [], blocked: [] };
  const tables = desiredTables(schema);
  if (tables.length === 0) return plan;

  const { rows } = await db.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = ANY($2)`,
    [dataSchema, tables.map(t => t.table)],
  );

  // table -> column -> live data_type
  const live = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const table = String(row['table_name']);
    let cols = live.get(table);
    if (!cols) live.set(table, (cols = new Map()));
    cols.set(String(row['column_name']), String(row['data_type']));
  }

  for (const { table, properties, isHistory } of tables) {
    const existing = live.get(table);
    if (!existing) continue; // table is new — CREATE TABLE IF NOT EXISTS covers it

    for (const prop of properties) {
      const col = snakeCase(prop.name);
      const declared = pgType(prop.type, prop.isList === true);
      const liveType = existing.get(col);
      const qualified = `${pgIdent(dataSchema)}.${pgIdent(table)}`;

      if (liveType === undefined) {
        const hasDefault = prop.defaultValue !== undefined;
        // A required property with no default cannot land on the main table,
        // so the property is unaddable as a whole — say so once (on the main
        // table) and emit nothing for its history column either, keeping the
        // plan self-consistent.
        if (prop.required && !hasDefault) {
          if (!isHistory) {
            plan.blocked.push(
              `${table}.${col}: new required property with no @default cannot be added to an existing ` +
              `table (existing rows would violate NOT NULL). Give it a default, or make it optional.`,
            );
          }
          continue;
        }

        // A history row records a past state, so its columns are always
        // nullable regardless of the property being required today.
        const needsNotNull = prop.required && !isHistory;

        const notNull = needsNotNull ? ' NOT NULL' : '';
        const def = hasDefault ? ` DEFAULT ${pgLiteral(prop.defaultValue)}` : '';
        plan.statements.push(
          `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS ${pgIdent(col)} ${declared}${def}${notNull};`,
        );
        continue;
      }

      if (liveType !== canonicalPgType(declared)) {
        plan.blocked.push(
          `${table}.${col}: declared ${declared} but the column is ${liveType}. Changing a column type ` +
          `rewrites existing data and needs an approved migration.`,
        );
      }
    }
  }

  return plan;
}
