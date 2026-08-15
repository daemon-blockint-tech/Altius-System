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
// MemoryTransaction
// ---------------------------------------------------------------------------

class MemoryTransaction implements Transaction {
  private _committed = false;
  private _rolledBack = false;
  private _journal: Array<
    | { op: 'createObject'; key: string; value: OntologyObject }
    | { op: 'updateObject'; key: string; prev: OntologyObject; value: OntologyObject }
    | { op: 'deleteObjectSoft'; key: string; prev: OntologyObject; value: OntologyObject }
    | { op: 'deleteObjectHard'; key: string; prev: OntologyObject }
    | { op: 'createLink'; key: string; value: OntologyLink }
    | { op: 'updateLink'; key: string; prev: OntologyLink; value: OntologyLink }
    | { op: 'deleteLink'; key: string; prev: OntologyLink }
    | { op: 'version'; objectKey: string; snapshot: OntologyObject }
  > = [];

  constructor(private _provider: MemoryStorageProvider, private _ctx: RequestContext) {}

  private assertOpen(): void {
    if (this._committed) throw new Error('Transaction already committed');
    if (this._rolledBack) throw new Error('Transaction already rolled back');
  }

  async createObject(type: string, properties: Record<string, unknown>): Promise<OntologyObject> {
    this.assertOpen();
    const obj = this._provider._doCreateObject(this._ctx, type, properties);
    this._journal.push({ op: 'createObject', key: `${type}:${obj._id}`, value: obj });
    return clone(obj);
  }

