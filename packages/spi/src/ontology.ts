/**
 * Core ontology types (Section 3.2).
 */

import type { DateTime } from './scalars.js';

// ---------------------------------------------------------------------------
// Domain objects & links
// ---------------------------------------------------------------------------

/** A persisted ontology object with tenant isolation. */
export interface OntologyObject {
  _tenantId: string;
  _type: string;
  _id: string;
  _version: number;
  _createdAt: DateTime;
  _updatedAt: DateTime;
  _deletedAt?: DateTime;
  /** Actor who produced this version (from RequestContext.actorId). */
  _actorId?: string;
  [key: string]: unknown;
}

/** A typed, directed relationship between two ontology objects. */
export interface OntologyLink {
  _tenantId: string;
  _type: string;
  _id: string;
  _fromType: string;
  _fromId: string;
  _toType: string;
  _toId: string;
  _version: number;
  _createdAt: DateTime;
  _updatedAt: DateTime;
  _deletedAt?: DateTime;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type FilterExpression = FieldPredicate | LogicalPredicate;

/**
 * Comparison semantics every provider must implement identically.
 *
 * `neq` and a negated predicate INCLUDE rows whose field is unset. SQL's
 * three-valued logic makes that the surprising case — `col != 'x'` and
 * `NOT (col = 'x')` are both NULL when the column is NULL, so those rows are
 * dropped — and Postgres did exactly that while the memory provider's `!==`
 * included them. "Not archived" must not silently omit every object whose
 * status was never set, so the JS reading is the contract and Postgres wraps
 * accordingly.
 *
 * The range operators (gt/gte/lt/lte) go the other way: a row with an unset
 * field is EXCLUDED, because "greater than" has no meaning for a value that is
 * not there. That matches SQL without help.
 */
export interface FieldPredicate {
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'contains'
    | 'startsWith'
    | 'exists'
    /**
     * Spatial bounding-box containment for a GeoPoint field. `value` is a
     * {@link GeoBoundingBox}; matches when the point's lat/lng fall inside the
     * (inclusive) box. Implemented by both providers without PostGIS.
     */
    | 'within';
  value?: unknown;
}

/** Inclusive lat/lng bounding box for the `within` spatial predicate. */
export interface GeoBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface LogicalPredicate {
  and?: FilterExpression[];
  or?: FilterExpression[];
  not?: FilterExpression;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

export interface TraversalPath {
  steps: TraversalStep[];
}

export interface TraversalStep {
  linkType: string;
  direction: 'inbound' | 'outbound';
  filter?: FilterExpression;
  /**
   * Repeat this step's link type up to N hops, which is how a self-referential
   * link expresses a hierarchy (a reply chain, an org tree).
   *
   * A node reachable at ANY depth 1..N is in the result, not only one at
   * exactly N — "up to" is what makes it useful ("everyone under this
   * manager"). Traversal is cycle-safe: each node is expanded once per step.
   *
   * Omitted, or 1, means exactly one hop; the two are identical by
   * construction. Below 1 is rejected rather than returning nothing, which
   * would be indistinguishable from "no such relationships exist".
   *
   * The depth budget is counted in hops, so a step with maxDepth: N consumes
   * N of the traversal's maximum. See stepDepth/totalHops.
   */
  maxDepth?: number;
}

export interface TraversalOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  includeDeleted?: boolean;
  asOfVersion?: number;
  asOfTime?: DateTime;
  /** Cursor from a previous page's LinkPage.cursor / ObjectPage.cursor. */
  after?: string;
}

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

/** Tenant-scoped context passed to every SPI operation. */
export interface RequestContext {
  tenantId: string;
  actorId?: string;
  traceId?: string;
}

// ---------------------------------------------------------------------------
// Bulk mutations
// ---------------------------------------------------------------------------

export interface BulkMutationRequest {
  idempotencyKey: string;
  operations: BulkOperation[];
}

export type BulkOperation =
  | { type: 'createObject'; objectType: string; properties: Record<string, unknown> }
  | { type: 'updateObject'; objectType: string; id: string; properties: Record<string, unknown> }
  | { type: 'deleteObject'; objectType: string; id: string; mode: 'soft' | 'hard' };

export interface BulkMutationResult {
  accepted: number;
  failed: number;
  errors: BulkMutationError[];
}

export interface BulkMutationError {
  operationIndex: number;
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Pagination result types
// ---------------------------------------------------------------------------

export interface ObjectPage {
  items: OntologyObject[];
  totalCount: number;
  hasNextPage: boolean;
  cursor?: string;
}

export interface LinkPage {
  items: OntologyLink[];
  totalCount: number;
  hasNextPage: boolean;
  cursor?: string;
}

/**
 * Largest link page a single `getLinks` call may return (PERF-02 DoS bound).
 *
 * Part of the contract rather than each provider's private business: the two
 * previously disagreed — Postgres defaulted to 100 and silently clamped at
 * 1000, the memory provider defaulted to every link and clamped at nothing —
 * so the same call returned a different page depending on the backend.
 * A provider MUST refuse a larger limit rather than quietly return fewer rows.
 */
export const MAX_LINK_QUERY_LIMIT = 1000;

/** Link page size when the caller does not ask for one. */
export const DEFAULT_LINK_QUERY_LIMIT = 100;

// ─── Cursor encoding ───

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode a page offset into an opaque cursor string.
 *
 * The format is base64(`cursor:<offset>`), matching the convention used by
 * the GraphQL pagination layer. Providers and the API layer share the same
 * encoding so a cursor returned by one can be consumed by the other without
 * translation.
 *
 * Implemented in pure JS so the SPI package stays free of a Node or DOM
 * type dependency (`Buffer`/`btoa` are not in the ES2022 lib).
 */
export function encodePageCursor(offset: number): string {
  const str = `cursor:${offset}`;
  let result = '';
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i) << 16;
    const b = (i + 1 < str.length ? str.charCodeAt(i + 1) : 0) << 8;
    const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    const triplet = a | b | c;
    result += B64_CHARS[(triplet >> 18) & 0x3f];
    result += B64_CHARS[(triplet >> 12) & 0x3f];
    result += i + 1 < str.length ? B64_CHARS[(triplet >> 6) & 0x3f] : '=';
    result += i + 2 < str.length ? B64_CHARS[triplet & 0x3f] : '=';
  }
  return result;
}

