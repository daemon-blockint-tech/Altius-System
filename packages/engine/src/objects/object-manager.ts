/**
 * ObjectManager — core object lifecycle management for the Ontology Engine.
 *
 * Implements create, get, update, delete, and query operations with
 * validation pipeline enforcement (Section 4.3) and event emission (Section 4.2).
 */

import type {
  StorageProvider,
  RequestContext,
  OntologyObject,
  FilterExpression,
  FieldPredicate,
  LogicalPredicate,
  QueryOptions,
  ObjectPage,
  PlatformError,
  AggregateQuery,
  AggregateResult,
  SearchQuery,
  SearchResult,
} from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { getTracer, withSpan, SpanAttributes } from '@altius/observability';
import {
  validateObjectProperties,
  validationError,
  type ValidationResult,
  type CelEvaluator,
} from './validation.js';
import { EngineEventEmitter, type ChangeSet, type EventCause } from '../events/event-emitter.js';
import type { ComputedFieldEvaluator } from '../computed/computed-field-evaluator.js';
import type { LineageRecorder } from '../lineage/lineage-recorder.js';
import type { ProvenanceSource } from '@altius/spi';

const tracer = getTracer('engine', 'objectManager');

/**
 * How many rows of a page have their computed fields evaluated at once.
 *
 * Every computed field costs at least one storage round trip per row (the
 * aggregate builtins cost one more per linked object), so evaluating a page
 * row by row makes a 100-row list 100+ serial trips. A fixed wave keeps the
 * latency win without letting a full page — storage caps a query at 1000 —
 * open a thousand concurrent requests and drain the connection pool.
 */
const COMPUTED_ROW_CONCURRENCY = 16;

/**
 * How many candidate rows a query may scan when it filters or sorts on a
 * @computed field.
 *
 * A computed field has no stored column, so such a predicate cannot be pushed
 * into storage: the rows have to be fetched, the field evaluated on each, and
 * the predicate applied here. Every candidate therefore costs at least one
 * storage round trip (the aggregate builtins cost one more per linked object),
 * so this bounds a fan-out and not merely memory — which is why it is well
 * below the 10,000 the consent scan allows for a much cheaper per-row check.
 *
 * Exceeding it is an error, never a truncated page. A silently short answer to
 * "which wards are over capacity" is indistinguishable from "none are", and the
 * caller cannot tell that it needs to narrow the query. Narrow with a filter on
 * stored fields, which IS pushed into storage and shrinks the candidate set
 * before any of this runs.
 *
 * The way out from under the cap is a materialised computed column (the EAGER
 * strategy the evaluator defers); that turns these into ordinary indexed
 * predicates, at the cost of invalidation when a LINKED object changes rather
 * than when this one does.
 */

/**
 * Rewrite every reference to a declared @primary field onto the system `_id`
 * it aliases.
 *
 * Storage never materialises the @primary field: the DDL skips it and its
 * value IS `_id`, which reads alias back to the declared name. Filters and
 * sorts, though, arrive under the declared name the generated schema
 * advertises, so they have to be translated before they reach a provider.
 * Above the SPI is the only place that fixes every backend at once —
 * Postgres would otherwise emit a WHERE on a column that does not exist,
 * and the memory provider would silently match nothing.
 */
function rewritePrimaryField(filter: FilterExpression, primary: string): FilterExpression {
  if ('field' in filter && 'operator' in filter) {
    return filter.field === primary ? { ...filter, field: '_id' } : filter;
  }
  const out: FilterExpression = { ...filter };
  if (out.and) out.and = out.and.map((f) => rewritePrimaryField(f, primary));
  if (out.or) out.or = out.or.map((f) => rewritePrimaryField(f, primary));
  if (out.not) out.not = rewritePrimaryField(out.not, primary);
  return out;
}

