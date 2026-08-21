/**
 * Data-connection gateway status — GET /api/v1/data-connection/status.
 *
 * The operator's view of agent-based ingestion: which agents are enrolled
 * and live, which datasources are leased to whom, per-datasource intake
 * counts and checkpoints. Registered unconditionally (like sync status) so
 * "the gateway is off" is reportable — the state an absent route cannot
 * express.
 *
 * Admin-gated for the same reason sync status is: agent names, datasource
 * names and error strings describe the deployment's source systems and the
 * customer networks feeding it.
 */

import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ResolverContext } from '../graphql/types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

/** Roles allowed to read gateway status. Mirrors the sync-status default. */
export const DEFAULT_DATA_CONNECTION_STATUS_ROLES = ['admin'] as const;

/**
 * What the route needs to know about the gateway. A provider callback for
 * the same reason SyncStatusProvider is one: the gateway is an optional
 * local binding inside server.ts's main().
 */
export interface DataConnectionStatusProvider {
  /** True when an agent gateway was started for this process. */
  enabled: boolean;
  /** Gateway status snapshot; empty shape when disabled. */
  status(): Promise<unknown>;
}

export function generateDataConnectionStatusRoutes(
  provider: DataConnectionStatusProvider | undefined,
  readerRoles: readonly string[] = DEFAULT_DATA_CONNECTION_STATUS_ROLES,
): RestRoute[] {
  if (!provider) return [];

  return [
    {
      method: 'GET',
      pattern: '/api/v1/data-connection/status',
      readOperation: 'query',
      handler: async (_req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
        try {
          if (!readerRoles.some(role => ctx.user.roles.includes(role))) {
            return createRestErrorResponse({
              code: 'FORBIDDEN',
              category: 'authorization',
              message: readerRoles.length === 0
                ? 'Data-connection status reads are disabled: no reader role is configured.'
                : `Reading data-connection status requires one of: ${readerRoles.join(', ')}`,
              retryable: false,
              traceId: ctx.requestContext.traceId,
            });
          }

          const status = provider.enabled
            ? await provider.status()
            : { agents: [], datasources: [] };
          return {
            status: 200,
            body: {
              data: {
                // Explicit, not inferred from empty lists: "the gateway is
                // off" and "the gateway is on with no agents enrolled yet"
                // are different operational states.
                enabled: provider.enabled,
                ...(status as Record<string, unknown>),
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