/**
 * Decode a cursor string back to a page offset.
 *
 * Throws on invalid format — a malformed cursor is a client error, not a
 * silent reset to page zero.
 */
export function decodePageCursor(cursor: string): number {
  let result = '';
  for (let i = 0; i < cursor.length; i += 4) {
    const a = B64_CHARS.indexOf(cursor[i]!);
    const b = B64_CHARS.indexOf(cursor[i + 1]!);
    const c = cursor[i + 2] === '=' ? -1 : B64_CHARS.indexOf(cursor[i + 2]!);
    const d = cursor[i + 3] === '=' ? -1 : B64_CHARS.indexOf(cursor[i + 3]!);
    if (a < 0 || b < 0) throw new Error(`Invalid cursor format: ${cursor}`);
    const triplet = (a << 18) | (b << 12) | ((c >= 0 ? c : 0) << 6) | (d >= 0 ? d : 0);
    result += String.fromCharCode((triplet >> 16) & 0xff);
    if (c >= 0) result += String.fromCharCode((triplet >> 8) & 0xff);
    if (d >= 0) result += String.fromCharCode(triplet & 0xff);
  }
  const match = result.match(/^cursor:(\d+)$/);
  if (!match || !match[1]) {
    throw new Error(`Invalid cursor format: ${cursor}`);
  }
  const offset = parseInt(match[1], 10);
  // A hostile or stale cursor could encode an enormous offset, producing a
  // SQL `OFFSET N` that forces Postgres to scan-and-discard N rows. Cap at
  // a sane absolute ceiling — no real link collection is expected to exceed
  // this, and a cursor beyond it is either crafted or from a different
  // dataset entirely.
  const MAX_CURSOR_OFFSET = 1_000_000;
  if (offset > MAX_CURSOR_OFFSET) {
    throw new Error(`Cursor offset ${offset} exceeds the maximum of ${MAX_CURSOR_OFFSET}.`);
  }
  return offset;
}

