/**
 * REST routes for the audit trail read API (Section 7.2.1).
 *
 * Audit records are written on every operation by AuditWriter, but without
 * these routes they are unreachable over HTTP — the PostgresAuditStore.query()
 * and MemoryAuditStore.query() implementations exist but had zero production
 * callers.
 *
 * Every query is scoped to the caller's tenantId: object ids are unique only
 * per tenant, so an unscoped read would return every tenant's operations on
 * `patient:123`, not just the caller's.
 *
 * Reads are also role-gated. The trail is not just metadata: action-executor
 * writes whole before/after object snapshots into AuditDetail, so an ungated
 * trail hands back exactly the field values that ReBAC scoping, field
 * redaction and the consent gate withhold on the object routes.
 */

import type { AuditQueryFilter } from '@altius/security';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ResolverContext } from '../graphql/types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 1000;

/**
 * Roles allowed to read the audit trail when a deployment configures none.
 *
 * Mirrors DEFAULT_GRANTER_ROLES and DEFAULT_CONSENT_RECORDER_ROLES: these are
 * administrative gates, not per-object ones. Role-based rather than ReBAC
 * because the trail spans every object in the tenant, so there is no single
 * object for OpenFGA to resolve a relation against.
 */
export const DEFAULT_AUDIT_READER_ROLES = ['admin'] as const;

/**
 * Generate the REST audit routes.
 *
 * Returns an empty array when deps.auditStore is absent, so a deployment
 * that does not configure audit reads simply gets no routes.
 */
export function generateAuditRoutes(deps: ResolverContext['deps']): RestRoute[] {
  if (!deps.auditStore) return [];

  return [
    {
      method: 'GET',
      pattern: '/api/v1/audit',
      handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          const readerRoles = deps.auditReaderRoles ?? DEFAULT_AUDIT_READER_ROLES;
          // An explicitly empty set means nobody, not everybody — the
          // permissive reading is the hole being closed.
          if (!readerRoles.some(role => ctx.user.roles.includes(role))) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: readerRoles.length === 0
                ? 'Audit trail reads are disabled: no audit-reader role is configured.'
                : `Reading the audit trail requires one of: ${readerRoles.join(', ')}`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          const filter = parseAuditFilter(req, ctx);
          const { limit, offset } = parsePagination(req);

          // Paged by the store, not here. Slicing a fetched result meant the
          // page was bounded by whatever the store chose to return — for
          // Postgres a hardcoded 1000 — so totalCount pinned at that bound,
          // hasMore went false with records still unread, and any offset past
          // it returned empty. The count is a separate query because the page
          // length only describes the page.
          const [records, totalCount] = await Promise.all([
            deps.auditStore!.query(filter, { limit, offset }),
            deps.auditStore!.count(filter),
          ]);

          return {
            status: 200,
            body: {
              data: records,
              totalCount,
              hasMore: offset + records.length < totalCount,
            },
          };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
  ];
}

/**
 * Build the AuditQueryFilter from query params, always scoped to the caller's
 * tenant. A caller cannot read another tenant's audit trail by passing
 * tenantId as a query param — the field is never read from the request.
 */
function parseAuditFilter(req: RestRequest, ctx: ResolverContext): AuditQueryFilter {
  const q = req.query;
  const filter: AuditQueryFilter = {
    tenantId: ctx.user.tenantId,
  };

  if (typeof q['actorId'] === 'string') filter.actorId = q['actorId'];
  if (typeof q['actorType'] === 'string') {
    if (q['actorType'] === 'user' || q['actorType'] === 'system' || q['actorType'] === 'connector') {
      filter.actorType = q['actorType'];
    }
  }
  if (typeof q['objectType'] === 'string') filter.objectType = q['objectType'];
  if (typeof q['objectId'] === 'string') filter.objectId = q['objectId'];
  if (typeof q['actionType'] === 'string') filter.actionType = q['actionType'];
  if (typeof q['operationType'] === 'string') filter.operationType = q['operationType'] as AuditQueryFilter['operationType'];
  if (typeof q['traceId'] === 'string') filter.traceId = q['traceId'];
  if (typeof q['from'] === 'string') filter.from = q['from'];
  if (typeof q['to'] === 'string') filter.to = q['to'];

  return filter;
}

function parsePagination(req: RestRequest): { limit: number; offset: number } {
  const q = req.query;
  let limit = DEFAULT_AUDIT_LIMIT;
  let offset = 0;

  if (typeof q['limit'] === 'string') {
    const parsed = parseInt(q['limit'], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_AUDIT_LIMIT);
    }
  }
  if (typeof q['offset'] === 'string') {
    const parsed = parseInt(q['offset'], 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  return { limit, offset };
}