// ─── Computed-field filter/sort/aggregate helpers ───────────────────────
//
// Computed fields are resolved AFTER the storage query returns (withComputed),
// so the storage provider cannot filter, sort, or aggregate on them — they
// don't exist as columns. The ObjectManager bridges this by:
//
//   1. Splitting a filter into storage-evaluable and computed-only parts
//   2. Querying storage with the storage-evaluable part (and no limit/orderBy
//      on computed fields)
//   3. Evaluating computed fields on all returned rows
//   4. Applying the computed filter / sort / pagination in memory
//
// This is correct but expensive: a computed filter on a large type fetches
// every row. That is the only correct option without write-time materialization
// (which is a separate gap — see the computed-properties backlog row).

/** Collect every field name referenced in a FilterExpression. */
function extractFilterFields(filter: FilterExpression): Set<string> {
  const fields = new Set<string>();
  const walk = (f: FilterExpression): void => {
    if ('field' in f && 'operator' in f) {
      fields.add((f as FieldPredicate).field);
    } else {
      const log = f as LogicalPredicate;
      if (log.and) log.and.forEach(walk);
      if (log.or) log.or.forEach(walk);
      if (log.not) walk(log.not);
    }
  };
  walk(filter);
  return fields;
}

/**
 * Split a filter into two: the part that references only storage fields
 * (safe to push down to the provider) and the part that references at least
 * one computed field (must be evaluated in memory).
 *
 * Returns `{ storage: undefined, computed: filter }` when the whole filter
 * touches a computed field, and `{ storage: filter, computed: undefined }`
 * when no computed field is involved.
 *
 * AND nodes are split recursively: `storage AND computed` becomes two
 * filters that are both applied (storage at the DB, computed in memory).
 * OR and NOT nodes are kept whole if any branch touches a computed field,
 * because splitting them would change semantics.
 */
function splitFilter(
  filter: FilterExpression,
  computedFields: Set<string>,
): { storage: FilterExpression | undefined; computed: FilterExpression | undefined } {
  // Fast path: no computed fields on this type at all.
  if (computedFields.size === 0) return { storage: filter, computed: undefined };

  const touchesComputed = (f: FilterExpression): boolean => {
    if ('field' in f && 'operator' in f) {
      return computedFields.has((f as FieldPredicate).field);
    }
    const log = f as LogicalPredicate;
    if (log.and) return log.and.some(touchesComputed);
    if (log.or) return log.or.some(touchesComputed);
    if (log.not) return touchesComputed(log.not);
    return false;
  };

  if (!touchesComputed(filter)) return { storage: filter, computed: undefined };

  // AND can be split: each conjunct is independent.
  const log = filter as LogicalPredicate;
  if (log.and) {
    const storageParts: FilterExpression[] = [];
    const computedParts: FilterExpression[] = [];
    for (const child of log.and) {
      const { storage, computed } = splitFilter(child, computedFields);
      if (storage) storageParts.push(storage);
      if (computed) computedParts.push(computed);
    }
    return {
      storage: storageParts.length > 0
        ? (storageParts.length === 1 ? storageParts[0]! : { and: storageParts })
        : undefined,
      computed: computedParts.length > 0
        ? (computedParts.length === 1 ? computedParts[0]! : { and: computedParts })
        : undefined,
    };
  }

  // OR, NOT, or a leaf computed predicate — keep whole for in-memory eval.
  return { storage: undefined, computed: filter };
}

/**
 * Evaluate a FieldPredicate against a value (already extracted from the
 * object, including computed fields). Mirrors the memory provider's
 * compareForRange semantics.
 */
function evalFieldPredicate(value: unknown, pred: FieldPredicate): boolean {
  switch (pred.operator) {
    case 'eq': return value === pred.value;
    case 'neq': return value !== pred.value;
    case 'gt': return compareValues(value, pred.value) > 0;
    case 'gte': return compareValues(value, pred.value) >= 0;
    case 'lt': return compareValues(value, pred.value) < 0;
    case 'lte': return compareValues(value, pred.value) <= 0;
    case 'in': return Array.isArray(pred.value) && pred.value.includes(value);
    case 'contains':
      return typeof value === 'string' && typeof pred.value === 'string' && value.includes(pred.value);
    case 'startsWith':
      return typeof value === 'string' && typeof pred.value === 'string' && value.startsWith(pred.value);
    case 'exists':
      return pred.value ? (value !== undefined && value !== null) : (value === undefined || value === null);
    default: return true;
  }
}

