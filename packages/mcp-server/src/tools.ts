/**
 * Tool discovery and invocation adapters.
 *
 * Builds the MCP tool list from the ODL schema's ActionTypes (one tool per
 * action) plus one `search_<Type>` read tool per ObjectType. Handles
 * `tools/call` by dispatching to the ActionExecutor (for action tools) or
 * the storage provider (for read tools), under the caller's OIDC identity.
 */

import type { ActionType, ObjectType, FunctionType, FieldDefinition } from '@altius/odl';
import { deriveActionAuthzMapping, toSnakeCase } from '@altius/odl';
import type { ActionActor, ActionContext, ActionResult } from '@altius/actions';
import type { FilterExpression, OntologyObject, TraversalStep, AggregateField, AggregateFunction, AggregateHaving, AggregateQuery } from '@altius/spi';
import { resolveConsentPurpose as resolveSpiConsentPurpose } from '@altius/spi';
import type { DataPurpose } from '@altius/spi';
import type { McpTool, McpCallToolResult } from './protocol.js';
import type { McpServerDependencies, McpCaller } from './types.js';

/** Default consent subject types (mirrors ApiDependencies default). */
const DEFAULT_CONSENT_SUBJECT_TYPES: readonly string[] = ['Patient'];

/** Resolve the consent purpose from deps, falling back to the default. */
function resolveConsentPurpose(deps: McpServerDependencies): DataPurpose {
  // Any non-empty string is a purpose (DataPurpose is open). This used to test
  // `configured in DataPurpose`, which checks the five-key NHS preset, so a
  // deployment-defined purpose was silently swapped for DIRECT_CARE and an
  // agent's read was consent-checked under a purpose nobody configured.
  return resolveSpiConsentPurpose(deps.consentPurpose);
}

/** Max objects a `search_<Type>` tool returns in one call. */
const SEARCH_TOOL_LIMIT = 50;

/** Max GROUPS an `aggregate_<Type>` tool returns in one call. */
const AGGREGATE_TOOL_LIMIT = 200;

/**
 * Rows scanned to resolve consent before aggregating a consent-gated type.
 * Beyond this the aggregate is REFUSED rather than computed over a truncated
 * population: a count that silently omits records reads as a fact.
 * Mirrors CONSENT_SCAN_LIMIT in the API's aggregate paths.
 */
const AGGREGATE_CONSENT_SCAN_LIMIT = 10_000;

/** Aggregate functions the tool accepts, mirroring the SPI grammar. */
const AGGREGATE_TOOL_FNS: readonly string[] = [
  'count', 'sum', 'avg', 'min', 'max', 'count_distinct', 'stddev', 'median', 'percentile',
];

/** HAVING operators the tool accepts. */
const AGGREGATE_TOOL_HAVING_OPS: readonly string[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];

/** ODL scalar → JSON Schema type mapping for tool input schemas. */
const SCALAR_JSON_SCHEMA: Record<string, string> = {
  String: 'string',
  Int: 'integer',
  Float: 'number',
  Boolean: 'boolean',
  ID: 'string',
  DateTime: 'string',
  Date: 'string',
  Duration: 'string',
  GeoPoint: 'string',
  JSON: 'object',
  URI: 'string',
};

/**
 * Build the MCP tool list: one tool per ActionType + one `search_<Type>` per
 * ObjectType. Tools are pure data (name, description, inputSchema) — no
 * closures or handlers captured here, so the list is stable across calls.
 */
export function buildToolList(deps: McpServerDependencies): McpTool[] {
  const tools: McpTool[] = [];

  // Action tools — one per ActionType
  for (const actionType of deps.schema.actionTypes) {
    tools.push(buildActionTool(actionType));
  }

  // Function tools — one per FunctionType, but only when an invoker is wired.
  // Advertising a tool the server cannot run would make discovery lie, and an
  // agent has no way to tell the difference until the call fails.
  if (deps.functionInvoker) {
    for (const fn of deps.schema.functionTypes) {
      tools.push(buildFunctionTool(fn));
    }
  }

  // Read tools — one search_<Type> and one traverse_<Type> per ObjectType
  for (const objType of deps.schema.objectTypes) {
    tools.push(buildSearchTool(objType));
    tools.push(buildAggregateTool(objType));
    tools.push(buildTraverseTool(objType));
  }

  return tools;
}

/**
 * Build an MCP tool descriptor for a FunctionType (name `function_<Name>`).
 *
 * Inputs come from the function's @param fields, matching what
 * generateFunctionInputType already emits for GraphQL — the two surfaces must
 * advertise the same shape or an agent and a human disagree about what the
 * function takes.
 */
function buildFunctionTool(fnType: FunctionType): McpTool {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of fnType.fields) {
    const isParam = field.directives.some((d) => d.kind === 'param');
    if (!isParam) continue;

    properties[field.name] = fieldToJsonSchema(field);
    if (field.type.nonNull) required.push(field.name);
  }

  return {
    name: `function_${fnType.name}`,
    description: fnType.description ?? `Invoke the ${fnType.name} function`,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * Whether this caller satisfies the mandatory markings on an ObjectType.
 *
 * Fail-closed: no markings held means every marked type is denied, and an
 * unconfigured policy means there is nothing to enforce.
 */
function markingAllows(
  deps: McpServerDependencies,
  caller: McpCaller,
  objectType: string,
): boolean {
  const policy = deps.markingPolicy;
  if (!policy || policy.isEmpty) return true;
  const required = policy.requiredFor(objectType);
  if (required.length === 0) return true;
  return policy.check(caller.user.markings ?? [], required).allowed;
}

/**
 * The response for a tool a caller may not see.
 *
 * Deliberately identical to the unknown-tool response: a distinct "denied"
 * would tell the agent the tool exists, which is what the marking hides.
 */
function unknownTool(toolName: string): McpCallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
    isError: true,
  };
}