  async updateObject(type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyObject> {
    this.assertOpen();
    const prev = this._provider._getObjectInternal(this._ctx, type, id);
    if (!prev) throw new Error(`Object ${type}:${id} not found`);
    const updated = this._provider._doUpdateObject(this._ctx, type, id, properties, expectedVersion);
    this._journal.push({ op: 'updateObject', key: `${type}:${id}`, prev: clone(prev), value: updated });
    return clone(updated);
  }

  async deleteObject(type: string, id: string, mode: 'soft' | 'hard'): Promise<void> {
    this.assertOpen();
    const prev = this._provider._getObjectInternal(this._ctx, type, id);
    if (!prev) throw new Error(`Object ${type}:${id} not found`);
    if (mode === 'soft') {
      const updated = this._provider._doSoftDeleteObject(this._ctx, type, id);
      this._journal.push({ op: 'deleteObjectSoft', key: `${type}:${id}`, prev: clone(prev), value: updated });
    } else {
      this._provider._doHardDeleteObject(this._ctx, type, id);
      this._journal.push({ op: 'deleteObjectHard', key: `${type}:${id}`, prev: clone(prev) });
    }
  }

  async createLink(type: string, fromId: string, toId: string, properties?: Record<string, unknown>): Promise<OntologyLink> {
    this.assertOpen();
    const link = this._provider._doCreateLink(this._ctx, type, fromId, toId, properties);
    this._journal.push({ op: 'createLink', key: `${type}:${link._id}`, value: link });
    return clone(link);
  }

  async updateLink(type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyLink> {
    this.assertOpen();
    const prev = this._provider._getLinkInternal(this._ctx, type, linkId);
    if (!prev) throw new Error(`Link ${type}:${linkId} not found`);
    const updated = this._provider._doUpdateLink(this._ctx, type, linkId, properties, expectedVersion);
    this._journal.push({ op: 'updateLink', key: `${type}:${linkId}`, prev: clone(prev), value: updated });
    return clone(updated);
  }

  async deleteLink(type: string, linkId: string): Promise<void> {
    this.assertOpen();
    const prev = this._provider._getLinkInternal(this._ctx, type, linkId);
    if (!prev) throw new Error(`Link ${type}:${linkId} not found`);
    this._provider._doDeleteLink(this._ctx, type, linkId);
    this._journal.push({ op: 'deleteLink', key: `${type}:${linkId}`, prev: clone(prev) });
  }

  async commit(): Promise<void> {
    this.assertOpen();
    this._committed = true;
    // Data already applied eagerly; commit is a no-op (journal kept for rollback).
  }

  async rollback(): Promise<void> {
    this.assertOpen();
    this._rolledBack = true;
    // Undo in reverse order
    for (let i = this._journal.length - 1; i >= 0; i--) {
      const entry = this._journal[i]!;
      switch (entry.op) {
        case 'createObject':
          this._provider._removeObject(entry.key);
          break;
        case 'updateObject':
        case 'deleteObjectSoft':
          this._provider._putObject(entry.key, entry.prev);
          // Also revert version history
          this._provider._popVersionHistory(entry.key);
          break;
        case 'deleteObjectHard':
          this._provider._putObject(entry.key, entry.prev);
          break;
        case 'createLink':
          this._provider._removeLink(entry.key);
          break;
        case 'updateLink':
          this._provider._putLink(entry.key, entry.prev);
          break;
        case 'deleteLink':
          this._provider._putLink(entry.key, entry.prev);
          break;
        case 'version':
          // Handled by updateObject rollback above
          break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MemoryStorageProvider
// ---------------------------------------------------------------------------

export class MemoryStorageProvider implements StorageProvider {
  /** type:id -> OntologyObject */
  private _objects = new Map<string, OntologyObject>();
  /** type:id -> OntologyLink */
  private _links = new Map<string, OntologyLink>();
  /** type:id -> OntologyObject[] (version history, chronological) */
  private _versionHistory = new Map<string, OntologyObject[]>();
  /** version -> OntologySchema */
  private _schemas = new Map<number, OntologySchema>();
  private _currentSchemaVersion = 0;
  /** idempotencyKey -> BulkMutationResult */
  private _idempotencyCache = new Map<string, BulkMutationResult>();
  /** objectType -> IndexDefinition[] (schema-declared plus ensureIndex) */
  private _indexes = new Map<string, IndexDefinition[]>();

  // ─── Internal helpers (exposed for Transaction rollback) ───

  /** @internal */ _putObject(key: string, obj: OntologyObject): void {
    this._objects.set(key, obj);
  }
  /** @internal */ _removeObject(key: string): void {
    this._objects.delete(key);
    this._versionHistory.delete(key);
  }
  /** @internal */ _putLink(key: string, link: OntologyLink): void {
    this._links.set(key, link);
  }
  /** @internal */ _removeLink(key: string): void {
    this._links.delete(key);
  }
  /** @internal */ _popVersionHistory(key: string): void {
    const history = this._versionHistory.get(key);
    if (history && history.length > 0) {
      history.pop();
    }
  }

  /** @internal */ _getObjectInternal(_ctx: RequestContext, type: string, id: string): OntologyObject | null {
    const key = `${type}:${id}`;
    const obj = this._objects.get(key);
    if (!obj || obj._tenantId !== _ctx.tenantId) return null;
    return obj;
  }

  /** @internal */ _getLinkInternal(_ctx: RequestContext, type: string, linkId: string): OntologyLink | null {
    const key = `${type}:${linkId}`;
    const link = this._links.get(key);
    if (!link || link._tenantId !== _ctx.tenantId) return null;
    return link;
  }

  private _pushVersionHistory(key: string, snapshot: OntologyObject): void {
    let history = this._versionHistory.get(key);
    if (!history) {
      history = [];
      this._versionHistory.set(key, history);
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
  private _enforceObjectConstraints(
    ctx: RequestContext,
    type: string,
    candidate: Record<string, unknown>,
    selfId?: string,
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
      for (const other of this._objects.values()) {
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
  private _assertEndpointLive(ctx: RequestContext, objectType: string, id: string, role: 'source' | 'target'): void {
    const obj = this._getObjectInternal(ctx, objectType, id);
    if (!obj) {
      throw new Error(`Referential integrity: ${role} object ${objectType}:${id} does not exist`);
    }
    if (obj._deletedAt) {
      throw new Error(`Referential integrity: ${role} object ${objectType}:${id} is soft-deleted`);
    }
  }

  private _enforceCardinality(ctx: RequestContext, linkType: string, fromId: string, toId: string): void {
    const def = this._getLinkTypeDef(linkType);
    if (!def) return; // No schema constraint

    // Count active (non-deleted) links of this type
    const activeLinks = Array.from(this._links.values()).filter(
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

  /** @internal */ _doCreateObject(ctx: RequestContext, type: string, properties: Record<string, unknown>): OntologyObject {
    this._enforceObjectConstraints(ctx, type, properties);
    const id = genId();
    const timestamp = now();
    const obj: OntologyObject = {
      _tenantId: ctx.tenantId,
      _type: type,
      _id: id,
      _version: 1,
      _createdAt: timestamp,
      _updatedAt: timestamp,
      ...properties,
    };
    const key = `${type}:${id}`;
    this._objects.set(key, obj);
    this._pushVersionHistory(key, obj);
    return obj;
  }

  /** @internal */ _doUpdateObject(ctx: RequestContext, type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number): OntologyObject {
    const key = `${type}:${id}`;
    const existing = this._objects.get(key);
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
    this._enforceObjectConstraints(ctx, type, { ...existing, ...properties }, id);
    const updated: OntologyObject = {
      ...existing,
      ...properties,
      _tenantId: existing._tenantId,
      _type: existing._type,
      _id: existing._id,
      _version: existing._version + 1,
      _createdAt: existing._createdAt,
      _updatedAt: now(),
    };
    this._objects.set(key, updated);
    this._pushVersionHistory(key, updated);
    return updated;
  }

  /** @internal */ _doSoftDeleteObject(ctx: RequestContext, type: string, id: string): OntologyObject {
    const key = `${type}:${id}`;
    const existing = this._objects.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    const updated: OntologyObject = {
      ...existing,
      _deletedAt: now(),
      _version: existing._version + 1,
      _updatedAt: now(),
    };
    this._objects.set(key, updated);
    this._pushVersionHistory(key, updated);
    return updated;
  }

  /** @internal */ _doHardDeleteObject(ctx: RequestContext, type: string, id: string): void {
    const key = `${type}:${id}`;
    const existing = this._objects.get(key);
    // Tenant isolation: deny access if object belongs to a different tenant
    if (existing && existing._tenantId !== ctx.tenantId) {
      throw new Error(`Object ${type}:${id} not found`);
    }
    // Idempotent: no-op if object doesn't exist
    if (!existing) return;
    this._objects.delete(key);
    this._versionHistory.delete(key);
  }

  /** @internal */ _doCreateLink(
    ctx: RequestContext,
    type: string,
    fromId: string,
    toId: string,
    properties?: Record<string, unknown>,
  ): OntologyLink {
    // Resolve fromType/toType from link type definition or default to 'unknown'
    const def = this._getLinkTypeDef(type);
    // Referential integrity before cardinality, matching the Postgres order.
    if (def) {
      this._assertEndpointLive(ctx, def.fromType, fromId, 'source');
      this._assertEndpointLive(ctx, def.toType, toId, 'target');
    }
    this._enforceCardinality(ctx, type, fromId, toId);
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
    this._links.set(`${type}:${id}`, link);
    return link;
  }

  /** @internal */ _doUpdateLink(ctx: RequestContext, type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number): OntologyLink {
    const key = `${type}:${linkId}`;
    const existing = this._links.get(key);
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
    this._links.set(key, updated);
    return updated;
  }

  /**
   * Soft delete, as in Postgres: the record stays with _deletedAt set so
   * getLinks/traverse with includeDeleted still see it.
   */
  /** @internal */ _doDeleteLink(ctx: RequestContext, type: string, linkId: string): void {
    const key = `${type}:${linkId}`;
    const existing = this._links.get(key);
    if (!existing || existing._tenantId !== ctx.tenantId || existing._deletedAt) {
      throw new Error(`Link ${type}:${linkId} not found or already deleted`);
    }
    const timestamp = now();
    this._links.set(key, {
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
    const obj = this._getObjectInternal(ctx, type, id);
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

  async queryObjects(ctx: RequestContext, type: string, filter: FilterExpression, options?: QueryOptions): Promise<ObjectPage> {
    let items = Array.from(this._objects.values()).filter((obj) => {
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
    // 1. Collect matching objects (tenant-scoped, non-deleted)
    let items = Array.from(this._objects.values()).filter((obj) => {
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

    const queryLower = query.query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter((t) => t.length > 0);

    // Collect candidate objects (tenant-scoped, type-matched, non-deleted)
    const candidates = Array.from(this._objects.values()).filter((obj) => {
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

      // Count occurrences of query terms across matching fields
      let score = 0;
      const highlights: Record<string, string[]> = {};

      for (const field of searchFields) {
        const val = obj[field];
        if (typeof val !== 'string') continue;
        const valLower = val.toLowerCase();

        for (const term of terms) {
          let idx = 0;
          let count = 0;
          while ((idx = valLower.indexOf(term, idx)) !== -1) {
            count++;
            idx += term.length;
          }
          if (count > 0) {
            score += count;
            if (!highlights[field]) {
              highlights[field] = [];
            }
            highlights[field].push(val);
          }
        }
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
    const link = this._getLinkInternal(ctx, type, linkId);
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
    let items = Array.from(this._links.values()).filter((link) => {
      if (link._tenantId !== ctx.tenantId) return false;
      if (link._type !== linkType) return false;
      if (!options?.includeDeleted && link._deletedAt) return false;
      if (direction === 'outbound') return link._fromId === objectId;
      return link._toId === objectId;
    });

    const totalCount = items.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? items.length;
    items = items.slice(offset, offset + limit);

    return {
      items: items.map((i) => clone(i)),
      totalCount,
      hasNextPage: offset + limit < totalCount,
    };
  }

  async traverse(
    ctx: RequestContext,
    startId: string,
    path: TraversalPath,
    options?: TraversalOptions,
  ): Promise<TraversalResult> {
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

        const links = Array.from(this._links.values()).filter((link) => {
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
          const targetObj = this._objects.get(`${targetType}:${targetId}`);
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
    return new MemoryTransaction(this, ctx);
  }

  // ─── Versioning ───

  async getObjectAtVersion(ctx: RequestContext, type: string, id: string, version: number): Promise<OntologyObject | null> {
    const key = `${type}:${id}`;
    const history = this._versionHistory.get(key);
    if (!history) return null;
    const snapshot = history.find((h) => h._version === version && h._tenantId === ctx.tenantId);
    return snapshot ? clone(snapshot) : null;
  }

  async getObjectHistory(ctx: RequestContext, type: string, id: string): Promise<OntologyObject[]> {
    const key = `${type}:${id}`;
    const history = this._versionHistory.get(key);
    if (!history) return [];
    return history
      .filter((h) => h._tenantId === ctx.tenantId)
      .sort((a, b) => (a._version ?? 0) - (b._version ?? 0))
      .map((h) => clone(h));
  }

  async getObjectAtTime(ctx: RequestContext, type: string, id: string, timestamp: DateTime): Promise<OntologyObject | null> {
    const key = `${type}:${id}`;
    const history = this._versionHistory.get(key);
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