/** Order two values for a range comparison, or return undefined if incomparable. */
function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined || b === null || b === undefined) return NaN;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'string') {
    const n = Number(b);
    return Number.isNaN(n) ? NaN : a - n;
  }
  if (typeof a === 'string' && typeof b === 'number') {
    const n = Number(a);
    return Number.isNaN(n) ? NaN : n - b;
  }
  return NaN;
}

/** Evaluate a full FilterExpression (possibly with computed fields) in memory. */
function evalFilter(obj: Record<string, unknown>, filter: FilterExpression): boolean {
  if ('field' in filter && 'operator' in filter) {
    return evalFieldPredicate(obj[(filter as FieldPredicate).field], filter as FieldPredicate);
  }
  const log = filter as LogicalPredicate;
  if (log.and) return log.and.every((f) => evalFilter(obj, f));
  if (log.or) return log.or.some((f) => evalFilter(obj, f));
  if (log.not) return !evalFilter(obj, log.not);
  return true;
}

/** Configuration for the ObjectManager. */
export interface ObjectManagerConfig {
  storage: StorageProvider;
  schema: ParsedSchema;
  eventEmitter: EngineEventEmitter;
  /** Optional computed field evaluator for LAZY field resolution on reads. */
  computedFieldEvaluator?: ComputedFieldEvaluator;
  /** Optional lineage recorder for field-level provenance tracking. */
  lineageRecorder?: LineageRecorder;
  /**
   * Optional CEL evaluator for @constraint expression evaluation in the
   * validation pipeline. When omitted, only a small inline subset of CEL
   * is enforced and complex expressions emit a warning instead of failing.
   * In production this is the same CelClient instance used by the action
   * pipeline (see packages/actions/src/cel).
   */
  celEvaluator?: CelEvaluator;
}

/**
 * Manages the full lifecycle of ontology objects.
 *
 * All mutating operations:
 * 1. Validate through the pipeline (Section 4.3)
 * 2. Delegate to the SPI storage provider
 * 3. Emit CloudEvents for state changes
 */
export class ObjectManager {
  private readonly storage: StorageProvider;
  private readonly schema: ParsedSchema;
  private readonly eventEmitter: EngineEventEmitter;
  private readonly computedFieldEvaluator?: ComputedFieldEvaluator;
  private readonly lineageRecorder?: LineageRecorder;
  private readonly celEvaluator?: CelEvaluator;

  constructor(config: ObjectManagerConfig) {
    this.storage = config.storage;
    this.schema = config.schema;
    this.eventEmitter = config.eventEmitter;
    this.computedFieldEvaluator = config.computedFieldEvaluator;
    this.lineageRecorder = config.lineageRecorder;
    this.celEvaluator = config.celEvaluator;
  }

