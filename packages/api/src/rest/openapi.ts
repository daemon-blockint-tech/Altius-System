/**
 * OpenAPI 3.0 specification generator.
 *
 * Produces a JSON-serializable OpenAPI 3.0.3 document from the ParsedSchema.
 * Routes mirror the auto-generated REST layer (Section 8.2):
 *
 *   GET  /api/v1/{plural}               — list with filter + pagination
 *   GET  /api/v1/{plural}/aggregate     — field aggregations
 *   GET  /api/v1/{plural}/search        — full-text search
 *   GET  /api/v1/{plural}/:id           — get by ID
 *   GET  /api/v1/{plural}/:id/links/:linkType — linked objects
 *   GET  /api/v1/{plural}/:id/history   — version history
 *   POST /api/v1/actions/{ActionName}   — execute action
 */

import type { ParsedSchema, ObjectType, ActionType, FieldDefinition } from '@altius/odl';

// ─── Helpers ───

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function pluralize(s: string): string {
  return lowerFirst(s) + 's';
}

function odlTypeToJsonSchema(typeName: string, nonNull: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = (() => {
    switch (typeName) {
      case 'ID': return { type: 'string', format: 'uuid' };
      case 'String': return { type: 'string' };
      case 'Int': return { type: 'integer' };
      case 'Float': return { type: 'number' };
      case 'Boolean': return { type: 'boolean' };
      case 'DateTime': return { type: 'string', format: 'date-time' };
      case 'Date': return { type: 'string', format: 'date' };
      case 'JSON': return { type: 'object' };
      default: return { type: 'string' }; // enum values, custom scalars
    }
  })();
  if (!nonNull) {
    return { ...base, nullable: true };
  }
  return base;
}

function isPrimary(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'primary');
}
function isComputed(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'computed');
}
function isLink(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'link');
}
function isParam(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'param');
}

/** Field-level `@display` metadata as an OpenAPI `x-altius-display` object, or undefined. */
function fieldDisplay(field: FieldDefinition): Record<string, unknown> | undefined {
  const d = field.directives.find(x => x.kind === 'display');
  if (!d || d.kind !== 'display') return undefined;
  const out: Record<string, unknown> = {};
  if (d.label !== undefined) out['label'] = d.label;
  if (d.group !== undefined) out['group'] = d.group;
  if (d.order !== undefined) out['order'] = d.order;
  if (d.renderHint !== undefined) out['renderHint'] = d.renderHint;
  if (d.format !== undefined) out['format'] = d.format;
  if (d.hidden !== undefined) out['hidden'] = d.hidden;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Type-level `@display` metadata as an OpenAPI `x-altius-display` object, or undefined. */
function typeDisplay(obj: ObjectType): Record<string, unknown> | undefined {
  const d = obj.directives.find(x => x.kind === 'display');
  if (!d || d.kind !== 'display') return undefined;
  const out: Record<string, unknown> = {};
  if (d.label !== undefined) out['label'] = d.label;
  if (d.pluralLabel !== undefined) out['pluralLabel'] = d.pluralLabel;
  if (d.icon !== undefined) out['icon'] = d.icon;
  if (d.color !== undefined) out['color'] = d.color;
  if (d.titleProperty !== undefined) out['titleProperty'] = d.titleProperty;
  if (d.statusProperty !== undefined) out['statusProperty'] = d.statusProperty;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ─── Schema helpers ───

function objectSchema(obj: ObjectType): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of obj.fields) {
    if (isComputed(field) || isLink(field)) continue;
    const key = field.name;
    const propSchema = odlTypeToJsonSchema(field.type.name, field.type.nonNull);
    const disp = fieldDisplay(field);
    if (disp) propSchema['x-altius-display'] = disp;
    props[key] = propSchema;
    if (field.type.nonNull) required.push(key);
  }
  // System fields
  props['_redactedFields'] = { type: 'array', items: { type: 'string' }, nullable: true };
  props['_consentRestricted'] = { type: 'boolean' };

  const schema: Record<string, unknown> = { type: 'object', properties: props };
  if (required.length > 0) schema['required'] = required;
  const td = typeDisplay(obj);
  if (td) schema['x-altius-display'] = td;
  return schema;
}

