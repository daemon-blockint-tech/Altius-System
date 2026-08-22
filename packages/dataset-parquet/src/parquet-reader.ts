/**
 * Read Parquet in place.
 *
 * The platform's datasets are ingested: bytes are copied into `dataset.rows`
 * before anything can query them. That is the wrong answer for an organisation
 * whose data already sits in a lake — the copy is stale the moment it lands,
 * and it duplicates data the customer is already paying to store.
 *
 * This reads the file where it lies. Only the footer and the requested column
 * chunks are touched, so a projection of two columns over a wide file does not
 * pull the whole thing, and paging reads the row range asked for rather than
 * everything before it.
 *
 * Read-only by construction: there is no write path here, which is what makes
 * "the source system still owns this data" true rather than a claim.
 */

import { parquetMetadata, parquetSchema, parquetReadObjects } from 'hyparquet';
import type { DatasetSchema, DatasetColumn } from '@altius/spi';

export interface ParquetPageOptions {
  /** Project a subset of columns. Unknown names are rejected, not ignored. */
  columns?: string[];
  limit?: number;
  offset?: number;
}

export interface ParquetPage {
  rows: Record<string, unknown>[];
  /** Rows in the file, from the footer — no scan required. */
  total: number;
}

/** Parquet physical/converted type → the dataset column types the platform has. */
function columnType(element: {
  type?: string;
  converted_type?: string;
  logical_type?: { type?: string };
  num_children?: number;
}): DatasetColumn['type'] {
  // A group node is a nested structure; the platform's flat column types cannot
  // describe it, so it is carried as json rather than silently flattened.
  if (element.num_children) return 'json';

  const converted = element.converted_type;
  const logical = element.logical_type?.type;

  if (converted === 'DATE' || logical === 'DATE') return 'date';
  if (converted?.startsWith('TIMESTAMP') || logical === 'TIMESTAMP') return 'timestamp';
  if (converted === 'UTF8' || converted === 'ENUM' || converted === 'JSON' || logical === 'STRING') {
    return converted === 'JSON' ? 'json' : 'string';
  }

  switch (element.type) {
    case 'BOOLEAN': return 'boolean';
    case 'INT32':
    case 'INT64':
    case 'INT96': return 'integer';
    case 'FLOAT':
    case 'DOUBLE': return 'double';
    case 'BYTE_ARRAY':
    case 'FIXED_LEN_BYTE_ARRAY': return 'binary';
    default: return 'json';
  }
}

/** The dataset schema this file describes, read from the footer. */
export function inferDatasetSchema(bytes: ArrayBuffer): DatasetSchema {
  const tree = parquetSchema(parquetMetadata(bytes));
  const columns: DatasetColumn[] = tree.children.map(child => ({
    name: child.element.name,
    type: columnType(child.element),
    // Parquet marks REQUIRED explicitly; everything else may be absent.
    nullable: child.element.repetition_type !== 'REQUIRED',
  }));
  return { columns, version: 1 };
}

/** Rows in the file, from the footer. */
export function rowCount(bytes: ArrayBuffer): number {
  return Number(parquetMetadata(bytes).num_rows);
}

/**
 * Make a value safe to serialise.
 *
 * Parquet INT64 arrives as a bigint, which `JSON.stringify` throws on. Values
 * inside the safe-integer range become numbers; the rest keep full precision as
 * a decimal string, because silently rounding an account balance or a
 * transaction id to the nearest 2048 is worse than changing its type.
 */
function normalise(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalise(v)]));
  }
  return value;
}

/** Read one page of rows. */
export async function readParquetPage(bytes: ArrayBuffer, options: ParquetPageOptions = {}): Promise<ParquetPage> {
  const total = rowCount(bytes);

  const offset = Math.max(0, options.offset ?? 0);
  // A limit past the end clamps; a caller paging off the end gets no rows
  // rather than an error, which is what every other read surface here does.
  const end = options.limit == null ? total : Math.min(total, offset + Math.max(0, options.limit));
  if (offset >= total || end <= offset) return { rows: [], total };

  if (options.columns?.length) {
    const known = new Set(inferDatasetSchema(bytes).columns.map(c => c.name));
    const unknown = options.columns.filter(c => !known.has(c));
    // Naming a column the file does not have is a caller error worth reporting:
    // silently dropping it returns rows that look complete and are not.
    if (unknown.length > 0) {
      throw new Error(`Parquet source has no column(s): ${unknown.join(', ')}`);
    }
  }

  const rows = await parquetReadObjects({
    file: bytes,
    rowStart: offset,
    rowEnd: end,
    ...(options.columns?.length ? { columns: options.columns } : {}),
  });

  return { rows: rows.map(r => normalise(r) as Record<string, unknown>), total };
}
