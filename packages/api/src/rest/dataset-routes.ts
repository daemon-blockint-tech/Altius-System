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
 *   GET    /api/v1/datasets/:name/read          — read rows
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
  routes.push({
    method: 'GET', pattern: '/api/v1/datasets/:name/read', readOperation: 'query',
    handler: async (req, ctx) => {
      try {
        const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
        const options: Record<string, unknown> = {};
        if (typeof req.query['limit'] === 'string') options['limit'] = parseInt(req.query['limit'], 10);
        if (typeof req.query['offset'] === 'string') options['offset'] = parseInt(req.query['offset'], 10);
        if (typeof req.query['asOfTransactionId'] === 'string') options['asOfTransactionId'] = req.query['asOfTransactionId'];
        const result = await svc.read(ctx.requestContext, req.params['name'] ?? '', options, branch);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

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