/**
 * Narrow the advertised tool list to what this caller could actually use.
 *
 * `tools/list` returned every tool to every authenticated caller, so a
 * read-only agent still saw the full catalogue of mutating actions and their
 * parameter schemas. Execution was denied later, so this was disclosure
 * rather than an authority hole — but for an LLM agent the tool list IS the
 * affordance: advertising writes it can never perform invites it to try, and
 * the failure surfaces as a confusing denial mid-plan instead of a capability
 * it never saw.
 *
 * What can be scoped exactly, and what cannot:
 *
 * - Function tools ARE role-gated (`requiredRoles` is the enforcement), so a
 *   role mismatch is a guaranteed denial and the tool is hidden.
 * - Action tools are gated by a per-OBJECT ReBAC relation, not by roles, so
 *   there is no role test to apply. Instead we ask OpenFGA which objects the
 *   caller holds that relation on; an empty set means every invocation would
 *   be refused, so the tool is hidden. One listObjects per ActionType per
 *   tools/list call — acceptable because discovery is infrequent, and the
 *   calls run concurrently.
 * - Read tools stay advertised for everyone: their results are FGA-scoped
 *   per object, so an unauthorized caller gets an empty page rather than a
 *   denial, and hiding them would misrepresent the ontology.
 */
export async function scopeToolList(
  tools: McpTool[],
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpTool[]> {
  const roles = caller.user.roles ?? [];

  // Mandatory markings hide a type entirely, so its read tools must not be
  // advertised either — listing search_Patient tells an agent Patient exists,
  // which is the disclosure the marking prevents.
  const hiddenTypes = new Set(
    deps.markingPolicy && !deps.markingPolicy.isEmpty
      ? deps.schema.objectTypes
          .filter((o) => !markingAllows(deps, caller, o.name))
          .map((o) => o.name)
      : [],
  );

  const allowedFunction = new Set(
    deps.schema.functionTypes
      .filter((fn) => fn.requiredRoles.some((r) => roles.includes(r)))
      .map((fn) => `function_${fn.name}`),
  );

  const objectTypeNames = new Set(deps.schema.objectTypes.map((o) => o.name));
  const actionAllowed = new Map<string, boolean>();
  await Promise.all(
    deps.schema.actionTypes.map(async (action) => {
      // Same derivation the API's authorization adapter applies at execution
      // time. Sharing it is the point: a second copy here would decide what to
      // advertise from a relation the executor does not check.
      const mapping = deriveActionAuthzMapping(action, objectTypeNames);
      if (!mapping) {
        // No ObjectType parameter means no object to check a relation against.
        // Keep advertising it; the executor still applies its own controls.
        actionAllowed.set(action.name, true);
        return;
      }
      try {
        const ids = await deps.authorizationService.listObjects(
          `user:${caller.user.id}`,
          mapping.relation,
          mapping.objectType,
          caller.user.tenantId,
        );
        // An empty set hides the tool. That is right when the caller simply
        // holds the relation on nothing — and indistinguishable from a
        // MISCONFIGURED model, because listObjects swallows an undefined
        // relation and returns [] rather than throwing. So say which relation
        // came back empty: a whole pack's tools vanishing from discovery is
        // otherwise silent, and the catch below never fires for that case.
        if (ids.length === 0) {
          deps.logger?.warn(
            { action: action.name, relation: mapping.relation, objectType: mapping.objectType },
            'MCP tools/list: hiding an action tool — the caller holds this relation on no object. ' +
              'If this is unexpected, check the relation exists in the deployed OpenFGA model.',
          );
        }
        actionAllowed.set(action.name, ids.length > 0);
      } catch (err) {
        // Fail OPEN for discovery only. A listObjects outage must not silently
        // empty an agent's toolbox and make the platform look broken; the
        // executor still refuses the call if the caller truly lacks the
        // relation, so nothing is authorized by this fallback.
        deps.logger?.warn(
          { err, action: action.name, relation: mapping.relation },
          'MCP tools/list: authorization lookup failed — advertising the tool anyway',
        );
        actionAllowed.set(action.name, true);
      }
    }),
  );

  return tools.filter((tool) => {
    for (const hidden of hiddenTypes) {
      if (tool.name === `search_${hidden}` || tool.name === `traverse_${hidden}`) return false;
    }
    if (tool.name.startsWith('function_')) return allowedFunction.has(tool.name);
    if (actionAllowed.has(tool.name)) return actionAllowed.get(tool.name) === true;
    return true; // search_/traverse_ — FGA-scoped at read time
  });
}

/**
 * Build an MCP tool descriptor for an ActionType.
 * The inputSchema is derived from the action's @param fields (JSON Schema).
 */
function buildActionTool(actionType: ActionType): McpTool {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of actionType.fields) {
    const isParam = field.directives.some((d) => d.kind === 'param');
    if (!isParam) continue;

    properties[field.name] = fieldToJsonSchema(field);
    if (field.type.nonNull) required.push(field.name);
  }

  // Advertise dry-run alongside the declared params. REST has always accepted
  // ?dryRun=true and MCP never passed it through, so an agent — the caller
  // most likely to want to preview a write before committing it — was the one
  // surface that could not. Reserved name, stripped before validation.
  properties['dryRun'] = {
    type: 'boolean',
    description: 'Validate and evaluate preconditions without committing any change.',
  };

  return {
    name: actionType.name,
    description: actionType.description ?? `Execute ${actionType.name} action`,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * Build an MCP tool descriptor for a `search_<Type>` read tool.
 * Input: { filter?: { field, operator, value }[], limit?: number }
 * The filter is a simple list of field-predicate objects that the adapter
 * composes into an SPI FilterExpression AND-tree.
 */
function buildSearchTool(objType: ObjectType): McpTool {
  return {
    name: `search_${objType.name}`,
    description: `Search ${objType.name} objects. Returns up to ${SEARCH_TOOL_LIMIT} results. Pass a 'filter' array of { field, operator, value } predicates (AND-combined), and optional 'limit' (max ${SEARCH_TOOL_LIMIT}).`,
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'array',
          description: 'AND-combined field predicates',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field name (e.g. "status", "_id")' },
              operator: {
                type: 'string',
                description: 'Filter operator',
                enum: ['eq', 'ne', 'in', 'contains', 'startsWith', 'gt', 'lt', 'gte', 'lte'],
              },
              value: { description: 'Value to compare (string, number, boolean, or array for "in")' },
            },
            required: ['field', 'operator', 'value'],
          },
        },
        limit: {
          type: 'integer',
          description: `Max results (default ${SEARCH_TOOL_LIMIT}, max ${SEARCH_TOOL_LIMIT})`,
          minimum: 1,
          maximum: SEARCH_TOOL_LIMIT,
        },
      },
    },
  };
}

