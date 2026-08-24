/**
 * REST routes for marking administration (Section: mandatory access control).
 *
 * Marking DEFINITIONS are pack-declared (governance-as-code); these routes
 * administer the runtime half — WHO holds a marking. Gated like the audit
 * trail (MARKING_ADMIN_ROLES, default admin; explicitly empty = nobody),
 * tenant-scoped from the caller's token, never from the body.
 */
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ResolverContext } from '../graphql/types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export const DEFAULT_MARKING_ADMIN_ROLES = ['admin'] as const;

function forbidden(roles: readonly string[], traceId: string): RestResponse {
  return createRestErrorResponse({
    code: 'FORBIDDEN',
    category: 'authorization',
    message: roles.length === 0
      ? 'Marking administration is disabled: no marking-admin role is configured.'
      : `Marking administration requires one of: ${roles.join(', ')}`,
    retryable: false,
    traceId,
  });
}

export function generateMarkingRoutes(deps: ResolverContext['deps']): RestRoute[] {
  const store = deps.markingMembershipStore;
  const defStore = deps.markingDefinitionStore;

  const gate = (ctx: ResolverContext): RestResponse | null => {
    const roles = deps.markingAdminRoles ?? DEFAULT_MARKING_ADMIN_ROLES;
    if (!roles.some(r => ctx.user.roles.includes(r))) {
      return forbidden(roles, ctx.requestContext.traceId ?? 'unknown');
    }
    return null;
  };

  const routes: RestRoute[] = [
    {
      method: 'GET',
      pattern: '/api/v1/markings',
      handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        const denied = gate(ctx); if (denied) return denied;
        return { status: 200, body: { data: deps.markingPolicy?.listDefinitions() ?? [] } };
      },
    },
  ];

  // ── Marking definition admin routes (runtime CRUD) ──
  if (defStore) {
    routes.push(
      {
        method: 'POST',
        pattern: '/api/v1/markings/definitions',
        handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
          try {
            const denied = gate(ctx); if (denied) return denied;
            const body = req.body as { name?: unknown; category?: unknown; rank?: unknown } | undefined;
            const name = body?.name;
            if (typeof name !== 'string' || name.length === 0) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR', category: 'validation',
                message: 'Body must carry a non-empty string name.',
                retryable: false, traceId: ctx.requestContext.traceId,
              });
            }
            const category = typeof body?.category === 'string' ? body.category : undefined;
            const rank = typeof body?.rank === 'number' ? body.rank : undefined;
            const record = await defStore.createDefinition(
              ctx.requestContext.tenantId,
              { name, category, rank },
              ctx.user.id,
            );
            // Add to the live policy so it's enforceable immediately
            deps.markingPolicy?.addDefinition({ name, category, rank });
            return { status: 201, body: record as unknown as Record<string, unknown> };
          } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
        },
      },
      {
        method: 'DELETE',
        pattern: '/api/v1/markings/definitions/:name',
        handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
          try {
            const denied = gate(ctx); if (denied) return denied;
            const name = req.params['name']!;
            const removed = await defStore.deleteDefinition(ctx.requestContext.tenantId, name);
            if (removed) deps.markingPolicy?.removeDefinition(name);
            return removed ? { status: 204, body: '' } : {
              status: 404,
              body: { error: { code: 'NOT_FOUND', message: 'No such marking definition.' } },
            };
          } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
        },
      },
      {
        method: 'GET',
        pattern: '/api/v1/markings/definitions',
        handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
          const denied = gate(ctx); if (denied) return denied;
          const data = await defStore.listDefinitions(ctx.requestContext.tenantId);
          return { status: 200, body: { data } };
        },
      },
      {
        method: 'POST',
        pattern: '/api/v1/markings/categories',
        handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
          try {
            const denied = gate(ctx); if (denied) return denied;
            const body = req.body as { name?: unknown; mode?: unknown } | undefined;
            const name = body?.name;
            const mode = body?.mode;
            if (typeof name !== 'string' || name.length === 0) {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR', category: 'validation',
                message: 'Body must carry a non-empty string name.',
                retryable: false, traceId: ctx.requestContext.traceId,
              });
            }
            if (mode !== 'CONJUNCTIVE' && mode !== 'DISJUNCTIVE') {
              return createRestErrorResponse({
                code: 'VALIDATION_ERROR', category: 'validation',
                message: 'Body must carry mode: CONJUNCTIVE or DISJUNCTIVE.',
                retryable: false, traceId: ctx.requestContext.traceId,
              });
            }
            const record = await defStore.createCategory(
              ctx.requestContext.tenantId,
              { name, mode },
              ctx.user.id,
            );
            deps.markingPolicy?.addCategory({ name, mode });
            return { status: 201, body: record as unknown as Record<string, unknown> };
          } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
        },
      },
      {
        method: 'GET',
        pattern: '/api/v1/markings/categories',
        handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
          const denied = gate(ctx); if (denied) return denied;
          const data = await defStore.listCategories(ctx.requestContext.tenantId);
          return { status: 200, body: { data } };
        },
      },
    );
  }

  // ── Marking membership routes (runtime half — WHO holds a marking) ──
  if (store) {
    routes.push(
      {
        method: 'GET',
        pattern: '/api/v1/markings/:marking/members',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const denied = gate(ctx); if (denied) return denied;
          const marking = req.params['marking']!;
          const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10) || 100, 1000);
          const offset = parseInt(String(req.query['offset'] ?? '0'), 10) || 0;
          const data = await store.listMembers(ctx.requestContext.tenantId, marking, { limit, offset });
          return { status: 200, body: { data, hasMore: data.length === limit } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/markings/:marking/members',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const denied = gate(ctx); if (denied) return denied;
          const marking = req.params['marking']!;
          const userId = (req.body as { userId?: unknown } | undefined)?.userId;
          if (typeof userId !== 'string' || userId.length === 0) {
            return createRestErrorResponse({
              code: 'VALIDATION_FAILED', category: 'validation',
              message: 'Body must carry a non-empty string userId.',
              retryable: false, traceId: ctx.requestContext.traceId,
            });
          }
          // An undefined marking is unsatisfiable at read time — granting it is
          // a config error the admin should hear about now, not at first read.
          if (deps.markingPolicy && !deps.markingPolicy.listDefinitions().some(d => d.name === marking)) {
            return createRestErrorResponse({
              code: 'VALIDATION_FAILED', category: 'validation',
              message: `Marking '${marking}' is not declared by any loaded pack.`,
              retryable: false, traceId: ctx.requestContext.traceId,
            });
          }
          const row = await store.grant(ctx.requestContext.tenantId, userId, marking, ctx.user.id);
          return { status: 201, body: row as unknown as Record<string, unknown> };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'DELETE',
      pattern: '/api/v1/markings/:marking/members/:userId',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const denied = gate(ctx); if (denied) return denied;
          const removed = await store.revoke(ctx.requestContext.tenantId, req.params['userId']!, req.params['marking']!);
          return removed ? { status: 204, body: '' } : {
            status: 404,
            body: { error: { code: 'NOT_FOUND', message: 'No such membership.' } },
          };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/users/:userId/markings',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const denied = gate(ctx); if (denied) return denied;
          const data = await store.listForUser(ctx.requestContext.tenantId, req.params['userId']!);
          return { status: 200, body: { data } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  );
  }

  return routes;
}