  /**
   * Create a new object.
   * Validates properties, creates via SPI, emits object.created event.
   */
  async create(
    type: string,
    properties: Record<string, unknown>,
    ctx: RequestContext,
    cause?: EventCause,
  ): Promise<OntologyObject> {
    return withSpan(tracer, 'createObject', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'create',
    }, async () => {
      // Validate
      const validation = await this.validate(type, properties, ctx);
      if (!validation.valid) {
        throw validationError(validation.failures);
      }

      // Create via SPI
      const obj = await this.storage.createObject(ctx, type, properties);

      // Record lineage for every non-system field
      if (this.lineageRecorder) {
        const source = this.buildProvenanceSource(cause, ctx);
        await this.lineageRecorder.recordFields(
          ctx.tenantId,
          type,
          obj._id,
          properties,
          source,
          obj._createdAt,
        );
      }

      // Emit event
      await this.eventEmitter.emitObjectCreated(
        ctx,
        type,
        obj._id,
        obj._version,
        cause,
      );

      return obj;
    });
  }

  /**
   * Get an object by type and ID.
   * Reads from SPI, then evaluates any LAZY computed fields and merges
   * the results into the returned object.
   */
  async get(
    type: string,
    id: string,
    ctx: RequestContext,
  ): Promise<OntologyObject | null> {
    return withSpan(tracer, 'getObject', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.OBJECT_ID]: id,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'get',
    }, async () => {
      const obj = await this.storage.getObject(ctx, type, id);
      if (!obj) return null;

      // NOTE: a stored object does not embed its link/reference fields (e.g.
      // Patient.currentWard) — those are resolved on demand by traversal. The
      // GraphQL layer hydrates them via type-level link resolvers
      // (generateLinkFieldResolvers → LinkManager.getLinks), and REST/FHIR/CDM
      // expose them through the /links endpoint and projection mappers. Action
      // manifests still reference link targets by id, not hydrated objects.

      // Evaluate LAZY computed fields and merge into the result
      if (this.computedFieldEvaluator) {
        const computed = await this.computedFieldEvaluator.evaluateAll(type, id, ctx);
        return { ...obj, ...computed };
      }

      return obj;
    });
  }

  /**
   * Update an existing object.
   * Validates new properties, updates via SPI, emits object.updated event.
   */
  async update(
    type: string,
    id: string,
    properties: Record<string, unknown>,
    ctx: RequestContext,
    cause?: EventCause,
    expectedVersion?: number,
  ): Promise<OntologyObject> {
    return withSpan(tracer, 'updateObject', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.OBJECT_ID]: id,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'update',
    }, async () => {
      // Get the existing object to compute changes
      const existing = await this.storage.getObject(ctx, type, id);
      if (!existing) {
        const error: PlatformError = {
          code: 'OBJECT_NOT_FOUND',
          category: 'not_found',
          message: `Object ${type}/${id} not found`,
          retryable: false,
        };
        throw error;
      }

      // Merge existing properties with updates for validation
      // (so required field checks work on partial updates)
      const merged = this.mergeProperties(existing, properties);

      // Validate the merged state, passing patch keys so immutable/field-level
      // constraint checks only run for fields actually being updated
      const patchKeys = new Set(Object.keys(properties));
      const validation = await this.validate(type, merged, ctx, id, patchKeys);
      if (!validation.valid) {
        throw validationError(validation.failures);
      }

      // Update via SPI
      const updated = await this.storage.updateObject(ctx, type, id, properties, expectedVersion);

      // Compute change set
      const changes = this.computeChanges(existing, properties);

      // Record lineage for changed fields
      if (this.lineageRecorder && Object.keys(changes).length > 0) {
        const changedProperties: Record<string, unknown> = {};
        for (const key of Object.keys(changes)) {
          changedProperties[key] = properties[key];
        }
        const source = this.buildProvenanceSource(cause, ctx);
        await this.lineageRecorder.recordFields(
          ctx.tenantId,
          type,
          id,
          changedProperties,
          source,
          updated._updatedAt,
        );
      }

      // Emit event
      await this.eventEmitter.emitObjectUpdated(
        ctx,
        type,
        id,
        updated._version,
        changes,
        cause,
      );

      return updated;
    });
  }

  /**
   * Delete an object (soft or hard).
   * Deletes via SPI, emits object.deleted event.
   */
  async delete(
    type: string,
    id: string,
    mode: 'soft' | 'hard',
    ctx: RequestContext,
    cause?: EventCause,
  ): Promise<void> {
    return withSpan(tracer, 'deleteObject', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.OBJECT_ID]: id,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'delete',
    }, async () => {
      // Get the existing object to know its version
      const existing = await this.storage.getObject(ctx, type, id);
      if (!existing) {
        const error: PlatformError = {
          code: 'OBJECT_NOT_FOUND',
          category: 'not_found',
          message: `Object ${type}/${id} not found`,
          retryable: false,
        };
        throw error;
      }

      // Delete via SPI
      await this.storage.deleteObject(ctx, type, id, mode);

      // Emit event
      await this.eventEmitter.emitObjectDeleted(
        ctx,
        type,
        id,
        existing._version,
        cause,
      );
    });
  }

  /**
   * Query objects by type with filters and options.
   *
   * When the filter or orderBy references a @computed field, the storage
   * provider cannot evaluate it (computed fields don't exist as columns).
   * In that case the ObjectManager fetches all rows matching the
   * storage-evaluable portion of the filter, evaluates computed fields,
   * then applies the computed filter/sort/pagination in memory.
   */
  async query(
    type: string,
    filter: FilterExpression,
    options: QueryOptions | undefined,
    ctx: RequestContext,
  ): Promise<ObjectPage> {
    return withSpan(tracer, 'queryObjects', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'query',
    }, async () => {
      const primary = this.primaryFieldName(type);
      if (primary) {
        filter = rewritePrimaryField(filter, primary);
        if (options?.orderBy?.some((s) => s.field === primary)) {
          options = {
            ...options,
            orderBy: options.orderBy.map((s) => (s.field === primary ? { ...s, field: '_id' } : s)),
          };
        }
      }

      const computedFields = this.computedFieldNames(type);
      const { storage: storageFilter, computed: computedFilter } = splitFilter(filter, computedFields);
      const hasComputedOrderBy = options?.orderBy?.some((s) => computedFields.has(s.field)) ?? false;

      // Fast path: no computed filter or sort — delegate to storage entirely.
      if (!computedFilter && !hasComputedOrderBy) {
        const page = await this.storage.queryObjects(ctx, type, filter, options);
        return { ...page, items: await this.withComputed(type, page.items, ctx) };
      }

      // Slow path: fetch all rows matching the storage filter (no limit,
      // no computed orderBy), evaluate computed, then filter/sort/paginate
      // in memory.
      const fetchOptions: QueryOptions = {
        ...options,
        // Drop computed orderBy — we sort in memory after evaluation.
        orderBy: options?.orderBy?.filter((s) => !computedFields.has(s.field)),
        // Fetch everything; we paginate in memory.
        limit: undefined,
        after: undefined,
      };
      const allRows: OntologyObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.storage.queryObjects(
          ctx, type, storageFilter ?? { and: [] }, cursor ? { ...fetchOptions, after: cursor } : fetchOptions,
        );
        allRows.push(...page.items);
        cursor = page.hasNextPage ? page.cursor : undefined;
      } while (cursor);

      // Evaluate computed fields on all rows.
      const withComputed = await this.withComputed(type, allRows, ctx);

      // Apply computed filter in memory.
      const filtered = computedFilter
        ? withComputed.filter((obj) => evalFilter(obj as Record<string, unknown>, computedFilter))
        : withComputed;

      // Apply orderBy (computed + storage) in memory.
      const orderBy = options?.orderBy;
      if (orderBy && orderBy.length > 0) {
        filtered.sort((a, b) => {
          for (const sort of orderBy) {
            const av = (a as Record<string, unknown>)[sort.field];
            const bv = (b as Record<string, unknown>)[sort.field];
            const cmp = compareValues(av, bv);
            if (Number.isNaN(cmp)) {
              const aNull = av === null || av === undefined;
              const bNull = bv === null || bv === undefined;
              if (aNull && bNull) continue;
              return sort.direction === 'asc' ? (aNull ? 1 : -1) : (aNull ? -1 : 1);
            }
            if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
          }
          return 0;
        });
      }

      // Paginate in memory.
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const pageItems = filtered.slice(offset, offset + limit);
      const hasNextPage = filtered.length > offset + limit;

      return {
        items: pageItems,
        totalCount: filtered.length,
        hasNextPage,
        cursor: hasNextPage ? undefined : undefined,
      };
    });
  }

  /**
   * Aggregate objects by type with grouping and aggregate functions.
   *
   * When the aggregate fields, groupBy, or filter reference a @computed field,
   * the storage provider cannot evaluate them. In that case the ObjectManager
   * fetches all rows, evaluates computed fields, and aggregates in memory.
   *
   * Rewrites the declared @primary field onto `_id` first, for the same
   * reason query() does: storage never materialises that column.
   */
  async aggregate(
    type: string,
    query: AggregateQuery,
    ctx: RequestContext,
  ): Promise<AggregateResult> {
    return withSpan(tracer, 'aggregateObjects', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'aggregate',
    }, async () => {
      const primary = this.primaryFieldName(type);
      if (primary) {
        const rename = (f: string) => (f === primary ? '_id' : f);
        query = {
          ...query,
          fields: query.fields.map((f) => ({ ...f, field: rename(f.field) })),
          ...(query.filter ? { filter: rewritePrimaryField(query.filter, primary) } : {}),
          ...(query.groupBy ? { groupBy: query.groupBy.map(rename) } : {}),
          ...(query.buckets ? { buckets: query.buckets.map((b) => ({ ...b, field: rename(b.field) })) } : {}),
          ...(query.orderBy ? { orderBy: query.orderBy.map((o) => ({ ...o, field: rename(o.field) })) } : {}),
        };
      }

      // Check whether any computed field is referenced.
      const computedFields = this.computedFieldNames(type);
      const touchesComputed =
        computedFields.size > 0 && (
          query.fields.some((f) => computedFields.has(f.field)) ||
          (query.groupBy?.some((f) => computedFields.has(f)) ?? false) ||
          (query.filter && extractFilterFields(query.filter).size > 0 &&
            [...extractFilterFields(query.filter)].some((f) => computedFields.has(f)))
        );

      // Fast path: no computed fields involved — delegate to storage.
      if (!touchesComputed) {
        return this.storage.aggregateObjects(ctx, type, query);
      }

      // Slow path: fetch all rows, evaluate computed, aggregate in memory.
      const { storage: storageFilter } = query.filter
        ? splitFilter(query.filter, computedFields)
        : { storage: undefined };
      const allRows: OntologyObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.storage.queryObjects(
          ctx, type, storageFilter ?? { and: [] },
          cursor ? { limit: 1000, after: cursor } : { limit: 1000 },
        );
        allRows.push(...page.items);
        cursor = page.hasNextPage ? page.cursor : undefined;
      } while (cursor);

      const withComputed = await this.withComputed(type, allRows, ctx);

      // Apply computed filter in memory.
      const { computed: computedFilter } = query.filter
        ? splitFilter(query.filter, computedFields)
        : { computed: undefined };
      const filtered = computedFilter
        ? withComputed.filter((obj) => evalFilter(obj as Record<string, unknown>, computedFilter))
        : withComputed;

      // Aggregate in memory.
      return this.aggregateInMemory(filtered as Record<string, unknown>[], query);
    });
  }

  /**
   * Aggregate a set of in-memory objects (with computed fields already
   * evaluated) according to an AggregateQuery.
   */
  private aggregateInMemory(
    rows: Record<string, unknown>[],
    query: AggregateQuery,
  ): AggregateResult {
    const groupBy = query.groupBy ?? [];
    const groups = new Map<string, { keys: Record<string, unknown>; rows: Record<string, unknown>[] }>();

    for (const row of rows) {
      const keyValues: Record<string, unknown> = {};
      const keyParts: string[] = [];
      for (const field of groupBy) {
        const val = row[field];
        keyValues[field] = val;
        keyParts.push(String(val));
      }
      const keyStr = keyParts.join('\0');
      let group = groups.get(keyStr);
      if (!group) {
        group = { keys: keyValues, rows: [] };
        groups.set(keyStr, group);
      }
      group.rows.push(row);
    }

    // If no groupBy, all rows are one group.
    if (groupBy.length === 0 && rows.length > 0) {
      groups.set('', { keys: {}, rows });
    } else if (groupBy.length === 0) {
      groups.set('', { keys: {}, rows: [] });
    }

    let resultGroups = [...groups.values()].map((g) => {
      const values: Record<string, number | null> = {};
      for (const af of query.fields) {
        if (af.fn === 'count') {
          values[af.alias ?? af.field] = g.rows.length;
        } else {
          const nums = g.rows
            .map((r) => r[af.field])
            .filter((v) => v !== null && v !== undefined && typeof v === 'number') as number[];
          if (nums.length === 0) {
            values[af.alias ?? af.field] = null;
          } else {
            switch (af.fn) {
              case 'sum': values[af.alias ?? af.field] = nums.reduce((a, b) => a + b, 0); break;
              case 'avg': values[af.alias ?? af.field] = nums.reduce((a, b) => a + b, 0) / nums.length; break;
              case 'min': values[af.alias ?? af.field] = Math.min(...nums); break;
              case 'max': values[af.alias ?? af.field] = Math.max(...nums); break;
              default: values[af.alias ?? af.field] = null; break;
            }
          }
        }
      }
      return { keys: g.keys, values };
    });

    // Apply orderBy.
    if (query.orderBy) {
      resultGroups.sort((a, b) => {
        for (const sort of query.orderBy!) {
          const av = a.values[sort.field] ?? a.keys[sort.field];
          const bv = b.values[sort.field] ?? b.keys[sort.field];
          const cmp = compareValues(av, bv);
          if (cmp !== 0 && !Number.isNaN(cmp)) return sort.direction === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    // Apply limit.
    if (query.limit !== undefined && resultGroups.length > query.limit) {
      resultGroups = resultGroups.slice(0, query.limit);
    }

    return {
      groups: resultGroups,
      totalGroups: resultGroups.length,
    };
  }

  /**
   * Search objects by type with full-text query.
   *
   * Rewrites the declared @primary field onto `_id` first, then resolves LAZY
   * computed fields on every hit, as get() does for a single object.
   *
   * Defaults the field set to the type's declared @searchable fields when the
   * caller names none — see searchableFieldNames for why that matters.
   */
  async search(
    type: string,
    query: SearchQuery,
    ctx: RequestContext,
  ): Promise<SearchResult> {
    return withSpan(tracer, 'searchObjects', {
      [SpanAttributes.OBJECT_TYPE]: type,
      [SpanAttributes.TENANT_ID]: ctx.tenantId,
      [SpanAttributes.OPERATION]: 'search',
    }, async () => {
      if (!query.fields || query.fields.length === 0) {
        const declared = this.searchableFieldNames(type);
        if (declared.length > 0) query = { ...query, fields: declared };
      }
      const primary = this.primaryFieldName(type);
      if (primary) {
        query = {
          ...query,
          ...(query.filter ? { filter: rewritePrimaryField(query.filter, primary) } : {}),
          ...(query.fields ? { fields: query.fields.map((f) => (f === primary ? '_id' : f)) } : {}),
        };
      }
      const result = await this.storage.searchObjects(ctx, type, query);
      const objects = await this.withComputed(type, result.hits.map((h) => h.object), ctx);
      return {
        ...result,
        hits: result.hits.map((hit, i) => ({ ...hit, object: objects[i]! })),
      };
    });
  }

  /**
   * The declared @primary field name for a type, when it differs from `_id`.
   *
   * Undefined for an unknown type, so a query against something outside the
   * schema is passed through rather than rejected here — the provider owns
   * that error.
   */
  /**
   * The type's declared @searchable field names, in declaration order.
   *
   * A search that names no fields used to mean "every text field", which each
   * provider resolved for itself and neither resolved from the schema:
   * Postgres queried information_schema on every call and searched every
   * text/varchar column, and the memory provider searched whichever string
   * keys happened to be PRESENT on each candidate object — so the field set
   * varied row to row.
   *
   * Both readings ignore @searchable, which is the declaration that decides
   * this. It is also the only one the storage can serve: @searchable is what
   * emits the pg_trgm GIN index (schema-loader FULLTEXT → ddl-objects), so a
   * search across every text column cannot use an index for the unindexed ones
   * and degrades to a full scan on exactly the queries meant to be fast.
   *
   * Empty when the type declares nothing searchable, and the caller then
   * leaves query.fields unset so the providers keep their existing
   * search-everything fallback — narrowing an undeclared type to zero fields
   * would turn "no @searchable directives yet" into "search returns nothing".
   */
  private searchableFieldNames(type: string): string[] {
    const objectType = this.schema.objectTypes.find((o) => o.name === type);
    if (!objectType) return [];
    return objectType.fields
      .filter((f) => f.directives.some((d) => d.kind === 'searchable'))
      .map((f) => f.name);
  }

  private primaryFieldName(type: string): string | undefined {
    const objectType = this.schema.objectTypes.find((o) => o.name === type);
    const primary = objectType?.fields.find((f) => f.directives.some((d) => d.kind === 'primary'));
    return primary && primary.name !== '_id' ? primary.name : undefined;
  }

  /**
   * The set of computed field names for a type, or empty if the type has
   * no @computed fields or no evaluator is configured.
   */
  private computedFieldNames(type: string): Set<string> {
    if (!this.computedFieldEvaluator) return new Set();
    return new Set(this.computedFieldEvaluator.getComputedFields(type).map((f) => f.name));
  }

  /**
   * Merge LAZY computed fields into a page of objects, in bounded waves.
   *
   * Returns the input untouched when nothing is computed for the type, so a
   * type without @computed fields — the common case — pays nothing. Results
   * are never truncated: a large page is slow, not silently incomplete.
   */
  private async withComputed(
    type: string,
    objects: OntologyObject[],
    ctx: RequestContext,
  ): Promise<OntologyObject[]> {
    const evaluator = this.computedFieldEvaluator;
    if (!evaluator || evaluator.getComputedFields(type).length === 0) return objects;

    const resolved: OntologyObject[] = [];
    for (let i = 0; i < objects.length; i += COMPUTED_ROW_CONCURRENCY) {
      const wave = await Promise.all(
        objects.slice(i, i + COMPUTED_ROW_CONCURRENCY).map(async (obj) => ({
          ...obj,
          ...await evaluator.evaluateAll(type, obj._id, ctx),
        })),
      );
      resolved.push(...wave);
    }
    return resolved;
  }

  /**
   * Run the validation pipeline for object properties.
   */
  private async validate(
    type: string,
    properties: Record<string, unknown>,
    ctx: RequestContext,
    existingId?: string,
    patchKeys?: Set<string>,
  ): Promise<ValidationResult> {
    return validateObjectProperties(
      this.schema,
      type,
      properties,
      ctx,
      this.storage,
      existingId,
      patchKeys,
      this.celEvaluator,
    );
  }

  /**
   * Merge existing object properties with update properties.
   * System fields (prefixed with _) are excluded from merge.
   */
  private mergeProperties(
    existing: OntologyObject,
    updates: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!key.startsWith('_')) {
        merged[key] = value;
      }
    }
    for (const [key, value] of Object.entries(updates)) {
      merged[key] = value;
    }
    return merged;
  }

  /**
   * Compute field-level changes between existing state and updates.
   */
  private computeChanges(
    existing: OntologyObject,
    updates: Record<string, unknown>,
  ): ChangeSet {
    const changes: ChangeSet = {};
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = existing[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = { old: oldValue, new: newValue };
      }
    }
    return changes;
  }

  /**
   * Build a ProvenanceSource from the cause and context.
   * Defaults to ACTION source kind with the actor from the request context.
   */
  private buildProvenanceSource(
    cause: EventCause | undefined,
    ctx: RequestContext,
  ): ProvenanceSource {
    return {
      kind: 'ACTION',
      actionType: cause?.actionType ?? 'direct',
      actionId: cause?.actionId ?? 'unknown',
      actor: cause?.actor ?? (ctx.actorId ? `user:${ctx.actorId}` : 'system'),
    };
  }
}