/**
 * Build an `aggregate_<Type>` tool: grouped aggregation over an ObjectType.
 *
 * The provider-side aggregate has always existed and every human surface
 * (REST, GraphQL) exposes it, but an agent could only fetch rows and count
 * them itself — which caps at the search limit and therefore answers "how many
 * X" wrongly on any real dataset. The same governance the search tool applies
 * (markings, field visibility, FGA scope, consent) applies here.
 */
function buildAggregateTool(objType: ObjectType): McpTool {
  return {
    name: `aggregate_${objType.name}`,
    description:
      `Aggregate ${objType.name} objects: counts, sums, averages, min/max, distinct counts, ` +
      `standard deviation, median and percentiles, optionally grouped by fields and filtered ` +
      `by group value (having). Returns up to ${AGGREGATE_TOOL_LIMIT} groups. ` +
      `Use this instead of search_${objType.name} when the question is "how many" or "what is the total".`,
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Aggregates to compute. Use field "*" with fn "count" to count rows.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field name, or "*" for count' },
              fn: { type: 'string', enum: [...AGGREGATE_TOOL_FNS] },
              alias: { type: 'string', description: 'Result key (defaults to fn_field)' },
              percentile: { type: 'number', description: 'Fraction 0..1, required for fn "percentile"', minimum: 0, maximum: 1 },
            },
            required: ['field', 'fn'],
          },
        },
        groupBy: {
          type: 'array',
          description: 'Field names to group by',
          items: { type: 'string' },
        },
        filter: {
          type: 'array',
          description: 'AND-combined field predicates applied before grouping',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', enum: ['eq', 'ne', 'in', 'contains', 'startsWith', 'gt', 'lt', 'gte', 'lte'] },
              value: {},
            },
            required: ['field', 'operator', 'value'],
          },
        },
        having: {
          type: 'array',
          description: 'Predicates over aggregate values, applied after grouping',
          items: {
            type: 'object',
            properties: {
              alias: { type: 'string', description: 'Alias of one of the requested aggregates' },
              operator: { type: 'string', enum: [...AGGREGATE_TOOL_HAVING_OPS] },
              value: { type: 'number' },
            },
            required: ['alias', 'operator'],
          },
        },
        limit: {
          type: 'integer',
          description: `Max groups (default ${AGGREGATE_TOOL_LIMIT}, max ${AGGREGATE_TOOL_LIMIT})`,
          minimum: 1,
          maximum: AGGREGATE_TOOL_LIMIT,
        },
      },
      required: ['fields'],
    },
  };
}

/** An `aggregate_<Type>` error, shaped like the other tools' errors. */
function aggregateError(message: string): McpCallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/**
 * Invoke an `aggregate_<Type>` tool under the caller's identity.
 *
 * Order matters and mirrors the REST route: validate the request against the
 * schema (so the two storage providers cannot disagree about an unknown
 * field), then refuse fields the caller cannot read (a GROUP BY over a
 * redacted field leaks its values as group keys), then scope to the objects
 * FGA authorises, then apply consent, and only then aggregate.
 */
