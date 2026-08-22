/**
 * Document the routes the gateway actually mounted.
 *
 * `generateOpenApiSpec` builds its document from the ParsedSchema, so it covers
 * the generated object/action routes and the hand-listed platform families —
 * and nothing else. Everything registered directly on the Express app
 * (attachments, time series, geospatial, workflow provenance, marking and the
 * rest) was live and callable but absent from the published contract, so no
 * SDK generator or spec reader could find it.
 *
 * Rather than maintaining a second hand-written list that drifts from the
 * mounting code, this reads the router at request time: whatever is mounted is
 * documented, and a route deleted tomorrow disappears from the spec with it.
 *
 * The entries are deliberately thin — path, method, path parameters, auth and
 * the error responses every route shares. Request and response bodies are not
 * modelled, and each such operation says so, because inventing schemas the
 * handlers do not actually guarantee would be worse than declaring the gap.
 */

import type { Express } from 'express';

export interface MountedRoute {
  /** Lowercase HTTP method. */
  method: string;
  /** OpenAPI-style path, e.g. `/api/v1/attachments/{blobId}`. */
  path: string;
}

export interface MergeResult {
  /** Operations added to the document. */
  added: number;
  /** Mounted paths that cannot be expressed as OpenAPI paths (wildcards). */
  skipped: string[];
}

/** Paths that are not part of the REST contract. */
const NON_CONTRACT = ['/graphql', '/health', '/healthz', '/ready', '/readyz', '/metrics', '/favicon.ico'];

/** Human labels for the families this fills in, keyed by first path segment. */
const FAMILY_LABEL: Record<string, string> = {
  attachments: 'Attachments',
  workflow: 'Workflow provenance',
  geo: 'Geospatial',
  timeseries: 'Time series',
  packs: 'Deployment metadata',
  cdm: 'CDM projection',
};

/** `:blobId` → `{blobId}`; Express 4 also allows an optional `?` suffix. */
function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)\??/g, '{$1}');
}

function pathParams(openApiPath: string): string[] {
  return [...openApiPath.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1]!);
}

/**
 * Read the routes registered on an Express 4 application.
 *
 * Only routes registered directly on the app are visible here — that is how
 * this gateway mounts every REST family; a sub-router mounted with `app.use`
 * would need its prefix resolved from the layer regexp, which is not something
 * to write speculatively.
 */
export function collectMountedRoutes(app: Express): MountedRoute[] {
  const router = (app as unknown as { _router?: { stack?: unknown[] } })._router;
  const stack = router?.stack;
  if (!Array.isArray(stack)) return [];

  const out: MountedRoute[] = [];
  const seen = new Set<string>();
  for (const layer of stack) {
    const route = (layer as { route?: { path?: unknown; methods?: Record<string, boolean> } }).route;
    if (!route || typeof route.path !== 'string' || !route.methods) continue;
    for (const [method, enabled] of Object.entries(route.methods)) {
      // `app.all` sets every method; `_all` is Express's own marker for it.
      if (!enabled || method === '_all') continue;
      const key = `${method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ method, path: route.path });
    }
  }
  return out;
}

function operationFor(method: string, path: string, expressPath: string): Record<string, unknown> {
  const segments = path.split('/').filter(Boolean);
  const family = segments[0] === 'api' ? (segments[2] ?? 'platform') : (segments[0] ?? 'platform');
  const label = FAMILY_LABEL[family] ?? family;

  const parameters = pathParams(path).map(name => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

  return {
    tags: [label],
    summary: `${method.toUpperCase()} ${expressPath}`,
    description:
      'Mounted on the gateway and documented from the running router. Request and ' +
      'response bodies are not modelled in this specification.',
    operationId: `${method}_${path.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    ...(parameters.length > 0 ? { parameters } : {}),
    responses: {
      '200': { description: 'Success' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '429': { $ref: '#/components/responses/RateLimited' },
    },
    security: [{ bearerAuth: [] }],
  };
}

/**
 * Add an operation for every mounted route the document does not already
 * describe. Mutates `spec.paths`; hand-authored entries always win, so a family
 * that gains a proper schema later simply stops being filled in here.
 */
export function mergeMountedRoutes(spec: Record<string, unknown>, routes: MountedRoute[]): MergeResult {
  const paths = (spec['paths'] ??= {}) as Record<string, Record<string, unknown>>;
  const result: MergeResult = { added: 0, skipped: [] };

  for (const { method, path: expressPath } of routes) {
    if (NON_CONTRACT.includes(expressPath)) continue;
    // A wildcard mount (`/api/v1/cdm/*`) has no honest OpenAPI path form.
    // Recorded rather than dropped, so the omission is visible in the document.
    if (expressPath.includes('*')) {
      if (!result.skipped.includes(expressPath)) result.skipped.push(expressPath);
      continue;
    }

    const openApiPath = toOpenApiPath(expressPath);
    const entry = (paths[openApiPath] ??= {});
    if (entry[method]) continue; // hand-authored operation wins
    entry[method] = operationFor(method, openApiPath, expressPath);
    result.added += 1;
  }

  if (result.skipped.length > 0) {
    spec['x-altius-wildcard-routes'] = [...result.skipped].sort();
  }
  return result;
}