function actionInputSchema(action: ActionType): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of action.fields) {
    if (!isParam(field)) continue;
    props[field.name] = odlTypeToJsonSchema(field.type.name, field.type.nonNull);
    if (field.type.nonNull) required.push(field.name);
  }
  const schema: Record<string, unknown> = { type: 'object', properties: props };
  if (required.length > 0) schema['required'] = required;
  return schema;
}

// ─── Path generators ───

function objectPaths(obj: ObjectType): Record<string, unknown> {
  const plural = pluralize(obj.name);
  const tag = obj.name;
  const ref = `#/components/schemas/${obj.name}`;
  const paths: Record<string, unknown> = {};

  // GET /api/v1/{plural}
  paths[`/api/v1/${plural}`] = {
    get: {
      tags: [tag],
      summary: `List ${obj.name} objects`,
      operationId: `list${obj.name}s`,
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Sort field' },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        {
          name: 'asOf',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          description:
            'Evaluate the query against the values that were live at this instant, ' +
            'reading from version history. Filters and sorting apply to the historical ' +
            'values. Objects created after it are absent; objects deleted before it stay ' +
            'excluded. Same meaning as asOf on the history route, for a collection.',
        },
        ...obj.fields
          .filter(f => !isPrimary(f) && !isComputed(f) && !isLink(f))
          .map(f => ({
            name: `filter[${f.name}]`,
            in: 'query' as const,
            schema: odlTypeToJsonSchema(f.type.name, false),
            description: `Filter by ${f.name}`,
          })),
      ],
      responses: {
        '200': {
          description: `List of ${obj.name} objects`,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: ref } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  };

  // POST /api/v1/{plural}/aggregate
  // A read expressed as POST because the query travels in the body; the
  // handler audits it as a read. Documented as GET until it was checked
  // against the router, which sends spec-following clients to a 405.
  paths[`/api/v1/${plural}/aggregate`] = {
    post: {
      tags: [tag],
      summary: `Aggregate ${obj.name} objects`,
      operationId: `aggregate${obj.name}s`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fields'],
              properties: {
                fields: {
                  type: 'array',
                  description: 'Aggregations to compute.',
                  items: {
                    type: 'object',
                    required: ['field', 'fn'],
                    properties: {
                      field: { type: 'string' },
                      fn: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
                      alias: { type: 'string' },
                    },
                  },
                },
                groupBy: { type: 'array', items: { type: 'string' } },
                buckets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['field', 'interval'],
                    properties: {
                      field: { type: 'string' },
                      interval: { type: 'string' },
                      alias: { type: 'string' },
                    },
                  },
                },
                filter: { type: 'object', description: 'Filter expression applied before aggregating.' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Aggregation result', content: { 'application/json': { schema: { type: 'object' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  };

  // GET /api/v1/{plural}/export
  paths[`/api/v1/${plural}/export`] = {
    get: {
      tags: [tag],
      summary: `Export ${obj.name} objects`,
      description:
        'Streams permission-scoped, redacted and consent-filtered records. ' +
        'Results are capped server-side; check the response for a truncation marker.',
      operationId: `export${obj.name}s`,
      parameters: [
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['ndjson', 'csv'], default: 'ndjson' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
      ],
      responses: {
        '200': {
          description: 'Exported records',
          content: {
            'application/x-ndjson': { schema: { type: 'string' } },
            'text/csv': { schema: { type: 'string' } },
          },
        },
        '400': { description: 'Unsupported export format' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  };

  // GET /api/v1/{plural}/search
  paths[`/api/v1/${plural}/search`] = {
    get: {
      tags: [tag],
      summary: `Full-text search ${obj.name} objects`,
      operationId: `search${obj.name}s`,
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
      ],
      responses: {
        '200': {
          description: 'Search results',
          content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: ref } } } } } },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  };

  // GET /api/v1/{plural}/{id}
  paths[`/api/v1/${plural}/{id}`] = {
    get: {
      tags: [tag],
      summary: `Get ${obj.name} by ID`,
      operationId: `get${obj.name}`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: `${obj.name} object`,
          content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: ref } } } } },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { description: 'Not found' },
      },
    },
    put: {
      tags: [tag],
      summary: `Update ${obj.name} by ID`,
      description:
        'Supports optimistic concurrency: send `If-Match` with the version last read, ' +
        'and the update is rejected with 412 if the object has moved on since.',
      operationId: `update${obj.name}`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'If-Match',
          in: 'header',
          schema: { type: 'integer' },
          description: 'Version the caller expects. Omit to update unconditionally.',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Properties to set. System fields (leading underscore) are ignored.',
            },
          },
        },
      },
      responses: {
        '200': {
          description: `Updated ${obj.name}`,
          content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: ref } } } } },
        },
        '400': { description: 'Validation error' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { description: 'Not permitted to edit this object' },
        '404': { description: 'Not found' },
        '412': { description: 'Version conflict — the object changed since the version in If-Match' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
    delete: {
      tags: [tag],
      summary: `Delete ${obj.name} by ID`,
      operationId: `delete${obj.name}`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'If-Match',
          in: 'header',
          schema: { type: 'integer' },
          description: 'Version the caller expects. Omit to delete unconditionally.',
        },
      ],
      responses: {
        '204': { description: 'Deleted' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { description: 'Not permitted to delete this object' },
        '404': { description: 'Not found' },
        '412': { description: 'Version conflict — the object changed since the version in If-Match' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  };

  // POST /api/v1/{plural}/{id}/traverse
  paths[`/api/v1/${plural}/{id}/traverse`] = {
    post: {
      tags: [tag],
      summary: `Traverse the link graph from a ${obj.name}`,
      operationId: `traverse${obj.name}`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Traversal specification: which link types to follow, and how deep.',
            },
          },
        },
      },
      responses: {
        '200': { description: 'Traversal result', content: { 'application/json': { schema: { type: 'object' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { description: 'Not found' },
        '429': { $ref: '#/components/responses/RateLimited' },
      },
    },
  };

  // GET /api/v1/{plural}/{id}/links/{linkType}
  paths[`/api/v1/${plural}/{id}/links/{linkType}`] = {
    get: {
      tags: [tag],
      summary: `Get linked objects from ${obj.name}`,
      operationId: `get${obj.name}Links`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'linkType', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
      ],
      responses: {
        '200': { description: 'Linked objects', content: { 'application/json': { schema: { type: 'object' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { description: 'Not found' },
      },
    },
  };

  // GET /api/v1/{plural}/{id}/history
  paths[`/api/v1/${plural}/{id}/history`] = {
    get: {
      tags: [tag],
      summary: `Get version history of ${obj.name}`,
      operationId: `get${obj.name}History`,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Version history', content: { 'application/json': { schema: { type: 'object' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { description: 'Not found' },
      },
    },
  };

  return paths;
}

function actionPath(action: ActionType): Record<string, unknown> {
  return {
    [`/api/v1/actions/${action.name}`]: {
      post: {
        tags: ['Actions'],
        summary: `Execute ${action.name}`,
        operationId: `execute${action.name}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: actionInputSchema(action),
            },
          },
        },
        responses: {
          '200': {
            description: 'Action result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' },
                    warnings: { type: 'array', items: { type: 'object' }, nullable: true },
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error or precondition failed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
  };
}

/**
 * Governance paths that are not derived from the ODL schema — the care-team
 * relationship grant/revoke API (v0.2.0 A1) and the consent-record API (A2).
 * Mounted unconditionally in server.ts; documented here so client generation and
 * contract checks see the full REST surface.
 */
/**
 * Endpoints that exist per-deployment rather than per-ObjectType: the saved
 * object-set CRUD, the action catalogue, and the LLM endpoints. Served since
 * they were written, and undocumented for just as long.
 */
function platformPaths(): Record<string, unknown> {
  const objectSetId = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
  const unauthorized = { $ref: '#/components/responses/Unauthorized' };
  const jsonObject = { 'application/json': { schema: { type: 'object' } } };

  return {
    '/api/v1/object-sets': {
      get: {
        tags: ['ObjectSet'],
        summary: 'List saved object sets',
        operationId: 'listObjectSets',
        responses: {
          '200': { description: 'Saved object sets', content: jsonObject },
          '401': unauthorized,
        },
      },
      post: {
        tags: ['ObjectSet'],
        summary: 'Create a saved object set',
        operationId: 'createObjectSet',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Created', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/object-sets/{id}': {
      get: {
        tags: ['ObjectSet'],
        summary: 'Get a saved object set',
        operationId: 'getObjectSet',
        parameters: [objectSetId],
        responses: {
          '200': { description: 'Object set', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
      put: {
        tags: ['ObjectSet'],
        summary: 'Update a saved object set',
        operationId: 'updateObjectSet',
        parameters: [objectSetId],
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Updated', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['ObjectSet'],
        summary: 'Delete a saved object set',
        operationId: 'deleteObjectSet',
        parameters: [objectSetId],
        responses: {
          '204': { description: 'Deleted' },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/object-sets/{id}/execute': {
      get: {
        tags: ['ObjectSet'],
        summary: 'Execute a saved object set and return matching objects',
        operationId: 'executeObjectSet',
        parameters: [objectSetId],
        responses: {
          '200': { description: 'Matching objects', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/object-sets/{id}/aggregate': {
      get: {
        tags: ['ObjectSet'],
        summary: 'Aggregate over a saved object set',
        operationId: 'aggregateObjectSet',
        parameters: [objectSetId],
        responses: {
          '200': { description: 'Aggregation result', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/actions': {
      get: {
        tags: ['Action'],
        summary: 'List the action types this deployment exposes',
        operationId: 'listActions',
        responses: {
          '200': { description: 'Action catalogue', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/llm/generate': {
      post: {
        tags: ['LLM'],
        summary: 'Generate a completion',
        operationId: 'llmGenerate',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Completion', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { description: 'No LLM client is configured for this deployment' },
        },
      },
    },
    '/api/v1/llm/embed': {
      post: {
        tags: ['LLM'],
        summary: 'Embed one or more texts',
        operationId: 'llmEmbed',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Embeddings', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { description: 'No LLM client is configured for this deployment' },
        },
      },
    },
    // ─── Function Lifecycle ───
    '/api/v1/functions-lifecycle/revisions': {
      post: {
        tags: ['Functions'],
        summary: 'Create a function revision draft',
        operationId: 'createFunctionRevision',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Created revision', content: jsonObject },
          '401': unauthorized,
          '503': { description: 'Function registry not configured' },
        },
      },
      get: {
        tags: ['Functions'],
        summary: 'List revisions for a function',
        operationId: 'listFunctionRevisions',
        parameters: [
          { name: 'functionName', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Revisions', content: jsonObject },
          '400': { description: 'Missing functionName' },
          '401': unauthorized,
          '503': { description: 'Function registry not configured' },
        },
      },
    },
    '/api/v1/functions-lifecycle/revisions/{id}': {
      get: {
        tags: ['Functions'],
        summary: 'Get a function revision by ID',
        operationId: 'getFunctionRevision',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Revision', content: jsonObject },
          '404': { description: 'Not found' },
          '401': unauthorized,
          '503': { description: 'Function registry not configured' },
        },
      },
    },
    '/api/v1/functions-lifecycle/revisions/{id}/publish': {
      post: {
        tags: ['Functions'],
        summary: 'Publish a draft function revision',
        operationId: 'publishFunctionRevision',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Published revision', content: jsonObject },
          '404': { description: 'Not found' },
          '401': unauthorized,
          '503': { description: 'Function registry not configured' },
        },
      },
    },
    '/api/v1/functions-lifecycle/revisions/{id}/test': {
      post: {
        tags: ['Functions'],
        summary: 'Run tests for a function revision',
        operationId: 'testFunctionRevision',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Test results', content: jsonObject },
          '404': { description: 'Not found' },
          '401': unauthorized,
          '503': { description: 'Function registry/executor not configured' },
        },
      },
    },
    '/api/v1/functions-lifecycle/rollback': {
      post: {
        tags: ['Functions'],
        summary: 'Rollback a function to a previous revision',
        operationId: 'rollbackFunction',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Rolled-back revision', content: jsonObject },
          '404': { description: 'Not found' },
          '401': unauthorized,
          '503': { description: 'Function registry not configured' },
        },
      },
    },
    '/api/v1/functions-lifecycle/webhook': {
      post: {
        tags: ['Functions'],
        summary: 'Git push webhook trigger for the function pipeline',
        description: 'Receives GitHub/GitLab push webhooks, verifies the signature, and runs the function pipeline for matching functions. Requires FUNCTION_WEBHOOK_SECRET to be set.',
        operationId: 'functionPipelineWebhook',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Webhook processed', content: jsonObject },
          '401': { description: 'Invalid signature or token' },
          '503': { description: 'Webhook trigger not configured' },
        },
      },
    },
    // ── Data Freshness ──
    '/api/v1/data-freshness/sync': {
      post: {
        tags: ['DataFreshness'],
        summary: 'Record a sync completion for an object type or datasource',
        operationId: 'recordDataFreshnessSync',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Freshness record', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/data-freshness/types/{type}': {
      get: {
        tags: ['DataFreshness'],
        summary: 'Get freshness for an object type',
        operationId: 'getFreshnessForType',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Freshness record', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['DataFreshness'],
        summary: 'Delete a freshness record for an object type',
        operationId: 'deleteFreshnessForType',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/data-freshness': {
      get: {
        tags: ['DataFreshness'],
        summary: 'Query freshness records',
        operationId: 'queryFreshness',
        parameters: [
          { name: 'objectType', in: 'query', schema: { type: 'string' } },
          { name: 'datasource', in: 'query', schema: { type: 'string' } },
          { name: 'maxAgeSeconds', in: 'query', schema: { type: 'integer' } },
          { name: 'minAgeSeconds', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Freshness records', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/data-freshness/summary': {
      get: {
        tags: ['DataFreshness'],
        summary: 'Get a freshness summary for the tenant',
        operationId: 'getFreshnessSummary',
        parameters: [{ name: 'maxAgeSeconds', in: 'query', schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Freshness summary', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    // ── Security Governance ──
    '/api/v1/security/explain': {
      post: {
        tags: ['Security'],
        summary: 'Explain why access was granted or denied',
        operationId: 'explainAccess',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Access explanation', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/security/justifications': {
      post: {
        tags: ['Security'],
        summary: 'Record a justification for a sensitive action',
        operationId: 'createJustification',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Justification record', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
      get: {
        tags: ['Security'],
        summary: 'Query justifications',
        operationId: 'listJustifications',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'actionName', in: 'query', schema: { type: 'string' } },
          { name: 'objectType', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Justification records', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/security/justifications/{id}': {
      get: {
        tags: ['Security'],
        summary: 'Get a justification by ID',
        operationId: 'getJustification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Justification record', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/security/justifications/{id}/approve': {
      post: {
        tags: ['Security'],
        summary: 'Approve a justification',
        operationId: 'approveJustification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Approved', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/security/sessions': {
      post: {
        tags: ['Security'],
        summary: 'Create a scoped session with restricted markings',
        operationId: 'createScopedSession',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Scoped session', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
      get: {
        tags: ['Security'],
        summary: 'List scoped sessions',
        operationId: 'listScopedSessions',
        parameters: [{ name: 'userId', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Scoped sessions', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/security/sessions/{id}': {
      get: {
        tags: ['Security'],
        summary: 'Get a scoped session by ID',
        operationId: 'getScopedSession',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Scoped session', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/security/sessions/{id}/revoke': {
      post: {
        tags: ['Security'],
        summary: 'Revoke a scoped session',
        operationId: 'revokeScopedSession',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Revoked', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/security/sessions/{id}/check': {
      get: {
        tags: ['Security'],
        summary: 'Check if a marking is allowed in a scoped session',
        operationId: 'checkMarkingAllowed',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'marking', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Check result', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Session not found' },
        },
      },
    },
    // ── Ontology SQL (SQL Studio) ──
    '/api/v1/sql/execute': {
      post: {
        tags: ['SQL'],
        summary: 'Execute a SQL query over the ontology',
        operationId: 'executeSql',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Query result', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/explain': {
      post: {
        tags: ['SQL'],
        summary: 'Explain how a SQL query will be executed',
        operationId: 'explainSql',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Query explanation', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/validate': {
      post: {
        tags: ['SQL'],
        summary: 'Validate a SQL query without executing it',
        operationId: 'validateSql',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Validation result', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/tables': {
      get: {
        tags: ['SQL'],
        summary: 'List object types available as virtual tables',
        operationId: 'listSqlVirtualTables',
        responses: {
          '200': { description: 'Virtual tables', content: jsonObject },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/tables/{type}': {
      get: {
        tags: ['SQL'],
        summary: 'Describe a virtual table schema',
        operationId: 'describeSqlVirtualTable',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Virtual table schema', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/sql/saved': {
      get: {
        tags: ['SQL'],
        summary: 'List saved SQL queries',
        operationId: 'listSavedSqlQueries',
        parameters: [{ name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated tags' }],
        responses: {
          '200': { description: 'Saved queries', content: jsonObject },
          '401': unauthorized,
        },
      },
      post: {
        tags: ['SQL'],
        summary: 'Create a saved SQL query',
        operationId: 'createSavedSqlQuery',
        requestBody: { required: true, content: jsonObject },
        responses: {
          '201': { description: 'Saved query', content: jsonObject },
          '400': { description: 'Validation error' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/saved/{id}': {
      get: {
        tags: ['SQL'],
        summary: 'Get a saved SQL query',
        operationId: 'getSavedSqlQuery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Saved query', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
      put: {
        tags: ['SQL'],
        summary: 'Update a saved SQL query',
        operationId: 'updateSavedSqlQuery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Updated query', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['SQL'],
        summary: 'Delete a saved SQL query',
        operationId: 'deleteSavedSqlQuery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': unauthorized,
        },
      },
    },
    '/api/v1/sql/saved/{id}/execute': {
      post: {
        tags: ['SQL'],
        summary: 'Execute a saved SQL query by ID',
        operationId: 'executeSavedSqlQuery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: jsonObject },
        responses: {
          '200': { description: 'Query result', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Saved query not found' },
        },
      },
    },
    '/api/v1/sql/saved/{id}/share': {
      post: {
        tags: ['SQL'],
        summary: 'Share a saved SQL query with users',
        operationId: 'shareSavedSqlQuery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: {
          '200': { description: 'Shared query', content: jsonObject },
          '401': unauthorized,
          '404': { description: 'Not found' },
        },
      },
    },
    // ── Datasets ──
    '/api/v1/datasets': {
      post: {
        tags: ['Datasets'],
        summary: 'Create a versioned transactional dataset',
        operationId: 'createDataset',
        requestBody: { required: true, content: jsonObject },
        responses: { '201': { description: 'Dataset', content: jsonObject }, '400': { description: 'Validation error' }, '401': unauthorized },
      },
      get: {
        tags: ['Datasets'],
        summary: 'List datasets',
        operationId: 'listDatasets',
        responses: { '200': { description: 'Datasets', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}': {
      get: {
        tags: ['Datasets'],
        summary: 'Get a dataset by name',
        operationId: 'getDataset',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Dataset', content: jsonObject }, '401': unauthorized, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Datasets'],
        summary: 'Drop a dataset (or just a branch)',
        operationId: 'dropDataset',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        responses: { '204': { description: 'Dropped' }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/schema': {
      put: {
        tags: ['Datasets'],
        summary: 'Update dataset schema',
        operationId: 'updateDatasetSchema',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '200': { description: 'Updated dataset', content: jsonObject }, '401': unauthorized, '404': { description: 'Not found' } },
      },
    },
    '/api/v1/datasets/{name}/insert': {
      post: {
        tags: ['Datasets'],
        summary: 'Insert rows into a dataset',
        operationId: 'insertDatasetRows',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '200': { description: 'Write result', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/update': {
      post: {
        tags: ['Datasets'],
        summary: 'Update rows in a dataset',
        operationId: 'updateDatasetRows',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '200': { description: 'Write result', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/delete': {
      post: {
        tags: ['Datasets'],
        summary: 'Delete rows from a dataset',
        operationId: 'deleteDatasetRows',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '200': { description: 'Write result', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/truncate': {
      post: {
        tags: ['Datasets'],
        summary: 'Truncate a dataset',
        operationId: 'truncateDataset',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'branch', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Write result', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/read': {
      get: {
        tags: ['Datasets'],
        summary: 'Read rows from a dataset',
        operationId: 'readDatasetRows',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'branch', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
          { name: 'asOfTransactionId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Read result', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/transactions': {
      get: {
        tags: ['Datasets'],
        summary: 'List transaction log entries',
        operationId: 'listDatasetTransactions',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'branch', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Transactions', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/transactions/{tid}': {
      get: {
        tags: ['Datasets'],
        summary: 'Get a transaction by ID',
        operationId: 'getDatasetTransaction',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'tid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Transaction', content: jsonObject }, '401': unauthorized, '404': { description: 'Not found' } },
      },
    },
    '/api/v1/datasets/{name}/branches': {
      post: {
        tags: ['Datasets'],
        summary: 'Create a dataset branch',
        operationId: 'createDatasetBranch',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '201': { description: 'Branch', content: jsonObject }, '401': unauthorized },
      },
      get: {
        tags: ['Datasets'],
        summary: 'List dataset branches',
        operationId: 'listDatasetBranches',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Branches', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/datasets/{name}/merge': {
      post: {
        tags: ['Datasets'],
        summary: 'Merge a branch into target',
        operationId: 'mergeDatasetBranch',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: jsonObject },
        responses: { '200': { description: 'Merge result', content: jsonObject }, '401': unauthorized },
      },
    },
    // ── Usage Metrics ──
    '/api/v1/usage/object-types': {
      get: {
        tags: ['Usage'],
        summary: 'Get per-object-type usage metrics',
        operationId: 'getObjectTypeMetrics',
        parameters: [
          { name: 'startTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Per-type metrics', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/actions': {
      get: {
        tags: ['Usage'],
        summary: 'Get per-action/function usage metrics',
        operationId: 'getActionFunctionMetrics',
        parameters: [
          { name: 'startTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Per-action metrics', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/summary': {
      get: {
        tags: ['Usage'],
        summary: 'Get a full usage summary for the tenant',
        operationId: 'getUsageSummary',
        parameters: [
          { name: 'startTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Usage summary', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/events': {
      get: {
        tags: ['Usage'],
        summary: 'Query raw usage events',
        operationId: 'queryUsageEvents',
        parameters: [
          { name: 'startTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'objectType', in: 'query', schema: { type: 'string' } },
          { name: 'operation', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Usage events', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/active-users': {
      get: {
        tags: ['Usage'],
        summary: 'Get active user count for the tenant',
        operationId: 'getActiveUserCount',
        parameters: [
          { name: 'startTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endTime', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Active user count', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/rules': {
      post: {
        tags: ['Usage'],
        summary: 'Create a usage monitoring rule',
        operationId: 'createUsageMonitoringRule',
        requestBody: { required: true, content: jsonObject },
        responses: { '201': { description: 'Monitoring rule', content: jsonObject }, '400': { description: 'Validation error' }, '401': unauthorized },
      },
      get: {
        tags: ['Usage'],
        summary: 'List usage monitoring rules',
        operationId: 'listUsageMonitoringRules',
        responses: { '200': { description: 'Monitoring rules', content: jsonObject }, '401': unauthorized },
      },
    },
    '/api/v1/usage/rules/{id}': {
      delete: {
        tags: ['Usage'],
        summary: 'Delete a usage monitoring rule',
        operationId: 'deleteUsageMonitoringRule',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' }, '401': unauthorized },
      },
    },
    '/api/v1/usage/rules/evaluate': {
      post: {
        tags: ['Usage'],
        summary: 'Evaluate all monitoring rules',
        operationId: 'evaluateUsageMonitoringRules',
        responses: { '200': { description: 'Evaluation results', content: jsonObject }, '401': unauthorized },
      },
    },
  };
}

function governancePaths(): Record<string, unknown> {
  const errorContent = { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } };
  const relationshipBody = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['user', 'relation', 'objectType', 'objectId'],
          properties: {
            user: { type: 'string', description: 'Subject user id (bare or `user:<id>`).' },
            relation: { type: 'string', description: 'A directly-grantable `[user]` relation from the merged FGA model.' },
            objectType: { type: 'string', description: 'Object type (e.g. Patient, Ward).' },
            objectId: { type: 'string' },
          },
        },
      },
    },
  };
  return {
    '/api/v1/relationships': {
      post: {
        tags: ['Governance'],
        summary: 'Grant a directly-assignable ReBAC relationship (care-team)',
        operationId: 'grantRelationship',
        requestBody: relationshipBody,
        responses: {
          '200': { description: 'Relationship granted' },
          '400': { description: 'Invalid/non-grantable relation or missing field', content: errorContent },
          '403': { description: 'Caller lacks a granter role', content: errorContent },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
      delete: {
        tags: ['Governance'],
        summary: 'Revoke a directly-assignable ReBAC relationship',
        operationId: 'revokeRelationship',
        requestBody: relationshipBody,
        responses: {
          '200': { description: 'Relationship revoked' },
          '400': { description: 'Invalid/non-grantable relation or missing field', content: errorContent },
          '403': { description: 'Caller lacks a granter role', content: errorContent },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/v1/consent': {
      post: {
        tags: ['Governance'],
        summary: 'Record a consent decision for a data subject',
        operationId: 'recordConsent',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['subject'],
                properties: {
                  subject: { type: 'string', description: 'Consent subject id.' },
                  purpose: { type: 'string', description: 'A DataPurpose from the deployment vocabulary (CONSENT_PURPOSES); default DEFAULT_CONSENT_PURPOSE.' },
                  decision: { type: 'string', enum: ['GRANT', 'DENY'], default: 'GRANT' },
                  evidence: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Consent recorded' },
          '400': { description: 'Validation error (unknown purpose / invalid decision / missing subject)', content: errorContent },
          '403': { description: 'Caller lacks a consent-recorder role', content: errorContent },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
  };
}

// ─── Public API ───

/**
 * Generate an OpenAPI 3.0.3 specification from a ParsedSchema.
 *
 * @param version - Spec version string (defaults to '1.0.0').
 *                  Dump CLIs pass the platform version from package.json.
 */
export function generateOpenApiSpec(schema: ParsedSchema, version = '1.0.0'): Record<string, unknown> {
  // Merge all paths
  let paths: Record<string, unknown> = {};
  for (const obj of schema.objectTypes) {
    paths = { ...paths, ...objectPaths(obj) };
  }
  for (const action of schema.actionTypes) {
    paths = { ...paths, ...actionPath(action) };
  }
  // Governance APIs (A1 relationships, A2 consent) — not ODL-derived.
  paths = { ...paths, ...governancePaths() };
  // Object sets, action catalogue, LLM — per-deployment, also not ODL-derived.
  paths = { ...paths, ...platformPaths() };

  // Component schemas
  const schemas: Record<string, unknown> = {};
  for (const obj of schema.objectTypes) {
    schemas[obj.name] = objectSchema(obj);
  }

  // Enum schemas
  for (const e of schema.enums) {
    schemas[e.name] = {
      type: 'string',
      enum: e.values.map(v => v.name),
    };
  }

  // Shared schemas
  schemas['Pagination'] = {
    type: 'object',
    properties: {
      offset: { type: 'integer' },
      limit: { type: 'integer' },
      total: { type: 'integer' },
      hasMore: { type: 'boolean' },
    },
  };
  schemas['ErrorResponse'] = {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          category: { type: 'string' },
          message: { type: 'string' },
          retryable: { type: 'boolean' },
          details: { type: 'object' },
          traceId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Altius API',
      version,
      description: 'Auto-generated REST API for the Altius ontology platform.',
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    servers: [
      { url: '/', description: 'Current server' },
    ],
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        RateLimited: {
          description: 'Rate limit exceeded',
          headers: {
            'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until the rate limit resets' },
          },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}