async function invokeAggregateTool(
  objType: ObjectType,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  const { user, requestContext } = caller;
  const typeName = objType.name;
  const fgaType = toSnakeCase(typeName);

  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};

  // ── Parse and validate aggregates ──
  const rawFields = obj['fields'];
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    return aggregateError('fields is required and must be a non-empty array of { field, fn }');
  }

  const aggregatable = new Set(
    objType.fields
      .filter(f => !f.directives.some(d => d.kind === 'link' || d.kind === 'computed' || d.kind === 'reducer'))
      .map(f => f.name),
  );
  const known = (field: string): boolean => field.startsWith('_') || aggregatable.has(field);

  const fields: AggregateField[] = [];
  const aliases = new Set<string>();
  for (const raw of rawFields as Array<Record<string, unknown>>) {
    const field = typeof raw['field'] === 'string' ? raw['field'] : undefined;
    const fn = typeof raw['fn'] === 'string' ? raw['fn'].toLowerCase() : undefined;
    if (!field || !fn) return aggregateError('each field entry needs a field name and an fn');
    if (!AGGREGATE_TOOL_FNS.includes(fn)) {
      return aggregateError(`unsupported aggregate function '${fn}'. Use one of: ${AGGREGATE_TOOL_FNS.join(', ')}`);
    }
    if (field !== '*' && !known(field)) {
      return aggregateError(`cannot aggregate on '${field}': not a stored field of ${typeName}`);
    }
    if (fn === 'percentile') {
      const p = raw['percentile'];
      if (typeof p !== 'number' || !isFinite(p) || p < 0 || p > 1) {
        return aggregateError(`fn 'percentile' needs a percentile fraction between 0 and 1 for field '${field}'`);
      }
    }
    const alias = typeof raw['alias'] === 'string' && raw['alias'] !== '' ? raw['alias'] : `${fn}_${field}`;
    aliases.add(alias);
    fields.push({
      field,
      fn: fn as AggregateFunction,
      alias,
      ...(fn === 'percentile' ? { percentile: raw['percentile'] as number } : {}),
    });
  }

  // ── groupBy ──
  const rawGroupBy = obj['groupBy'];
  let groupBy: string[] | undefined;
  if (rawGroupBy !== undefined) {
    if (!Array.isArray(rawGroupBy) || rawGroupBy.some(g => typeof g !== 'string')) {
      return aggregateError('groupBy must be an array of field names');
    }
    groupBy = rawGroupBy as string[];
    const unknownGroup = groupBy.filter(g => !known(g));
    if (unknownGroup.length > 0) {
      return aggregateError(`cannot group by ${unknownGroup.join(', ')}: not stored field(s) of ${typeName}`);
    }
  }

  // ── filter (same shape as the search tool) ──
  const parsedFilter = parseSearchArgs({ filter: obj['filter'] });
  const unknownFilterFields = parsedFilter.filterFields.filter(f => !known(f));
  if (unknownFilterFields.length > 0) {
    return aggregateError(`cannot filter on ${unknownFilterFields.join(', ')}: not stored field(s) of ${typeName}`);
  }

  // ── having ──
  const rawHaving = obj['having'];
  let having: AggregateHaving[] | undefined;
  if (rawHaving !== undefined) {
    if (!Array.isArray(rawHaving)) return aggregateError('having must be an array of { alias, operator, value }');
    const parsed: AggregateHaving[] = [];
    for (const raw of rawHaving as Array<Record<string, unknown>>) {
      const alias = typeof raw['alias'] === 'string' ? raw['alias'] : undefined;
      const operator = typeof raw['operator'] === 'string' ? raw['operator'].toLowerCase() : undefined;
      const value = raw['value'];
      if (!alias || !aliases.has(alias)) {
        return aggregateError(`having alias '${String(alias)}' is not one of the requested aggregates: ${[...aliases].join(', ')}`);
      }
      if (!operator || !AGGREGATE_TOOL_HAVING_OPS.includes(operator)) {
        return aggregateError(`having operator must be one of: ${AGGREGATE_TOOL_HAVING_OPS.join(', ')}`);
      }
      if (value !== null && value !== undefined && typeof value !== 'number') {
        return aggregateError('having value must be a number or null');
      }
      parsed.push({ alias, operator: operator as AggregateHaving['operator'], value: (value as number | null | undefined) ?? null });
    }
    if (parsed.length > 0) having = parsed;
  }

  const limit = Math.min(
    typeof obj['limit'] === 'number' && obj['limit'] > 0 ? Math.floor(obj['limit']) : AGGREGATE_TOOL_LIMIT,
    AGGREGATE_TOOL_LIMIT,
  );

  // ── Field visibility: a redacted field must not be aggregated or grouped ──
  const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
  if (visibleFields) {
    const referenced = [
      ...fields.filter(f => f.field !== '*').map(f => f.field),
      ...(groupBy ?? []),
      ...parsedFilter.filterFields,
    ];
    const violations = referenced.filter(f => !f.startsWith('_') && !visibleFields.has(f));
    if (violations.length > 0) {
      return aggregateError(`Access denied: cannot aggregate over redacted fields: ${violations.join(', ')}`);
    }
  }

  // ── FGA scope ──
  const allowedObjects = await deps.authorizationService.listObjects(
    `user:${user.id}`,
    'viewer',
    fgaType,
    user.tenantId,
  );
  const allAuthorized = allowedObjects.length === 1 && allowedObjects[0] === '*';
  const allowedIds = allAuthorized
    ? []
    : allowedObjects
        .map((o: string) => {
          const parts = o.split(':');
          return parts[parts.length - 1];
        })
        .filter((id): id is string => id !== undefined && id !== '');
  if (!allAuthorized && allowedIds.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ groups: [], totalGroups: 0 }) }],
      isError: false,
    };
  }

  const userFilter = parsedFilter.filter;
  let scopeFilter: FilterExpression;
  if (!allAuthorized) {
    const idFilter: FilterExpression = { field: '_id', operator: 'in', value: allowedIds };
    scopeFilter = userFilter ? { and: [idFilter, userFilter] } : idFilter;
  } else {
    const passThrough: FilterExpression = { field: '_deleted_at', operator: 'exists', value: false };
    scopeFilter = userFilter ? { and: [passThrough, userFilter] } : passThrough;
  }

  // ── Consent ──
  // An aggregate has no per-row output to filter, so consent has to narrow the
  // INPUT set. Resolve the consented ids first; refuse rather than answer over
  // a truncated population.
  const gated = deps.consentSubjectTypes ?? DEFAULT_CONSENT_SUBJECT_TYPES;
  if (gated.includes(typeName) && deps.consentService) {
    const scan = deps.objectManager
      ? await deps.objectManager.query(typeName, scopeFilter, { limit: AGGREGATE_CONSENT_SCAN_LIMIT + 1, offset: 0 }, requestContext)
      : await deps.storage.queryObjects(requestContext, typeName, scopeFilter, { limit: AGGREGATE_CONSENT_SCAN_LIMIT + 1, offset: 0 });
    if (scan.items.length > AGGREGATE_CONSENT_SCAN_LIMIT) {
      return aggregateError(
        `Cannot aggregate ${typeName}: more than ${AGGREGATE_CONSENT_SCAN_LIMIT} records match and consent must be ` +
        `checked per record. Narrow the filter and try again.`,
      );
    }
    const consentedIds: string[] = [];
    for (const node of scan.items as OntologyObject[]) {
      const data = node as unknown as Record<string, unknown>;
      if (await consentAllows(node, data, caller, deps)) consentedIds.push(node._id);
    }
    if (consentedIds.length === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ groups: [], totalGroups: 0 }) }],
        isError: false,
      };
    }
    const consentFilter: FilterExpression = { field: '_id', operator: 'in', value: consentedIds };
    scopeFilter = userFilter ? { and: [consentFilter, userFilter] } : consentFilter;
  }

  const query: AggregateQuery = {
    fields,
    ...(groupBy && groupBy.length > 0 ? { groupBy } : {}),
    filter: scopeFilter,
    ...(having ? { having } : {}),
    limit,
  };

  try {
    const result = deps.objectManager
      ? await deps.objectManager.aggregate(typeName, query, requestContext)
      : await deps.storage.aggregateObjects(requestContext, typeName, query);
    return {
      content: [{ type: 'text', text: JSON.stringify({ groups: result.groups, totalGroups: result.totalGroups, limit }) }],
      isError: false,
    };
  } catch (err) {
    return aggregateError(err instanceof Error ? err.message : 'Aggregate failed');
  }
}

