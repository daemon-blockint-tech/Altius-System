/**
 * Sync scheduler status — GET /api/v1/sync/status.
 *
 * `SyncScheduler.stats()` was consumed by exactly one caller, the Prometheus
 * gauge updater, and those gauges are only registered when a scheduler exists.
 * So on a deployment where the scheduler is off (the default: it needs
 * SYNC_SCHEDULER_ENABLED=true and a pack that declares connectors) there was no
 * way to find that out — no metric, no endpoint, and /health reporting `ok`
 * because the gateway itself is fine. The operator's question, "is ingestion
 * running and when did it last succeed", had no answer anywhere.
 *
 * Admin-gated: per-datasource names, intervals and error strings describe the
 * deployment's source systems, which is not something an ordinary caller
 * should be able to enumerate.
 */

import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ResolverContext } from '../graphql/types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

/** Roles allowed to read scheduler status. Mirrors the audit-reader default. */
export const DEFAULT_SYNC_STATUS_ROLES = ['admin'] as const;

/**
 * What the route needs to know about the scheduler.
 *
 * A provider callback rather than the scheduler itself: the scheduler is a
 * local binding inside server.ts's main(), it is optional, and typing this
 * against `@altius/sync` would pull the sync package into every consumer of
 * the REST layer for one status shape.
 */
export interface SyncStatusProvider {
  /** True when a scheduler was started for this process. */
  enabled: boolean;
  /** Datasources the scheduler drives, empty when disabled. */
  datasources(): unknown[];
}

export function generateSyncStatusRoutes(
  provider: SyncStatusProvider | undefined,
  readerRoles: readonly string[] = DEFAULT_SYNC_STATUS_ROLES,
): RestRoute[] {
  if (!provider) return [];

  return [
    {
      method: 'GET',
      pattern: '/api/v1/sync/status',
      readOperation: 'query',
      handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!readerRoles.some(role => ctx.user.roles.includes(role))) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: readerRoles.length === 0
                ? 'Sync status reads are disabled: no reader role is configured.'
                : `Reading sync status requires one of: ${readerRoles.join(', ')}`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          const datasources = provider.enabled ? provider.datasources() : [];
          return {
            status: 200,
            body: {
              data: {
                // Reported explicitly rather than inferred from an empty
                // datasource list: "the scheduler is off" and "the scheduler is
                // on and has nothing to do" are different operational states
                // and the empty list alone cannot tell them apart.
                enabled: provider.enabled,
                datasourceCount: datasources.length,
                datasources,
              },
            },
          };
        } catch (err) {
          return wrapErrorToRest(err, ctx.requestContext.traceId);
        }
      },
    },
  ];
}
