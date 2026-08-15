/**
 * REST route for multi-hop graph traversal — "Search Around" (Section 3.4).
 *
 * `StorageProvider.traverse` is implemented by both providers, covered by the
 * SPI conformance suite, and wrapped by LinkManager.traverse — and until this
 * route existed nothing outside the test harness called it. The only graph
 * primitive a client could reach was a single unfiltered hop
 * (`GET /{plural}/:id/links/:linkType`), so multi-hop meant fanning out one
 * request per node and filtering client-side.
 *
 * POST rather than GET: a traversal path is an array of steps, each with its
 * own direction and filter expression. That is a body, not a query string. The
 * cost is that these reads are not cacheable by intermediaries.
 *
 * Authorization is the hard part here, because a traversal returns objects of
 * MIXED types. Every node is checked, redacted and consent-gated against its
 * OWN type — the single-object route's sequence, applied per node.
 */

import type {
  OntologyObject,
  OntologyLink,
  TraversalPath,
  TraversalStep,
  FilterExpression,
  DataPurpose,
} from '@altius/spi';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import type { ResolverContext } from '../graphql/types.js';
import {
  DEFAULT_CONSENT_PURPOSE,
  isConsentSubjectType,
} from '../graphql/types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';
import { lowerFirst, toSnakeCase } from '../utils.js';

const DEFAULT_TRAVERSE_LIMIT = 100;
const MAX_TRAVERSE_LIMIT = 1000;

/**
 * The provider caps traversal depth at 10. Rejecting a longer path here gives
 * the caller a named error instead of a silently truncated graph.
 */
const MAX_STEPS = 10;

/**
 * How many authorization checks to run at once.
 *
 * Nodes come back with mixed types, so they cannot be authorized with one
 * `listObjects` call per type — and doing that anyway would be worse than it
 * looks: `listObjects` is un-paginated with a server-side cap, so on a large
 * tenant it silently omits ids and would drop nodes the caller may actually
 * see. A `check` per node is exact, and the page cap bounds how many there are.
 */
const AUTHZ_CONCURRENCY = 16;

interface ParsedTraverseRequest {
  path: TraversalPath;
  limit: number;
  offset: number;
}

/** Shape errors are the caller's mistake; say which field and why. */
function parseTraverseBody(
  body: unknown,
  knownLinkTypes: Set<string>,
): { request: ParsedTraverseRequest } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object with a "steps" array' };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b['steps']) || b['steps'].length === 0) {
    return { error: '"steps" must be a non-empty array of traversal steps' };
  }
  if (b['steps'].length > MAX_STEPS) {
    return { error: `"steps" may contain at most ${MAX_STEPS} steps` };
  }

  const steps: TraversalStep[] = [];
  for (const [i, raw] of (b['steps'] as unknown[]).entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: `steps[${i}] must be an object` };
    }
    const s = raw as Record<string, unknown>;

    const linkType = s['linkType'];
    if (typeof linkType !== 'string') {
      return { error: `steps[${i}].linkType must be a string` };
    }
    // Checked against the schema so a caller cannot probe for which link types
    // exist by comparing an empty result against an error.
    if (!knownLinkTypes.has(linkType)) {
      return { error: `steps[${i}].linkType "${linkType}" is not a link type in this ontology` };
    }

    const direction = s['direction'] ?? 'outbound';
    if (direction !== 'inbound' && direction !== 'outbound') {
      return { error: `steps[${i}].direction must be "inbound" or "outbound"` };
    }

    const step: TraversalStep = { linkType, direction };
    if (s['filter'] !== undefined && s['filter'] !== null) {
      if (typeof s['filter'] !== 'object' || Array.isArray(s['filter'])) {
        return { error: `steps[${i}].filter must be a filter expression object` };
      }
      step.filter = s['filter'] as FilterExpression;
    }
    steps.push(step);
  }

  const rawLimit = b['limit'];
  const limit = typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_TRAVERSE_LIMIT)
    : DEFAULT_TRAVERSE_LIMIT;

  const rawOffset = b['offset'];
  const offset = typeof rawOffset === 'number' && Number.isInteger(rawOffset) && rawOffset >= 0
    ? rawOffset
    : 0;

  return { request: { path: { steps }, limit, offset } };
}