/**
 * Convert an ODL field definition to a JSON Schema fragment.
 */
function fieldToJsonSchema(field: FieldDefinition): unknown {
  const baseType = SCALAR_JSON_SCHEMA[field.type.name];
  if (field.type.isList) {
    return {
      type: 'array',
      items: baseType ? { type: baseType } : { type: 'string', description: `Reference to ${field.type.name}` },
      ...(field.description ? { description: field.description } : {}),
    };
  }
  if (baseType) {
    return {
      type: baseType,
      ...(field.description ? { description: field.description } : {}),
    };
  }
  // Object type reference → string ID
  return {
    type: 'string',
    description: (field.description ? field.description + '. ' : '') + `ID reference to ${field.type.name}`,
  };
}

// ---------------------------------------------------------------------------
// Tool invocation
// ---------------------------------------------------------------------------

/**
 * Invoke a tool by name. Dispatches to the action executor or the storage
 * read path based on the tool name prefix.
 */
export async function invokeTool(
  toolName: string,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  // Action tool: name matches an ActionType
  const actionType = deps.schema.actionTypes.find((a) => a.name === toolName);
  if (actionType) {
    return invokeActionTool(actionType, args, caller, deps);
  }

  // Function tool: name matches function_<Name>
  if (toolName.startsWith('function_') && deps.functionInvoker) {
    const fnName = toolName.slice('function_'.length);
    const fnType = deps.schema.functionTypes.find((f) => f.name === fnName);
    if (fnType) {
      return invokeFunctionTool(fnType, args, caller, deps);
    }
  }

  // Read tool: name matches search_<Type>
  if (toolName.startsWith('search_')) {
    const typeName = toolName.slice('search_'.length);
    const objType = deps.schema.objectTypes.find((o) => o.name === typeName);
    if (objType && !markingAllows(deps, caller, typeName)) return unknownTool(toolName);
    if (objType) {
      const result = await invokeSearchTool(objType, args, caller, deps);
      await auditMcpRead(deps, caller, typeName, toolName, result.isError === true);
      return result;
    }
  }

  // Read tool: name matches aggregate_<Type>
  if (toolName.startsWith('aggregate_')) {
    const typeName = toolName.slice('aggregate_'.length);
    const objType = deps.schema.objectTypes.find((o) => o.name === typeName);
    if (objType && !markingAllows(deps, caller, typeName)) return unknownTool(toolName);
    if (objType) {
      const result = await invokeAggregateTool(objType, args, caller, deps);
      await auditMcpRead(deps, caller, typeName, toolName, result.isError === true);
      return result;
    }
  }

  // Read tool: name matches traverse_<Type>
  if (toolName.startsWith('traverse_')) {
    const typeName = toolName.slice('traverse_'.length);
    const objType = deps.schema.objectTypes.find((o) => o.name === typeName);
    if (objType && !markingAllows(deps, caller, typeName)) return unknownTool(toolName);
    if (objType) {
      const result = await invokeTraverseTool(objType, args, caller, deps);
      await auditMcpRead(deps, caller, typeName, toolName, result.isError === true);
      return result;
    }
  }

  // Unknown tool — protocol error surfaced as isError content (not a JSON-RPC
  // error) so the agent sees the message and can recover.
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
    isError: true,
  };
}

