/**
 * Ontology SQL REST routes — SQL Studio.
 *
 *   POST   /api/v1/sql/execute           — execute SQL query
 *   POST   /api/v1/sql/explain            — explain SQL query plan
 *   POST   /api/v1/sql/validate           — validate SQL query
 *   GET    /api/v1/sql/tables             — list virtual tables
 *   GET    /api/v1/sql/tables/:type       — describe virtual table
 *   GET    /api/v1/sql/saved              — list saved queries
 *   POST   /api/v1/sql/saved              — create saved query
 *   GET    /api/v1/sql/saved/:id          — get saved query
 *   PUT    /api/v1/sql/saved/:id          — update saved query
 *   DELETE /api/v1/sql/saved/:id          — delete saved query
 *   POST   /api/v1/sql/saved/:id/execute  — execute saved query
 *   POST   /api/v1/sql/saved/:id/share    — share saved query
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateOntologySqlRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.ontologySqlService) return [];
  const svc = deps.ontologySqlService;
  const routes: RestRoute[] = [];

  // POST /api/v1/sql/execute
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/execute',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sql = body['sql'] as string | undefined;
        if (!sql) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER', category: 'validation',
            message: 'sql is required', retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const options: Record<string, unknown> = {};
        if (typeof body['limit'] === 'number') options['limit'] = body['limit'];
        if (typeof body['timeoutMs'] === 'number') options['timeoutMs'] = body['timeoutMs'];
        if (body['parameters'] && typeof body['parameters'] === 'object') options['parameters'] = body['parameters'];
        const result = await svc.execute(ctx.requestContext, sql, options);
        return { status: 200, body: { data: result } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/sql/explain
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/explain',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sql = body['sql'] as string | undefined;
        if (!sql) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER', category: 'validation',
            message: 'sql is required', retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const explanation = await svc.explain(ctx.requestContext, sql);
        return { status: 200, body: { data: explanation } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/sql/validate
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/validate',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sql = body['sql'] as string | undefined;
        if (!sql) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER', category: 'validation',
            message: 'sql is required', retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const result = await svc.validate(ctx.requestContext, sql);
        return { status: 200, body: { data: result } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/sql/tables
  routes.push({
    method: 'GET',
    pattern: '/api/v1/sql/tables',
    readOperation: 'query',
    handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const tables = await svc.listVirtualTables(ctx.requestContext);
        return { status: 200, body: { data: tables } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/sql/tables/:type
  routes.push({
    method: 'GET',
    pattern: '/api/v1/sql/tables/:type',
    readOperation: 'read',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const table = await svc.describeVirtualTable(ctx.requestContext, req.params['type'] ?? '');
        if (!table) return { status: 404, body: { error: 'NOT_FOUND', message: 'Virtual table not found' } };
        return { status: 200, body: { data: table } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/sql/saved
  routes.push({
    method: 'GET',
    pattern: '/api/v1/sql/saved',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const tags = typeof req.query['tags'] === 'string' ? req.query['tags'].split(',') : undefined;
        const queries = await svc.listSavedQueries(ctx.requestContext, tags);
        return { status: 200, body: { data: queries } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/sql/saved
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/saved',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = body['name'] as string | undefined;
        const sql = body['sql'] as string | undefined;
        if (!name || !sql) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER', category: 'validation',
            message: 'name and sql are required', retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const query = await svc.createSavedQuery(ctx.requestContext, {
          name, sql,
          description: typeof body['description'] === 'string' ? body['description'] : '',
          isPublic: body['isPublic'] === true,
          tags: Array.isArray(body['tags']) ? body['tags'] as string[] : [],
        });
        return { status: 201, body: { data: query } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/sql/saved/:id
  routes.push({
    method: 'GET',
    pattern: '/api/v1/sql/saved/:id',
    readOperation: 'read',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const query = await svc.getSavedQuery(ctx.requestContext, req.params['id'] ?? '');
        if (!query) return { status: 404, body: { error: 'NOT_FOUND', message: 'Saved query not found' } };
        return { status: 200, body: { data: query } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // PUT /api/v1/sql/saved/:id
  routes.push({
    method: 'PUT',
    pattern: '/api/v1/sql/saved/:id',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (typeof body['name'] === 'string') updates['name'] = body['name'];
        if (typeof body['description'] === 'string') updates['description'] = body['description'];
        if (typeof body['sql'] === 'string') updates['sql'] = body['sql'];
        if (typeof body['isPublic'] === 'boolean') updates['isPublic'] = body['isPublic'];
        if (Array.isArray(body['tags'])) updates['tags'] = body['tags'];
        const query = await svc.updateSavedQuery(ctx.requestContext, req.params['id'] ?? '', updates);
        return { status: 200, body: { data: query } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // DELETE /api/v1/sql/saved/:id
  routes.push({
    method: 'DELETE',
    pattern: '/api/v1/sql/saved/:id',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        await svc.deleteSavedQuery(ctx.requestContext, req.params['id'] ?? '');
        return { status: 204, body: {} };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/sql/saved/:id/execute
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/saved/:id/execute',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const options: Record<string, unknown> = {};
        if (typeof body['limit'] === 'number') options['limit'] = body['limit'];
        if (typeof body['timeoutMs'] === 'number') options['timeoutMs'] = body['timeoutMs'];
        if (body['parameters'] && typeof body['parameters'] === 'object') options['parameters'] = body['parameters'];
        const result = await svc.executeSavedQuery(ctx.requestContext, req.params['id'] ?? '', options);
        return { status: 200, body: { data: result } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/sql/saved/:id/share
  routes.push({
    method: 'POST',
    pattern: '/api/v1/sql/saved/:id/share',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const userIds = Array.isArray(body['userIds']) ? body['userIds'] as string[] : [];
        if (userIds.length === 0) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER', category: 'validation',
            message: 'userIds array is required', retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const query = await svc.shareSavedQuery(ctx.requestContext, req.params['id'] ?? '', userIds);
        return { status: 200, body: { data: query } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}