/** Run `task` over `items` in bounded waves so a page cannot open N connections at once. */
async function inBoundedWaves<T, R>(
  items: T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(task)));
  }
  return out;
}

/**
 * Generate the traversal route for one ObjectType.
 *
 * Scoped per type so the start object's type — and therefore the permission
 * that gates entering the graph at all — is known from the route itself.
 */
export function generateTraverseRoute(
  deps: ResolverContext['deps'],
  typeName: string,
  plural: string,
): RestRoute {
  const knownLinkTypes = new Set(deps.schema.linkTypes.map(l => l.name));

  return {
    method: 'POST',
    pattern: `/api/v1/${plural}/:id/traverse`,
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        const { user, requestContext } = ctx;
        const startId = req.params['id']!;

        const parsed = parseTraverseBody(req.body, knownLinkTypes);
        if ('error' in parsed) {
          return createRestErrorResponse({
            code: 'INVALID_REQUEST',
            category: 'validation',
            message: parsed.error,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        // Entering the graph requires being able to see where you start from.
        // Without this a caller could traverse outward from an object they
        // cannot read and learn its neighbourhood.
        const startAllowed = await deps.authorizationService.check(
          `user:${user.id}`,
          'viewer',
          `${toSnakeCase(typeName)}:${startId}`,
          requestContext.tenantId,
        );
        if (!startAllowed) {
          return createRestErrorResponse({
            code: 'FORBIDDEN',
            category: 'authorization',
            message: `Not authorized to view ${typeName} ${startId}`,
            retryable: false,
            traceId: requestContext.traceId,
          });
        }

        const result = await deps.linkManager.traverse(
          startId,
          parsed.request.path,
          { limit: parsed.request.limit, offset: parsed.request.offset },
          requestContext,
        );

        // ── Per-node authorization, by each node's own type ──
        const decisions = await inBoundedWaves(
          result.nodes,
          AUTHZ_CONCURRENCY,
          async (node: OntologyObject) => ({
            node,
            allowed: await deps.authorizationService.check(
              `user:${user.id}`,
              'viewer',
              `${toSnakeCase(node._type)}:${node._id}`,
              requestContext.tenantId,
            ),
          }),
        );

        const visible: Record<string, unknown>[] = [];
        const visibleIds = new Set<string>();

        for (const { node, allowed } of decisions) {
          if (!allowed) continue;

          const redacted = deps.authorizationService.redactFields(
            user.id,
            user.roles,
            node._type,
            node as unknown as Record<string, unknown>,
          );
          const shaped = redacted.data as Record<string, unknown>;
          shaped['_redactedFields'] =
            redacted._redactedFields.length > 0 ? redacted._redactedFields : null;

          if (
            deps.consentService &&
            isConsentSubjectType(node._type, deps.consentSubjectTypes)
          ) {
            const consent = await deps.consentService.checkSingleObject(
              shaped,
              node._id,
              DEFAULT_CONSENT_PURPOSE as DataPurpose,
              user.id,
              requestContext.tenantId,
            );
            // A consent-restricted node is dropped rather than blanked. On the
            // single-object route the caller already named the object, so an
            // emptied shell tells them nothing new; here its mere presence in
            // the graph is the disclosure.
            if (consent._consentRestricted) continue;
          }

          visible.push(shaped);
          visibleIds.add(node._id);
        }

        // An edge to a node the caller cannot see is itself a disclosure — it
        // reveals that the hidden object exists and is connected. Keep only
        // edges whose both endpoints survived.
        const edges = result.edges.filter(
          (e: OntologyLink) => visibleIds.has(e._fromId) && visibleIds.has(e._toId),
        );

        return {
          status: 200,
          body: {
            data: {
              nodes: visible,
              edges,
              // Deliberately the post-authorization count, not the provider's
              // totalCount: reporting how many nodes the traversal *found*
              // would disclose the size of the part the caller may not see.
              totalCount: visible.length,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  };
}

/** Generate a traversal route for every ObjectType in the ontology. */
export function generateTraverseRoutes(deps: ResolverContext['deps']): RestRoute[] {
  return deps.schema.objectTypes.map(obj =>
    generateTraverseRoute(deps, obj.name, `${lowerFirst(obj.name)}s`),
  );
}
