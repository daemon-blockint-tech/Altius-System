/**
 * Tool discovery and invocation adapters.
 *
 * Builds the MCP tool list from the ODL schema's ActionTypes (one tool per
 * action) plus one `search_<Type>` read tool per ObjectType. Handles
 * `tools/call` by dispatching to the ActionExecutor (for action tools) or
 * the storage provider (for read tools), under the caller's OIDC identity.
 */

import type { ActionType, ObjectType, FieldDefinition } from '@altius/odl';
import type { ActionActor, ActionContext, ActionResult } from '@altius/actions';
import type { FilterExpression, OntologyObject, TraversalStep } from '@altius/spi';
import { DataPurpose } from '@altius/spi';
import type { McpTool, McpCallToolResult } from './protocol.js';
import type { McpServerDependencies, McpCaller } from './types.js';

/** Default consent subject types (mirrors ApiDependencies default). */
const DEFAULT_CONSENT_SUBJECT_TYPES: readonly string[] = ['Patient'];

/** Default consent purpose when the deployment does not configure one. */
const DEFAULT_CONSENT_PURPOSE: DataPurpose = DataPurpose.DIRECT_CARE;

/** Resolve the consent purpose from deps, falling back to the default. */
function resolveConsentPurpose(deps: McpServerDependencies): DataPurpose {
  const configured = deps.consentPurpose;
  if (configured && configured in DataPurpose) {
    return configured as DataPurpose;
  }
  return DEFAULT_CONSENT_PURPOSE;
}

/** Max objects a `search_<Type>` tool returns in one call. */
const SEARCH_TOOL_LIMIT = 50;

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

  // Read tools — one search_<Type> and one traverse_<Type> per ObjectType
  for (const objType of deps.schema.objectTypes) {
    tools.push(buildSearchTool(objType));
    tools.push(buildTraverseTool(objType));
  }

  return tools;
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

  // Read tool: name matches search_<Type>
  if (toolName.startsWith('search_')) {
    const typeName = toolName.slice('search_'.length);
    const objType = deps.schema.objectTypes.find((o) => o.name === typeName);
    if (objType) {
      return invokeSearchTool(objType, args, caller, deps);
    }
  }

  // Read tool: name matches traverse_<Type>
  if (toolName.startsWith('traverse_')) {
    const typeName = toolName.slice('traverse_'.length);
    const objType = deps.schema.objectTypes.find((o) => o.name === typeName);
    if (objType) {
      return invokeTraverseTool(objType, args, caller, deps);
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

  const result: ActionResult = await deps.actionExecutor.execute(
    manifest,
    params,
    actor,
    actionCtx,
    deps.schema,
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
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

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
