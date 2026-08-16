/**
 * Read auditing for the REST surface.
 *
 * `AuditWriter` has always documented a "called by query layer for read
 * auditing" caller that did not exist: every writer in the platform recorded
 * actions, links, consent and functions, so the audit trail could answer "who
 * changed this record" but never "who read it" — the question a DPO is
 * actually asked, and the one a subject-access request turns on.
 *
 * This is written at the single REST dispatcher rather than inside each route
 * handler. There are nine generated routes per ObjectType plus traverse,
 * audit, object-set and consent routes, and a per-handler call would have to
 * be added to each one and remembered for every route added later. Auditing
 * where they all converge means a new read route is covered the day it is
 * written.
 *
 * One record per request, not per object returned: a list of 500 objects is
 * one query the caller made, and 500 records would bury the single-record
 * reads a DPO is looking for.
 */

import type { AuditWriter } from '@altius/security';

import type { ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestRoute } from './types.js';

/** What a read audit record needs, independent of the surface that served it. */
export interface ReadAuditEntry {
  type: 'read' | 'query';
  objectType?: string;
  objectId?: string;
  /** What was asked — never what came back. */
  query: string;
  result: 'success' | 'denied' | 'error';
}

/**
 * Write one read audit record, best-effort.
 *
 * Shared by REST and GraphQL so the trail has one shape: a DPO filtering for
 * reads of `Patient p-1` must not have to know which protocol served them.
 */
export async function writeReadAudit(
  auditWriter: AuditWriter | undefined,
  ctx: ResolverContext,
  entry: ReadAuditEntry,
): Promise<void> {
  if (!auditWriter) return;
  const { user, requestContext } = ctx;
  try {
    await auditWriter.write({
      tenantId: requestContext.tenantId,
      actor: { type: 'user', id: user.id, roles: user.roles },
      operation: {
        type: entry.type,
        ...(entry.objectType ? { objectType: entry.objectType } : {}),
        ...(entry.objectId ? { objectId: entry.objectId } : {}),
      },
      detail: { result: entry.result, query: entry.query },
      traceId: requestContext.traceId,
    });
  } catch {
    /* best-effort — never fail a read because auditing failed */
  }
}

/**
 * Decide how a route should be audited as a read.
 *
 * Defaults by method — GET is a read — with an explicit `readOperation` for
 * the reads that must be POSTs because they carry a body. Non-GET routes
 * without that marker are writes, which their own handlers audit.
 */
function readOperationFor(route: RestRoute, req: RestRequest): 'read' | 'query' | undefined {
  if (route.readOperation) return route.readOperation;
  if (route.method !== 'GET') return undefined;
  // A route addressing one object by id is a record read; anything else
  // (list, search, export) is a query over a set.
  return req.params['id'] ? 'read' : 'query';
}

/**
 * Write the audit record for a read, if this route is one.
 *
 * Best-effort by design: auditing must never turn a successful read into a
 * failed request. A write that throws is swallowed here, matching how the
 * action and mutation paths treat their own audit writes.
 */
export async function auditRead(
  auditWriter: AuditWriter | undefined,
  route: RestRoute,
  req: RestRequest,
  ctx: ResolverContext,
  status: number,
): Promise<void> {
  if (!auditWriter) return;
  const operationType = readOperationFor(route, req);
  if (!operationType) return;

  // 4xx from a read path is a refusal (403 denied, 404 not found); 5xx is a
  // fault. Both matter to a DPO — a denied read is evidence the control held.
  const result = status >= 500 ? 'error' : status >= 400 ? 'denied' : 'success';

  await writeReadAudit(auditWriter, ctx, {
    type: operationType,
    ...(route.objectType ? { objectType: route.objectType } : {}),
    ...(req.params['id'] ? { objectId: req.params['id'] } : {}),
    // What was asked, not what came back: the query is the evidence, and
    // recording the response would copy the very data being protected into a
    // second store.
    query: `${req.method} ${req.path}`,
    result,
  });
}
