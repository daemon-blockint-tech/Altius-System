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
import { MAX_LINK_QUERY_LIMIT, DEFAULT_LINK_QUERY_LIMIT, encodePageCursor, decodePageCursor } from '@altius/spi';

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

function evaluateFilter(obj: Record<string, unknown>, filter: FilterExpression): boolean {
  if (isFieldPredicate(filter)) {
    return evaluateFieldPredicate(obj, filter);
  }
  if (isLogicalPredicate(filter)) {
    return evaluateLogicalPredicate(obj, filter);
  }
  return true;
}

function evaluateFieldPredicate(obj: Record<string, unknown>, pred: FieldPredicate): boolean {
  const val = obj[pred.field];
  switch (pred.operator) {
    case 'eq':
      return val === pred.value;
    case 'neq':
      return val !== pred.value;
    case 'gt':
      return typeof val === 'number' && typeof pred.value === 'number' && val > pred.value;
    case 'gte':
      return typeof val === 'number' && typeof pred.value === 'number' && val >= pred.value;
    case 'lt':
      return typeof val === 'number' && typeof pred.value === 'number' && val < pred.value;
    case 'lte':
      return typeof val === 'number' && typeof pred.value === 'number' && val <= pred.value;
    case 'in':
      return Array.isArray(pred.value) && (pred.value as unknown[]).includes(val);
    case 'contains':
      return typeof val === 'string' && typeof pred.value === 'string' && val.includes(pred.value);
    case 'startsWith':
      return typeof val === 'string' && typeof pred.value === 'string' && val.startsWith(pred.value);
    case 'exists':
      return pred.value ? val !== undefined && val !== null : val === undefined || val === null;
    default:
      return false;
  }
}

function evaluateLogicalPredicate(obj: Record<string, unknown>, pred: LogicalPredicate): boolean {
  if (pred.and) {
    return pred.and.every((f) => evaluateFilter(obj, f));
  }
  if (pred.or) {
    return pred.or.some((f) => evaluateFilter(obj, f));
  }
  if (pred.not) {
    return !evaluateFilter(obj, pred.not);
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
      _tenantId: ctx.tenantId,
      _type: type,
      _id: id,
      _version: 1,
      _createdAt: timestamp,
      _updatedAt: timestamp,
      _actorId: ctx.actorId,
      ...properties,
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
      return evaluateFilter(obj as Record<string, unknown>, filter);
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
    const ALLOWED_FNS = new Set(['count', 'sum', 'avg', 'min', 'max']);
    for (const aggField of query.fields) {
      if (!ALLOWED_FNS.has(aggField.fn.toLowerCase())) {
        throw new Error(`Invalid aggregate function: ${aggField.fn}`);
      }
    }
    // Same for bucket intervals: bucketDate falls through to day-granularity
    // for anything it does not recognise, so without this an unsupported
    // interval is a silent wrong answer here while Postgres rejects it.
    const ALLOWED_BUCKET_INTERVALS = new Set(['day', 'week', 'month', 'year']);
    for (const bucket of query.buckets ?? []) {
      if (!ALLOWED_BUCKET_INTERVALS.has(bucket.interval)) {
        throw new Error(`Invalid bucket interval: ${bucket.interval}`);
      }
    }
    // 1. Collect matching objects (tenant-scoped, non-deleted)
    const maps = this._getEffectiveMaps(ctx);
    let items = Array.from(maps.objects.values()).filter((obj) => {
      if (obj._tenantId !== ctx.tenantId) return false;
      if (obj._type !== type) return false;
      if (obj._deletedAt) return false;
      if (query.filter) return evaluateFilter(obj as Record<string, unknown>, query.filter);
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
      // Date bucketing — truncate the field value to the bucket boundary
      if (query.buckets) {
        for (const bucket of query.buckets) {
          const aliasName = bucket.alias ?? bucket.field;
          const raw = (obj as Record<string, unknown>)[bucket.field];
          keys[aliasName] = bucketDate(raw, bucket.interval);
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
            }
          }
        }
      }

      groups.push({ keys, values });
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

    // ONE literal substring, not a bag of terms.
    //
    // This provider used to split the query on whitespace and match ANY term,
    // while Postgres has always sent a single `%query%` ILIKE pattern. So
    // search('acme corp') returned rows containing "acme" OR "corp" here and
    // only rows containing the contiguous phrase there — the same SPI call,
    // two different result sets, with the conformance suite green against the
    // one that is not production.
    //
    // Postgres wins the tie deliberately: it is what deployments actually run,
    // so aligning the test double changes no shipped behaviour, while
    // "improving" Postgres to match this provider would have.
    const queryLower = query.query.toLowerCase();

    // Collect candidate objects (tenant-scoped, type-matched, non-deleted)
    const maps = this._getEffectiveMaps(ctx);
    const candidates = Array.from(maps.objects.values()).filter((obj) => {
      if (obj._tenantId !== ctx.tenantId) return false;
      if (obj._type !== type) return false;
      if (obj._deletedAt) return false;
      return true;
    });

    // Score and filter
    const scored: SearchHit[] = [];
    for (const obj of candidates) {
      // Determine which fields to search
      const searchFields = query.fields
        ? query.fields
        : Object.keys(obj).filter((k) => !k.startsWith('_') && typeof obj[k] === 'string');

      // Score is the number of FIELDS containing the substring, matching the
      // Postgres `SUM(CASE WHEN col ILIKE ... THEN 1 ELSE 0 END)` expression.
      // Counting occurrences within a field would rank differently.
      let score = 0;
      const highlights: Record<string, string[]> = {};

      for (const field of searchFields) {
        const val = obj[field];
        if (typeof val !== 'string') continue;
        if (!val.toLowerCase().includes(queryLower)) continue;
        score += 1;
        if (!highlights[field]) {
          highlights[field] = [];
        }
        highlights[field].push(val);
      }

      if (score === 0) continue;

      // Apply additional filter if present
      if (query.filter && !evaluateFilter(obj as Record<string, unknown>, query.filter)) {
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
    // maxDepth is declared in the SPI but implemented by neither provider:
    // every step is exactly one hop. Silently ignoring it would answer a
    // 2-hop request with 1 hop and no way for the caller to notice.
    const depthStep = path.steps.find(s => s.maxDepth !== undefined);
    if (depthStep) {
      throw new Error(
        `TraversalStep.maxDepth is not implemented (step "${depthStep.linkType}"). ` +
        `Each step traverses exactly one hop; repeat the step to go deeper.`,
      );
    }
    // Match Postgres traversal safety limits (PERF-03)
    const MAX_TRAVERSAL_DEPTH = 10;
    const MAX_TRAVERSAL_NODES = 10_000;

    if (path.steps.length > MAX_TRAVERSAL_DEPTH) {
      throw new Error(`Traversal depth ${path.steps.length} exceeds maximum of ${MAX_TRAVERSAL_DEPTH}`);
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

      const nextIds = new Set<string>();
      stepNodes = new Map<string, OntologyObject>();

      for (const objectId of currentIds) {
        if (totalNodesSeen >= MAX_TRAVERSAL_NODES) break;

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
          nextIds.add(targetId);
        }
      }

      currentIds = nextIds;
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
      supportsGeoQueries: false,
      supportsGraphTraversal: true,
      supportsBulkMutations: true,
      supportsVectorSearch: false,
      supportsWrites: true,
      maxTraversalDepth: 10,
      replicationSupport: 'NONE',
    };
  }
}
