/**
 * Which properties are list-typed, per provider pool.
 *
 * The value serializer in object-crud JSON.stringify's any non-Date object so
 * it lands correctly in a JSONB column. That is right for a `JSON` property
 * holding an array and wrong for a list-typed one, whose column is a real
 * Postgres array: the driver serializes a JS array to an array literal itself,
 * and handing it a JSON string produces `malformed array literal`.
 *
 * The serializer therefore has to know which columns are arrays, and it only
 * receives the ObjectType name and the raw properties. Rather than thread a
 * new parameter through createObject, updateObject and both transaction
 * variants, the provider registers the list properties once when it applies a
 * schema and the serializer looks them up.
 *
 * Keyed by Pool, not module-global: one process runs several providers with
 * different schemas — the conformance suite builds a fresh one per test — and
 * a global would let the last schema applied decide for all of them.
 */

import type { Pool } from 'pg';
import type { OntologySchema } from '@altius/spi';
import { snakeCase } from './schema/type-mapping.js';

const byPool = new WeakMap<Pool, Map<string, Set<string>>>();

/** Record every list-typed property in this schema for later serialization. */
export function registerListProperties(pool: Pool, schema: OntologySchema): void {
  let byType = byPool.get(pool);
  if (!byType) {
    byType = new Map();
    byPool.set(pool, byType);
  }
  for (const objectType of schema.objectTypes) {
    // Both spellings: callers on the write path hold the property name, while
    // the history-row copy holds the column name it was returned under.
    const lists = new Set<string>();
    for (const prop of objectType.properties) {
      if (prop.isList !== true) continue;
      lists.add(prop.name);
      lists.add(snakeCase(prop.name));
    }
    // Set even when empty: a type whose list property was removed must stop
    // being treated as having one.
    byType.set(objectType.name, lists);
  }
}

/** Whether `property` (property name or column name) on `type` is an array. */
export function isListProperty(pool: Pool, type: string, property: string): boolean {
  return byPool.get(pool)?.get(type)?.has(property) ?? false;
}