export interface TraversalResult {
  nodes: OntologyObject[];
  edges: OntologyLink[];
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Schema representation
// ---------------------------------------------------------------------------

/** Parsed representation of an ODL ontology schema (Section 2). */
export interface OntologySchema {
  version: number;
  objectTypes: ObjectTypeDefinition[];
  linkTypes: LinkTypeDefinition[];
}

export interface ObjectTypeDefinition {
  name: string;
  properties: PropertyDefinition[];
  indexes?: IndexDefinition[];
}

export interface LinkTypeDefinition {
  name: string;
  fromType: string;
  toType: string;
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
  properties?: PropertyDefinition[];
}

export interface PropertyDefinition {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  /**
   * Whether the property holds a list of `type` rather than one value.
   *
   * Without this the flag never crossed the SPI boundary: `tags: [String!]`
   * became a scalar TEXT column on Postgres while the memory provider stored
   * a JS array, so the same ODL produced two different shapes and only the
   * memory one round-tripped.
   */
  isList?: boolean;
}

export interface IndexDefinition {
  field: string;
  indexType: IndexType;
  /** If true, a UNIQUE constraint is generated instead of a regular index. */
  unique?: boolean;
}

// ---------------------------------------------------------------------------
// Storage metadata types
// ---------------------------------------------------------------------------

export type IndexType = 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'FULLTEXT';

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  appliedAt: DateTime;
  details?: string;
}

export interface HealthStatus {
  healthy: boolean;
  provider: string;
  latencyMs: number;
  details?: Record<string, unknown>;
}

export type ReplicationCapability =
  | 'NONE'
  | 'STREAMING_REPLICATION'
  | 'POINT_IN_TIME_RECOVERY'
  | 'BOTH';

export interface StorageCapabilities {
  supportsTransactions: boolean;
  /**
   * Whether a transaction also provides ISOLATION, not just atomicity.
   *
   * `supportsTransactions: true` reasonably reads as ACID, and for one provider
   * it is not: the in-memory provider applies each write immediately and undoes
   * it from a journal on rollback, so all-or-nothing holds but a concurrent
   * reader observes uncommitted state. A test suite that passes against memory
   * can therefore be relying on a dirty read that Postgres would never serve —
   * which is why this is declared rather than left for callers to discover.
   */
  supportsTransactionIsolation: boolean;
  supportsTemporalQueries: boolean;
  supportsFullTextSearch: boolean;
  supportsGeoQueries: boolean;
  supportsGraphTraversal: boolean;
  supportsBulkMutations: boolean;
  /**
   * Whether the provider accepts write operations (create/update/delete).
   * Read-only providers (e.g. lake-backed projections) set this to false so
   * the action executor can fail fast with a typed READ_ONLY error instead
   * of hitting a provider-specific exception mid-transaction.
   */
  supportsWrites: boolean;
  /**
   * Whether the provider supports vector similarity search (e.g. pgvector).
   * When false, LLMClient.vectorSearch is not available on this provider.
   */
  supportsVectorSearch: boolean;
  maxTraversalDepth: number;
  replicationSupport: ReplicationCapability;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type BucketInterval = 'day' | 'week' | 'month' | 'year';

export interface DateBucket {
  /** The date field to bucket (must be a DateTime property). */
  field: string;
  /** Bucket granularity. */
  interval: BucketInterval;
  /** Group key name in the result (defaults to the field name). */
  alias?: string;
}

export interface AggregateField {
  field: string;          // Property name ('*' for count)
  fn: AggregateFunction;
  alias?: string;         // Optional result key alias
}

export interface AggregateQuery {
  fields: AggregateField[];
  groupBy?: string[];
  /** Optional date bucketing dimensions. Each bucket becomes a group key. */
  buckets?: DateBucket[];
  filter?: FilterExpression;
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

export interface AggregateGroup {
  keys: Record<string, unknown>;
  values: Record<string, number | null>;
}

export interface AggregateResult {
  groups: AggregateGroup[];
  totalGroups: number;
}

// ---------------------------------------------------------------------------
// Full-text search
// ---------------------------------------------------------------------------

export interface SearchQuery {
  query: string;
  fields?: string[];
  filter?: FilterExpression;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  object: OntologyObject;
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SearchResult {
  hits: SearchHit[];
  totalCount: number;
  hasNextPage: boolean;
}
