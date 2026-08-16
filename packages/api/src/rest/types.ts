/**
 * REST API types.
 *
 * Framework-agnostic request/response types for the auto-generated REST layer.
 * Route handlers receive RestRequest and return RestResponse, allowing any
 * HTTP framework (Express, Fastify, Node http) to adapt to these types.
 */

import type { AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';

/**
 * Inbound REST request — framework-agnostic.
 */
export interface RestRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  user: AuthenticatedUserInfo;
  /**
   * Lower-cased request headers. Populated for routes that honour HTTP
   * preconditions — `If-Match` carries the object version an action is
   * asserting it acts on.
   */
  headers?: Record<string, string | undefined>;
}

/**
 * Outbound REST response — framework-agnostic.
 */
export interface RestResponse {
  status: number;
  /** JSON body (default) or string body for export endpoints (NDJSON/CSV). */
  body: Record<string, unknown> | string;
  /** Optional response headers (e.g. Content-Type for export endpoints). */
  headers?: Record<string, string>;
}

/**
 * A single REST route definition.
 */
export interface RestRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  pattern: string;
  handler: (req: RestRequest, ctx: ResolverContext) => Promise<RestResponse>;
  /**
   * ObjectType this route reads or writes, when it has exactly one.
   *
   * Recorded on the audit record so a DPO can filter the trail by type. Absent
   * on routes that are not per-type (audit, object-sets, consent).
   */
  objectType?: string;
  /**
   * Overrides how the dispatcher audits this route as a read.
   *
   * The default is derived from the method: GET is a read, everything else is
   * not. Reads that must be expressed as POST because they carry a body —
   * aggregate, traverse — set this explicitly, because auditing them by method
   * alone would silently miss them.
   */
  readOperation?: 'read' | 'query';
}
