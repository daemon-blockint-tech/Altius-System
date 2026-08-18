/**
 * Security governance REST routes.
 *
 *   POST   /api/v1/security/explain              — explain access decision
 *   POST   /api/v1/security/justifications       — record justification
 *   GET    /api/v1/security/justifications        — query justifications
 *   GET    /api/v1/security/justifications/:id    — get justification
 *   POST   /api/v1/security/justifications/:id/approve — approve justification
 *   POST   /api/v1/security/sessions              — create scoped session
 *   GET    /api/v1/security/sessions              — list scoped sessions
 *   GET    /api/v1/security/sessions/:id          — get scoped session
 *   POST   /api/v1/security/sessions/:id/revoke   — revoke scoped session
 *   GET    /api/v1/security/sessions/:id/check    — check marking allowed
 */

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateSecurityGovernanceRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // ── Access explanation ──

  if (deps.accessExplanationService) {
    const svc = deps.accessExplanationService;

    routes.push({
      method: 'POST',
      pattern: '/api/v1/security/explain',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const objectType = body['objectType'] as string | undefined;
          if (!objectType) {
            return createRestErrorResponse({
              code: 'MISSING_PARAMETER', category: 'validation',
              message: 'objectType is required', retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const result = await svc.explain({
            tenantId: ctx.requestContext.tenantId,
            userId: ctx.requestContext.actorId ?? req.user.id,
            objectType,
            objectId: typeof body['objectId'] === 'string' ? body['objectId'] : undefined,
            action: typeof body['action'] === 'string' ? body['action'] : undefined,
          });
          return { status: 200, body: { data: result } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });
  }

  // ── Justification store ──

  if (deps.justificationStore) {
    const store = deps.justificationStore;

    routes.push({
      method: 'POST',
      pattern: '/api/v1/security/justifications',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const actionName = body['actionName'] as string | undefined;
          const justification = body['justification'] as string | undefined;
          if (!actionName || !justification) {
            return createRestErrorResponse({
              code: 'MISSING_PARAMETER', category: 'validation',
              message: 'actionName and justification are required', retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const record = await store.create(
            ctx.requestContext.tenantId,
            ctx.requestContext.actorId ?? req.user.id,
            {
              actionName,
              objectType: typeof body['objectType'] === 'string' ? body['objectType'] : undefined,
              objectId: typeof body['objectId'] === 'string' ? body['objectId'] : undefined,
              justification,
              category: (body['category'] as 'break-glass' | 'routine' | 'audit' | 'emergency' | 'legal') ?? 'routine',
            },
          );
          return { status: 201, body: { data: record } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'GET',
      pattern: '/api/v1/security/justifications',
      readOperation: 'query',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const query: Record<string, unknown> = {};
          if (typeof req.query['userId'] === 'string') query['userId'] = req.query['userId'];
          if (typeof req.query['actionName'] === 'string') query['actionName'] = req.query['actionName'];
          if (typeof req.query['objectType'] === 'string') query['objectType'] = req.query['objectType'];
          if (typeof req.query['limit'] === 'string') query['limit'] = parseInt(req.query['limit'], 10);
          if (typeof req.query['offset'] === 'string') query['offset'] = parseInt(req.query['offset'], 10);
          const result = await store.list(ctx.requestContext.tenantId, query);
          return { status: 200, body: { data: result.records, totalCount: result.totalCount } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'GET',
      pattern: '/api/v1/security/justifications/:id',
      readOperation: 'read',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const record = await store.get(ctx.requestContext.tenantId, req.params['id'] ?? '');
          if (!record) return { status: 404, body: { error: 'NOT_FOUND', message: 'Justification not found' } };
          return { status: 200, body: { data: record } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/security/justifications/:id/approve',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          await store.approve(ctx.requestContext.tenantId, req.params['id'] ?? '', ctx.requestContext.actorId ?? req.user.id);
          return { status: 200, body: { data: { approved: true } } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });
  }

  // ── Scoped session store ──

  if (deps.scopedSessionStore) {
    const store = deps.scopedSessionStore;

    routes.push({
      method: 'POST',
      pattern: '/api/v1/security/sessions',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const userId = body['userId'] as string | undefined;
          const label = body['label'] as string | undefined;
          if (!userId || !label) {
            return createRestErrorResponse({
              code: 'MISSING_PARAMETER', category: 'validation',
              message: 'userId and label are required', retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const session = await store.create(
            ctx.requestContext.tenantId,
            ctx.requestContext.actorId ?? req.user.id,
            {
              userId,
              allowedMarkings: Array.isArray(body['allowedMarkings']) ? body['allowedMarkings'] as string[] : [],
              excludedMarkings: Array.isArray(body['excludedMarkings']) ? body['excludedMarkings'] as string[] : [],
              label,
              durationSeconds: typeof body['durationSeconds'] === 'number' ? body['durationSeconds'] : 3600,
            },
          );
          return { status: 201, body: { data: session } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'GET',
      pattern: '/api/v1/security/sessions',
      readOperation: 'query',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const userId = typeof req.query['userId'] === 'string' ? req.query['userId'] : undefined;
          const sessions = await store.list(ctx.requestContext.tenantId, userId);
          return { status: 200, body: { data: sessions } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'GET',
      pattern: '/api/v1/security/sessions/:id',
      readOperation: 'read',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const session = await store.get(ctx.requestContext.tenantId, req.params['id'] ?? '');
          if (!session) return { status: 404, body: { error: 'NOT_FOUND', message: 'Scoped session not found' } };
          return { status: 200, body: { data: session } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/security/sessions/:id/revoke',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          await store.revoke(ctx.requestContext.tenantId, req.params['id'] ?? '');
          return { status: 200, body: { data: { revoked: true } } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });

    routes.push({
      method: 'GET',
      pattern: '/api/v1/security/sessions/:id/check',
      readOperation: 'read',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const marking = req.query['marking'];
          if (typeof marking !== 'string') {
            return createRestErrorResponse({
              code: 'MISSING_PARAMETER', category: 'validation',
              message: 'marking query parameter is required', retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          const allowed = await store.isMarkingAllowed(ctx.requestContext.tenantId, req.params['id'] ?? '', marking);
          return { status: 200, body: { data: { allowed } } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });
  }

  return routes;
}
