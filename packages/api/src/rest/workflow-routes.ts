/**
 * Workflow REST routes — visualization and monitoring surfaces.
 *
 *   GET  /api/v1/workflow/graph                — provenance graph (tenant-scoped)
 *   GET  /api/v1/workflow/graph/:objectType/:objectId — graph rooted at one object
 *   GET  /api/v1/workflow/events               — recent workflow events
 *   GET  /api/v1/workflow/workflows/:workflowId — ordered event log for one workflow
 *   GET  /api/v1/workflow/workflows/:workflowId/summary — outcome summary
 *
 * All routes are tenant-scoped via the authenticated user's tenantId. A
 * deployment without a workflowGraphBuilder or workflowMonitor dependency
 * does not register the corresponding routes — the surface is opt-in.
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateWorkflowRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // --- Workflow graph (visualization) ---

  routes.push({
    method: 'GET',
    pattern: '/api/v1/workflow/graph',
    readOperation: 'query',
    handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.workflowGraphBuilder) {
          return createRestErrorResponse({
            code: 'WORKFLOW_GRAPH_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'Workflow graph builder is not configured. Provide a lineage store and audit store.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const graph = await deps.workflowGraphBuilder.buildGraph(ctx.user.tenantId);
        return { status: 200, body: { data: graph } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  routes.push({
    method: 'GET',
    pattern: '/api/v1/workflow/graph/:objectType/:objectId',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.workflowGraphBuilder) {
          return createRestErrorResponse({
            code: 'WORKFLOW_GRAPH_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'Workflow graph builder is not configured.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const objectType = req.params['objectType'];
        const objectId = req.params['objectId'];
        if (!objectType || !objectId) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'objectType and objectId path parameters are required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const graph = await deps.workflowGraphBuilder.buildGraph(ctx.user.tenantId, {
          rootObject: { objectType, objectId },
        });
        return { status: 200, body: { data: graph } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // --- Workflow events (monitoring) ---

  routes.push({
    method: 'GET',
    pattern: '/api/v1/workflow/events',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.workflowMonitor) {
          return createRestErrorResponse({
            code: 'WORKFLOW_MONITOR_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'Workflow monitor is not configured.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const limitRaw = req.query['limit'];
        const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
        const events = await deps.workflowMonitor.getRecentEvents(
          ctx.user.tenantId,
          limit !== undefined && Number.isFinite(limit) ? limit : undefined,
        );
        return { status: 200, body: { data: events } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  routes.push({
    method: 'GET',
    pattern: '/api/v1/workflow/workflows/:workflowId',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.workflowMonitor) {
          return createRestErrorResponse({
            code: 'WORKFLOW_MONITOR_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'Workflow monitor is not configured.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const workflowId = req.params['workflowId'];
        if (!workflowId) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'workflowId path parameter is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const log = await deps.workflowMonitor.getWorkflowLog(ctx.user.tenantId, workflowId);
        return { status: 200, body: { data: log } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  routes.push({
    method: 'GET',
    pattern: '/api/v1/workflow/workflows/:workflowId/summary',
    readOperation: 'query',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.workflowMonitor) {
          return createRestErrorResponse({
            code: 'WORKFLOW_MONITOR_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'Workflow monitor is not configured.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const workflowId = req.params['workflowId'];
        if (!workflowId) {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'workflowId path parameter is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        const summary = await deps.workflowMonitor.summarizeWorkflow(ctx.user.tenantId, workflowId);
        if (!summary) {
          return createRestErrorResponse({
            code: 'WORKFLOW_NOT_FOUND',
            category: 'not_found',
            message: `No workflow events found for workflowId "${workflowId}"`,
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }
        return { status: 200, body: { data: summary } };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}
