/**
 * In-memory StorageProvider implementation for testing.
 *
 * Data stored in Maps. Version history in arrays. Tenant isolation via
 * _tenantId filtering. Soft-delete via _deletedAt field.
 */

import type {
  StorageProvider,
  Transaction,
  RequestContext,
  OntologySchema,
  OntologyObject,
  OntologyLink,
  FilterExpression,
  FieldPredicate,
  LogicalPredicate,
  QueryOptions,
  TraversalPath,
  TraversalOptions,
  TraversalResult,
  BulkMutationRequest,
  BulkMutationResult,
  ObjectPage,
  ObjectTypeDefinition,
  LinkPage,
  MigrationResult,
  HealthStatus,
  StorageCapabilities,
  IndexDefinition,
  DateTime,
  LinkTypeDefinition,
  AggregateQuery,
  AggregateResult,
  AggregateGroup,
  SearchQuery,
  SearchResult,
  SearchHit,
} from '@altius/spi';
import type { BucketInterval } from '@altius/spi';
import { MAX_LINK_QUERY_LIMIT, DEFAULT_LINK_QUERY_LIMIT, encodePageCursor, decodePageCursor, parseSearchQuery } from '@altius/spi';
import type { SearchTerm } from '@altius/spi';
import { stepDepth, totalHops } from '@altius/spi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;
function genId(): string {
  return `mem_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

/**
 * Truncate a date value to the start of the given interval.
 * Matches Postgres `date_trunc(interval, value)`.
 * Returns null for null/undefined/non-date input.
 */
function bucketDate(raw: unknown, interval: BucketInterval): string | null {
  if (raw === null || raw === undefined) return null;
  const d = raw instanceof Date ? raw : new Date(raw as string);
  if (isNaN(d.getTime())) return null;
  const utc = new Date(Date.UTC(
    d.getUTCFullYear(),
    interval === 'year' ? 0 : d.getUTCMonth(),
    interval === 'year' || interval === 'month' ? 1 : d.getUTCDate(),
  ));
  // Week: truncate to Monday of the week (ISO week, like Postgres with week starting Monday)
  if (interval === 'week') {
    const day = utc.getUTCDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? 6 : day - 1; // days since Monday
    utc.setUTCDate(utc.getUTCDate() - diff);
  }
  return utc.toISOString();
}

/**
 * Numeric bucketing — mirrors Postgres width_bucket(operand, min, max, numBuckets).
 * Returns 1..numBuckets for in-range values, 0 for below-min, numBuckets+1 for >= max.
 * Returns null for non-numeric input.
 */
function bucketNumber(raw: unknown, min: number, max: number, numBuckets: number): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!isFinite(n)) return null;
  if (n < min) return 0;
  if (n >= max) return numBuckets + 1;
  return Math.floor(((n - min) / (max - min)) * numBuckets) + 1;
}

/**
 * Continuous percentile — the same definition Postgres PERCENTILE_CONT uses,
 * so the two providers answer a median identically. The result interpolates
 * between the two neighbouring values and therefore need not appear in the
 * input: the median of [1, 2] is 1.5, not 1 or 2.
 */
function continuousPercentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/**
 * Evaluate one HAVING predicate. A null aggregate (an empty group, or a
 * single-row STDDEV) satisfies nothing except an explicit `eq null` — SQL's
 * three-valued logic drops NULL rows from a `> x` comparison, and this matches.
 */
function matchesHaving(
  value: number | null,
  predicate: { operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: number | null },
): boolean {
  if (value === null || predicate.value === null) {
    if (predicate.operator === 'eq') return value === predicate.value;
    if (predicate.operator === 'ne') return value !== predicate.value;
    return false;
  }
  switch (predicate.operator) {
    case 'eq': return value === predicate.value;
    case 'ne': return value !== predicate.value;
    case 'gt': return value > predicate.value;
    case 'gte': return value >= predicate.value;
    case 'lt': return value < predicate.value;
    case 'lte': return value <= predicate.value;
  }
}

function now(): DateTime {
  return new Date().toISOString() as DateTime;
}

function isFieldPredicate(f: FilterExpression): f is FieldPredicate {
  return 'field' in f && 'operator' in f;
}

function isLogicalPredicate(f: FilterExpression): f is LogicalPredicate {
  return 'and' in f || 'or' in f || 'not' in f;
}

/** Deep clone a plain object. */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ---------------------------------------------------------------------------
// Filter evaluation
// ---------------------------------------------------------------------------

/**
 * Resolves linked objects for link-scoped filters.
 *
 * Given an object ID and a link type, returns the objects on the other end
 * of that link (non-deleted, tenant-scoped). Used by evaluateFilter to
 * support dotted field paths like `admittedTo.name`.
 */
export type LinkResolver = (obj: Record<string, unknown>, linkType: string) => Record<string, unknown>[];

function evaluateFilter(obj: Record<string, unknown>, filter: FilterExpression, linkResolver?: LinkResolver): boolean {
  if (isFieldPredicate(filter)) {
    return evaluateFieldPredicate(obj, filter, linkResolver);
  }
  if (isLogicalPredicate(filter)) {
    return evaluateLogicalPredicate(obj, filter, linkResolver);
  }
  return true;
}

/**
 * Order two values for a range predicate, or undefined when they cannot be
 * ordered at all.
 *
 * The four range operators previously required BOTH operands to be JS numbers,
 * which made them match nothing in two common cases:
 *
 *  - REST. Query-string values are strings and coerceFilterValue only converts
 *    `in` and `exists`, so `?filter[age][gt]=30` arrives as '30' and every row
 *    failed the typeof check. Postgres casts the parameter against an integer
 *    column, so the same request worked there and returned nothing here — and
 *    memory is the default provider when POSTGRES_URL is unset, i.e. the dev
 *    and test path.
 *  - Dates and strings. filter-to-sql emits a bare `col > $1` with no type
 *    gate, and the codegen assigns the range operators to Date/DateTime, so
 *    every generated schema offers a date range that only worked on Postgres.
 *
 * Strings compare lexicographically, which is the correct ordering for the ISO
 * forms the platform uses for Date ('YYYY-MM-DD') and DateTime. A numeric
 * string against a number compares numerically — that is the REST case, and
 * treating '30' as text against 30 would be its own wrong answer.
 *
 * Anything else — null, undefined, booleans, objects, a non-numeric string
 * against a number — is incomparable and excluded, matching SQL, where a
 * comparison against NULL is NULL and the row is dropped.
 */
function compareForRange(a: unknown, b: unknown): number | undefined {
  if (a === null || a === undefined || b === null || b === undefined) return undefined;

  const aNum = typeof a === 'number' ? a : undefined;
  const bNum = typeof b === 'number' ? b : undefined;

  if (aNum !== undefined && bNum !== undefined) {
    return Number.isNaN(aNum) || Number.isNaN(bNum) ? undefined : aNum - bNum;
  }

  // One side numeric, the other a string: only meaningful if the string is a
  // number. Number('') is 0 and Number(' ') is 0, so an empty string must not
  // silently become zero.
  if (aNum !== undefined && typeof b === 'string') {
    const parsed = b.trim() === '' ? NaN : Number(b);
    return Number.isNaN(parsed) ? undefined : aNum - parsed;
  }
  if (bNum !== undefined && typeof a === 'string') {
    const parsed = a.trim() === '' ? NaN : Number(a);
    return Number.isNaN(parsed) ? undefined : parsed - bNum;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  return undefined;
}

/**
 * Haversine distance between two lat/lng points in meters.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting point-in-polygon test. Returns true if (lat,lng) is inside
 * the polygon defined by the ordered list of vertices.
 */
function pointInPolygon(lat: number, lng: number, points: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i]!.lng, yi = points[i]!.lat;
    const xj = points[j]!.lng, yj = points[j]!.lat;
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function evaluateFieldPredicate(obj: Record<string, unknown>, pred: FieldPredicate, linkResolver?: LinkResolver): boolean {
  // Link-scoped filter: dotted field path.
  const dot = pred.field.indexOf('.');
  if (dot > 0 && linkResolver) {
    const linkType = pred.field.substring(0, dot);
    const targetField = pred.field.substring(dot + 1);
    const linked = linkResolver(obj, linkType);
    if (linked.length === 0) return false;
    // ANY linked object's target field must satisfy the predicate.
    // For 'neq' and 'not exists', the semantics invert: the predicate
    // holds if NO linked object matches the positive form. To keep it
    // simple and consistent with SQL EXISTS, link-scoped predicates are
    // existential: the filter matches if at least one linked object
    // satisfies the operator applied to the target field.
    const innerPred: FieldPredicate = { ...pred, field: targetField };
    return linked.some((target) => evaluateFieldPredicate(target, innerPred));
  }
  const val = obj[pred.field];
  switch (pred.operator) {
    case 'eq':
      return val === pred.value;
    case 'neq':
      return val !== pred.value;
    case 'gt': {
      const c = compareForRange(val, pred.value);
      return c !== undefined && c > 0;
    }
    case 'gte': {
      const c = compareForRange(val, pred.value);
      return c !== undefined && c >= 0;
    }
    case 'lt': {
      const c = compareForRange(val, pred.value);
      return c !== undefined && c < 0;
    }
    case 'lte': {
      const c = compareForRange(val, pred.value);
      return c !== undefined && c <= 0;
    }
    case 'in':
      return Array.isArray(pred.value) && (pred.value as unknown[]).includes(val);
    case 'contains':
      return typeof val === 'string' && typeof pred.value === 'string' && val.includes(pred.value);
    case 'startsWith':
      return typeof val === 'string' && typeof pred.value === 'string' && val.startsWith(pred.value);
    case 'exists':
      return pred.value ? val !== undefined && val !== null : val === undefined || val === null;
    case 'within': {
      const box = pred.value as { minLat?: unknown; minLng?: unknown; maxLat?: unknown; maxLng?: unknown } | null | undefined;
      if (!box || typeof val !== 'object' || val === null) return false;
      const pt = val as { lat?: unknown; lng?: unknown };
      if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number') return false;
      if (
        typeof box.minLat !== 'number' || typeof box.maxLat !== 'number' ||
        typeof box.minLng !== 'number' || typeof box.maxLng !== 'number'
      ) return false;
      return pt.lat >= box.minLat && pt.lat <= box.maxLat && pt.lng >= box.minLng && pt.lng <= box.maxLng;
    }
    case 'near': {
      const filter = pred.value as { lat?: unknown; lng?: unknown; radiusMeters?: unknown } | null | undefined;
      if (!filter || typeof val !== 'object' || val === null) return false;
      const pt = val as { lat?: unknown; lng?: unknown };
      if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number') return false;
      if (typeof filter.lat !== 'number' || typeof filter.lng !== 'number' || typeof filter.radiusMeters !== 'number') return false;
      return haversineMeters(pt.lat, pt.lng, filter.lat, filter.lng) <= filter.radiusMeters;
    }
    case 'withinPolygon': {
      const filter = pred.value as { points?: unknown } | null | undefined;
      if (!filter || typeof val !== 'object' || val === null) return false;
      const pt = val as { lat?: unknown; lng?: unknown };
      if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number') return false;
      if (!Array.isArray(filter.points) || filter.points.length < 3) return false;
      return pointInPolygon(pt.lat, pt.lng, filter.points as Array<{ lat: number; lng: number }>);
    }
    default:
      return false;
  }
}

function evaluateLogicalPredicate(obj: Record<string, unknown>, pred: LogicalPredicate, linkResolver?: LinkResolver): boolean {
  if (pred.and) {
    return pred.and.every((f) => evaluateFilter(obj, f, linkResolver));
  }
  if (pred.or) {
    return pred.or.some((f) => evaluateFilter(obj, f, linkResolver));
  }
  if (pred.not) {
    return !evaluateFilter(obj, pred.not, linkResolver);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Transaction-local Maps
// ---------------------------------------------------------------------------

/**
 * The three Maps a transaction operates on: a snapshot of the committed state
 * taken at begin time, plus any writes the transaction applies. Passed to the
 * provider's `_do*` and constraint-check methods so they run against the
 * transaction's view instead of the committed Maps.
 */
interface MemMaps {
  objects: Map<string, OntologyObject>;
  links: Map<string, OntologyLink>;
  versionHistory: Map<string, OntologyObject[]>;
}

// ---------------------------------------------------------------------------
// MemoryTransaction — snapshot isolation
// ---------------------------------------------------------------------------

/**
 * Snapshot-on-begin transaction.
 *
 * On construction the transaction shallow-copies the provider's committed
 * `_objects` / `_links` Maps and deep-copies the `_versionHistory` arrays.
 * Object references are safe to share because the provider never mutates an
 * `OntologyObject` in place — every update creates a new spread-copied object —
 * so the snapshot's entries remain the versions that were committed when the
 * transaction opened. Version history arrays ARE mutated in place (push), so
 * those are copied element-by-element.
 *
 * All writes go to the transaction-local Maps. The provider's read methods
 * check `_activeTransactions` (a `WeakMap` keyed by `RequestContext`) and, when
 * a transaction is active for the calling context, read from the transaction's
 * Maps instead of the committed Maps. This gives:
 *
 * - **Isolation**: another reader (different `RequestContext`) sees committed
 *   state only, never this transaction's uncommitted writes.
 * - **Read-your-writes**: reads issued with the same `RequestContext` inside
 *   the transaction see the transaction's own pending writes.
 * - **Snapshot consistency**: reads see the state as of begin-time plus this
 *   transaction's writes; changes committed by another transaction after this
 *   one opened are not visible.
 *
 * On commit, only the keys this transaction actually changed are flushed to
 * the committed Maps — flushing the entire snapshot would clobber changes
 * another transaction committed in the meantime. On rollback the snapshot is
 * simply discarded; the committed Maps were never touched.
 */
class MemoryTransaction implements Transaction {
  private _committed = false;
  private _rolledBack = false;
  private _maps: MemMaps;
  private _changedObjectKeys = new Set<string>();
  private _changedLinkKeys = new Set<string>();
  private _hardDeletedObjectKeys = new Set<string>();
  // Base version of each changed object captured at first modification time.
  // At commit, if the committed version no longer matches, a concurrent
  // transaction committed first — this is the lost-update check Postgres
  // performs in the UPDATE WHERE clause but the memory provider's snapshot
  // cannot see, because the snapshot was taken at begin and never refreshed.
  private _objectBaseVersions = new Map<string, number>();

  constructor(private _provider: MemoryStorageProvider, private _ctx: RequestContext) {
    this._maps = {
      objects: new Map(_provider._objects),
      links: new Map(_provider._links),
      versionHistory: new Map(
        Array.from(_provider._versionHistory).map(([k, v]) => [k, [...v]]),
      ),
    };
  }

  /** @internal Expose Maps for the provider's read-path delegation. */
  _getMaps(): MemMaps {
    return this._maps;
  }

  /** @internal Whether the transaction has been committed or rolled back. */
  _isClosed(): boolean {
    return this._committed || this._rolledBack;
  }

  private assertOpen(): void {
    if (this._committed) throw new Error('Transaction already committed');
    if (this._rolledBack) throw new Error('Transaction already rolled back');
  }

  /**
   * Record the version the snapshot sees the first time this transaction
   * touches an object. Only the first capture matters: later modifications
   * within the same transaction read the already-updated snapshot, so the
   * first capture is the version the commit-time conflict check must compare
   * the committed state against.
   */
  private captureBaseVersion(key: string): void {
    if (this._objectBaseVersions.has(key)) return;
    this._objectBaseVersions.set(key, this._maps.objects.get(key)?._version ?? 0);
  }

  async createObject(type: string, properties: Record<string, unknown>): Promise<OntologyObject> {
    this.assertOpen();
    const obj = this._provider._doCreateObject(this._ctx, type, properties, this._maps);
    const key = `${type}:${obj._id}`;
    this._changedObjectKeys.add(key);
    // New object — base version is 0 (does not exist in committed state).
    this._objectBaseVersions.set(key, 0);
    return clone(obj);
  }

  async updateObject(type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyObject> {
    this.assertOpen();
    const key = `${type}:${id}`;
    this.captureBaseVersion(key);
    const updated = this._provider._doUpdateObject(this._ctx, type, id, properties, expectedVersion, this._maps);
    this._changedObjectKeys.add(key);
    return clone(updated);
  }

  async deleteObject(type: string, id: string, mode: 'soft' | 'hard'): Promise<void> {
    this.assertOpen();
    const key = `${type}:${id}`;
    // Deletes are writes like any other: they must lose to a concurrent
    // commit rather than silently erase it.
    this.captureBaseVersion(key);
    if (mode === 'soft') {
      this._provider._doSoftDeleteObject(this._ctx, type, id, this._maps);
      this._changedObjectKeys.add(key);
    } else {
      this._provider._doHardDeleteObject(this._ctx, type, id, this._maps);
      this._hardDeletedObjectKeys.add(key);
    }
  }

  async restoreObject(type: string, id: string): Promise<OntologyObject> {
    this.assertOpen();
    const key = `${type}:${id}`;
    this.captureBaseVersion(key);
    const restored = this._provider._doRestoreObject(this._ctx, type, id, this._maps);
    this._changedObjectKeys.add(key);
    return clone(restored);
  }

  async createLink(type: string, fromId: string, toId: string, properties?: Record<string, unknown>): Promise<OntologyLink> {
    this.assertOpen();
    const link = this._provider._doCreateLink(this._ctx, type, fromId, toId, properties, this._maps);
    this._changedLinkKeys.add(`${type}:${link._id}`);
    return clone(link);
  }

  async updateLink(type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyLink> {
    this.assertOpen();
    const updated = this._provider._doUpdateLink(this._ctx, type, linkId, properties, expectedVersion, this._maps);
    this._changedLinkKeys.add(`${type}:${linkId}`);
    return clone(updated);
  }

  async deleteLink(type: string, linkId: string): Promise<void> {
    this.assertOpen();
    this._provider._doDeleteLink(this._ctx, type, linkId, this._maps);
    this._changedLinkKeys.add(`${type}:${linkId}`);
  }

  async commit(): Promise<void> {
    this.assertOpen();
    // Lost-update check: for each object this transaction modified, verify
    // the committed version still matches the base version the snapshot saw
    // when the transaction first touched it. If another transaction committed
    // in between, the committed version advanced and this transaction's
    // write would silently overwrite it — the exact defect Postgres prevents
    // with `WHERE _version = $expected` in the UPDATE, and the memory
    // provider's snapshot isolation hides from the update call itself.
    for (const [key, baseVersion] of this._objectBaseVersions) {
      const committed = this._provider._objects.get(key);
      const committedVersion = committed?._version ?? 0;
      if (committedVersion !== baseVersion) {
        this._provider._activeTransactions.delete(this._ctx);
        this._rolledBack = true;
        const err = new Error(
          `VERSION_CONFLICT: Object ${key} was modified by a concurrent transaction (expected version ${baseVersion}, committed is ${committedVersion})`,
        ) as Error & { code: string };
        err.code = 'VERSION_CONFLICT';
        throw err;
      }
    }
    // Flush only the keys this transaction changed. Other keys in the snapshot
    // are unchanged references that already exist in the committed Maps, so
    // flushing them would be a no-op — and would clobber changes another
    // transaction committed in the meantime (lost-update).
    for (const key of this._changedObjectKeys) {
      const obj = this._maps.objects.get(key);
      if (obj) {
        this._provider._objects.set(key, obj);
        const hist = this._maps.versionHistory.get(key);
        if (hist) {
          this._provider._versionHistory.set(key, hist);
        }
      }
    }
    for (const key of this._hardDeletedObjectKeys) {
      this._provider._objects.delete(key);
      this._provider._versionHistory.delete(key);
    }
    for (const key of this._changedLinkKeys) {
      const link = this._maps.links.get(key);
      if (link) {
        this._provider._links.set(key, link);
      }
    }
    this._provider._activeTransactions.delete(this._ctx);
    this._committed = true;
  }

  async rollback(): Promise<void> {
    this.assertOpen();
    // Nothing to undo — the committed Maps were never touched. Discard the
    // transaction-local snapshot and unregister from the provider.
    this._provider._activeTransactions.delete(this._ctx);
    this._rolledBack = true;
  }
}

// ---------------------------------------------------------------------------
// MemoryStorageProvider
// ---------------------------------------------------------------------------

export class MemoryStorageProvider implements StorageProvider {
  /** type:id -> OntologyObject */
  /** @internal */ _objects = new Map<string, OntologyObject>();
  /** type:id -> OntologyLink */
  /** @internal */ _links = new Map<string, OntologyLink>();
  /** type:id -> OntologyObject[] (version history, chronological) */
  /** @internal */ _versionHistory = new Map<string, OntologyObject[]>();
  /** version -> OntologySchema */
  private _schemas = new Map<number, OntologySchema>();
  private _currentSchemaVersion = 0;
  /** idempotencyKey -> BulkMutationResult */
  private _idempotencyCache = new Map<string, BulkMutationResult>();
  /** objectType -> IndexDefinition[] (schema-declared plus ensureIndex) */
  private _indexes = new Map<string, IndexDefinition[]>();

  /**
   * Active transactions keyed by RequestContext identity. When a read arrives
   * with a context that has an open transaction, reads are served from the
   * transaction's snapshot+overlay Maps instead of the committed Maps — this is
   * what provides isolation (other contexts see committed state only) and
   * read-your-writes (the transaction's own context sees its pending writes).
   */
  /** @internal */ _activeTransactions = new WeakMap<RequestContext, MemoryTransaction>();

  /**
   * Return the Maps a read with `ctx` should consult: the active
   * transaction's snapshot+overlay if one is open for this context, otherwise
   * the committed Maps.
   */
  private _getEffectiveMaps(ctx: RequestContext): MemMaps {
    const txn = this._activeTransactions.get(ctx);
    if (txn && !txn._isClosed()) return txn._getMaps();
    return { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
  }

  // ─── Internal helpers (exposed for Transaction) ───

  /** @internal */ _getObjectInternal(_ctx: RequestContext, type: string, id: string, objectsMap: Map<string, OntologyObject> = this._objects): OntologyObject | null {
    const key = `${type}:${id}`;
    const obj = objectsMap.get(key);
    if (!obj || obj._tenantId !== _ctx.tenantId) return null;
    return obj;
  }

  /** @internal */ _getLinkInternal(_ctx: RequestContext, type: string, linkId: string, linksMap: Map<string, OntologyLink> = this._links): OntologyLink | null {
    const key = `${type}:${linkId}`;
    const link = linksMap.get(key);
    if (!link || link._tenantId !== _ctx.tenantId) return null;
    return link;
  }

  private _pushVersionHistory(key: string, snapshot: OntologyObject, historyMap: Map<string, OntologyObject[]> = this._versionHistory): void {
    let history = historyMap.get(key);
    if (!history) {
      history = [];
      historyMap.set(key, history);
    }
    history.push(clone(snapshot));
  }

  private _getLinkTypeDef(linkType: string): LinkTypeDefinition | undefined {
    const schema = this._schemas.get(this._currentSchemaVersion);
    if (!schema) return undefined;
    return schema.linkTypes.find((lt) => lt.name === linkType);
  }

  private _getObjectTypeDef(objectType: string): ObjectTypeDefinition | undefined {
    const schema = this._schemas.get(this._currentSchemaVersion);
    if (!schema) return undefined;
    return schema.objectTypes.find((ot) => ot.name === objectType);
  }

  /**
   * Build a LinkResolver for evaluateFilter. Given a source object and a
   * link type, returns the objects on the other end of that link (non-deleted,
   * same tenant). Used for dotted field paths like `admittedTo.name`.
   */
  private _makeLinkResolver(
    ctx: RequestContext,
    maps: MemMaps,
    sourceType: string,
  ): LinkResolver {
    return (obj: Record<string, unknown>, linkType: string): Record<string, unknown>[] => {
      const linkDef = this._getLinkTypeDef(linkType);
      if (!linkDef) return [];
      // Direction: if the source type is the fromType, outbound; else inbound.
      const outbound = linkDef.fromType === sourceType;
      const targetType = outbound ? linkDef.toType : linkDef.fromType;
      const objId = obj['_id'] as string;
      const result: Record<string, unknown>[] = [];
      for (const link of maps.links.values()) {
        if (link._tenantId !== ctx.tenantId) continue;
        if (link._type !== linkType) continue;
        if (link._deletedAt) continue;
        if (outbound) {
          if (link._fromId !== objId) continue;
          // Objects map is keyed by `${type}:${id}`.
          const target = maps.objects.get(`${targetType}:${link._toId}`);
          if (target && !target._deletedAt) result.push(target as Record<string, unknown>);
        } else {
          if (link._toId !== objId) continue;
          const target = maps.objects.get(`${targetType}:${link._fromId}`);
          if (target && !target._deletedAt) result.push(target as Record<string, unknown>);
        }
      }
      return result;
    };
  }

  private _registerIndex(objectType: string, index: IndexDefinition): void {
    const existing = this._indexes.get(objectType) ?? [];
    this._indexes.set(objectType, [...existing.filter((i) => i.field !== index.field), { ...index }]);
  }

  /**
   * Enforce what Postgres carries as column DDL: `required: true` becomes a
   * NOT NULL column and a unique IndexDefinition becomes a UNIQUE index, so
   * the store itself refuses the write. Without this the engine's
   * check-then-write is the only guard and loses every race.
   *
   * @param candidate - the object as it would be stored after the write
   * @param selfId - id of the object being updated, excluded from uniqueness
   */
  /**
   * Fill in any declared default the caller omitted.
   *
   * Only absent values are filled: an explicit null is the caller saying
   * "no value", which must still fail a NOT NULL check rather than be
   * quietly replaced by the default.
   */
  private _applyDefaults(type: string, properties: Record<string, unknown>): Record<string, unknown> {
    const def = this._getObjectTypeDef(type);
    if (!def) return properties;
    let out = properties;
    for (const prop of def.properties) {
      if (prop.defaultValue === undefined) continue;
      if (out[prop.name] !== undefined) continue;
      if (out === properties) out = { ...properties };
      out[prop.name] = prop.defaultValue;
    }
    return out;
  }

  private _enforceObjectConstraints(
    ctx: RequestContext,
    type: string,
    candidate: Record<string, unknown>,
    selfId?: string,
    objectsMap: Map<string, OntologyObject> = this._objects,
  ): void {
    const def = this._getObjectTypeDef(type);
    if (!def) return; // No schema applied — no constraint to enforce

    for (const prop of def.properties) {
      if (!prop.required) continue;
      const value = candidate[prop.name];
      // An explicit null always violates NOT NULL; an absent value only does
      // so when the column has no DEFAULT to fall back on.
      if (value === null || (value === undefined && prop.defaultValue === undefined)) {
        throw new Error(`Required property '${prop.name}' is missing on ${type}`);
      }
    }

    for (const index of this._indexes.get(type) ?? []) {
      if (!index.unique) continue;
      const value = candidate[index.field];
      if (value === undefined || value === null) continue; // NULLs never collide in a unique index
      for (const other of objectsMap.values()) {
        if (other._type !== type || other._tenantId !== ctx.tenantId) continue;
        if (other._id === selfId) continue;
        // Soft-deleted rows still occupy the index in Postgres.
        if ((other as Record<string, unknown>)[index.field] === value) {
          throw new Error(`Unique constraint violation: ${type}.${index.field} = ${String(value)}`);
        }
      }
    }
  }

  /** Postgres refuses a link whose endpoint is missing or soft-deleted. */
  private _assertEndpointLive(ctx: RequestContext, objectType: string, id: string, role: 'source' | 'target', objectsMap: Map<string, OntologyObject> = this._objects): void {
    const obj = this._getObjectInternal(ctx, objectType, id, objectsMap);
    if (!obj) {
      throw new Error(`Referential integrity: ${role} object ${objectType}:${id} does not exist`);
    }
    if (obj._deletedAt) {
      throw new Error(`Referential integrity: ${role} object ${objectType}:${id} is soft-deleted`);
    }
  }

  private _enforceCardinality(ctx: RequestContext, linkType: string, fromId: string, toId: string, linksMap: Map<string, OntologyLink> = this._links): void {
    const def = this._getLinkTypeDef(linkType);
    if (!def) return; // No schema constraint

    // Count active (non-deleted) links of this type
    const activeLinks = Array.from(linksMap.values()).filter(
      (l) => l._type === linkType && l._tenantId === ctx.tenantId && !l._deletedAt,
    );

    if (def.cardinality === 'ONE_TO_ONE') {
      const existingFromOutbound = activeLinks.find((l) => l._fromId === fromId);
      if (existingFromOutbound) {
        throw new Error(`Cardinality violation: ONE_TO_ONE link ${linkType} already exists from ${fromId}`);
      }
      const existingToInbound = activeLinks.find((l) => l._toId === toId);
      if (existingToInbound) {
        throw new Error(`Cardinality violation: ONE_TO_ONE link ${linkType} already exists to ${toId}`);
      }
    } else if (def.cardinality === 'ONE_TO_MANY') {
      // Each "to" can only have one inbound link of this type
      const existingToInbound = activeLinks.find((l) => l._toId === toId);
      if (existingToInbound) {
        throw new Error(`Cardinality violation: ONE_TO_MANY link ${linkType} already exists to ${toId}`);
      }
    } else if (def.cardinality === 'MANY_TO_ONE') {
      // Each "from" can only have one outbound link of this type
      const existingFromOutbound = activeLinks.find((l) => l._fromId === fromId);
      if (existingFromOutbound) {
        throw new Error(`Cardinality violation: MANY_TO_ONE link ${linkType} already exists from ${fromId}`);
      }
    }
    // MANY_TO_MANY: no constraint
  }

  // ─── Internal mutation methods (used by provider + transaction) ───

  /** @internal */ _doCreateObject(ctx: RequestContext, type: string, properties: Record<string, unknown>, maps?: MemMaps): OntologyObject {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    // Apply declared defaults before validating. Postgres applies them in the
    // column DEFAULT, so skipping the check without also filling the value
    // would leave the same create storing "DRAFT" on one provider and nothing
    // on the other — a divergence that only shows up on read.
    properties = this._applyDefaults(type, properties);
    this._enforceObjectConstraints(ctx, type, properties, undefined, m.objects);
    const id = genId();
    const timestamp = now();
    const obj: OntologyObject = {
      // Caller properties FIRST so the system fields below always win. With
      // the spread last, any `_`-prefixed key in properties silently overrode
      // the value the provider computed — `_type` let an action declaring one
      // object type write a row of another (so markings, FGA and consent all
      // validated a type the row did not end up having, and the audit trail
      // recorded the declared one), and `_tenantId` let a caller write into
      // another tenant outright.
      ...properties,
      _tenantId: ctx.tenantId,
      _type: type,
      _id: id,
      _version: 1,
      _createdAt: timestamp,
      _updatedAt: timestamp,
      _actorId: ctx.actorId,
    };
    const key = `${type}:${id}`;
    m.objects.set(key, obj);
    this._pushVersionHistory(key, obj, m.versionHistory);
    return obj;
  }

  /** @internal */ _doUpdateObject(ctx: RequestContext, type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number, maps?: MemMaps): OntologyObject {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${id}`;
    const existing = m.objects.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    if (existing._deletedAt) {
      throw new Error(`Object ${type}:${id} is deleted`);
    }
    if (expectedVersion !== undefined && existing._version !== expectedVersion) {
      const err = new Error(`Object ${type}:${id} has version ${existing._version}, expected ${expectedVersion}`) as Error & { code: string };
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    this._enforceObjectConstraints(ctx, type, { ...existing, ...properties }, id, m.objects);
    const updated: OntologyObject = {
      ...existing,
      ...properties,
      _tenantId: existing._tenantId,
      _type: existing._type,
      _id: existing._id,
      _version: existing._version + 1,
      _createdAt: existing._createdAt,
      _updatedAt: now(),
      _actorId: ctx.actorId,
    };
    m.objects.set(key, updated);
    this._pushVersionHistory(key, updated, m.versionHistory);
    return updated;
  }

  /** @internal */ _doSoftDeleteObject(ctx: RequestContext, type: string, id: string, maps?: MemMaps): OntologyObject {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${id}`;
    const existing = m.objects.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    const updated: OntologyObject = {
      ...existing,
      _deletedAt: now(),
      _version: existing._version + 1,
      _updatedAt: now(),
      _actorId: ctx.actorId,
    };
    m.objects.set(key, updated);
    this._pushVersionHistory(key, updated, m.versionHistory);
    return updated;
  }

  /** @internal */ _doRestoreObject(ctx: RequestContext, type: string, id: string, maps?: MemMaps): OntologyObject {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${id}`;
    const existing = m.objects.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    if (!existing._deletedAt) {
      throw new Error(`Object ${type}:${id} is not deleted`);
    }
    const updated: OntologyObject = {
      ...existing,
      _deletedAt: undefined as unknown as DateTime,
      _version: existing._version + 1,
      _updatedAt: now(),
      _actorId: ctx.actorId,
    };
    m.objects.set(key, updated);
    this._pushVersionHistory(key, updated, m.versionHistory);
    return updated;
  }

  /** @internal */ _doHardDeleteObject(ctx: RequestContext, type: string, id: string, maps?: MemMaps): void {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${id}`;
    const existing = m.objects.get(key);
    // Tenant isolation: deny access if object belongs to a different tenant
    if (existing && existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    // Idempotent: no-op if object doesn't exist
    if (!existing) return;
    m.objects.delete(key);
    m.versionHistory.delete(key);
  }

  /** @internal */ _doCreateLink(
    ctx: RequestContext,
    type: string,
    fromId: string,
    toId: string,
    properties?: Record<string, unknown>,
    maps?: MemMaps,
  ): OntologyLink {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    // Resolve fromType/toType from link type definition or default to 'unknown'
    const def = this._getLinkTypeDef(type);
    // Referential integrity before cardinality, matching the Postgres order.
    if (def) {
      this._assertEndpointLive(ctx, def.fromType, fromId, 'source', m.objects);
      this._assertEndpointLive(ctx, def.toType, toId, 'target', m.objects);
    }
    this._enforceCardinality(ctx, type, fromId, toId, m.links);
    // Honour engine-provided ID (UUIDv7) per SPI contract, fall back to genId
    const engineId = properties?._engineLinkId;
    const id = typeof engineId === 'string' ? engineId : genId();
    const timestamp = now();
    // Strip _engineLinkId from user-facing properties
    const { _engineLinkId: _, ...userProps } = properties ?? {};
    const link: OntologyLink = {
      _tenantId: ctx.tenantId,
      _type: type,
      _id: id,
      _fromType: def?.fromType ?? 'unknown',
      _fromId: fromId,
      _toType: def?.toType ?? 'unknown',
      _toId: toId,
      _version: 1,
      _createdAt: timestamp,
      _updatedAt: timestamp,
      ...userProps,
    };
    m.links.set(`${type}:${id}`, link);
    return link;
  }

  /** @internal */ _doUpdateLink(ctx: RequestContext, type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number, maps?: MemMaps): OntologyLink {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${linkId}`;
    const existing = m.links.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId || existing._deletedAt) {
      throw new Error(`Link ${type}:${linkId} not found or is deleted`);
    }
    if (expectedVersion !== undefined && existing._version !== expectedVersion) {
      const err = new Error(`Link ${type}:${linkId} has version ${existing._version}, expected ${expectedVersion}`) as Error & { code: string };
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    const updated: OntologyLink = {
      ...existing,
      ...properties,
      _tenantId: existing._tenantId,
      _type: existing._type,
      _id: existing._id,
      _fromType: existing._fromType,
      _fromId: existing._fromId,
      _toType: existing._toType,
      _toId: existing._toId,
      _version: existing._version + 1,
      _createdAt: existing._createdAt,
      _updatedAt: now(),
    };
    m.links.set(key, updated);
    return updated;
  }

  /**
   * Soft delete, as in Postgres: the record stays with _deletedAt set so
   * getLinks/traverse with includeDeleted still see it.
   */
  /** @internal */ _doDeleteLink(ctx: RequestContext, type: string, linkId: string, maps?: MemMaps): void {
    const m = maps ?? { objects: this._objects, links: this._links, versionHistory: this._versionHistory };
    const key = `${type}:${linkId}`;
    const existing = m.links.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId || existing._deletedAt) {
      throw new Error(`Link ${type}:${linkId} not found or already deleted`);
    }
    const timestamp = now();
    m.links.set(key, {
      ...existing,
      _deletedAt: timestamp,
      _updatedAt: timestamp,
      _version: existing._version + 1,
    });
  }

  // ─── Schema ───

  async applySchema(_ctx: RequestContext, schema: OntologySchema): Promise<MigrationResult> {
    const fromVersion = this._currentSchemaVersion;
    this._currentSchemaVersion = schema.version;
    this._schemas.set(schema.version, clone(schema));
    // Postgres emits index DDL alongside the table, so schema-declared indexes
    // are live from applySchema onwards without an ensureIndex call.
    for (const objectType of schema.objectTypes) {
      for (const index of objectType.indexes ?? []) {
        this._registerIndex(objectType.name, index);
      }
    }
    return {
      success: true,
      fromVersion,
      toVersion: schema.version,
      appliedAt: now(),
    };
  }

  async getSchema(_ctx: RequestContext, version?: number): Promise<OntologySchema> {
    const v = version ?? this._currentSchemaVersion;
    const schema = this._schemas.get(v);
    if (!schema) {
      throw new Error(`Schema version ${v} not found`);
    }
    return clone(schema);
  }

  // ─── Objects ───

  async createObject(ctx: RequestContext, type: string, properties: Record<string, unknown>): Promise<OntologyObject> {
    return clone(this._doCreateObject(ctx, type, properties));
  }

  async getObject(ctx: RequestContext, type: string, id: string): Promise<OntologyObject | null> {
    const maps = this._getEffectiveMaps(ctx);
    const obj = this._getObjectInternal(ctx, type, id, maps.objects);
    if (!obj) return null;
    if (obj._deletedAt) return null;
    return clone(obj);
  }

  async updateObject(ctx: RequestContext, type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyObject> {
    return clone(this._doUpdateObject(ctx, type, id, properties, expectedVersion));
  }

  async deleteObject(ctx: RequestContext, type: string, id: string, mode: 'soft' | 'hard'): Promise<void> {
    if (mode === 'soft') {
      this._doSoftDeleteObject(ctx, type, id);
    } else {
      this._doHardDeleteObject(ctx, type, id);
    }
  }

  async restoreObject(ctx: RequestContext, type: string, id: string): Promise<OntologyObject> {
    return clone(this._doRestoreObject(ctx, type, id));
  }

  async queryObjects(ctx: RequestContext, type: string, filter: FilterExpression, options?: QueryOptions): Promise<ObjectPage> {
    // `asOfVersion` is well defined for ONE object (getObjectAtVersion) and
    // not for a set: versions are per-object, so "every Patient at version 3"
    // has no answer for a patient that only ever reached version 2. Refuse it
    // loudly rather than invent a reading — an as-of query that silently
    // returns current rows looks exactly like real historical data.
    if (options?.asOfVersion !== undefined) {
      throw new Error(
        'QueryOptions.asOfVersion is not supported on collection queries: version numbers are per-object. ' +
        'Use getObjectAtVersion for a single object, or asOfTime for a set.',
      );
    }

    const maps = this._getEffectiveMaps(ctx);
    const asOf = options?.asOfTime;
    const candidates = asOf
      ? this._objectsAsOf(ctx, type, asOf, maps)
      : Array.from(maps.objects.values());

    let items = candidates.filter((obj) => {
      if (obj._tenantId !== ctx.tenantId) return false;
      if (obj._type !== type) return false;
      if (!options?.includeDeleted && obj._deletedAt) return false;
      return evaluateFilter(obj as Record<string, unknown>, filter, this._makeLinkResolver(ctx, maps, type));
    });

    const totalCount = items.length;

    // Sorting
    if (options?.orderBy) {
      for (const sort of [...options.orderBy].reverse()) {
        items.sort((a, b) => {
          const aVal = (a as Record<string, unknown>)[sort.field];
          const bVal = (b as Record<string, unknown>)[sort.field];
          if (aVal === bVal) return 0;
          if (aVal === undefined || aVal === null) return 1;
          if (bVal === undefined || bVal === null) return -1;
          const cmp = aVal < bVal ? -1 : 1;
          return sort.direction === 'desc' ? -cmp : cmp;
        });
      }
    }

    // Pagination — enforce maximum limit to prevent DoS (matches Postgres provider)
    const MAX_QUERY_LIMIT = 1000;
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 100, MAX_QUERY_LIMIT);
    items = items.slice(offset, offset + limit);

    return {
      items: items.map((i) => clone(i)),
      totalCount,
      hasNextPage: offset + limit < totalCount,
    };
  }

  /**
   * Every object of a type as it stood at a point in time.
   *
   * One entry per object: its newest version whose `_updatedAt` is at or
   * before the instant. An object created after the instant has no such
   * version and is absent, which is correct — it did not exist yet. An object
   * soft-deleted before the instant comes back carrying `_deletedAt`, so the
   * caller's normal soft-delete filter drops it exactly as it would today.
   *
   * The filter is applied to the historical state by the caller, not to the
   * current one: asking "which patients were DISCHARGED last Tuesday" has to
   * evaluate the predicate against Tuesday's values, or the answer is a set
   * of today's rows wearing old timestamps.
   */
  private _objectsAsOf(
    ctx: RequestContext,
    type: string,
    asOfTime: DateTime,
    maps: MemMaps,
  ): OntologyObject[] {
    const out: OntologyObject[] = [];
    for (const [key, history] of maps.versionHistory) {
      if (!key.startsWith(`${type}:`)) continue;
      let best: OntologyObject | undefined;
      for (const snapshot of history) {
        if (snapshot._tenantId !== ctx.tenantId) continue;
        if (snapshot._updatedAt > asOfTime) continue;
        if (!best || snapshot._version > best._version) best = snapshot;
      }
      if (best) out.push(best);
    }
    return out;
  }

  async aggregateObjects(ctx: RequestContext, type: string, query: AggregateQuery): Promise<AggregateResult> {
    if (!query.fields || query.fields.length === 0) {
      throw new Error('Aggregate query must specify at least one field');
    }
    // Validate aggregate functions upfront (before grouping) so invalid
    // functions always throw, even when there are zero matching rows.
    const ALLOWED_FNS = new Set(['count', 'sum', 'avg', 'min', 'max', 'count_distinct', 'stddev', 'median', 'percentile']);
    for (const aggField of query.fields) {
      if (!ALLOWED_FNS.has(aggField.fn.toLowerCase())) {
        throw new Error(`Invalid aggregate function: ${aggField.fn}`);
      }
      // A percentile with no fraction has no answer; Postgres would raise on
      // PERCENTILE_CONT(NULL), so refuse it here rather than defaulting to a
      // median the caller did not ask for.
      if (aggField.fn.toLowerCase() === 'percentile') {
        if (typeof aggField.percentile !== 'number' || !isFinite(aggField.percentile) || aggField.percentile < 0 || aggField.percentile > 1) {
          throw new Error(`Aggregate percentile requires a fraction between 0 and 1 for field '${aggField.field}'`);
        }
      }
    }
    // Same for bucket intervals: bucketDate falls through to day-granularity
    // for anything it does not recognise, so without this an unsupported
    // interval is a silent wrong answer here while Postgres rejects it.
    const ALLOWED_BUCKET_INTERVALS = new Set(['day', 'week', 'month', 'year']);
    for (const bucket of query.buckets ?? []) {
      if ('interval' in bucket) {
        if (!ALLOWED_BUCKET_INTERVALS.has(bucket.interval)) {
          throw new Error(`Invalid bucket interval: ${bucket.interval}`);
        }
      } else {
        // NumericBucket validation — mirror Postgres checks.
        if (typeof bucket.min !== 'number' || typeof bucket.max !== 'number' || typeof bucket.numBuckets !== 'number') {
          throw new Error('NumericBucket requires numeric min, max, and numBuckets');
        }
        if (bucket.numBuckets <= 0) {
          throw new Error('NumericBucket numBuckets must be positive');
        }
        if (bucket.min >= bucket.max) {
          throw new Error('NumericBucket min must be less than max');
        }
      }
    }
    // 1. Collect matching objects (tenant-scoped, non-deleted)
    const maps = this._getEffectiveMaps(ctx);
    let items = Array.from(maps.objects.values()).filter((obj) => {
      if (obj._tenantId !== ctx.tenantId) return false;
      if (obj._type !== type) return false;
      if (obj._deletedAt) return false;
      if (query.filter) return evaluateFilter(obj as Record<string, unknown>, query.filter, this._makeLinkResolver(ctx, maps, type));
      return true;
    });

    // 2. Group by groupBy fields
    const groupMap = new Map<string, Record<string, unknown>[]>();
    const groupKeyMap = new Map<string, Record<string, unknown>>();

    for (const obj of items) {
      const keys: Record<string, unknown> = {};
      if (query.groupBy) {
        for (const field of query.groupBy) {
          keys[field] = (obj as Record<string, unknown>)[field] ?? null;
        }
      }
      // Bucketing — date or numeric, truncate the field value to the bucket
      if (query.buckets) {
        for (const bucket of query.buckets) {
          const aliasName = bucket.alias ?? bucket.field;
          const raw = (obj as Record<string, unknown>)[bucket.field];
          if ('interval' in bucket) {
            keys[aliasName] = bucketDate(raw, bucket.interval);
          } else {
            keys[aliasName] = bucketNumber(raw, bucket.min, bucket.max, bucket.numBuckets);
          }
        }
      }
      const groupKey = JSON.stringify(keys);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
        groupKeyMap.set(groupKey, keys);
      }
      groupMap.get(groupKey)!.push(obj as Record<string, unknown>);
    }

    // If no items and no groupBy/buckets, return empty
    const hasGrouping = (query.groupBy && query.groupBy.length > 0) || (query.buckets && query.buckets.length > 0);
    if (groupMap.size === 0 && !hasGrouping) {
      // No groupBy: aggregate over all matching items as a single group
      groupMap.set('{}', []);
      groupKeyMap.set('{}', {});
      // Re-add all items to the single group
      for (const obj of items) {
        groupMap.get('{}')!.push(obj as Record<string, unknown>);
      }
    }

    // 3. Compute aggregates per group
    let groups: AggregateGroup[] = [];

    for (const [groupKey, groupItems] of groupMap) {
      const keys = groupKeyMap.get(groupKey)!;
      const values: Record<string, number | null> = {};

      for (const aggField of query.fields) {
        const fnLower = aggField.fn.toLowerCase();
        const alias = aggField.alias ?? `${aggField.fn}_${aggField.field}`;

        if (fnLower === 'count') {
          if (aggField.field === '*') {
            values[alias] = groupItems.length;
          } else {
            values[alias] = groupItems.filter(
              (item) => item[aggField.field] !== undefined && item[aggField.field] !== null,
            ).length;
          }
        } else if (fnLower === 'count_distinct') {
          // Distinct over any comparable type, matching COUNT(DISTINCT col).
          // Objects/arrays are keyed by their JSON form so two structurally
          // equal values count once, as Postgres would compare them by value.
          const seen = new Set<string>();
          for (const item of groupItems) {
            const v = item[aggField.field];
            if (v === undefined || v === null) continue;
            seen.add(typeof v === 'object' ? JSON.stringify(v) : `${typeof v}:${String(v)}`);
          }
          values[alias] = seen.size;
        } else {
          // sum, avg, min, max — only on numeric fields. A present but
          // non-numeric value is rejected rather than silently skipped:
          // AggregateGroup.values is Record<string, number | null>, so a
          // DateTime or string MIN/MAX has no representation, and Postgres
          // answers such a query with an epoch millisecond count or NaN.
          // Both providers must refuse it identically. Absent values still
          // aggregate to null — that case already agrees.
          const present = groupItems
            .map((item) => item[aggField.field])
            .filter((v) => v !== undefined && v !== null);

          if (present.some((v) => typeof v !== 'number')) {
            throw new Error(
              `Aggregate ${aggField.fn} on non-numeric field '${aggField.field}'`,
            );
          }
          const numericValues = present as number[];

          if (numericValues.length === 0) {
            values[alias] = null;
          } else {
            switch (fnLower) {
              case 'sum':
                values[alias] = numericValues.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                values[alias] = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
                break;
              case 'min':
                values[alias] = Math.min(...numericValues);
                break;
              case 'max':
                values[alias] = Math.max(...numericValues);
                break;
              case 'stddev': {
                // Sample standard deviation. Undefined for one observation —
                // STDDEV_SAMP returns NULL there, so this must too.
                if (numericValues.length < 2) {
                  values[alias] = null;
                  break;
                }
                const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
                const variance = numericValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (numericValues.length - 1);
                values[alias] = Math.sqrt(variance);
                break;
              }
              case 'median':
                values[alias] = continuousPercentile(numericValues, 0.5);
                break;
              case 'percentile':
                values[alias] = continuousPercentile(numericValues, aggField.percentile!);
                break;
            }
          }
        }
      }

      groups.push({ keys, values });
    }

    // HAVING — filter groups by aggregate value before counting, ordering and
    // paging, so totalGroups reflects what a caller can actually page through.
    if (query.having && query.having.length > 0) {
      for (const predicate of query.having) {
        groups = groups.filter(g => matchesHaving(g.values[predicate.alias] ?? null, predicate));
      }
    }

    const totalGroups = groups.length;

    // 4. Apply ordering
    if (query.orderBy && query.orderBy.length > 0) {
      for (const sort of [...query.orderBy].reverse()) {
        groups.sort((a, b) => {
          // Check if the field is a group key or aggregate value
          const aVal = (a.keys[sort.field] ?? a.values[sort.field]) as unknown;
          const bVal = (b.keys[sort.field] ?? b.values[sort.field]) as unknown;
          if (aVal === bVal) return 0;
          if (aVal === undefined || aVal === null) return 1;
          if (bVal === undefined || bVal === null) return -1;
          const cmp = aVal < bVal ? -1 : 1;
          return sort.direction === 'desc' ? -cmp : cmp;
        });
      }
    }

    // 5. Apply limit/offset
    const offset = query.offset ?? 0;
    const limit = query.limit ?? groups.length;
    groups = groups.slice(offset, offset + limit);

    return { groups, totalGroups };
  }

  async searchObjects(ctx: RequestContext, type: string, query: SearchQuery): Promise<SearchResult> {
    // Guard against empty search queries (matches Postgres provider behavior)
    if (!query.query || query.query.trim().length === 0) {
      return { hits: [], totalCount: 0, hasNextPage: false };
    }

    const parsed = parseSearchQuery(query.query);
    if (parsed.required.length === 0 && parsed.orGroups.length === 0) {
      // Only exclusions or empty — no positive match possible.
      return { hits: [], totalCount: 0, hasNextPage: false };
    }

    // Collect candidate objects (tenant-scoped, type-matched, non-deleted)
    const maps = this._getEffectiveMaps(ctx);
    const candidates = Array.from(maps.objects.values()).filter((obj) => {
      if (obj._tenantId !== ctx.tenantId) return false;
      if (obj._type !== type) return false;
      if (obj._deletedAt) return false;
      return true;
    });

    // Score and filter using the parsed query.
    //   - All `required` terms must match (AND)
    //   - No `excluded` term may match
    //   - If `orGroups` exist, at least one group must match (all its terms)
    //   - Per-field match quality: exact=3, prefix=2, substring=1 for words;
    //     phrases score 3 (contiguous match is always exact-quality).
    //     Sums across fields, multiplied by @searchable(weight:).
    //     Matches the Postgres provider weight-for-weight.
    const otDef = this._getObjectTypeDef(type);
    const weightMap = new Map<string, number>();
    for (const idx of otDef?.indexes ?? []) {
      if (idx.indexType === 'FULLTEXT' && idx.weight !== undefined) {
        weightMap.set(idx.field, idx.weight);
      }
    }
    const fieldWeight = (field: string): number => weightMap.get(field) ?? 1;

    const fieldScore = (val: string, term: SearchTerm): number => {
      const lower = val.toLowerCase();
      const t = term.value;
      if (lower === t) return 3;
      if (lower.startsWith(t)) return 2;
      if (term.kind === 'phrase') return 3; // contiguous phrase match
      return 1; // substring
    };

    const scored: SearchHit[] = [];
    for (const obj of candidates) {
      const searchFields = query.fields
        ? query.fields
        : Object.keys(obj).filter((k) => !k.startsWith('_') && typeof obj[k] === 'string');

      let score = 0;
      let matched = true;
      const highlights: Record<string, string[]> = {};

      // Required: all must match somewhere in the searched fields
      for (const term of parsed.required) {
        let termScore = 0;
        for (const field of searchFields) {
          const val = obj[field];
          if (typeof val !== 'string') continue;
          if (!val.toLowerCase().includes(term.value)) continue;
          termScore += fieldWeight(field) * fieldScore(val, term);
          if (!highlights[field]) highlights[field] = [];
          highlights[field].push(val);
        }
        if (termScore === 0) { matched = false; break; }
        score += termScore;
      }
      if (!matched) continue;

      // Excluded: no field may match
      let excludedHit = false;
      for (const term of parsed.excluded) {
        for (const field of searchFields) {
          const val = obj[field];
          if (typeof val !== 'string') continue;
          if (val.toLowerCase().includes(term.value)) { excludedHit = true; break; }
        }
        if (excludedHit) break;
      }
      if (excludedHit) continue;

      // OR groups: at least one group must match (all terms in it)
      if (parsed.orGroups.length > 0) {
        let orSatisfied = false;
        for (const group of parsed.orGroups) {
          let groupScore = 0;
          let allMatched = true;
          for (const term of group) {
            let termScore = 0;
            for (const field of searchFields) {
              const val = obj[field];
              if (typeof val !== 'string') continue;
              if (!val.toLowerCase().includes(term.value)) continue;
              termScore += fieldWeight(field) * fieldScore(val, term);
              if (!highlights[field]) highlights[field] = [];
              highlights[field].push(val);
            }
            if (termScore === 0) { allMatched = false; break; }
            groupScore += termScore;
          }
          if (allMatched) { orSatisfied = true; score += groupScore; break; }
        }
        if (!orSatisfied) continue;
      }

      // Apply additional filter if present
      if (query.filter && !evaluateFilter(obj as Record<string, unknown>, query.filter, this._makeLinkResolver(ctx, this._getEffectiveMaps(ctx), type))) {
        continue;
      }

      scored.push({
        object: clone(obj),
        score,
        highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const totalCount = scored.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? scored.length;
    const hits = scored.slice(offset, offset + limit);

    return {
      hits,
      totalCount,
      hasNextPage: offset + limit < totalCount,
    };
  }

  async bulkMutate(ctx: RequestContext, request: BulkMutationRequest): Promise<BulkMutationResult> {
    // Idempotency check — scoped by tenant to prevent cross-tenant cache hits
    const cacheKey = `${ctx.tenantId}:${request.idempotencyKey}`;
    const cached = this._idempotencyCache.get(cacheKey);
    if (cached) return clone(cached);

    let accepted = 0;
    let failed = 0;
    const errors: BulkMutationResult['errors'] = [];

    for (let i = 0; i < request.operations.length; i++) {
      const op = request.operations[i]!;
      try {
        switch (op.type) {
          case 'createObject':
            this._doCreateObject(ctx, op.objectType, op.properties);
            break;
          case 'updateObject':
            this._doUpdateObject(ctx, op.objectType, op.id, op.properties);
            break;
          case 'deleteObject':
            if (op.mode === 'soft') {
              this._doSoftDeleteObject(ctx, op.objectType, op.id);
            } else {
              this._doHardDeleteObject(ctx, op.objectType, op.id);
            }
            break;
        }
        accepted++;
      } catch (err) {
        failed++;
        errors.push({
          operationIndex: i,
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result: BulkMutationResult = { accepted, failed, errors };
    this._idempotencyCache.set(cacheKey, result);
    return clone(result);
  }

  // ─── Links ───

  async createLink(
    ctx: RequestContext,
    type: string,
    fromId: string,
    toId: string,
    properties?: Record<string, unknown>,
  ): Promise<OntologyLink> {
    return clone(this._doCreateLink(ctx, type, fromId, toId, properties));
  }

  async getLink(ctx: RequestContext, type: string, linkId: string): Promise<OntologyLink | null> {
    const maps = this._getEffectiveMaps(ctx);
    const link = this._getLinkInternal(ctx, type, linkId, maps.links);
    if (!link) return null;
    if (link._deletedAt) return null;
    return clone(link);
  }

  async updateLink(ctx: RequestContext, type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyLink> {
    return clone(this._doUpdateLink(ctx, type, linkId, properties, expectedVersion));
  }

  async deleteLink(ctx: RequestContext, type: string, linkId: string): Promise<void> {
    this._doDeleteLink(ctx, type, linkId);
  }

  async getLinks(
    ctx: RequestContext,
    objectId: string,
    linkType: string,
    direction: 'inbound' | 'outbound',
    options?: QueryOptions,
  ): Promise<LinkPage> {
    const maps = this._getEffectiveMaps(ctx);
    let items = Array.from(maps.links.values()).filter((link) => {
      if (link._tenantId !== ctx.tenantId) return false;
      if (link._type !== linkType) return false;
      if (!options?.includeDeleted && link._deletedAt) return false;
      if (direction === 'outbound') return link._fromId === objectId;
      return link._toId === objectId;
    });

    const totalCount = items.length;
    // `after` cursor takes precedence over `offset` — a cursor is the
    // stable, opaque way to page; `offset` is a lower-level escape hatch.
    // The cursor encodes the starting offset of the next page, so decoding
    // gives the offset directly (no +1 needed).
    let offset = options?.offset ?? 0;
    if (options?.after) {
      offset = decodePageCursor(options.after);
    }
    // Validate limit — reject anything that is not a non-negative integer up
    // to the maximum. A negative limit is a client error; a non-integer limit
    // is nonsensical; in Postgres `LIMIT -1` meant *no limit*, silently
    // bypassing the DoS bound.
    if (options?.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 0) {
        throw new Error(
          `Requested link page limit ${options.limit} is not a non-negative integer.`,
        );
      }
      if (options.limit > MAX_LINK_QUERY_LIMIT) {
        throw new Error(
          `Requested link page limit ${options.limit} exceeds the maximum of ${MAX_LINK_QUERY_LIMIT}. ` +
          `Request ${MAX_LINK_QUERY_LIMIT} or fewer and page with offset.`,
        );
      }
    }
    const limit = options?.limit ?? DEFAULT_LINK_QUERY_LIMIT;
    items = items.slice(offset, offset + limit);

    const hasNextPage = offset + limit < totalCount;
    // Opaque cursor the caller passes back as `after` to get the next page.
    // Only present when there IS a next page — an absent cursor means "done",
    // matching the ObjectPage contract.
    const cursor = hasNextPage ? encodePageCursor(offset + limit) : undefined;

    return {
      items: items.map((i) => clone(i)),
      totalCount,
      hasNextPage,
      cursor,
    };
  }

  async traverse(
    ctx: RequestContext,
    startId: string,
    path: TraversalPath,
    options?: TraversalOptions,
  ): Promise<TraversalResult> {
    const maps = this._getEffectiveMaps(ctx);
    // Match Postgres traversal safety limits (PERF-03)
    const MAX_TRAVERSAL_DEPTH = 10;
    const MAX_TRAVERSAL_NODES = 10_000;

    // A step's effective cost is its maxDepth, not 1 — the budget has to be
    // counted in hops or `maxDepth: 1000` would slip past a limit that exists
    // to bound work.
    const effectiveDepth = totalHops(path.steps);
    if (effectiveDepth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(`Traversal depth ${effectiveDepth} exceeds maximum of ${MAX_TRAVERSAL_DEPTH}`);
    }

    const includeDeleted = options?.includeDeleted ?? false;
    const collectedEdges = new Map<string, OntologyLink>();
    let totalNodesSeen = 0;

    // Start with the set of current object IDs
    let currentIds = new Set<string>([startId]);
    let stepNodes = new Map<string, OntologyObject>();

    for (const step of path.steps) {
      if (currentIds.size === 0) break;
      if (totalNodesSeen >= MAX_TRAVERSAL_NODES) break;

      const depth = stepDepth(step);
      stepNodes = new Map<string, OntologyObject>();
      // Ids reachable within this step at ANY depth 1..N. This is both the
      // step's node set and the frontier handed to the next step, so the two
      // cannot disagree.
      const reached = new Set<string>();
      // Re-expansion guard. A self-referential link is what maxDepth exists
      // for, and such a graph can cycle: without this, every hop re-expands
      // nodes already visited, so a dense or cyclic region costs work
      // proportional to the branching factor raised to the depth. It does not
      // change the answer — the hop loop is bounded by `depth`, and the node
      // map dedups — which is why no conformance case fails without it. It is
      // here for cost, and that is deliberately not dressed up as correctness.
      const expanded = new Set<string>();
      let frontier = currentIds;

      for (let hop = 0; hop < depth && frontier.size > 0; hop++) {
        if (totalNodesSeen >= MAX_TRAVERSAL_NODES) break;
        const nextFrontier = new Set<string>();

        for (const objectId of frontier) {
          if (totalNodesSeen >= MAX_TRAVERSAL_NODES) break;
          if (expanded.has(objectId)) continue;
          expanded.add(objectId);

          const links = Array.from(maps.links.values()).filter((link) => {
            if (link._tenantId !== ctx.tenantId) return false;
            if (link._type !== step.linkType) return false;
            if (!includeDeleted && link._deletedAt) return false;
            if (step.direction === 'outbound') return link._fromId === objectId;
            return link._toId === objectId;
          });

          for (const link of links) {
            if (totalNodesSeen >= MAX_TRAVERSAL_NODES) break;

            const targetId = step.direction === 'outbound' ? link._toId : link._fromId;
            const targetType = step.direction === 'outbound' ? link._toType : link._fromType;

            // Find the target object
            const targetObj = maps.objects.get(`${targetType}:${targetId}`);
            if (!targetObj || targetObj._tenantId !== ctx.tenantId) continue;
            if (!includeDeleted && targetObj._deletedAt) continue;

            // Apply step filter if present
            if (step.filter && !evaluateFilter(targetObj as Record<string, unknown>, step.filter)) {
              continue;
            }

            collectedEdges.set(`${link._type}:${link._id}`, link);
            const nodeKey = `${targetType}:${targetId}`;
            if (!stepNodes.has(nodeKey)) {
              stepNodes.set(nodeKey, targetObj);
              totalNodesSeen++;
            }
            reached.add(targetId);
            nextFrontier.add(targetId);
          }
        }

        frontier = nextFrontier;
      }

      currentIds = reached;
    }

    // nodes = only the final step's results; edges = all traversed edges
    const nodes = Array.from(stepNodes.values()).map((n) => clone(n));
    const edges = Array.from(collectedEdges.values()).map((e) => clone(e));

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? nodes.length;
    const paginatedNodes = nodes.slice(offset, offset + limit);

    return {
      nodes: paginatedNodes,
      edges,
      totalCount: nodes.length,
    };
  }

  // ─── Transactions ───

  async beginTransaction(ctx: RequestContext): Promise<Transaction> {
    const txn = new MemoryTransaction(this, ctx);
    this._activeTransactions.set(ctx, txn);
    return txn;
  }

  // ─── Versioning ───

  async getObjectAtVersion(ctx: RequestContext, type: string, id: string, version: number): Promise<OntologyObject | null> {
    const maps = this._getEffectiveMaps(ctx);
    const key = `${type}:${id}`;
    const history = maps.versionHistory.get(key);
    if (!history) return null;
    const snapshot = history.find((h) => h._version === version && h._tenantId === ctx.tenantId);
    return snapshot ? clone(snapshot) : null;
  }

  async getObjectHistory(ctx: RequestContext, type: string, id: string): Promise<OntologyObject[]> {
    const maps = this._getEffectiveMaps(ctx);
    const key = `${type}:${id}`;
    const history = maps.versionHistory.get(key);
    if (!history) return [];
    return history
      .filter((h) => h._tenantId === ctx.tenantId)
      .sort((a, b) => (a._version ?? 0) - (b._version ?? 0))
      .map((h) => clone(h));
  }

  async getObjectAtTime(ctx: RequestContext, type: string, id: string, timestamp: DateTime): Promise<OntologyObject | null> {
    const maps = this._getEffectiveMaps(ctx);
    const key = `${type}:${id}`;
    const history = maps.versionHistory.get(key);
    if (!history) return null;

    const ts = new Date(timestamp).getTime();
    // Find the latest version whose _updatedAt <= timestamp
    let best: OntologyObject | null = null;
    for (const snapshot of history) {
      if (snapshot._tenantId !== ctx.tenantId) continue;
      const snapshotTime = new Date(snapshot._updatedAt).getTime();
      if (snapshotTime <= ts) {
        best = snapshot;
      }
    }
    return best ? clone(best) : null;
  }

  // ─── Indices ───

  async ensureIndex(ctx: RequestContext, type: string, index: IndexDefinition): Promise<void> {
    // Postgres builds a real index here, so a unique index over data that
    // already contains duplicates fails instead of being silently accepted.
    if (index.unique) {
      const seen = new Set<unknown>();
      for (const obj of this._objects.values()) {
        if (obj._type !== type || obj._tenantId !== ctx.tenantId) continue;
        const value = (obj as Record<string, unknown>)[index.field];
        if (value === undefined || value === null) continue;
        if (seen.has(value)) {
          throw new Error(`Cannot create unique index on ${type}.${index.field}: duplicate value ${String(value)}`);
        }
        seen.add(value);
      }
    }
    this._registerIndex(type, index);
  }

  async dropIndex(_ctx: RequestContext, type: string, field: string): Promise<void> {
    const existing = this._indexes.get(type);
    if (existing) {
      this._indexes.set(type, existing.filter((i) => i.field !== field));
    }
  }

  async listIndexes(_ctx: RequestContext, type: string): Promise<IndexDefinition[]> {
    return (this._indexes.get(type) ?? []).map((i) => ({ ...i }));
  }

  // ─── Health ───

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: true,
      provider: 'memory',
      latencyMs: 0,
    };
  }

  capabilities(): StorageCapabilities {
    return {
      supportsTransactions: true,
      // Snapshot-on-begin: each transaction shallow-copies the committed Maps
      // at open time and writes to its own copy. Reads with the transaction's
      // RequestContext see the snapshot+overlay; all other readers see
      // committed state only. Commit flushes only changed keys.
      supportsTransactionIsolation: true,
      supportsTemporalQueries: true,
      supportsFullTextSearch: true,
      supportsGeoQueries: true,
      supportsGraphTraversal: true,
      supportsBulkMutations: true,
      supportsVectorSearch: false,
      supportsWrites: true,
      maxTraversalDepth: 10,
      replicationSupport: 'NONE',
    };
  }
}
