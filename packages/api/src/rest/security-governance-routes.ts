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

/**
 * Roles allowed to explain a principal other than themselves. Mirrors the
 * audit-reader default: the answer is information about someone else's
 * permissions, so it is an administrative read.
 */
export const DEFAULT_SIMULATION_ROLES = ['admin'] as const;

/**
 * Roles allowed to manage scoped sessions beyond self-service. A scoped
 * session RESTRICTS its subject's effective markings (enforced at the auth
 * funnel), so cross-user create is a denial-of-access on the victim and
 * revoke of an admin-imposed session is the subject's escape hatch — both
 * administrative writes. Mirrors the audit-reader default.
 */
export const DEFAULT_SCOPED_SESSION_ADMIN_ROLES = ['admin'] as const;

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
          const callerId = ctx.requestContext.actorId ?? req.user.id;

          // Simulation: explain another principal's access. That answer is
          // information about THEIR permissions, so it is admin-gated — the
          // same gate the audit trail uses. Without the gate, any user could
          // enumerate a colleague's access.
          const subject = typeof body['subjectUserId'] === 'string' ? body['subjectUserId'] : undefined;
          const simulated = subject !== undefined && subject !== callerId;
          if (simulated) {
            const explainRoles = deps.accessExplanationSimulationRoles ?? DEFAULT_SIMULATION_ROLES;
            if (!explainRoles.some(role => ctx.user.roles.includes(role))) {
              return createRestErrorResponse({
                code: 'FORBIDDEN',
                category: 'authorization',
                message: explainRoles.length === 0
                  ? 'Explaining another principal\'s access is disabled: no simulation role is configured.'
                  : `Explaining another principal's access requires one of: ${explainRoles.join(', ')}`,
                retryable: false,
                traceId: ctx.requestContext.traceId,
              });
            }
          }

          const fieldsInput = body['fields'];
          const fields = Array.isArray(fieldsInput)
            ? fieldsInput.filter((f): f is string => typeof f === 'string')
            : undefined;

          const result = await svc.explain({
            tenantId: ctx.requestContext.tenantId,
            userId: simulated ? subject! : callerId,
            objectType,
            objectId: typeof body['objectId'] === 'string' ? body['objectId'] : undefined,
            action: typeof body['action'] === 'string' ? body['action'] : undefined,
            // For a simulation the caller states the principal's roles and
            // markings; for a self-explanation they come from the live token,
            // so a caller cannot inflate their own answer.
            roles: simulated
              ? (Array.isArray(body['roles']) ? (body['roles'] as unknown[]).filter((r): r is string => typeof r === 'string') : [])
              : ctx.user.roles,
            markings: simulated
              ? (Array.isArray(body['markings']) ? (body['markings'] as unknown[]).filter((m): m is string => typeof m === 'string') : [])
              : (ctx.user.markings ?? []),
            ...(fields && fields.length > 0 ? { fields } : {}),
            ...(simulated ? { simulated: true } : {}),
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
    const sessionAdminRoles = deps.scopedSessionAdminRoles ?? DEFAULT_SCOPED_SESSION_ADMIN_ROLES;
    const isSessionAdmin = (ctx: ResolverContext): boolean =>
      sessionAdminRoles.some(role => ctx.user.roles.includes(role));

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
          // Self-service stays open (Foundry: users pick their own session);
          // restricting ANOTHER user's markings is an administrative write.
          if (userId !== ctx.user.id && !isSessionAdmin(ctx)) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: sessionAdminRoles.length === 0
                ? 'Creating a scoped session for another user is disabled: no session-admin role is configured.'
                : `Creating a scoped session for another user requires one of: ${sessionAdminRoles.join(', ')}`,
              retryable: false,
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
          // Non-admins see only their own sessions: metadata names markings a
          // user holds, which is administrative information about them.
          const requested = typeof req.query['userId'] === 'string' ? req.query['userId'] : undefined;
          const userId = isSessionAdmin(ctx) ? requested : ctx.user.id;
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
          // 404 (not 403) for sessions the caller may not see: a distinct
          // status would confirm the id exists — an enumeration oracle.
          if (!session || (session.userId !== ctx.user.id && session.createdBy !== ctx.user.id && !isSessionAdmin(ctx))) {
            return { status: 404, body: { error: 'NOT_FOUND', message: 'Scoped session not found' } };
          }
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
          const session = await store.get(ctx.requestContext.tenantId, req.params['id'] ?? '');
          if (!session || (session.userId !== ctx.user.id && session.createdBy !== ctx.user.id && !isSessionAdmin(ctx))) {
            return { status: 404, body: { error: 'NOT_FOUND', message: 'Scoped session not found' } };
          }
          // Revoking lifts the restriction. Only the creator (undoing their
          // own self-service session) or a session admin may do that — the
          // session's SUBJECT must not be able to shed an imposed restriction.
          if (session.createdBy !== ctx.user.id && !isSessionAdmin(ctx)) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: sessionAdminRoles.length === 0
                ? 'Revoking this scoped session is disabled: no session-admin role is configured.'
                : `Revoking a scoped session you did not create requires one of: ${sessionAdminRoles.join(', ')}`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }
          await store.revoke(ctx.requestContext.tenantId, session.id);
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
          const session = await store.get(ctx.requestContext.tenantId, req.params['id'] ?? '');
          if (!session || (session.userId !== ctx.user.id && session.createdBy !== ctx.user.id && !isSessionAdmin(ctx))) {
            return { status: 404, body: { error: 'NOT_FOUND', message: 'Scoped session not found' } };
          }
          const allowed = await store.isMarkingAllowed(ctx.requestContext.tenantId, session.id, marking);
          return { status: 200, body: { data: { allowed } } };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    });
  }

  return routes;
}