/**
 * Invoke a FunctionType through the injected governed invoker. Authorization
 * (requiredRoles) and audit live in that path — shared with REST and GraphQL —
 * so this only marshals the arguments and shapes the result/error.
 */
async function invokeFunctionTool(
  fnType: FunctionType,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  const params = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;

  // A throw from the invoker — an authorization denial is the common one —
  // would reach the dispatcher's catch and be reported as INTERNAL_ERROR. A
  // refusal is not an internal error, and an agent that sees one has no way
  // to tell "you may not do this" from "the platform is broken". Returned as
  // isError content instead, matching the action and read tools.
  let outcome: Awaited<ReturnType<NonNullable<McpServerDependencies['functionInvoker']>['invoke']>>;
  try {
    outcome = await deps.functionInvoker!.invoke({
      functionName: fnType.name,
      args: params,
      user: caller.user,
      requestContext: caller.requestContext,
    });
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }],
      isError: true,
    };
  }

  if (!outcome.ok) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) }) }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(outcome.result ?? null) }],
    isError: false,
  };
}

/**
 * Record an MCP read in the audit trail.
 *
 * Written at the dispatcher, where both read tools converge, for the same
 * reason as the REST equivalent: a read tool added later is covered without
 * anyone remembering to instrument it.
 *
 * The actor is recorded as `user`, matching what the MCP action path already
 * writes. Distinguishing agent traffic from human traffic in the trail is a
 * real gap, but it belongs to the whole MCP surface at once — recording reads
 * as `agent` while the same caller's writes say `user` would make the trail
 * harder to read, not easier.
 *
 * Best-effort: an agent's read must not fail because auditing did.
 */
async function auditMcpRead(
  deps: McpServerDependencies,
  caller: McpCaller,
  objectType: string,
  toolName: string,
  isError: boolean,
): Promise<void> {
  if (!deps.auditWriter) return;
  try {
    await deps.auditWriter.write({
      tenantId: caller.requestContext.tenantId,
      actor: { type: 'user', id: caller.user.id, roles: caller.user.roles },
      operation: { type: 'query', objectType },
      // What was asked, never what came back.
      detail: { result: isError ? 'denied' : 'success', query: `mcp ${toolName}` },
      traceId: caller.requestContext.traceId,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Execute an action tool via the 8-stage ActionExecutor pipeline.
 */
async function invokeActionTool(
  actionType: ActionType,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  const { user, requestContext } = caller;
  const params = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;

  const manifest = deps.manifestRegistry.get(actionType.name);
  if (!manifest) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `No manifest registered for action: ${actionType.name}` }) }],
      isError: true,
    };
  }

  const actor: ActionActor = {
    id: user.id,
    type: 'agent',
    roles: user.roles,
    markings: user.markings ?? [],
  };

  // Derive consent subject from @param fields (mirrors REST/GraphQL resolvers)
  const subjectTypes = deps.consentSubjectTypes ?? DEFAULT_CONSENT_SUBJECT_TYPES;
  const subjectParam = actionType.fields.find(
    (f) => f.directives.some((d) => d.kind === 'param') && subjectTypes.includes(f.type.name),
  );
  const consentSubjectId = subjectParam ? String(params[subjectParam.name] ?? '') : undefined;

  const actionCtx: ActionContext = {
    requestContext,
    ...(consentSubjectId
      ? { consentPurpose: resolveConsentPurpose(deps), consentSubjectId }
      : {}),
  };

  // `dryRun` is reserved, not an action parameter: it is stripped from params
  // before validation so a manifest can never declare a @param of that name
  // and shadow it.
  const dryRun = params['dryRun'] === true;
  if ('dryRun' in params) delete params['dryRun'];

  const result: ActionResult = await deps.actionExecutor.execute(
    manifest,
    params,
    actor,
    actionCtx,
    deps.schema,
    dryRun ? { dryRun: true } : undefined,
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !result.success,
  };
}

/**
 * Execute a `search_<Type>` read tool via the FGA-scoped storage query path.
 */
