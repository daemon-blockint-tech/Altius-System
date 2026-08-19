/**
 * Usage instrumentation for the REST dispatcher.
 *
 * `OntologyUsageMetricsService.record()` was documented as "an instrumentation
 * hook called internally by the API layer (dispatch loop, resolvers, action
 * executor)" and no caller existed. The read endpoints therefore reported the
 * events nobody had written: zero reads, zero writes, zero active users — a
 * dashboard that looks healthy because it is empty.
 *
 * Recorded here, at the single REST dispatcher, for the same reason read
 * auditing lives there: there are nine generated routes per ObjectType plus
 * the platform routes, and a per-handler call would have to be added to each
 * and remembered for every route added later.
 *
 * Best-effort by design. Metrics must never turn a served request into a
 * failed one, so every failure inside here is swallowed after logging.
 */

import type { OntologyOperationType, OntologyUsageEvent } from '@altius/spi';
import type { ApiDependencies } from '../graphql/types.js';
import type { RestRequest, RestRoute } from './types.js';

/** What the metrics layer needs to know about one served request. */
export interface RestUsageClassification {
  operation: OntologyOperationType;
  /**
   * Type the operation touched. Platform routes (audit, usage, datasets…) have
   * no ObjectType; they are recorded under a `_platform` pseudo-type so the
   * per-type breakdown stays about the ontology while totals stay complete.
   */
  objectType: string;
  actionOrFunctionName?: string;
}

const PLATFORM_TYPE = '_platform';

/**
 * Classify a served REST request as an ontology operation.
 *
 * Derived from the route rather than the path where possible: `readOperation`
 * already marks the reads that must be POSTs (aggregate, traverse), and
 * guessing from the method alone would file every one of them as a write.
 */
export function classifyRestUsage(route: RestRoute, req: RestRequest): RestUsageClassification {
  const objectType = route.objectType ?? PLATFORM_TYPE;
  const path = req.path;

  // Actions and functions are named in the path and are their own operations.
  const actionMatch = /\/api\/v1\/actions\/([^/?]+)/.exec(path);
  if (actionMatch) {
    return { operation: 'action', objectType, actionOrFunctionName: decodeURIComponent(actionMatch[1]!) };
  }
  const functionMatch = /\/api\/v1\/functions\/([^/?]+)/.exec(path);
  if (functionMatch) {
    return { operation: 'function', objectType, actionOrFunctionName: decodeURIComponent(functionMatch[1]!) };
  }
  const objectFunctionMatch = /\/function\/([^/?]+)/.exec(path);
  if (objectFunctionMatch) {
    return { operation: 'function', objectType, actionOrFunctionName: decodeURIComponent(objectFunctionMatch[1]!) };
  }

  // Reads that carry a body are marked on the route; the specific shape is
  // still worth distinguishing because an aggregate and a list have very
  // different cost profiles.
  if (/\/(aggregate|histogram|facets)(\/|$)/.test(path)) return { operation: 'aggregate', objectType };
  if (/\/search(\/|$)/.test(path)) return { operation: 'search', objectType };
  if (/\/(links|traverse)(\/|$)/.test(path)) return { operation: 'link', objectType };

  if (route.readOperation) return { operation: 'read', objectType };

  switch (route.method) {
    case 'GET': return { operation: 'read', objectType };
    case 'POST': return { operation: 'create', objectType };
    case 'PUT':
    case 'PATCH': return { operation: 'update', objectType };
    case 'DELETE': return { operation: 'delete', objectType };
    default: return { operation: 'read', objectType };
  }
}

/**
 * Record one served REST request as a usage event.
 *
 * `success` is derived from the status: 4xx is a refusal and 5xx a fault, and
 * both count as errors for the error-rate metric — a monitoring rule on error
 * rate that ignored 4xx would stay green through a permissions outage.
 */
export async function recordRestUsage(
  deps: ApiDependencies,
  route: RestRoute,
  req: RestRequest,
  status: number,
  durationMs: number,
  logger?: { warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  const service = deps.usageMetricsService;
  if (!service) return;

  try {
    const classified = classifyRestUsage(route, req);
    const event: OntologyUsageEvent = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      operation: classified.operation,
      objectType: classified.objectType,
      ...(req.params['id'] ? { objectId: req.params['id'] } : {}),
      ...(classified.actionOrFunctionName ? { actionOrFunctionName: classified.actionOrFunctionName } : {}),
      success: status < 400,
      durationMs,
      timestamp: new Date().toISOString(),
    };
    await service.record(event);
  } catch (err) {
    logger?.warn(
      { err: err instanceof Error ? err.message : 'unknown', path: req.path },
      'Usage metrics: failed to record request',
    );
  }
}
