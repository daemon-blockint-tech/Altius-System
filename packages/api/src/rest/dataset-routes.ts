/**
 * Dataset REST routes — versioned transactional datasets.
 *
 *   POST   /api/v1/datasets                    — create dataset
 *   GET    /api/v1/datasets                     — list datasets
 *   GET    /api/v1/datasets/:name               — get dataset
 *   DELETE /api/v1/datasets/:name               — drop dataset
 *   PUT    /api/v1/datasets/:name/schema         — update schema
 *   POST   /api/v1/datasets/:name/insert        — insert rows
 *   POST   /api/v1/datasets/:name/update        — update rows
 *   POST   /api/v1/datasets/:name/delete        — delete rows
 *   POST   /api/v1/datasets/:name/truncate      — truncate
 *   GET    /api/v1/datasets/:name/read          — read rows (projection, filter, order, CSV)
 *   GET    /api/v1/datasets/:name/metadata      — metadata incl. rowCount
 *   GET    /api/v1/datasets/:name/schema        — schema by branch/version/transaction
 *   GET    /api/v1/datasets/:name/transactions  — list transactions
 *   GET    /api/v1/datasets/:name/transactions/:tid — get transaction
 *   POST   /api/v1/datasets/:name/branches      — create branch
 *   GET    /api/v1/datasets/:name/branches      — list branches
 *   POST   /api/v1/datasets/:name/merge         — merge branch
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { DatasetSchema } from '@altius/spi';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateDatasetRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.datasetService) return [];
  const svc = deps.datasetService;
  const routes: RestRoute[] = [];

  // POST /api/v1/datasets — create
  routes.push({
    method: 'POST',
    pattern: '/api/v1/datasets',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = body['name'] as string | undefined;
        if (!name) {
          return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        }
        const ds = await svc.create(ctx.requestContext, {
          name,
          description: typeof body['description'] === 'string' ? body['description'] : '',
          schema: body['schema'] as DatasetSchema,
        });
        return { status: 201, body: { data: ds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets — list
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets', readOperation: 'query',
    handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; }
      catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets/:name — get
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name', readOperation: 'read',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const ds = await svc.get(ctx.requestContext, req.params['name'] ?? '', branch);
        if (!ds) return { status: 404, body: { error: 'NOT_FOUND', message: 'Dataset not found' } };
        return { status: 200, body: { data: ds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // DELETE /api/v1/datasets/:name — drop
  routes.push({
    method: 'DELETE', pattern: '/api/v1/datasets/:name',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        await svc.drop(ctx.requestContext, req.params['name'] ?? '', branch);
        return { status: 204, body: {} };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // PUT /api/v1/datasets/:name/schema — update schema
  routes.push({
    method: 'PUT', pattern: '/api/v1/datasets/:name/schema',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const ds = await svc.updateSchema(ctx.requestContext, req.params['name'] ?? '', body['schema'] as never, branch);
        return { status: 200, body: { data: ds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/insert
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/insert',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const result = await svc.insert(ctx.requestContext, req.params['name'] ?? '', {
          rows: Array.isArray(body['rows']) ? body['rows'] as Record<string, unknown>[] : [],
          upsert: body['upsert'] === true,
          message: typeof body['message'] === 'string' ? body['message'] : undefined,
        }, branch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/update
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/update',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const result = await svc.update(ctx.requestContext, req.params['name'] ?? '', body['filter'] as Record<string, unknown>, body['patch'] as Record<string, unknown>, branch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/delete
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/delete',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const result = await svc.delete(ctx.requestContext, req.params['name'] ?? '', body['filter'] as Record<string, unknown>, branch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/truncate
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/truncate',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const result = await svc.truncate(ctx.requestContext, req.params['name'] ?? '', branch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets/:name/read
  //
  // Addressing: ?branch= and ?asOfTransactionId= / ?asOfSchemaVersion=.
  // Shaping: ?columns=a,b (projection), ?filter={json}, ?orderBy=a:desc,b,
  // ?limit=&offset=. ?format=csv returns text/csv over the projected columns
  // instead of JSON, so a dataset can be exported page by page.
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name/read', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const options: Record<string, unknown> = {};
        if (typeof req.query['limit'] === 'string') options['limit'] = parseInt(req.query['limit'], 10);
        if (typeof req.query['offset'] === 'string') options['offset'] = parseInt(req.query['offset'], 10);
        if (typeof req.query['asOfTransactionId'] === 'string') options['asOfTransactionId'] = req.query['asOfTransactionId'];
        if (typeof req.query['asOfSchemaVersion'] === 'string') {
          const v = parseInt(req.query['asOfSchemaVersion'], 10);
          if (isNaN(v)) {
            return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'asOfSchemaVersion must be an integer', retryable: false, traceId: ctx.requestContext.traceId });
          }
          options['asOfSchemaVersion'] = v;
        }

        const name = req.params['name'] ?? '';
        const ds = await svc.get(ctx.requestContext, name, branch);
        if (!ds) return { status: 404, body: { error: 'NOT_FOUND', message: `Dataset '${name}' not found` } };
        const schemaColumns = new Set(ds.schema.columns.map(c => c.name));

        // Column projection — validated against the schema so a typo is a 400
        // rather than a page of null columns.
        let columns: string[] | undefined;
        if (typeof req.query['columns'] === 'string' && req.query['columns'].length > 0) {
          columns = req.query['columns'].split(',').map(c => c.trim()).filter(c => c.length > 0);
          const unknown = columns.filter(c => !schemaColumns.has(c));
          if (unknown.length > 0) {
            return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `Unknown column(s): ${unknown.join(', ')}`, retryable: false, traceId: ctx.requestContext.traceId });
          }
          options['columns'] = columns;
        }

        if (typeof req.query['filter'] === 'string' && req.query['filter'].length > 0) {
          try {
            options['filter'] = JSON.parse(req.query['filter']) as Record<string, unknown>;
          } catch {
            return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'filter must be a JSON object', retryable: false, traceId: ctx.requestContext.traceId });
          }
        }

        if (typeof req.query['orderBy'] === 'string' && req.query['orderBy'].length > 0) {
          const parsed: { field: string; direction: 'asc' | 'desc' }[] = [];
          for (const part of req.query['orderBy'].split(',')) {
            const [field, dir] = part.split(':').map(t => t.trim());
            if (!field) continue;
            if (!schemaColumns.has(field)) {
              return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `Unknown orderBy column: ${field}`, retryable: false, traceId: ctx.requestContext.traceId });
            }
            if (dir && dir !== 'asc' && dir !== 'desc') {
              return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `orderBy direction must be asc or desc, got '${dir}'`, retryable: false, traceId: ctx.requestContext.traceId });
            }
            parsed.push({ field, direction: (dir as 'asc' | 'desc' | undefined) ?? 'asc' });
          }
          if (parsed.length > 0) options['orderBy'] = parsed;
        }

        const result = await svc.read(ctx.requestContext, name, options, branch);

        const format = typeof req.query['format'] === 'string' ? req.query['format'].toLowerCase() : 'json';
        if (format === 'csv') {
          const cols = columns ?? ds.schema.columns.map(c => c.name);
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${name}.csv"`,
              'X-Dataset-Transaction-Id': result.transactionId,
            },
            body: rowsToCsv(cols, result.rows),
          };
        }
        if (format !== 'json') {
          return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `Unsupported format '${format}'. Use json or csv.`, retryable: false, traceId: ctx.requestContext.traceId });
        }
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets/:name/metadata — metadata incl. rowCount
  if (deps.datasetMetadataService) {
    const meta = deps.datasetMetadataService;
    routes.push({
      method: 'GET', pattern: '/api/v1/datasets/:name/metadata', readOperation: 'read',
      handler: async (req, ctx) => {
        try {
          const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
          const md = await meta.get(ctx.requestContext, req.params['name'] ?? '', branch);
          if (!md) return { status: 404, body: { error: 'NOT_FOUND', message: 'Dataset not found' } };
          return { status: 200, body: { data: md } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });

    // GET /api/v1/datasets/:name/schema?branch=&version=&asOfTransactionId=
    routes.push({
      method: 'GET', pattern: '/api/v1/datasets/:name/schema', readOperation: 'read',
      handler: async (req, ctx) => {
        try {
          const options: { branch?: string; version?: number; asOfTransactionId?: string } = {};
          if (typeof req.query['branch'] === 'string') options.branch = req.query['branch'];
          if (typeof req.query['asOfTransactionId'] === 'string') options.asOfTransactionId = req.query['asOfTransactionId'];
          if (typeof req.query['version'] === 'string') {
            const v = parseInt(req.query['version'], 10);
            if (isNaN(v)) {
              return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'version must be an integer', retryable: false, traceId: ctx.requestContext.traceId });
            }
            options.version = v;
          }
          const schema = await meta.getSchema(ctx.requestContext, req.params['name'] ?? '', options);
          if (!schema) {
            return { status: 404, body: { error: 'NOT_FOUND', message: 'No schema for that dataset at the requested version/transaction' } };
          }
          return { status: 200, body: { data: schema } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // GET /api/v1/datasets/:name/transactions
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name/transactions', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
        const txns = await svc.listTransactions(ctx.requestContext, req.params['name'] ?? '', branch, limit);
        return { status: 200, body: { data: txns } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets/:name/transactions/:tid
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name/transactions/:tid', readOperation: 'read',
    handler: async (req, ctx) => {
      try {
        const txn = await svc.getTransaction(ctx.requestContext, req.params['name'] ?? '', req.params['tid'] ?? '');
        if (!txn) return { status: 404, body: { error: 'NOT_FOUND', message: 'Transaction not found' } };
        return { status: 200, body: { data: txn } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/branches — create branch
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/branches',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const branchName = body['name'] as string | undefined;
        if (!branchName) {
          return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        }
        const fromTxn = typeof body['fromTransactionId'] === 'string' ? body['fromTransactionId'] : undefined;
        const branch = await svc.createBranch(ctx.requestContext, req.params['name'] ?? '', branchName, fromTxn);
        return { status: 201, body: { data: branch } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // GET /api/v1/datasets/:name/branches — list branches
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name/branches', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const branches = await svc.listBranches(ctx.requestContext, req.params['name'] ?? '');
        return { status: 200, body: { data: branches } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // POST /api/v1/datasets/:name/merge — merge branch
  routes.push({
    method: 'POST', pattern: '/api/v1/datasets/:name/merge',
    handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sourceBranch = body['sourceBranch'] as string | undefined;
        if (!sourceBranch) {
          return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'sourceBranch is required', retryable: false, traceId: ctx.requestContext.traceId });
        }
        const targetBranch = typeof body['targetBranch'] === 'string' ? body['targetBranch'] : undefined;
        const result = await svc.mergeBranch(ctx.requestContext, req.params['name'] ?? '', sourceBranch, targetBranch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  return routes;
}

/**
 * Serialise dataset rows to CSV. Values that are objects are JSON-encoded;
 * quotes/newlines/commas are escaped per RFC 4180.
 */
function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    const str = value instanceof Date
      ? value.toISOString()
      : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => escape(r[c])).join(','))].join('\n');
}