async function invokeSearchTool(
  objType: ObjectType,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  const { user, requestContext } = caller;
  const typeName = objType.name;
  const fgaType = toSnakeCase(typeName);

  const parsed = parseSearchArgs(args);
  const limit = Math.min(parsed.limit ?? SEARCH_TOOL_LIMIT, SEARCH_TOOL_LIMIT);

  // Filtering on a field the caller cannot read leaks its value through the
  // result count. Mirrors validateQueryFields in the GraphQL resolvers.
  const visibleFields = deps.authorizationService.getVisibleFields(user.id, user.roles, typeName);
  if (visibleFields) {
    const violations = parsed.filterFields.filter(
      (f) => !f.startsWith('_') && !visibleFields.has(f),
    );
    if (violations.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Access denied: cannot filter on redacted fields: ${violations.join(', ')}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  // FGA-scoped list: viewer relation on the object type
  const allowedObjects = await deps.authorizationService.listObjects(
    `user:${user.id}`,
    'viewer',
    fgaType,
    user.tenantId,
  );

  const allAuthorized = allowedObjects.length === 1 && allowedObjects[0] === '*';
  const allowedIds = allAuthorized
    ? []
    : allowedObjects
        .map((o: string) => {
          const parts = o.split(':');
          return parts[parts.length - 1];
        })
        .filter((id): id is string => id !== undefined && id !== '');

  // No authorized objects → empty result (fail closed, no error)
  if (!allAuthorized && allowedIds.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ items: [], totalCount: 0 }) }],
      isError: false,
    };
  }

  // Build combined filter: ID restriction (if scoped) AND user filter
  let combinedFilter: FilterExpression;
  const userFilter = parsed.filter;
  if (!allAuthorized) {
    const idFilter: FilterExpression = { field: '_id', operator: 'in', value: allowedIds };
    combinedFilter = userFilter ? { and: [idFilter, userFilter] } : idFilter;
  } else {
    const passThrough: FilterExpression = { field: '_deleted_at', operator: 'exists', value: false };
    combinedFilter = userFilter ? { and: [passThrough, userFilter] } : passThrough;
  }

  // Route through ObjectManager when available so computed fields are
  // resolved (parity with REST and GraphQL). Fall back to direct storage
  // query only when ObjectManager is not injected.
  const page = deps.objectManager
    ? await deps.objectManager.query(typeName, combinedFilter, { limit, offset: 0 }, requestContext)
    : await deps.storage.queryObjects(requestContext, typeName, combinedFilter, {
        limit,
        offset: 0,
      });

  // Redact sensitive fields per user role
  const redacted = deps.authorizationService.redactFieldsBatch(
    user.id,
    user.roles,
    typeName,
    page.items.map((o: OntologyObject) => o as unknown as Record<string, unknown>),
  );

  // Consent gate. This surface returned consent-gated rows unchecked, so an
  // agent could read what the REST and GraphQL paths withhold.
  const consented: Record<string, unknown>[] = [];
  for (const [i, row] of redacted.entries()) {
    const node = page.items[i]!;
    const data = row.data as Record<string, unknown>;
    if (await consentAllows(node, data, caller, deps)) consented.push(data);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          items: consented,
          // Post-consent count: page.totalCount is what storage matched before
          // the gate, so reporting it discloses how many rows were withheld.
          totalCount: consented.length,
          limit,
        }),
      },
    ],
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedSearchArgs {
  filter?: FilterExpression;
  /** Field names referenced by the filter, for the redacted-field guard. */
  filterFields: string[];
  limit?: number;
}

/**
 * Parse the `search_<Type>` tool arguments into an SPI FilterExpression.
 * Accepts { filter: [{ field, operator, value }, ...], limit?: number }.
 */
function parseSearchArgs(args: unknown): ParsedSearchArgs {
  if (!args || typeof args !== 'object') return { filterFields: [] };
  const obj = args as Record<string, unknown>;

  let filter: FilterExpression | undefined;
  const filterFields: string[] = [];
  const rawFilter = obj['filter'];
  if (Array.isArray(rawFilter) && rawFilter.length > 0) {
    const predicates: FilterExpression[] = [];
    for (const item of rawFilter) {
      if (item && typeof item === 'object') {
        const p = item as { field?: string; operator?: string; value?: unknown };
        if (typeof p.field === 'string' && typeof p.operator === 'string') {
          predicates.push({
            field: p.field,
            operator: p.operator,
            value: p.value,
          } as FilterExpression);
          filterFields.push(p.field);
        }
      }
    }
    if (predicates.length === 1) {
      filter = predicates[0];
    } else if (predicates.length > 1) {
      filter = { and: predicates };
    }
  }

  let limit: number | undefined;
  if (typeof obj['limit'] === 'number' && obj['limit'] > 0) {
    limit = obj['limit'];
  }

  return { filter, filterFields, limit };
}

/**
 * Convert PascalCase to snake_case for FGA type names.
 * Mirrors packages/api/src/utils.ts toSnakeCase.
 */
// toSnakeCase now comes from @altius/odl — see the import at the top of this
// file. The copy that used to live here used a different algorithm and
// disagreed with the generated model on every acronym.

// ─── Traversal tool ───

/** Nodes a `traverse_<Type>` call may return, and hops it may take. */
const TRAVERSE_NODE_LIMIT = 50;
const TRAVERSE_MAX_STEPS = 5;

/**
 * Build a `traverse_<Type>` tool: multi-hop "search around" from one object.
 *
 * The provider-side primitive has always existed and was reachable from no
 * surface at all; an agent could only fan out one `getLinks` per node and
 * stitch the graph itself.
 */
