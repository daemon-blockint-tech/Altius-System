/**
 * Data freshness REST routes.
 *
 *   POST   /api/v1/data-freshness/sync        — record a sync completion
 *   GET    /api/v1/data-freshness/types/:type — freshness for an object type
 *   GET    /api/v1/data-freshness             — query freshness records
 *   GET    /api/v1/data-freshness/summary     — freshness summary
 *   DELETE /api/v1/data-freshness/types/:type — delete a freshness record
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateDataFreshnessRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.dataFreshnessService) return [];
  const svc = deps.dataFreshnessService;
  const routes: RestRoute[] = [];

  // POST /api/v1/data-freshness/sync — record a sync
  routes.push({
    method: 'POST',
    pattern: '/api/v1/data-freshness/sync',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const objectType = body['objectType'] as string | undefined;
        const datasource = body['datasource'] as string | undefined;
        if (!objectType && !datasource) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'Either objectType or datasource must be provided',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const record = await svc.recordSync(ctx.requestContext, {
          objectType,
          datasource,
          recordCount: typeof body['recordCount'] === 'number' ? body['recordCount'] : 0,
          succeeded: body['succeeded'] !== false,
          error: typeof body['error'] === 'string' ? body['error'] : undefined,
          intervalMs: typeof body['intervalMs'] === 'number' ? body['intervalMs'] : undefined,
        });
        return { status: 201, body: { data: record } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/data-freshness/types/:type — freshness for an object type
  routes.push({
    method: 'GET',
    pattern: '/api/v1/data-freshness/types/:type',
    readOperation: 'read',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const objectType = req.params['type'] ?? '';
        const record = await svc.getFreshnessForType(ctx.requestContext, objectType);
        if (!record) return { status: 404, body: { error: 'NOT_FOUND', message: `No freshness record for type: ${objectType}` } };
        return { status: 200, body: { data: record } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/data-freshness — query freshness records
  routes.push({
    method: 'GET',
    pattern: '/api/v1/data-freshness',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const query: Record<string, unknown> = {};
        if (typeof req.query['objectType'] === 'string') query['objectType'] = req.query['objectType'];
        if (typeof req.query['datasource'] === 'string') query['datasource'] = req.query['datasource'];
        if (typeof req.query['maxAgeSeconds'] === 'string') query['maxAgeSeconds'] = parseInt(req.query['maxAgeSeconds'], 10);
        if (typeof req.query['minAgeSeconds'] === 'string') query['minAgeSeconds'] = parseInt(req.query['minAgeSeconds'], 10);
        const records = await svc.queryFreshness(ctx.requestContext, query);
        return { status: 200, body: { data: records } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // GET /api/v1/data-freshness/summary — freshness summary
  routes.push({
    method: 'GET',
    pattern: '/api/v1/data-freshness/summary',
    readOperation: 'read',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const maxAgeSeconds = typeof req.query['maxAgeSeconds'] === 'string' ? parseInt(req.query['maxAgeSeconds'], 10) : undefined;
        const summary = await svc.getSummary(ctx.requestContext, maxAgeSeconds);
        return { status: 200, body: { data: summary } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // DELETE /api/v1/data-freshness/types/:type — delete a freshness record
  routes.push({
    method: 'DELETE',
    pattern: '/api/v1/data-freshness/types/:type',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const objectType = req.params['type'] ?? '';
        await svc.deleteFreshness(ctx.requestContext, objectType);
        return { status: 204, body: {} };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}

/** Per-object-type data-freshness routes (API Tooling). */
export { generateObjectDataFreshnessRoutes } from './api-tooling-routes.js';
