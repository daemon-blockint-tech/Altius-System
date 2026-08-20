/**
 * Row semantics shared by every DatasetService implementation.
 *
 * Primary-key derivation, filter matching, ordering and column projection are
 * part of the DatasetService contract, not of any one backend. They used to
 * live as private functions inside the in-memory service, which meant a second
 * implementation had to restate them — and a restatement that drifts is
 * invisible: both providers pass their own tests while answering the same read
 * differently.
 *
 * So they live here, and both the in-memory and the Postgres services call
 * these exact functions. A change to filter semantics lands in one place or in
 * neither.
 */

import type { DatasetSchema } from './datasets.js';

/**
 * Stable key identifying a row within a dataset branch, or `null` when the
 * schema declares no primary key.
 *
 * A `null` result means the row has no identity: callers must mint a fresh
 * unique key so the row appends rather than replacing an existing one. That is
 * the difference between an upsert-able dataset and an append-only one, and it
 * is deliberately the caller's decision because only the caller can generate a
 * key that fits its storage.
 *
 * The parts are JSON-encoded rather than joined on a separator. The in-memory
 * service joined on a NUL byte, which is fine as a JS Map key and impossible
 * for Postgres — a TEXT value cannot contain NUL, so that key could not be
 * persisted at all. Swapping in a printable separator would have traded one
 * defect for a subtler one: joining on a space collides `('a b', 'c')` with
 * `('a', 'b c')`, silently merging two distinct rows. JSON encoding is both
 * storable and unambiguous.
 */
export function datasetRowKey(schema: DatasetSchema, row: Record<string, unknown>): string | null {
  if (!schema.primaryKey || schema.primaryKey.length === 0) return null;
  return JSON.stringify(schema.primaryKey.map(k => String(row[k] ?? '')));
}

/**
 * Whether a row satisfies a dataset filter.
 *
 * Two forms are accepted per field: `{ field: value }` is equality shorthand,
 * `{ field: { op: value } }` applies operators. Unknown operators are ignored
 * rather than throwing, so an unsupported filter widens the result set instead
 * of failing the read.
 *
 * The numeric comparisons require both sides to be numbers: comparing a string
 * against a number would otherwise coerce and silently match.
 */
export function datasetRowMatches(row: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  for (const [field, cond] of Object.entries(filter)) {
    if (cond === null || cond === undefined) continue;
    if (typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      for (const [op, val] of Object.entries(c)) {
        const rv = row[field];
        switch (op) {
          case 'eq': if (rv !== val) return false; break;
          case 'neq': if (rv === val) return false; break;
          case 'gt': if (!(typeof rv === 'number' && typeof val === 'number' && rv > val)) return false; break;
          case 'gte': if (!(typeof rv === 'number' && typeof val === 'number' && rv >= val)) return false; break;
          case 'lt': if (!(typeof rv === 'number' && typeof val === 'number' && rv < val)) return false; break;
          case 'lte': if (!(typeof rv === 'number' && typeof val === 'number' && rv <= val)) return false; break;
          case 'in': if (!Array.isArray(val) || !val.includes(rv)) return false; break;
          case 'contains': if (typeof rv !== 'string' || typeof val !== 'string' || !rv.includes(val)) return false; break;
          case 'startsWith': if (typeof rv !== 'string' || typeof val !== 'string' || !rv.startsWith(val)) return false; break;
        }
      }
    } else {
      // shorthand: { field: value } → equality
      if (row[field] !== cond) return false;
    }
  }
  return true;
}

/**
 * Sort rows by an ordering spec, least-significant key first so earlier keys
 * win ties. Nulls sort first ascending, last descending.
 */
export function datasetSortRows(
  rows: Record<string, unknown>[],
  orderBy?: { field: string; direction: 'asc' | 'desc' }[],
): Record<string, unknown>[] {
  if (!orderBy || orderBy.length === 0) return rows;
  const sorted = [...rows];
  for (const { field, direction } of [...orderBy].reverse()) {
    sorted.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av === null || av === undefined) return direction === 'asc' ? -1 : 1;
      if (bv === null || bv === undefined) return direction === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return direction === 'asc' ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv));
      return direction === 'asc' ? cmp : -cmp;
    });
  }
  return sorted;
}

/** Restrict rows to the named columns. An empty or absent list projects nothing away. */
export function datasetProjectColumns(
  rows: Record<string, unknown>[],
  columns?: string[],
): Record<string, unknown>[] {
  if (!columns || columns.length === 0) return rows;
  return rows.map(r => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = r[c];
    return out;
  });
}
