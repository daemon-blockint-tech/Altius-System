/**
 * Auto-generated REST route factory (Section 8.2).
 *
 * Takes a ParsedSchema and ApiDependencies, produces REST route definitions.
 * Each ObjectType gets:
 *   GET  /api/v1/{plural}            — list with query params
 *   GET  /api/v1/{plural}/:id        — get by ID
 *   GET  /api/v1/{plural}/:id/links/:linkType — linked objects
 *   GET  /api/v1/{plural}/:id/history — version history
 *
 * Each ActionType gets:
 *   POST /api/v1/actions/{ActionName} — execute action
 *
 * All routes go through the same security pipeline (auth, authz, consent)
 * as the GraphQL layer. Error responses use the unified error model (Section 8.8).
 */

import type { ParsedSchema, ObjectType, ActionType, FunctionType, FieldDefinition } from '@altius/odl';
import { DataPurpose } from '@altius/spi';
import type { OntologyObject, FilterExpression, FieldPredicate, AggregateQuery, AggregateField, AggregateFunction, AggregateHaving, BucketInterval, SearchQuery, ObjectSetDefinition, RequestContext } from '@altius/spi';
import type { ActionActor, ActionContext } from '@altius/actions';
import type { RedactionResult } from '@altius/security';
import type { FunctionRevision } from '@altius/engine';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import { DEFAULT_CONSENT_PURPOSE, DEFAULT_CONSENT_SUBJECT_TYPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, isConsentSubjectType } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest, mapCodeToCategory, mapErrorToHttpStatus } from './errors.js';
import { invokeFunction } from '../functions/invoke-function.js';
import { generateLlmRoutes } from './llm-routes.js';
import { generateDataFreshnessRoutes } from './data-freshness-routes.js';
import { generateFase21ObjectRoutes, generateFase21PlatformRoutes } from './fase21-routes.js';
import { generateFase22ObjectRoutes, generateFase22PlatformRoutes } from './fase22-routes.js';
import { generateSecurityGovernanceRoutes } from './security-governance-routes.js';
import { generateOntologySqlRoutes } from './ontology-sql-routes.js';
import { generateDatasetRoutes } from './dataset-routes.js';
import { generateUsageMetricsRoutes } from './usage-metrics-routes.js';
import { generateHistogramFacetRoutes } from './histogram-facet-routes.js';
import { isTypeVisible } from '../markings/enforce.js';
import { writeReadAuditFor } from './audit-read.js';
import { lowerFirst, toSnakeCase, searchableTextFields } from '../utils.js';
import { paginateWithConsent } from '../consent-pagination.js';
import { collectRawRecords } from '../cdm/router.js';

// ─── Helpers ───

function pluralize(s: string): string {
  return lowerFirst(s) + 's';
}

function isPrimaryField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'primary');
}

function isParamField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'param');
}

/**
 * Recursively collect field names referenced in an SPI FilterExpression.
 * Used to enforce field-level authorization on filter predicates.
 */
function collectFilterFields(filter: FilterExpression | undefined): string[] {
  if (!filter) return [];
  if ('field' in filter) return [(filter as { field: string }).field];
  const fields: string[] = [];
  const logical = filter as { and?: FilterExpression[]; or?: FilterExpression[]; not?: FilterExpression };
  if (logical.and) {
    for (const sub of logical.and) fields.push(...collectFilterFields(sub));
  }
  if (logical.or) {
    for (const sub of logical.or) fields.push(...collectFilterFields(sub));
  }
  if (logical.not) {
    fields.push(...collectFilterFields(logical.not));
  }
  return fields;
}

/**
 * Convert an OntologyObject to a REST-friendly shape.
 * Same logic as GraphQL objectToGraphQL.
 */
function objectToRest(obj: OntologyObject, objectType: ObjectType): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of objectType.fields) {
    if (isPrimaryField(field)) {
      // Primary field is an alias for the system _id column — the field name
      // can be anything (id, mrn, sku); the value always comes from obj._id.
      result[field.name] = obj._id;
    } else {
      result[field.name] = obj[field.name];
    }
  }

  // The row identity. Not in the declared shape — the @primary field above
  // already exposes it under its own name — but the consent filter resolves the
  // subject from `_id`, so without it every row is checked as subject '',
  // matches no consent record, and is default-denied: a consent-subject type
  // reads as an empty collection with no error. objectToGraphQL carries it for
  // the same reason.
  result._id = obj._id;

  // The version the caller sends back in `If-Match` for optimistic concurrency.
  // System metadata, so redaction (which skips `_`-prefixed keys) leaves it alone.
  result._version = obj._version;

  // Actor attribution: who produced this version. Surfaces in history so the
  // timeline can show who made each change.
  result._actorId = obj._actorId ?? null;

  result._redactedFields = null;
  result._consentRestricted = false;

  return result;
}

/**
 * Wire operator names accepted in `filter[field][op]=value`.
 *
 * Deliberately the same vocabulary the generated GraphQL filter inputs use
 * (see mapFilterOp in graphql/resolver-generator.ts) — `ne` rather than the
 * SPI's `neq` — so one filter vocabulary spans both surfaces.
 */