function buildTraverseTool(objType: ObjectType): McpTool {
  return {
    name: `traverse_${objType.name}`,
    description: `Traverse the object graph outward from one ${objType.name}, following up to ${TRAVERSE_MAX_STEPS} link hops. Returns the objects reached (up to ${TRAVERSE_NODE_LIMIT}) and the links between them. Each step names a linkType and a direction; add a 'filter' to a step to keep only targets matching it.`,
    inputSchema: {
      type: 'object',
      properties: {
        startId: { type: 'string', description: `Id of the ${objType.name} to start from` },
        steps: {
          type: 'array',
          description: 'Hops to follow, in order. Each is exactly one hop.',
          items: {
            type: 'object',
            properties: {
              linkType: { type: 'string', description: 'Link type name to follow' },
              direction: { type: 'string', enum: ['outbound', 'inbound'], description: 'Which way to follow it' },
            },
            required: ['linkType'],
          },
          minItems: 1,
          maxItems: TRAVERSE_MAX_STEPS,
        },
      },
      required: ['startId', 'steps'],
    },
  };
}

/**
 * Run a traversal for an agent.
 *
 * Authorization is the hard part: a traversal returns objects of MIXED types,
 * so every node is checked against its OWN type rather than the starting one.
 * Three things are withheld beyond the nodes themselves, because each discloses
 * an object the caller may not see: an edge whose endpoint was dropped (it
 * confirms the hidden object exists and is connected), the provider's node
 * count (it reveals the size of the withheld part), and the neighbourhood of a
 * start object the caller cannot read.
 */
async function invokeTraverseTool(
  objType: ObjectType,
  args: unknown,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<McpCallToolResult> {
  const { user, requestContext } = caller;
  const a = (args ?? {}) as Record<string, unknown>;

  const startId = a['startId'];
  const rawSteps = a['steps'];
  if (typeof startId !== 'string' || !startId) {
    return errorResult('startId must be the id of a ' + objType.name);
  }
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return errorResult('steps must be a non-empty array of hops');
  }
  if (rawSteps.length > TRAVERSE_MAX_STEPS) {
    return errorResult(`steps may contain at most ${TRAVERSE_MAX_STEPS} hops`);
  }

  const knownLinkTypes = new Set(deps.schema.linkTypes.map((l) => l.name));
  const steps: TraversalStep[] = [];
  for (const [i, raw] of rawSteps.entries()) {
    const step = (raw ?? {}) as Record<string, unknown>;
    const linkType = step['linkType'];
    if (typeof linkType !== 'string' || !knownLinkTypes.has(linkType)) {
      // Named rather than silently empty: an agent comparing an empty result
      // against an error would otherwise be able to probe which link types exist.
      return errorResult(`steps[${i}].linkType "${String(linkType)}" is not a link type in this ontology`);
    }
    const direction = step['direction'] ?? 'outbound';
    if (direction !== 'inbound' && direction !== 'outbound') {
      return errorResult(`steps[${i}].direction must be "inbound" or "outbound"`);
    }
    steps.push({ linkType, direction });
  }

  // Entering the graph requires being able to see where you start from.
  const startAllowed = await deps.authorizationService.check(
    `user:${user.id}`,
    'viewer',
    `${toSnakeCase(objType.name)}:${startId}`,
    requestContext.tenantId,
  );
  if (!startAllowed) {
    return errorResult(`Access denied: cannot view ${objType.name} ${startId}`);
  }

  const result = await deps.storage.traverse(
    requestContext,
    startId,
    { steps },
    { limit: TRAVERSE_NODE_LIMIT },
  );

  const visible: Record<string, unknown>[] = [];
  const visibleIds = new Set<string>();
  for (const node of result.nodes) {
    const allowed = await deps.authorizationService.check(
      `user:${user.id}`,
      'viewer',
      `${toSnakeCase(node._type)}:${node._id}`,
      requestContext.tenantId,
    );
    if (!allowed) continue;
    const [redacted] = deps.authorizationService.redactFieldsBatch(
      user.id,
      user.roles,
      node._type,
      [node as unknown as Record<string, unknown>],
    );
    const data = redacted!.data as Record<string, unknown>;
    // Dropped, not blanked: on the graph, presence is itself the disclosure.
    if (!(await consentAllows(node, data, caller, deps))) continue;
    visible.push(data);
    visibleIds.add(node._id);
  }

  const edges = result.edges
    .filter((e) => visibleIds.has(e._fromId) && visibleIds.has(e._toId))
    .map((e) => ({ linkType: e._type, fromId: e._fromId, toId: e._toId }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ nodes: visible, edges, totalCount: visible.length }),
    }],
    isError: false,
  };
}

/** Shape a caller-facing refusal the way the other tools do. */
function errorResult(message: string): McpCallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

/**
 * Whether a node of this type may be returned to an agent, per consent.
 *
 * Matches the REST and GraphQL rule exactly: gate when a consent service is
 * configured, and do not invent one when it is absent. A deployment without a
 * consent service has no consent control anywhere, so refusing here would be
 * stricter than the platform and would empty a working agent's reads.
 *
 * The hole this closes is the other case — a service IS configured and this
 * surface never called it, so an agent read exactly what REST and GraphQL
 * withhold.
 */
async function consentAllows(
  node: { _id: string; _type: string },
  data: Record<string, unknown>,
  caller: McpCaller,
  deps: McpServerDependencies,
): Promise<boolean> {
  const gated = deps.consentSubjectTypes ?? DEFAULT_CONSENT_SUBJECT_TYPES;
  if (!gated.includes(node._type)) return true;
  if (!deps.consentService) return true;

  const result = await deps.consentService.checkSingleObject(
    data,
    node._id,
    resolveConsentPurpose(deps),
    caller.user.id,
    caller.requestContext.tenantId,
  );
  return !result._consentRestricted;
}
