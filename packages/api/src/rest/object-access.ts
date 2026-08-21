/**
 * Shared per-object access gate for the object-linked auxiliary REST families
 * (time-series, comments, embeddings, ...) that mount directly on Express and
 * bypass the central dispatcher pipeline.
 *
 * These surfaces expose data hanging off an ontology object by that object's id.
 * Authenticating and tenant-scoping the store is not enough: a caller who cannot
 * read Patient X on the generated object routes must not read X's series,
 * comments, or embeddings by knowing its id. This applies the SAME two checks
 * the generated routes do — markings hide the type (404, discovery-hiding), then
 * FGA gates the specific object (viewer for reads, editor for writes; 403).
 */

import { toSnakeCase } from '../utils.js';
import { isTypeVisible } from '../markings/enforce.js';
import type { ApiDependencies, AuthenticatedUserInfo } from '../graphql/types.js';

export interface AccessDenial {
  status: 403 | 404;
  body: { error: string; message: string };
}

/**
 * Returns an AccessDenial when the caller may not access `typeName:objectId` in
 * `mode`, or undefined when access is allowed. Denials mirror the generated
 * routes: a marking miss is 404 (never confirm the object exists), an FGA miss
 * is 403.
 */
export async function checkObjectAccess(
  deps: ApiDependencies,
  user: AuthenticatedUserInfo,
  typeName: string,
  objectId: string,
  mode: 'read' | 'write',
): Promise<AccessDenial | undefined> {
  // Markings first — a marking restricts where a role expands, and a denial
  // must read as "not found", not "forbidden".
  if (!isTypeVisible(deps.markingPolicy, user, typeName)) {
    return { status: 404, body: { error: 'NOT_FOUND', message: 'Not found' } };
  }
  const relation = mode === 'write' ? 'editor' : 'viewer';
  const allowed = await deps.authorizationService.check(
    `user:${user.id}`,
    relation,
    `${toSnakeCase(typeName)}:${objectId}`,
    user.tenantId,
  );
  if (!allowed) {
    return { status: 403, body: { error: 'FORBIDDEN', message: `No ${relation} access to ${typeName}` } };
  }
  return undefined;
}

/**
 * The object ids of `typeName` the caller may view, via one FGA listObjects.
 * `allowAll` is the dev/allow-all sentinel (`*`) meaning "do not restrict".
 * Use this to scope a collection surface (e.g. vector search) that returns
 * object ids the caller might not be authorized to see.
 */
export async function viewableObjectIds(
  deps: ApiDependencies,
  user: AuthenticatedUserInfo,
  typeName: string,
): Promise<{ allowAll: boolean; ids: string[] }> {
  const ids = await deps.authorizationService.listObjects(
    `user:${user.id}`,
    'viewer',
    toSnakeCase(typeName),
    user.tenantId,
  );
  if (ids.includes('*')) return { allowAll: true, ids: [] };
  return { allowAll: false, ids };
}