const REST_FILTER_OPS: Record<string, FieldPredicate['operator']> = {
  eq: 'eq',
  ne: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  in: 'in',
  contains: 'contains',
  startsWith: 'startsWith',
  exists: 'exists',
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * The fields a caller may filter or sort on: everything with a stored column.
 *
 * Link and @computed fields are excluded because they have no column to
 * compare — and an unknown name must be refused rather than passed through,
 * since the providers disagree about it (Postgres raises on a missing column,
 * the memory provider matches nothing and returns a plausible empty page).
 */
function queryableFields(obj: ObjectType): Set<string> {
  return new Set(
    obj.fields
      .filter(f => !f.directives.some(d => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
      .map(f => f.name),
  );
}

/** Coerce a raw query-string value for the given operator. */
function coerceFilterValue(op: string, raw: unknown): unknown {
  if (op === 'in') {
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  if (op === 'exists') {
    const s = String(Array.isArray(raw) ? raw[0] : raw).toLowerCase();
    return !(s === 'false' || s === '0');
  }
  // Everything else compares against a single value; a repeated param is
  // handled by the caller as set membership before reaching here.
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Parse REST query params into a FilterExpression.
 *
 * Accepts `filter[field]=value` (equality) and `filter[field][op]=value` for
 * the operator set above. A repeated `filter[field]=a&filter[field]=b` becomes
 * set membership rather than silently discarding all but the first value.
 *
 * Unknown fields and unknown operators are refused. Skipping them instead —
 * which is what passing the raw nested object through amounted to — widens the
 * result set, so a typo returns more rows than the caller asked for rather
 * than an error.
 */
function parseQueryFilter(
  query: Record<string, unknown>,
  queryable: Set<string>,
): ParseResult<FilterExpression | undefined> {
  const predicates: FilterExpression[] = [];

  const addField = (fieldName: string, raw: unknown): string | undefined => {
    if (raw == null) return undefined;
    if (!fieldName.startsWith('_') && !queryable.has(fieldName)) {
      return `Cannot filter on ${fieldName}: not a filterable field. Computed and link fields have no stored value to filter on.`;
    }

    // Nested form: filter[field][op]=value, possibly several ops per field.
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [op, opValue] of Object.entries(raw as Record<string, unknown>)) {
        const spiOp = REST_FILTER_OPS[op];
        if (!spiOp) {
          return `Unknown filter operator '${op}' on ${fieldName}. Supported: ${Object.keys(REST_FILTER_OPS).join(', ')}.`;
        }
        predicates.push({ field: fieldName, operator: spiOp, value: coerceFilterValue(op, opValue) });
      }
      return undefined;
    }

    // Repeated param: treat as set membership.
    if (Array.isArray(raw)) {
      predicates.push({ field: fieldName, operator: 'in', value: raw });
      return undefined;
    }

    predicates.push({ field: fieldName, operator: 'eq', value: raw });
    return undefined;
  };

  // Express's default (qs) query parser turns `filter[specialty]=x` into a
  // nested object: req.query.filter = { specialty: 'x' }. Handle that form...
  const nested = query['filter'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [fieldName, value] of Object.entries(nested as Record<string, unknown>)) {
      const err = addField(fieldName, value);
      if (err) return { ok: false, message: err };
    }
  }

  // ...and the flat form `filter[specialty]` as a literal key (simple parsers).
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    const match = key.match(/^filter\[(\w+)\](?:\[(\w+)\])?$/);
    if (match && match[1]) {
      const err = match[2]
        ? addField(match[1], { [match[2]]: value })
        : addField(match[1], value);
      if (err) return { ok: false, message: err };
    }
  }

  if (predicates.length === 0) return { ok: true, value: undefined };
  if (predicates.length === 1) return { ok: true, value: predicates[0] };
  return { ok: true, value: { and: predicates } };
}

/**
 * Parse `?sort=field&order=asc|desc` into QueryOptions.orderBy.
 *
 * openapi.ts has always advertised these two params on the list route; the
 * handler never read them, so a client following the published contract got an
 * arbitrary order back with no signal it had been ignored.
 */
function parseOrderBy(
  query: Record<string, unknown>,
  queryable: Set<string>,
): ParseResult<{ field: string; direction: 'asc' | 'desc' }[] | undefined> {
  const rawSort = query['sort'];
  if (rawSort == null) return { ok: true, value: undefined };

  const field = String(Array.isArray(rawSort) ? rawSort[0] : rawSort);
  if (!field.startsWith('_') && !queryable.has(field)) {
    return {
      ok: false,
      message: `Cannot sort on ${field}: not a sortable field. Computed and link fields have no stored value to sort on.`,
    };
  }

  const rawOrder = query['order'];
  let direction: 'asc' | 'desc' = 'asc';
  if (rawOrder != null) {
    const o = String(Array.isArray(rawOrder) ? rawOrder[0] : rawOrder).toLowerCase();
    if (o !== 'asc' && o !== 'desc') {
      return { ok: false, message: `Invalid order '${o}': expected 'asc' or 'desc'.` };
    }
    direction = o;
  }

  return { ok: true, value: [{ field, direction }] };
}

/**
 * Parse `?asOf=<ISO-8601>` into QueryOptions.asOfTime.
 *
 * Same param name as the single-object `asOf` on the history route, because it
 * is the same question asked of a set. QueryOptions.asOfTime is implemented by
 * both providers and pinned by the temporal conformance category, but nothing
 * above the SPI ever set it: the history endpoint answered "what did THIS
 * object look like then" and no route answered it for a collection — which is
 * the form the useful questions take ("who was DISCHARGED last Tuesday"),
 * because it has to be evaluated against that day's rows, not today's.
 */
function parseAsOf(query: Record<string, unknown>): ParseResult<string | undefined> {
  const raw = query['asOf'];
  if (raw == null) return { ok: true, value: undefined };

  const value = String(Array.isArray(raw) ? raw[0] : raw);
  // Rejected rather than coerced, for the reason the history route gives:
  // Date.parse('last tuesday') is NaN, but Date.parse('2026') silently means
  // January 1st, and a historical answer the caller did not ask for still
  // looks like a real record.
  if (Number.isNaN(Date.parse(value))) {
    return { ok: false, message: `asOf must be an ISO-8601 timestamp, got "${value}"` };
  }
  return { ok: true, value };
}

/**
 * Parse pagination from query params.
 */
function parsePagination(query: Record<string, string | string[] | undefined>): { offset: number; limit: number; after?: string } {
  const limitStr = typeof query['limit'] === 'string' ? query['limit'] : undefined;
  const offsetStr = typeof query['offset'] === 'string' ? query['offset'] : undefined;
  const afterStr = typeof query['after'] === 'string' ? query['after'] : undefined;

  const limit = Math.max(0, Math.min(
    limitStr ? parseInt(limitStr, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  ));
  const offset = Math.max(0, offsetStr ? parseInt(offsetStr, 10) || 0 : 0);

  // `after` is returned alongside offset/limit; callers decide whether to
  // forward it. The link route does (cursor pagination), the object list
  // routes do not (they predate the cursor contract and stay offset-only
  // to keep the change minimal).
  return afterStr ? { offset, limit, after: afterStr } : { offset, limit };
}

// ─── Auth helpers ───

/**
 * Resolve authorized object IDs for a user+type via FGA listObjects.
 * Returns ['*'] when the dev stub signals all objects are authorized.
 */
async function resolveAllowedIds(
  deps: ApiDependencies,
  userId: string,
  fgaType: string,
  tenantId: string,
): Promise<string[]> {
  const allowedObjects = await deps.authorizationService.listObjects(
    `user:${userId}`,
    'viewer',
    fgaType,
    tenantId,
  );
  if (allowedObjects.length === 1 && allowedObjects[0] === '*') {
    return ['*'];
  }
  return allowedObjects.map((o: string) => {
    const parts = o.split(':');
    return parts[parts.length - 1];
  }).filter((id): id is string => id !== undefined && id !== '');
}

/**
 * How many records the per-record consent evaluation will scan before it gives
 * up. Aggregates over a consent-subject type cannot be pushed into storage —
 * every candidate has to be consent-checked individually — so this bounds the
 * work, and exceeding it is an error rather than a silent partial answer.
 */
const CONSENT_SCAN_LIMIT = 10_000;

/**
 * For consent-subject types, query all matching records, apply consent
 * filtering, and return the consented ID list. Returns the input allowedIds
 * when consent is not applicable. Used by aggregate to constrain the input
 * set to consented records before delegating to storage.
 *
 * Throws QUOTA_EXCEEDED when more than CONSENT_SCAN_LIMIT records match.
 */
async function resolveConsentedIds(
  deps: ApiDependencies,
  typeName: string,
  allowedIds: string[],
  userFilter: FilterExpression | undefined,
  userId: string,
  requestContext: RequestContext,
): Promise<string[]> {
  if (!deps.consentService || !isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
    return allowedIds;
  }

  const combinedFilter = buildAuthFilter(allowedIds, userFilter);
  // Fetch one past the window so a full page is distinguishable from a
  // truncated one — same trick as collectObjectRecords in cdm/router.ts.
  const scan = await deps.objectManager.query(
    typeName, combinedFilter, { limit: CONSENT_SCAN_LIMIT + 1, offset: 0 }, requestContext,
  );

  if (scan.items.length > CONSENT_SCAN_LIMIT) {
    // Consent is per subject, so the aggregate can only cover what this scan
    // returned. Past the window the result would quietly omit rows — a COUNT
    // or SUM that looks authoritative and is wrong. Refuse instead: a missing
    // number is recoverable, a plausible wrong one is not.
    throw Object.assign(
      new Error(
        `Cannot aggregate ${typeName}: more than ${CONSENT_SCAN_LIMIT} records match and consent must be ` +
        `evaluated per record, so the result would be computed over a truncated population. ` +
        `Narrow the filter.`,
      ),
      { code: 'QUOTA_EXCEEDED' },
    );
  }

  const getPrimaryId = (item: OntologyObject) => String(item._id ?? '');
  const consentResult = await deps.consentService.filterList(
    scan.items, getPrimaryId, DEFAULT_CONSENT_PURPOSE as DataPurpose,
    userId, requestContext.tenantId,
  );

  return consentResult.edges.map(o => o._id);
}

/**
 * Build a combined filter that restricts to authorized IDs + optional user filter.
 * When allowedIds is ['*'] (dev stub), skip the ID restriction.
 */
function buildAuthFilter(
  allowedIds: string[],
  userFilter?: FilterExpression,
): FilterExpression {
  const allAuthorized = allowedIds.length === 1 && allowedIds[0] === '*';
  if (allAuthorized) {
    const passThrough: FilterExpression = { field: '_deleted_at', operator: 'exists', value: false };
    return userFilter ? { and: [passThrough, userFilter] } : passThrough;
  }
  const idFilter: FilterExpression = {
    field: '_id',
    operator: 'in',
    value: allowedIds,
  };
  return userFilter ? { and: [idFilter, userFilter] } : idFilter;
}

// ─── Public API ───

/**
 * Generate REST route definitions from ParsedSchema and dependencies.
 */
export function generateRestRoutes(
  schema: ParsedSchema,
  deps: ApiDependencies,
): RestRoute[] {
  const routes: RestRoute[] = [];

  for (const obj of schema.objectTypes) {
    routes.push(...generateObjectRoutes(obj, deps));
  }

  for (const action of schema.actionTypes) {
    routes.push(generateActionRoute(action, schema, deps));
  }

  for (const fn of schema.functionTypes) {
    routes.push(generateFunctionRoute(fn, deps));
  }

  // Function lifecycle routes (draft → publish → test → rollback)
  routes.push(...generateFunctionLifecycleRoutes(deps));

  // Object Set routes
  routes.push(...generateObjectSetRoutes(schema, deps));

  // Per-object action applicability
  routes.push(generateApplicableActionsRoute(schema, deps));

  // LLM routes (generate + embed)
  routes.push(...generateLlmRoutes(deps));

  // Data freshness routes
  routes.push(...generateDataFreshnessRoutes(deps));

  // Fase 21 object-level and platform routes
  routes.push(...generateFase21ObjectRoutes(schema, deps));
  routes.push(...generateFase21PlatformRoutes(deps));

  // Fase 22 — mobile, cross-app commands, graph, filter state
  routes.push(...generateFase22ObjectRoutes(schema, deps));
  routes.push(...generateFase22PlatformRoutes(deps));

  // Security governance routes (access explanation, justifications, scoped sessions)
  routes.push(...generateSecurityGovernanceRoutes(deps));

  // Ontology SQL routes (SQL Studio)
  routes.push(...generateOntologySqlRoutes(deps));

  // Dataset routes (versioned transactional datasets)
  routes.push(...generateDatasetRoutes(deps));

  // Usage metrics routes (ontology observability)
  routes.push(...generateUsageMetricsRoutes(deps));

  return routes;
}

// ─── Object routes ───

function generateObjectRoutes(
  obj: ObjectType,
  deps: ApiDependencies,
): RestRoute[] {
  const plural = pluralize(obj.name);
  const fgaType = toSnakeCase(obj.name);

  // Route order matters for Express: static path segments must come before
  // parameterized segments (e.g., /search before /:id) to avoid shadowing.
  // Every route here belongs to exactly one ObjectType, so stamp it once
  // rather than threading obj.name through nine generators.
  return [
    generateListRoute(obj, plural, fgaType, deps),
    generateExportRoute(obj, plural, deps),
    generateAggregateRoute(obj, plural, fgaType, deps),
    ...generateHistogramFacetRoutes(obj, plural, fgaType, deps),
    generateSearchRoute(obj, plural, fgaType, deps),
    generateGetByIdRoute(obj, plural, fgaType, deps),
    generateUpdateRoute(obj, plural, fgaType, deps),
    generateDeleteRoute(obj, plural, fgaType, deps),
    generateLinksRoute(plural, fgaType, deps),
    generateHistoryRoute(obj, plural, fgaType, deps),
  ].map(route => ({ ...route, objectType: obj.name }));
}

/**
 * GET /api/v1/{plural} — list with query params for filtering and pagination.
 */
function generateListRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;

        // Authorization: list objects user can see.
        // Dev stub returns ['*'] sentinel meaning "all objects authorized".
        const allowedObjects = await deps.authorizationService.listObjects(
          `user:${user.id}`,
          'viewer',
          fgaType,
          user.tenantId,
        );

        const allAuthorized = allowedObjects.length === 1 && allowedObjects[0] === '*';
        const allowedIds = allAuthorized ? [] : allowedObjects.map((o: string) => {
          const parts = o.split(':');
          return parts[parts.length - 1];
        }).filter((id): id is string => id !== undefined && id !== '');

        // SEC-10: If no objects are authorized, return empty result immediately
        if (!allAuthorized && allowedIds.length === 0) {
          return {
            status: 200,
            body: {
              data: [],
              pagination: { totalCount: 0, limit: parsePagination(req.query).limit, offset: 0, hasNextPage: false, hasPreviousPage: false },
            },
          };
        }

        const queryable = queryableFields(obj);

        const parsedFilter = parseQueryFilter(req.query, queryable);
        if (!parsedFilter.ok) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: parsedFilter.message,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }
        const userFilter = parsedFilter.value;

        const parsedOrderBy = parseOrderBy(req.query, queryable);
        if (!parsedOrderBy.ok) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: parsedOrderBy.message,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }
        const orderBy = parsedOrderBy.value;

        const parsedAsOf = parseAsOf(req.query);
        if (!parsedAsOf.ok) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: parsedAsOf.message,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }
        const asOfTime = parsedAsOf.value;

        // SEC-14: Validate filter fields against redacted fields
        const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
        if (visibleFields) {
          // Sorting reveals ordering over a value just as filtering reveals
          // membership, so a redacted field is refused for both.
          const violations = [
            ...(userFilter ? collectFilterFields(userFilter) : []),
            ...(orderBy ?? []).map(o => o.field),
          ].filter(f => !f.startsWith('_') && !visibleFields.has(f));
          if (violations.length > 0) {
            return createRestErrorResponse({
              code: 'ACCESS_DENIED',
              category: 'authorization',
              message: `Cannot filter on redacted fields: ${violations.join(', ')}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
        }

        // Build combined filter — skip ID restriction when all authorized
        let combinedFilter: FilterExpression;
        if (!allAuthorized) {
          const idFilter: FilterExpression = { field: '_id', operator: 'in', value: allowedIds };
          combinedFilter = userFilter ? { and: [idFilter, userFilter] } : idFilter;
        } else {
          const passThrough: FilterExpression = { field: '_deleted_at', operator: 'exists', value: false };
          combinedFilter = userFilter ? { and: [passThrough, userFilter] } : passThrough;
        }

        const { offset, limit } = parsePagination(req.query);

        const mapAndRedact = (objs: OntologyObject[]): Record<string, unknown>[] =>
          deps.authorizationService
            .redactFieldsBatch(
              user.id,
              user.roles,
              typeName,
              objs.map((item: OntologyObject) => objectToRest(item, obj)),
            )
            .map((r: RedactionResult<Record<string, unknown>>) => {
              const data = r.data as Record<string, unknown>;
              data._redactedFields = r._redactedFields.length > 0 ? r._redactedFields : null;
              data._consentRestricted = false;
              return data;
            });

        let items: Record<string, unknown>[];
        let totalCount: number;
        let hasNextPage: boolean;

        if (deps.consentService && isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
          // Consent removes records, so it must be applied BEFORE slicing the
          // page (see consent-pagination.ts) — DB-level pagination then consent
          // drops drift totalCount/hasNextPage and can hide later pages.
          const getPrimaryId = (item: Record<string, unknown>) => String(item._id ?? '');
          const result = await paginateWithConsent<OntologyObject, Record<string, unknown>>(
            offset,
            limit,
            async (windowLimit) => {
              const scan = await deps.objectManager.query(
                typeName, combinedFilter,
                { limit: windowLimit, offset: 0, ...(orderBy ? { orderBy } : {}), ...(asOfTime ? { asOfTime } : {}) },
                requestContext,
              );
              return { items: scan.items, total: scan.totalCount };
            },
            async (raw) => {
              const consentResult = await deps.consentService!.filterList(
                mapAndRedact(raw), getPrimaryId, DEFAULT_CONSENT_PURPOSE as DataPurpose,
                user.id, requestContext.tenantId,
              );
              return consentResult.edges as Record<string, unknown>[];
            },
          );
          items = result.items;
          totalCount = result.totalCount;
          hasNextPage = result.hasNextPage;
        } else {
          // No consent gate — efficient DB-level pagination.
          const page = await deps.objectManager.query(
            typeName,
            combinedFilter,
            { limit, offset, ...(orderBy ? { orderBy } : {}), ...(asOfTime ? { asOfTime } : {}) },
            requestContext,
          );
          items = mapAndRedact(page.items);
          totalCount = page.totalCount;
          hasNextPage = offset + items.length < totalCount;
        }

        return {
          status: 200,
          body: {
            data: items,
            pagination: {
              totalCount,
              limit,
              offset,
              hasNextPage,
              hasPreviousPage: offset > 0,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * Row cap for the general export endpoint. Matches the CDM export limit.
 * Callers can request fewer rows via ?limit= but never more.
 */
const REST_EXPORT_LIMIT = 10_000;
const REST_EXPORT_FORMATS = ['ndjson', 'csv'] as const;
type RestExportFormat = (typeof REST_EXPORT_FORMATS)[number];

/**
 * GET /api/v1/{plural}/export?format=ndjson|csv&limit=&offset=&columns= —
 * general per-ObjectType dataset export. Reuses the same FGA scoping,
 * field-level redaction, and consent filtering as the list route (via
 * `collectRawRecords`), but returns NDJSON or CSV instead of JSON. No CDM
 * projection — raw object fields only.
 *
 * Rows past the per-request cap are reachable by paging on ?offset=; the
 * response carries X-Export-Next-Offset while more rows may exist. Offsets are
 * applied at the storage layer, so a consent-filtered page can come back short
 * but never skips or repeats a row.
 *
 * Parity with Foundry `readTable` for non-CDM consumers. Arrow IPC is
 * deliberately deferred (would require `apache-arrow`).
 */
function generateExportRoute(
  obj: ObjectType,
  plural: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}/export`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user } = ctx;
        const typeName = obj.name;

        const formatParam = (typeof req.query['format'] === 'string' ? req.query['format'] : 'ndjson').toLowerCase();
        if (!REST_EXPORT_FORMATS.includes(formatParam as RestExportFormat)) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: `Unsupported export format '${formatParam}'. Use one of: ${REST_EXPORT_FORMATS.join(', ')}.`,
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const format = formatParam as RestExportFormat;

        const limitParam = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
        const limit = Math.max(1, Math.min(limitParam && !isNaN(limitParam) ? limitParam : REST_EXPORT_LIMIT, REST_EXPORT_LIMIT));

        const offsetParam = typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : undefined;
        if (offsetParam !== undefined && (isNaN(offsetParam) || offsetParam < 0)) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: 'offset must be a non-negative integer',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const offset = offsetParam ?? 0;

        // Column projection. Validated against the type's scalar fields so a
        // typo is a 400 rather than a file of empty columns, and so a redacted
        // field cannot be named to probe whether it exists.
        const scalarFields = obj.fields.filter(f => !f.directives.some(d => d.kind === 'link') && !f.directives.some(d => d.kind === 'computed') && !f.directives.some(d => d.kind === 'reducer'));
        const exportable = new Set<string>([
          ...scalarFields.map(f => f.name),
          '_id', '_version', '_createdAt', '_updatedAt',
        ]);
        let projection: string[] | undefined;
        if (typeof req.query['columns'] === 'string' && req.query['columns'].length > 0) {
          projection = req.query['columns'].split(',').map(c => c.trim()).filter(c => c.length > 0);
          const unknown = projection.filter(c => !exportable.has(c));
          if (unknown.length > 0) {
            return createRestErrorResponse({
              code: 'VALIDATION_ERROR',
              category: 'validation',
              message: `Unknown column(s): ${unknown.join(', ')}`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
        }

        // Reuse the CDM router's raw collection pipeline (FGA scoping +
        // redaction + consent filtering) with no CDM projection.
        const { records: rawRecords, capped } = await collectRawRecords(
          deps,
          user,
          typeName,
          limit,
          offset,
        );

        // Projection is applied after redaction, so a redacted field named in
        // ?columns= still comes back masked rather than restored.
        const records = projection
          ? rawRecords.map(r => {
              const out: Record<string, unknown> = {};
              for (const c of projection!) out[c] = r[c];
              return out;
            })
          : rawRecords;

        const filenameBase = `${plural}-export`;
        const truncationHeaders: Record<string, string> = {
          'X-Export-Truncated': String(capped),
          'X-Export-Limit': String(limit),
          'X-Export-Offset': String(offset),
        };
        // Page cursor: present only while more rows may exist, so a client can
        // walk a type larger than the per-request cap instead of losing the tail.
        if (capped) truncationHeaders['X-Export-Next-Offset'] = String(offset + limit);

        if (format === 'csv') {
          const columns = projection ?? [
            ...scalarFields.map(f => f.name),
            '_id', '_version', '_createdAt', '_updatedAt',
          ];
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
              ...truncationHeaders,
            },
            body: recordsToCsv(columns, records),
          };
        }

        // NDJSON: one JSON object per line
        return {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filenameBase}.ndjson"`,
            ...truncationHeaders,
          },
          body: records.map(r => JSON.stringify(r)).join('\n'),
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * Serialise records to CSV. Columns are the provided field list; nested values
 * are JSON-encoded. Mirrors the CDM export's CSV helper.
 */
function recordsToCsv(columns: string[], records: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    let str: string;
    if (value instanceof Date) {
      str = value.toISOString();
    } else if (typeof value === 'object') {
      str = JSON.stringify(value);
    } else {
      str = String(value);
    }
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.join(',');
  const lines = records.map(rec =>
    columns.map(col => escape(rec[col])).join(','),
  );
  return [header, ...lines].join('\n');
}

/**
 * GET /api/v1/{plural}/:id — get single object by ID.
 */
function generateGetByIdRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}/:id`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;
        const id = req.params['id']!;

        // Authorize
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'viewer',
          `${fgaType}:${id}`,
          user.tenantId,
        );
        if (!allowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Access denied to ${typeName} ${id}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Get from engine
        const result = await deps.objectManager.get(typeName, id, requestContext);
        if (!result) {
          return createRestErrorResponse({
            code: 'OBJECT_NOT_FOUND',
            category: 'not_found',
            message: `${typeName} ${id} not found`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        let restObj = objectToRest(result, obj);

        // Field-level redaction
        const redacted = deps.authorizationService.redactFields(
          user.id,
          user.roles,
          typeName,
          restObj,
        );
        restObj = redacted.data as Record<string, unknown>;
        restObj._redactedFields = redacted._redactedFields.length > 0 ? redacted._redactedFields : null;

        // Consent filtering — only for types that have a data subject.
        if (deps.consentService && isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
          const consentResult = await deps.consentService.checkSingleObject(
            restObj,
            id,
            DEFAULT_CONSENT_PURPOSE as DataPurpose,
            user.id,
            requestContext.tenantId,
          );
          if (consentResult._consentRestricted) {
            restObj._consentRestricted = true;
            for (const field of obj.fields) {
              if (!isPrimaryField(field)) {
                restObj[field.name] = null;
              }
            }
          }
        }

        return {
          status: 200,
          body: { data: restObj },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * Parse an `If-Match` header value into a numeric expected version.
 * Returns `undefined` when the header is absent. Returns `NaN` when the
 * header is present but not a valid integer — callers should return 400.
 */
function parseIfMatchHeader(req: RestRequest): number | undefined {
  const raw = req.headers?.['if-match'];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const version = parseInt(trimmed, 10);
  return version;
}

/**
 * PUT /api/v1/{plural}/:id — update an object.
 *
 * Accepts an optional `If-Match: <version>` header. When present, the
 * version is forwarded as `expectedVersion` to `ObjectManager.update`,
 * enabling optimistic concurrency. A stale version yields
 * `VERSION_CONFLICT` → `412 Precondition Failed`.
 */
function generateUpdateRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'PUT',
    pattern: `/api/v1/${plural}/:id`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;
        const id = req.params['id']!;

        // Parse If-Match header
        const ifMatch = parseIfMatchHeader(req);
        if (ifMatch !== undefined && Number.isNaN(ifMatch)) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: 'If-Match header must be an integer version number',
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Authorize
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'editor',
          `${fgaType}:${id}`,
          user.tenantId,
        );
        if (!allowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Access denied to update ${typeName} ${id}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        const properties = (req.body as Record<string, unknown>) ?? {};

        // Write-side field permissions: a caller who cannot READ a field
        // must not be able to OVERWRITE it. Without this, an 'editor' can
        // overwrite @sensitive fields they cannot see, bypassing the column
        // policy that redaction enforces on reads. The check uses the same
        // getVisibleFields set that redaction uses — if a field is not
        // visible, it is not writable.
        const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
        if (visibleFields) {
          const writableFields = new Set(visibleFields);
          // _id, _version, _type, _tenantId, _createdAt, _updatedAt, _deletedAt
          // are system fields — always excluded from user writes.
          const systemFields = new Set(['_id', '_version', '_type', '_tenantId', '_createdAt', '_updatedAt', '_deletedAt']);
          const attemptedFields = Object.keys(properties).filter(f => !systemFields.has(f));
          const blocked = attemptedFields.filter(f => !writableFields.has(f));
          if (blocked.length > 0) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: `Cannot write redacted fields: ${blocked.join(', ')}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
        }

        const updated = await deps.objectManager.update(
          typeName,
          id,
          properties,
          requestContext,
          undefined,
          ifMatch,
        );

        let restObj = objectToRest(updated, obj);

        // Field-level redaction
        const redacted = deps.authorizationService.redactFields(
          user.id,
          user.roles,
          typeName,
          restObj,
        );
        restObj = redacted.data as Record<string, unknown>;
        restObj._redactedFields = redacted._redactedFields.length > 0 ? redacted._redactedFields : null;

        return {
          status: 200,
          body: { data: restObj },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * DELETE /api/v1/{plural}/:id — delete an object (soft by default).
 *
 * Accepts an optional `If-Match: <version>` header. Since the SPI
 * `deleteObject` signature does not accept `expectedVersion`, this
 * handler does a fetch-then-compare: the object is loaded, its
 * `_version` is compared to the If-Match value, and a mismatch yields
 * `412 Precondition Failed`.
 */
function generateDeleteRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'DELETE',
    pattern: `/api/v1/${plural}/:id`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;
        const id = req.params['id']!;

        // Parse If-Match header
        const ifMatch = parseIfMatchHeader(req);
        if (ifMatch !== undefined && Number.isNaN(ifMatch)) {
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: 'If-Match header must be an integer version number',
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Authorize
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'editor',
          `${fgaType}:${id}`,
          user.tenantId,
        );
        if (!allowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Access denied to delete ${typeName} ${id}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Fetch-then-check for If-Match (SPI deleteObject has no expectedVersion)
        if (ifMatch !== undefined) {
          const existing = await deps.objectManager.get(typeName, id, requestContext);
          if (!existing) {
            return createRestErrorResponse({
              code: 'OBJECT_NOT_FOUND',
              category: 'not_found',
              message: `${typeName} ${id} not found`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
          if (existing._version !== ifMatch) {
            return createRestErrorResponse({
              code: 'VERSION_CONFLICT',
              category: 'precondition',
              message: `Version mismatch: expected ${ifMatch}, found ${existing._version}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
        }

        const mode = (req.query['mode'] as string | undefined) === 'hard' ? 'hard' : 'soft';
        await deps.objectManager.delete(typeName, id, mode, requestContext);

        return {
          status: 204,
          body: {},
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * GET /api/v1/{plural}/:id/links/:linkType — linked objects.
 */
function generateLinksRoute(
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}/:id/links/:linkType`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const id = req.params['id']!;
        const linkType = req.params['linkType']!;

        // Authorize — user must have view access to the parent object
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'viewer',
          `${fgaType}:${id}`,
          user.tenantId,
        );
        if (!allowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Access denied to ${plural} ${id}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        const { offset, limit, after } = parsePagination(req.query);
        const direction = (req.query['direction'] as string) || 'outbound';

        const linkPage = await deps.linkManager.getLinks(
          id,
          linkType,
          direction as 'inbound' | 'outbound',
          after ? { limit, offset, after } : { limit, offset },
          requestContext,
        );

        // Field-level redaction on link properties
        const redacted = deps.authorizationService.redactFieldsBatch(
          user.id,
          user.roles,
          linkType,
          linkPage.items as unknown as Record<string, unknown>[],
        );
        const data = redacted.map((r: { data: Record<string, unknown> }) => r.data);

        return {
          status: 200,
          body: {
            data,
            pagination: {
              totalCount: linkPage.totalCount,
              limit,
              offset,
              hasNextPage: linkPage.hasNextPage,
              hasPreviousPage: offset > 0,
              // Opaque cursor the client passes back as ?after= to fetch the
              // next page. Absent when there is no next page — same contract
              // as the GraphQL Connection.endCursor / LinkPage.cursor.
              cursor: linkPage.cursor ?? null,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * GET /api/v1/{plural}/:id/history — version history.
 */
function generateHistoryRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}/:id/history`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;
        const id = req.params['id']!;

        // Authorize — user must have view access to the object
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'viewer',
          `${fgaType}:${id}`,
          user.tenantId,
        );
        if (!allowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Access denied to ${typeName} ${id}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // ?asOf=<ISO-8601> — the single version that was live at that instant.
        //
        // getObjectAtTime is implemented by both providers and covered by the
        // conformance suite, but nothing above the SPI called it, so the
        // question temporal storage exists to answer ("what did this look like
        // on the 3rd?") had no route. Answered here rather than on a new
        // endpoint because it is the same question the version list answers,
        // narrowed to one point — so it inherits the authorization, redaction
        // and consent path above unchanged.
        const asOfRaw = typeof req.query['asOf'] === 'string' ? req.query['asOf'] : undefined;
        if (asOfRaw !== undefined) {
          // Rejected rather than coerced: Date.parse('last tuesday') is NaN,
          // but Date.parse('2026') silently means January 1st. A timestamp the
          // caller did not mean is worse than an error, because the answer
          // still looks like a real record.
          if (Number.isNaN(Date.parse(asOfRaw))) {
            return createRestErrorResponse({
              code: 'VALIDATION_ERROR',
              category: 'validation',
              message: `asOf must be an ISO-8601 timestamp, got "${asOfRaw}"`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }

          const atTime = await deps.storage.getObjectAtTime(requestContext, typeName, id, asOfRaw);
          if (!atTime) {
            return createRestErrorResponse({
              code: 'OBJECT_NOT_FOUND',
              category: 'not_found',
              message: `${typeName} ${id} did not exist at ${asOfRaw}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }

          const shaped = objectToRest(atTime, obj);
          const redactedAtTime = deps.authorizationService.redactFields(
            user.id, user.roles, typeName, shaped,
          );
          const data = redactedAtTime.data as Record<string, unknown>;
          data._redactedFields = redactedAtTime._redactedFields.length > 0
            ? redactedAtTime._redactedFields
            : null;
          data._version = atTime._version;
          data._updatedAt = atTime._updatedAt;
          data._actorId = atTime._actorId ?? null;

          if (deps.consentService && isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
            const consent = await deps.consentService.checkSingleObject(
              data, id, DEFAULT_CONSENT_PURPOSE as DataPurpose, user.id, requestContext.tenantId,
            );
            if (consent._consentRestricted) {
              return { status: 200, body: { data: [] } };
            }
          }

          return { status: 200, body: { data: [data] } };
        }

        // Get current object to determine version count
        const current = await deps.objectManager.get(typeName, id, requestContext);
        if (!current) {
          return createRestErrorResponse({
            code: 'OBJECT_NOT_FOUND',
            category: 'not_found',
            message: `${typeName} ${id} not found`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Batch fetch all versions in a single query instead of N+1
        const versions = await deps.storage.getObjectHistory(
          requestContext,
          typeName,
          id,
        );

        // Field-level redaction on each version, preserving version metadata
        const redacted = deps.authorizationService.redactFieldsBatch(
          user.id,
          user.roles,
          typeName,
          versions.map((item: OntologyObject) => objectToRest(item, obj)),
        );

        let items = redacted.map((r: RedactionResult<Record<string, unknown>>, i: number) => {
          const data = r.data as Record<string, unknown>;
          // Preserve version metadata for history entries
          data._version = versions[i]?._version;
          data._updatedAt = versions[i]?._updatedAt;
          data._actorId = versions[i]?._actorId ?? null;
          data._redactedFields = r._redactedFields.length > 0 ? r._redactedFields : null;
          data._consentRestricted = false;
          return data;
        });

        // Consent filtering — only for types that have a data subject.
        if (deps.consentService && isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
          const getPrimaryId = (item: Record<string, unknown>) => String(item._id ?? '');
          const consentResult = await deps.consentService.filterList(
            items,
            getPrimaryId,
            DEFAULT_CONSENT_PURPOSE as DataPurpose,
            user.id,
            requestContext.tenantId,
          );
          items = consentResult.edges;
        }

        return {
          status: 200,
          body: {
            data: items,
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * POST /api/v1/{plural}/aggregate — aggregate query.
 */
function generateAggregateRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'POST',
    // A read expressed as POST because it carries a body — audited as a query.
    readOperation: 'query',
    pattern: `/api/v1/${plural}/aggregate`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;

        // Authorization: restrict aggregation to authorized objects
        const allowedIds = await resolveAllowedIds(deps, user.id, fgaType, user.tenantId);
        if (allowedIds.length === 0) {
          return { status: 200, body: { data: { groups: [], totalGroups: 0 } } };
        }

        const body = (req.body ?? {}) as Record<string, unknown>;

        // Build AggregateQuery from body
        const rawFields = (body['fields'] ?? []) as Array<{ field: string; fn: string; alias?: string; percentile?: number }>;
        const groupBy = body['groupBy'] as string[] | undefined;
        const rawBuckets = body['buckets'] as Array<{ field: string; interval?: string; min?: number; max?: number; numBuckets?: number; alias?: string }> | undefined;

        const userFilter = body['filter'] as FilterExpression | undefined;
        const orderBy = body['orderBy'] as { field: string; direction: 'asc' | 'desc' }[] | undefined;

        // A field name the schema does not have must be refused here, because
        // the two providers disagree on what to do with it: Postgres builds
        // SUM("no_such_column") and raises, while the memory provider finds
        // nothing and returns a null group — a silent wrong answer. @computed
        // fields land here too: they are query-time values with no column, so
        // aggregating one is not supported and should say so rather than
        // depend on which backend is configured.
        const aggregatable = new Set(
          obj.fields
            .filter(f => !f.directives.some(d => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
            .map(f => f.name),
        );
        // orderBy may reference either a groupBy key (a schema field) or an
        // aggregate alias. An alias is the explicit `alias` on a field/bucket
        // or the default `${fn}_${field}` / `${field}` form the providers use.
        // Without this allowance, "top N groups by the measure" — the core
        // pivot operation — is rejected even though both providers implement it.
        const aliasNames = new Set<string>();
        for (const f of rawFields) {
          if (f.field === '*') continue;
          aliasNames.add(f.alias ?? `${f.fn.toLowerCase()}_${f.field}`);
        }
        for (const b of rawBuckets ?? []) {
          aliasNames.add(b.alias ?? b.field);
        }
        const namedFields = [
          ...rawFields.filter(f => f.field !== '*').map(f => f.field),
          ...(groupBy ?? []),
          ...(rawBuckets ?? []).map(b => b.field),
        ];
        const unknown = namedFields.filter(f => !f.startsWith('_') && !aggregatable.has(f));
        const unknownOrderBy = (orderBy ?? [])
          .map(o => o.field)
          .filter(f => !f.startsWith('_') && !aggregatable.has(f) && !aliasNames.has(f));
        if (unknown.length > 0 || unknownOrderBy.length > 0) {
          const all = [...unknown, ...unknownOrderBy];
          return createRestErrorResponse({
            code: 'VALIDATION_ERROR',
            category: 'validation',
            message: `Cannot aggregate on ${all.join(', ')}: not an aggregatable field of ${typeName}. Computed and link fields have no stored value to aggregate.`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Field-level authorization: reject aggregation over redacted fields
        // Check aggregate fields, groupBy, buckets, and filter predicates.
        // orderBy may reference an aggregate alias (e.g. "total") which is not
        // a schema field and therefore not in visibleFields; the underlying
        // field it derives from is already checked above, so aliases are safe.
        const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
        if (visibleFields) {
          const allRequestedFields = [
            ...rawFields.filter(f => f.field !== '*').map(f => f.field),
            ...(groupBy ?? []),
            ...(rawBuckets ?? []).map(b => b.field),
            ...collectFilterFields(userFilter),
            ...(orderBy ?? []).map(o => o.field).filter(f => !aliasNames.has(f)),
          ];
          const blocked = allRequestedFields.filter(f => !visibleFields.has(f));
          if (blocked.length > 0) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: `Cannot aggregate over redacted fields: ${blocked.join(', ')}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
        }

        const fields: AggregateField[] = rawFields.map((f) => ({
          field: f.field,
          fn: f.fn.toLowerCase() as AggregateFunction,
          alias: f.alias,
          ...(typeof f.percentile === 'number' ? { percentile: f.percentile } : {}),
        }));

        // HAVING — predicates over aggregate aliases. An alias the request did
        // not define is refused here: Postgres would raise on the re-emitted
        // expression while the memory provider would treat the missing value as
        // null and silently drop every group, so the two would disagree.
        const rawHaving = body['having'];
        let having: AggregateHaving[] | undefined;
        if (rawHaving !== undefined) {
          if (!Array.isArray(rawHaving)) {
            return createRestErrorResponse({
              code: 'VALIDATION_ERROR',
              category: 'validation',
              message: 'having must be an array of {alias, operator, value}',
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
          const ops = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
          const parsed: AggregateHaving[] = [];
          for (const raw of rawHaving as Array<Record<string, unknown>>) {
            const alias = typeof raw['alias'] === 'string' ? raw['alias'] : undefined;
            const operator = typeof raw['operator'] === 'string' ? raw['operator'].toLowerCase() : undefined;
            const value = raw['value'];
            if (!alias || !aliasNames.has(alias)) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR',
                category: 'validation',
                message: `having alias '${String(alias)}' is not one of the requested aggregates: ${[...aliasNames].join(', ')}`,
                retryable: false,
                traceId: requestContext.traceId,
              });
            }
            if (!operator || !ops.has(operator)) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR',
                category: 'validation',
                message: `having operator must be one of: ${[...ops].join(', ')}`,
                retryable: false,
                traceId: requestContext.traceId,
              });
            }
            if (value !== null && typeof value !== 'number') {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR',
                category: 'validation',
                message: 'having value must be a number or null',
                retryable: false,
                traceId: requestContext.traceId,
              });
            }
            parsed.push({ alias, operator: operator as AggregateHaving['operator'], value });
          }
          if (parsed.length > 0) having = parsed;
        }

        // Consent gate: for consent-subject types, constrain the aggregate to
        // consented records only (parity with the GraphQL aggregate resolver).
        const consentedIds = await resolveConsentedIds(
          deps, typeName, allowedIds, userFilter, user.id, requestContext,
        );
        if (consentedIds.length === 0) {
          return { status: 200, body: { data: { groups: [], totalGroups: 0 } } };
        }
        const combinedFilter = buildAuthFilter(consentedIds, userFilter);

        const query: AggregateQuery = {
          fields,
          groupBy,
          buckets: rawBuckets?.map(b => {
            if (b.interval !== undefined) {
              return {
                field: b.field,
                interval: b.interval.toLowerCase() as BucketInterval,
                alias: b.alias,
              };
            }
            // NumericBucket — validate at the boundary.
            const min = Number(b.min);
            const max = Number(b.max);
            const numBuckets = Number(b.numBuckets);
            if (!isFinite(min) || !isFinite(max) || !isFinite(numBuckets)) {
              throw new Error(`NumericBucket for field "${b.field}" requires numeric min, max, and numBuckets`);
            }
            if (numBuckets <= 0) {
              throw new Error(`NumericBucket for field "${b.field}" numBuckets must be positive`);
            }
            if (min >= max) {
              throw new Error(`NumericBucket for field "${b.field}" min must be less than max`);
            }
            return {
              field: b.field,
              min,
              max,
              numBuckets,
              alias: b.alias,
            };
          }),
          filter: combinedFilter,
          ...(having ? { having } : {}),
          orderBy,
          limit: body['limit'] as number | undefined,
          offset: body['offset'] as number | undefined,
        };

        const result = await deps.objectManager.aggregate(typeName, query, requestContext);

        return {
          status: 200,
          body: { data: result },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * GET /api/v1/{plural}/search?q=term&fields=f1,f2&limit=20&offset=0 — full-text search.
 */
function generateSearchRoute(
  obj: ObjectType,
  plural: string,
  fgaType: string,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'GET',
    pattern: `/api/v1/${plural}/search`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const typeName = obj.name;

        const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
        if (!q || q.trim().length === 0) {
          return createRestErrorResponse({
            code: 'MISSING_QUERY',
            category: 'validation',
            message: 'The "q" query parameter is required for search',
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Authorization: restrict search to authorized objects
        const allowedIds = await resolveAllowedIds(deps, user.id, fgaType, user.tenantId);
        if (allowedIds.length === 0) {
          const { offset, limit } = parsePagination(req.query);
          return {
            status: 200,
            body: {
              data: [],
              pagination: { totalCount: 0, limit, offset, hasNextPage: false, hasPreviousPage: false },
            },
          };
        }

        const authFilter = buildAuthFilter(allowedIds);

        // Parse fields from comma-separated string
        const fieldsRaw = typeof req.query['fields'] === 'string' ? req.query['fields'] : undefined;
        const fields = fieldsRaw ? fieldsRaw.split(',').map((f) => f.trim()).filter((f) => f.length > 0) : undefined;

        // SEC-14: Validate search fields against redacted fields
        const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
        if (visibleFields && fields) {
          const searchViolations = fields.filter(f => !f.startsWith('_') && !visibleFields.has(f));
          if (searchViolations.length > 0) {
            return createRestErrorResponse({
              code: 'ACCESS_DENIED',
              category: 'authorization',
              message: `Cannot search on redacted fields: ${searchViolations.join(', ')}`,
              retryable: false,
              traceId: requestContext.traceId,
            });
          }
        }

        // SEC-14b: When no explicit search fields and redaction is active,
        // restrict search to visible fields only (prevents hidden field leakage).
        //
        // Intersected with the type's text fields — see the twin in
        // graphql/resolver-generator.ts. The column policy lists what a role may
        // SEE, which includes the @primary alias and non-text columns; neither
        // can carry a substring match.
        let searchFields = fields;
        if (!searchFields && visibleFields) {
          const textFields = searchableTextFields(obj, deps.schema);
          searchFields = [...visibleFields].filter(f => textFields.has(f));
        }

        const { offset, limit } = parsePagination(req.query);

        type Hit = { object: OntologyObject; score: number };
        type ShapedHit = { node: Record<string, unknown>; score: number };
        const searchWith = (l: number, o: number): SearchQuery => ({
          query: q, fields: searchFields, filter: authFilter, limit: l, offset: o,
        });
        const mapHits = (rawHits: Hit[]): ShapedHit[] => {
          const redacted = deps.authorizationService.redactFieldsBatch(
            user.id, user.roles, typeName,
            rawHits.map((h) => objectToRest(h.object, obj)),
          );
          return redacted.map((r: RedactionResult<Record<string, unknown>>, i: number) => {
            const data = r.data as Record<string, unknown>;
            data._redactedFields = r._redactedFields.length > 0 ? r._redactedFields : null;
            data._consentRestricted = false;
            return { node: data, score: rawHits[i]!.score };
          });
        };

        let hits: ShapedHit[];
        let totalCount: number;
        let hasNextPage: boolean;

        if (deps.consentService && isConsentSubjectType(typeName, deps.consentSubjectTypes)) {
          const getPrimaryId = (hit: ShapedHit) => String(hit.node._id ?? '');
          const result = await paginateWithConsent<Hit, ShapedHit>(
            offset,
            limit,
            async (windowLimit) => {
              const r = await deps.objectManager.search(typeName, searchWith(windowLimit, 0), requestContext);
              return { items: r.hits as Hit[], total: r.totalCount };
            },
            async (rawHits) => {
              const consentResult = await deps.consentService!.filterList(
                mapHits(rawHits), getPrimaryId, DEFAULT_CONSENT_PURPOSE as DataPurpose,
                user.id, requestContext.tenantId,
              );
              return consentResult.edges as ShapedHit[];
            },
          );
          hits = result.items;
          totalCount = result.totalCount;
          hasNextPage = result.hasNextPage;
        } else {
          const r = await deps.objectManager.search(typeName, searchWith(limit, offset), requestContext);
          hits = mapHits(r.hits as Hit[]);
          totalCount = r.totalCount;
          hasNextPage = offset + hits.length < totalCount;
        }

        return {
          status: 200,
          body: {
            data: hits,
            pagination: {
              totalCount,
              limit,
              offset,
              hasNextPage,
              hasPreviousPage: offset > 0,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

// ─── Action routes ───

/**
 * POST /api/v1/actions/{ActionName} — execute action.
 */
function generateActionRoute(
  action: ActionType,
  schema: ParsedSchema,
  deps: ApiDependencies,
): RestRoute {
  return {
    method: 'POST',
    pattern: `/api/v1/actions/${action.name}`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const input = (req.body ?? {}) as Record<string, unknown>;

        const actor: ActionActor = {
          id: user.id,
          type: 'user',
          roles: user.roles,
          markings: user.markings ?? [],
        };

        // Derive consent from action schema — if the action has a @param whose
        // type is a configured consent-subject type (default Patient), check
        // consent for that subject under the deployment's default purpose.
        const subjectTypes = deps.consentSubjectTypes ?? DEFAULT_CONSENT_SUBJECT_TYPES;
        const subjectParam = action.fields.find(
          f => isParamField(f) && subjectTypes.includes(f.type.name),
        );
        const consentSubjectId = subjectParam
          ? String(input[subjectParam.name] ?? '')
          : undefined;
        // Optimistic concurrency: If-Match carries the object version the
        // caller decided on (RFC 9110 conditional request). A non-numeric or
        // absent value simply leaves the check off.
        const ifMatch = req.headers?.['if-match'];
        const expectedVersion = ifMatch !== undefined
          ? Number.parseInt(String(ifMatch).replace(/^W\/|"/g, ''), 10)
          : Number.NaN;

        const actionCtx: ActionContext = {
          requestContext,
          ...(consentSubjectId ? {
            consentPurpose: DEFAULT_CONSENT_PURPOSE,
            consentSubjectId,
          } : {}),
          ...(Number.isInteger(expectedVersion) ? { expectedVersion } : {}),
        };

        // Resolve manifest from registry — fail closed if not found
        const manifest = deps.manifestRegistry?.get(action.name);
        if (!manifest) {
          return createRestErrorResponse({
            code: 'MANIFEST_NOT_FOUND',
            category: 'not_found',
            message: `No manifest registered for action "${action.name}"`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        const result = await deps.actionExecutor.execute(
          manifest,
          input,
          actor,
          actionCtx,
          schema,
          { dryRun: req.query['dryRun'] === 'true' },
        );

        // A refused write must answer with its HTTP status, not 200-with-a-body.
        // The route accepts `If-Match`, so a stale assertion owes the caller a
        // 412: that is the whole point of a conditional request, and a client
        // acting on the status alone would otherwise record the write as
        // applied. Only precondition/conflict failures are mapped — the other
        // in-band failure codes have always answered 200 and changing them is
        // a contract decision, not this fix.
        const refusal = result.success
          ? undefined
          : result.errors.find(e => {
              const category = mapCodeToCategory(e.code);
              return category === 'precondition' || category === 'conflict';
            });

        return {
          status: refusal ? mapErrorToHttpStatus(mapCodeToCategory(refusal.code)) : 200,
          body: {
            data: {
              success: result.success,
              actionId: result.actionId,
              errors: result.errors.length > 0 ? result.errors : null,
              affectedObjects: result.affectedObjects.map(o => ({
                typeName: o.type,
                id: o.id,
                changeType: o.changeType.toUpperCase(),
              })),
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/**
 * GET /api/v1/actions?objectType=X&objectId=Y — per-object action applicability.
 *
 * Returns the names of actions that target the given object (have a @param
 * whose type is that ObjectType), filtered by FGA viewer access. This lets a
 * right-click row menu show only the actions that could apply to that row
 * without trial execution.
 */
function generateApplicableActionsRoute(
  schema: ParsedSchema,
  deps: ApiDependencies,
): RestRoute {
  // Pre-compute: for each ObjectType, which actions target it?
  const actionsByTargetType = new Map<string, string[]>();
  for (const action of schema.actionTypes) {
    for (const field of action.fields) {
      const isParam = field.directives.some((d) => d.kind === 'param');
      if (!isParam) continue;
      if (schema.objectTypes.some((ot) => ot.name === field.type.name)) {
        const list = actionsByTargetType.get(field.type.name) ?? [];
        list.push(action.name);
        actionsByTargetType.set(field.type.name, list);
        break;
      }
    }
  }

  return {
    method: 'GET',
    pattern: '/api/v1/actions',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const objectType = req.query['objectType'] as string | undefined;
        const objectId = req.query['objectId'] as string | undefined;

        if (!objectType || !objectId) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'Both objectType and objectId query parameters are required',
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        const candidates = actionsByTargetType.get(objectType) ?? [];
        if (candidates.length === 0) {
          return { status: 200, body: { data: [] } };
        }

        // FGA viewer check — fail-closed
        const fgaType = toSnakeCase(objectType);
        const allowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'viewer',
          `${fgaType}:${objectId}`,
          user.tenantId,
        );
        if (!allowed) {
          return { status: 200, body: { data: [] } };
        }

        return { status: 200, body: { data: candidates } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

// ─── Function routes ───

/**
 * POST /api/v1/functions/{Name}
 *
 * Delegates to invokeFunction, the same entry point generateFunctionResolver
 * uses, so the role gate and the audit record are the function's rather than
 * the transport's — a control tightened on one path cannot silently stay loose
 * on the other.
 */
function generateFunctionRoute(fn: FunctionType, deps: ApiDependencies): RestRoute {
  return {
    method: 'POST',
    pattern: `/api/v1/functions/${fn.name}`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const data = await invokeFunction(fn, deps, ctx, (req.body ?? {}) as Record<string, unknown>);
        return { status: 200, body: { data } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

// ─── Object Set routes ───

function objectSetToRest(def: ObjectSetDefinition): Record<string, unknown> {
  return {
    id: def.id,
    name: def.name,
    description: def.description ?? null,
    objectType: def.objectType,
    filter: def.filter ?? null,
    orderBy: def.orderBy ?? null,
    limit: def.limit ?? null,
    aggregation: def.aggregation ?? null,
    isPublic: def.isPublic,
    sharedWithUsers: def.sharedWithUsers ?? null,
    sharedWithGroups: def.sharedWithGroups ?? null,
    createdBy: def.createdBy,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

/**
 * Validate an object-set definition body against the schema.
 *
 * Create previously took the body on trust: a set could name a type that does
 * not exist, filter or sort on a field that does not exist, or carry a
 * negative limit — none of which fails until execute time, on a different
 * request, with an error that points at the reader rather than the author.
 * Returns an error message, or null when the body is acceptable.
 */
function validateObjectSetBody(
  schema: ParsedSchema,
  body: Record<string, unknown>,
): string | null {
  const name = body['name'];
  if (typeof name !== 'string' || name.trim() === '') return 'name is required and must be a non-empty string';

  const objectType = body['objectType'];
  if (typeof objectType !== 'string' || objectType.trim() === '') return 'objectType is required and must be a non-empty string';
  const obj = schema.objectTypes.find(o => o.name === objectType);
  if (!obj) return `objectType "${objectType}" is not in the schema`;

  if (body['description'] !== undefined && typeof body['description'] !== 'string') {
    return 'description must be a string';
  }
  if (body['isPublic'] !== undefined && typeof body['isPublic'] !== 'boolean') {
    return 'isPublic must be a boolean';
  }
  if (body['limit'] !== undefined) {
    const limit = body['limit'];
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
      return 'limit must be a positive integer';
    }
  }
  for (const key of ['sharedWithUsers', 'sharedWithGroups'] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || v.trim() === '')) {
      return `${key} must be an array of non-empty strings`;
    }
  }

  // Field references must name real, stored fields — the same rule the
  // aggregate routes apply, for the same provider-disagreement reason.
  const queryable = new Set(
    obj.fields
      .filter(f => !f.directives.some(d => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
      .map(f => f.name),
  );
  const known = (field: string): boolean => field.startsWith('_') || queryable.has(field);

  const orderBy = body['orderBy'];
  if (orderBy !== undefined) {
    if (!Array.isArray(orderBy)) return 'orderBy must be an array of {field, direction}';
    for (const entry of orderBy as Array<Record<string, unknown>>) {
      const field = entry?.['field'];
      if (typeof field !== 'string' || !known(field)) {
        return `orderBy field "${String(field)}" is not a stored field of ${objectType}`;
      }
      const direction = entry['direction'];
      if (direction !== undefined && direction !== 'asc' && direction !== 'desc') {
        return 'orderBy direction must be asc or desc';
      }
    }
  }

  const filter = body['filter'];
  if (filter !== undefined) {
    if (typeof filter !== 'object' || filter === null) return 'filter must be an object';
    const unknownFilterFields = collectFilterFields(filter as FilterExpression).filter(f => !known(f));
    if (unknownFilterFields.length > 0) {
      return `filter references unknown field(s) of ${objectType}: ${unknownFilterFields.join(', ')}`;
    }
  }

  const aggregation = body['aggregation'] as AggregateQuery | undefined;
  if (aggregation !== undefined) {
    if (typeof aggregation !== 'object' || aggregation === null) return 'aggregation must be an object';
    if (!Array.isArray(aggregation.fields) || aggregation.fields.length === 0) {
      return 'aggregation.fields must be a non-empty array';
    }
    const aggFieldNames = [
      ...aggregation.fields.filter(f => f.field !== '*').map(f => f.field),
      ...(aggregation.groupBy ?? []),
      ...(aggregation.buckets ?? []).map(b => b.field),
    ];
    const unknownAgg = aggFieldNames.filter(f => typeof f !== 'string' || !known(f));
    if (unknownAgg.length > 0) {
      return `aggregation references unknown field(s) of ${objectType}: ${unknownAgg.join(', ')}`;
    }
  }

  return null;
}

function generateObjectSetRoutes(schema: ParsedSchema, deps: ApiDependencies): RestRoute[] {
  return [
    // GET /api/v1/object-sets — list
    {
      method: 'GET',
      pattern: '/api/v1/object-sets',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return { status: 200, body: { data: [] } };
          }
          const objectType = typeof req.query['objectType'] === 'string' ? req.query['objectType'] : undefined;
          const defs = await deps.objectSetManager.list(objectType, ctx.requestContext);
          return { status: 200, body: { data: defs.map(objectSetToRest) } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // GET /api/v1/object-sets/:id — get
    {
      method: 'GET',
      pattern: '/api/v1/object-sets/:id',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const id = req.params['id']!;
          const def = await deps.objectSetManager.get(id, ctx.requestContext);
          if (!def) {
            return createRestErrorResponse({
              code: 'OBJECT_SET_NOT_FOUND',
              category: 'not_found',
              message: `Object set ${id} not found`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          return { status: 200, body: { data: objectSetToRest(def) } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // POST /api/v1/object-sets — create
    {
      method: 'POST',
      pattern: '/api/v1/object-sets',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const body = (req.body ?? {}) as Record<string, unknown>;
          const invalid = validateObjectSetBody(schema, body);
          if (invalid) {
            return createRestErrorResponse({
              code: 'VALIDATION_ERROR',
              category: 'validation',
              message: invalid,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const def = await deps.objectSetManager.create(
            {
              name: body['name'] as string,
              description: body['description'] as string | undefined,
              objectType: body['objectType'] as string,
              filter: body['filter'] as FilterExpression | undefined,
              orderBy: body['orderBy'] as { field: string; direction: 'asc' | 'desc' }[] | undefined,
              limit: body['limit'] as number | undefined,
              aggregation: body['aggregation'] as AggregateQuery | undefined,
              isPublic: (body['isPublic'] as boolean) ?? false,
              sharedWithUsers: body['sharedWithUsers'] as string[] | undefined,
              sharedWithGroups: body['sharedWithGroups'] as string[] | undefined,
              createdBy: ctx.user.id,
              tenantId: ctx.requestContext.tenantId,
            },
            ctx.requestContext,
          );
          return { status: 201, body: { data: objectSetToRest(def) } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // PUT /api/v1/object-sets/:id — update
    {
      method: 'PUT',
      pattern: '/api/v1/object-sets/:id',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const id = req.params['id']!;
          const body = (req.body ?? {}) as Record<string, unknown>;
          const ALLOWED_UPDATE_FIELDS = new Set([
            'name', 'description', 'filter', 'orderBy', 'limit', 'aggregation', 'isPublic',
            // Sharing is an update, not a separate route: the creator is the
            // only principal the store lets mutate a set, which is exactly the
            // authorization sharing needs.
            'sharedWithUsers', 'sharedWithGroups',
          ]);
          const updates: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && ALLOWED_UPDATE_FIELDS.has(key)) {
              updates[key] = value;
            }
          }
          for (const key of ['sharedWithUsers', 'sharedWithGroups'] as const) {
            const value = updates[key];
            if (value === undefined) continue;
            if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || v.trim() === '')) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR',
                category: 'validation',
                message: `${key} must be an array of non-empty strings`,
                retryable: false,
                traceId: ctx.requestContext.traceId,
              });
            }
          }
          const def = await deps.objectSetManager.update(id, updates, ctx.requestContext);
          return { status: 200, body: { data: objectSetToRest(def) } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // DELETE /api/v1/object-sets/:id — delete
    {
      method: 'DELETE',
      pattern: '/api/v1/object-sets/:id',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const id = req.params['id']!;
          await deps.objectSetManager.delete(id, ctx.requestContext);
          return { status: 204, body: {} };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // GET /api/v1/object-sets/:id/execute?limit=&offset= — run saved query
    {
      method: 'GET',
      pattern: '/api/v1/object-sets/:id/execute',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const { user } = ctx;
          const id = req.params['id']!;

          // Look up the object set to determine the objectType for auth
          const def = await deps.objectSetManager.get(id, ctx.requestContext);
          if (!def) {
            return createRestErrorResponse({
              code: 'OBJECT_SET_NOT_FOUND',
              category: 'not_found',
              message: `Object set ${id} not found`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // The global REST marking gate (server.ts) keys on the route's STATIC
          // objectType, and enforce.ts treats an absent one as "nothing to
          // check". An object set names its type at RUNTIME, so these two
          // routes sailed past a control that 404s the equivalent per-type
          // route — POST a set over a marked type, then execute it.
          //
          // 404, not 403, for the same reason as everywhere else: markings
          // restrict discovery, and a 403 confirms what is being withheld.
          if (!isTypeVisible(deps.markingPolicy, user, def.objectType)) {
            await writeReadAuditFor(
              deps.auditWriter,
              { id: user.id, roles: user.roles, tenantId: user.tenantId },
              {
                type: 'read',
                objectType: def.objectType,
                query: `GET ${req.path}`,
                result: 'denied',
              },
            );
            return createRestErrorResponse({
              code: 'NOT_FOUND',
              category: 'not_found',
              message: `Object set ${id} not found`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // Validate schema type before querying storage — fail closed if unknown
          const obj = schema.objectTypes.find((o) => o.name === def.objectType);
          if (!obj) {
            return createRestErrorResponse({
              code: 'SCHEMA_TYPE_NOT_FOUND',
              category: 'system',
              message: `Object type "${def.objectType}" not found in schema`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // Authorization: restrict results to authorized objects
          const fgaType = toSnakeCase(def.objectType);
          const allowedIds = await resolveAllowedIds(deps, user.id, fgaType, user.tenantId);
          if (allowedIds.length === 0) {
            const { offset, limit } = parsePagination(req.query);
            return {
              status: 200,
              body: {
                data: [],
                pagination: { totalCount: 0, limit, offset, hasNextPage: false, hasPreviousPage: false },
              },
            };
          }

          // Field-level authorization (SEC-14): a saved set may filter or sort
          // on a field the caller cannot see. Executing it would leak the
          // hidden values through which rows come back and in what order — the
          // list and object-set aggregate routes both reject this, so does this.
          const visibleFields = deps.authorizationService.getVisibleFields(
            user.id, user.roles, def.objectType,
          );
          if (visibleFields) {
            const requestedFields = [
              ...collectFilterFields(def.filter),
              ...(def.orderBy ?? []).map(o => o.field),
            ];
            const blocked = requestedFields.filter(f => !f.startsWith('_') && !visibleFields.has(f));
            if (blocked.length > 0) {
              return createRestErrorResponse({
                code: 'FORBIDDEN',
                category: 'authorization',
                message: `Cannot execute an object set filtered or ordered by redacted fields: ${blocked.join(', ')}`,
                retryable: false,
                traceId: ctx.requestContext.traceId,
              });
            }
          }

          const { offset, limit } = parsePagination(req.query);

          // Inject auth filter into the object set's saved filter
          const authFilter = buildAuthFilter(allowedIds, def.filter);
          const mapAndRedact = (objs: OntologyObject[]): Record<string, unknown>[] =>
            deps.authorizationService
              .redactFieldsBatch(
                user.id, user.roles, def.objectType,
                objs.map((item: OntologyObject) => objectToRest(item, obj)),
              )
              .map((r: RedactionResult<Record<string, unknown>>) => {
                const data = r.data as Record<string, unknown>;
                data._redactedFields = r._redactedFields.length > 0 ? r._redactedFields : null;
                data._consentRestricted = false;
                return data;
              });

          let items: Record<string, unknown>[];
          let totalCount: number;
          let hasNextPage: boolean;

          if (deps.consentService && isConsentSubjectType(def.objectType, deps.consentSubjectTypes)) {
            const getPrimaryId = (item: Record<string, unknown>) => {
              const primaryField = obj.fields.find(f => isPrimaryField(f));
              return String(item[primaryField?.name ?? 'id'] ?? '');
            };
            const result = await paginateWithConsent<OntologyObject, Record<string, unknown>>(
              offset,
              limit,
              async (windowLimit) => {
                const scan = await deps.objectManager.query(
                  def.objectType, authFilter, { limit: windowLimit, offset: 0, orderBy: def.orderBy }, ctx.requestContext,
                );
                return { items: scan.items, total: scan.totalCount };
              },
              async (raw) => {
                const consentResult = await deps.consentService!.filterList(
                  mapAndRedact(raw), getPrimaryId, DEFAULT_CONSENT_PURPOSE as DataPurpose,
                  user.id, ctx.requestContext.tenantId,
                );
                return consentResult.edges as Record<string, unknown>[];
              },
            );
            items = result.items;
            totalCount = result.totalCount;
            hasNextPage = result.hasNextPage;
          } else {
            const page = await deps.objectManager.query(
              def.objectType, authFilter, { limit, offset, orderBy: def.orderBy }, ctx.requestContext,
            );
            items = mapAndRedact(page.items);
            totalCount = page.totalCount;
            hasNextPage = offset + items.length < totalCount;
          }

          // ?format=ndjson — return the saved object set as a downloadable
          // NDJSON dataset (parity with Foundry readTable on saved queries).
          // The handler already returned governed, redacted, consent-filtered
          // rows above; this just reformats the output.
          const formatParam = typeof req.query['format'] === 'string' ? req.query['format'] : undefined;
          if (formatParam === 'ndjson') {
            return {
              status: 200,
              headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Content-Disposition': `attachment; filename="object-set-${id}.ndjson"`,
              },
              body: items.map(r => JSON.stringify(r)).join('\n'),
            };
          }

          return {
            status: 200,
            body: {
              data: items,
              pagination: {
                totalCount,
                limit,
                offset,
                hasNextPage,
                hasPreviousPage: offset > 0,
              },
            },
          };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
    // GET /api/v1/object-sets/:id/aggregate — run saved aggregation
    {
      method: 'GET',
      pattern: '/api/v1/object-sets/:id/aggregate',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!deps.objectSetManager) {
            return createRestErrorResponse({
              code: 'NOT_CONFIGURED',
              category: 'system',
              message: 'Object set manager is not configured',
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const { user } = ctx;
          const id = req.params['id']!;

          // Look up the object set for auth scoping
          const def = await deps.objectSetManager.get(id, ctx.requestContext);
          if (!def) {
            return createRestErrorResponse({
              code: 'OBJECT_SET_NOT_FOUND',
              category: 'not_found',
              message: `Object set ${id} not found`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // The global REST marking gate (server.ts) keys on the route's STATIC
          // objectType, and enforce.ts treats an absent one as "nothing to
          // check". An object set names its type at RUNTIME, so these two
          // routes sailed past a control that 404s the equivalent per-type
          // route — POST a set over a marked type, then execute it.
          //
          // 404, not 403, for the same reason as everywhere else: markings
          // restrict discovery, and a 403 confirms what is being withheld.
          if (!isTypeVisible(deps.markingPolicy, user, def.objectType)) {
            await writeReadAuditFor(
              deps.auditWriter,
              { id: user.id, roles: user.roles, tenantId: user.tenantId },
              {
                type: 'read',
                objectType: def.objectType,
                query: `GET ${req.path}`,
                result: 'denied',
              },
            );
            return createRestErrorResponse({
              code: 'NOT_FOUND',
              category: 'not_found',
              message: `Object set ${id} not found`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          if (!def.aggregation) {
            return createRestErrorResponse({
              code: 'INVALID_OPERATION',
              category: 'validation',
              message: `Object set ${id} has no aggregation defined`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // Validate schema type before querying storage
          const aggObj = schema.objectTypes.find((o) => o.name === def.objectType);
          if (!aggObj) {
            return createRestErrorResponse({
              code: 'SCHEMA_TYPE_NOT_FOUND',
              category: 'system',
              message: `Object type "${def.objectType}" not found in schema`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          // Aggregatable-field check, the same one the per-type aggregate route
          // applies. A saved set can name a field the schema lost since it was
          // written (or never had), and the providers disagree on the result:
          // Postgres raises on the missing column while the memory provider
          // returns a null group — a silent wrong answer that looks like data.
          {
            const aggregatable = new Set(
              aggObj.fields
                .filter(f => !f.directives.some(d => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
                .map(f => f.name),
            );
            const referenced = [
              ...def.aggregation.fields.filter(f => f.field !== '*').map(f => f.field),
              ...(def.aggregation.groupBy ?? []),
              ...(def.aggregation.buckets ?? []).map(b => b.field),
              ...collectFilterFields(def.filter),
              ...collectFilterFields(def.aggregation.filter),
            ];
            const unknownAggFields = referenced.filter(f => !f.startsWith('_') && !aggregatable.has(f));
            if (unknownAggFields.length > 0) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR',
                category: 'validation',
                message: `Object set ${id} aggregates on ${unknownAggFields.join(', ')}: not an aggregatable field of ${def.objectType}. Computed and link fields have no stored value to aggregate.`,
                retryable: false,
                traceId: ctx.requestContext.traceId,
              });
            }
          }

          // Authorization: restrict aggregation to authorized objects
          const fgaType = toSnakeCase(def.objectType);
          const allowedIds = await resolveAllowedIds(deps, user.id, fgaType, user.tenantId);
          if (allowedIds.length === 0) {
            return { status: 200, body: { data: { groups: [], totalGroups: 0 } } };
          }

          // Field-level authorization: reject aggregation over redacted fields
          // Check aggregate fields, groupBy, saved filter, and aggregation filter.
          // orderBy may reference an aggregate alias (not a schema field), so
          // aliases are excluded — the underlying field is already checked.
          const aliasNames = new Set<string>();
          for (const f of def.aggregation.fields) {
            if (f.field === '*') continue;
            aliasNames.add(f.alias ?? `${f.fn}_${f.field}`);
          }
          for (const b of def.aggregation.buckets ?? []) {
            aliasNames.add(b.alias ?? b.field);
          }
          const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, def.objectType);
          if (visibleFields) {
            const allRequestedFields = [
              ...def.aggregation.fields.filter(f => f.field !== '*').map(f => f.field),
              ...(def.aggregation.groupBy ?? []),
              ...collectFilterFields(def.filter),
              ...collectFilterFields(def.aggregation.filter),
              ...(def.aggregation.orderBy ?? []).map(o => o.field).filter(f => !aliasNames.has(f)),
            ];
            const blocked = allRequestedFields.filter(f => !visibleFields.has(f));
            if (blocked.length > 0) {
              return createRestErrorResponse({
                code: 'FORBIDDEN',
                category: 'authorization',
                message: `Cannot aggregate over redacted fields: ${blocked.join(', ')}`,
                retryable: false,
                traceId: ctx.requestContext.traceId,
              });
            }
          }

          // Consent gate: for consent-subject types, constrain the aggregate to
          // consented records only — parity with the per-type aggregate route.
          // Without this, a saved aggregation over a consent-subject type
          // aggregates non-consented records.
          const consentedIds = await resolveConsentedIds(
            deps, def.objectType, allowedIds, def.filter, user.id, ctx.requestContext,
          );
          if (consentedIds.length === 0) {
            return { status: 200, body: { data: { groups: [], totalGroups: 0 } } };
          }

          // Merge consented-id filter + saved filter into the aggregation query
          const aggregation = { ...def.aggregation };
          const savedFilter = def.filter;
          const authFilter = buildAuthFilter(consentedIds, savedFilter);
          if (aggregation.filter) {
            aggregation.filter = { and: [authFilter, aggregation.filter] };
          } else {
            aggregation.filter = authFilter;
          }

          const result = await deps.objectManager.aggregate(def.objectType, aggregation, ctx.requestContext);
          return { status: 200, body: { data: result } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
  ];
}

// ─── Function Lifecycle REST routes ────────────────────────────────────

function functionRevisionToRest(rev: FunctionRevision): Record<string, unknown> {
  return {
    id: rev.id,
    functionName: rev.functionName,
    revision: rev.revision,
    status: rev.status,
    runtime: rev.runtime,
    entry: rev.entry,
    source: rev.source ?? null,
    testInputs: rev.testInputs ?? null,
    expectedOutputs: rev.expectedOutputs ?? null,
    tenantId: rev.tenantId,
    createdBy: rev.createdBy,
    createdAt: rev.createdAt,
    publishedAt: rev.publishedAt ?? null,
  };
}

function generateFunctionLifecycleRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // POST /api/v1/functions-lifecycle/revisions — create draft
  routes.push({
    method: 'POST',
    pattern: '/api/v1/functions-lifecycle/revisions',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry is not configured' } } };
        }
        const body = req.body as Record<string, unknown>;
        const rev = deps.functionRegistry.createDraft({
          functionName: body['functionName'] as string,
          runtime: body['runtime'] as string,
          entry: body['entry'] as string,
          source: body['source'] as string | undefined,
          testInputs: body['testInputs'] as Record<string, unknown>[] | undefined,
          expectedOutputs: body['expectedOutputs'] as unknown[] | undefined,
          tenantId: ctx.requestContext.tenantId,
          createdBy: ctx.user.id,
        });
        return { status: 201, body: { data: functionRevisionToRest(rev) } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/functions-lifecycle/revisions/:id — get revision
  routes.push({
    method: 'GET',
    pattern: '/api/v1/functions-lifecycle/revisions/:id',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry is not configured' } } };
        }
        const rev = deps.functionRegistry.getRevision(req.params['id']!);
        if (!rev) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Revision not found' } } };
        return { status: 200, body: { data: functionRevisionToRest(rev) } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/functions-lifecycle/revisions?functionName=Foo — list revisions
  routes.push({
    method: 'GET',
    pattern: '/api/v1/functions-lifecycle/revisions',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry is not configured' } } };
        }
        const functionName = req.query['functionName'] as string | undefined;
        if (!functionName) {
          return { status: 400, body: { error: { code: 'BAD_REQUEST', message: 'functionName query parameter is required' } } };
        }
        const revs = deps.functionRegistry.listRevisions(functionName);
        return { status: 200, body: { data: revs.map(functionRevisionToRest) } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/functions-lifecycle/revisions/:id/publish — publish draft
  routes.push({
    method: 'POST',
    pattern: '/api/v1/functions-lifecycle/revisions/:id/publish',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry is not configured' } } };
        }
        const rev = deps.functionRegistry.publish(req.params['id']!);
        return { status: 200, body: { data: functionRevisionToRest(rev) } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/functions-lifecycle/revisions/:id/test — run tests
  routes.push({
    method: 'POST',
    pattern: '/api/v1/functions-lifecycle/revisions/:id/test',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry || !deps.functionExecutor) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry or executor is not configured' } } };
        }
        const rev = deps.functionRegistry.getRevision(req.params['id']!);
        if (!rev) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Revision not found' } } };
        const fnType = deps.schema.functionTypes.find((f) => f.name === rev.functionName);
        if (!fnType) return { status: 404, body: { error: { code: 'NOT_FOUND', message: `FunctionType ${rev.functionName} not found` } } };
        const result = await deps.functionRegistry.runTests(req.params['id']!, async (input) => {
          const execResult = await deps.functionExecutor!.execute(
            rev.functionName,
            input,
          );
          return execResult.result;
        });
        return { status: 200, body: { data: result } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/functions-lifecycle/rollback — rollback to a previous revision
  routes.push({
    method: 'POST',
    pattern: '/api/v1/functions-lifecycle/rollback',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.functionRegistry) {
          return { status: 503, body: { error: { code: 'NOT_CONFIGURED', message: 'Function registry is not configured' } } };
        }
        const body = req.body as Record<string, unknown>;
        const rev = deps.functionRegistry.rollback(
          body['functionName'] as string,
          body['toRevisionId'] as string,
        );
        return { status: 200, body: { data: functionRevisionToRest(rev) } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}
