/**
 * Audit record types (Section 7.2).
 */

import type { DateTime } from './scalars.js';

export interface AuditRecord {
  id: string;
  timestamp: DateTime;
  traceId: string;
  /**
   * The tenant whose data the operation touched.
   *
   * Required, not optional: an audit record is compliance evidence, and one
   * that cannot say whose it is cannot be served to anyone — object ids are
   * unique only per tenant, so an unscoped read returns every tenant's
   * operations on `patient:123`, not just the caller's.
   */
  tenantId: string;
  actor: AuditActor;
  operation: AuditOperation;
  detail: AuditDetail;
}

export interface AuditActor {
  type: 'user' | 'system' | 'connector' | 'agent';
  id: string;
  roles: string[];
  ip?: string;
}

export interface AuditOperation {
  type: 'read' | 'create' | 'update' | 'delete' | 'action' | 'query' | 'link' | 'unlink' | 'function';
  objectType?: string;
  objectId?: string;
  actionType?: string;
  actionId?: string;
  /**
   * FunctionType name, for `type: 'function'`.
   *
   * Kept separate from `actionType` rather than reusing it: audit records are
   * immutable compliance evidence, and a field named actionType holding a
   * function name would make every filter on it permanently ambiguous about
   * which one ran.
   */
  functionName?: string;
}

export interface AuditDetail {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  query?: string;
  result?: 'success' | 'denied' | 'error';
  denialReason?: string;
  consentDecision?: 'granted' | 'denied' | 'not_required';
}

// ---------------------------------------------------------------------------
// Audit Query API (Section 7.2.1)
// ---------------------------------------------------------------------------

export interface AuditStore {
  queryAuditRecords(filter: AuditFilter, options?: AuditQueryOptions): Promise<AuditPage>;
  getAuditRecord(id: string): Promise<AuditRecord | null>;
  getAuditTrail(objectType: string, objectId: string, options?: AuditQueryOptions): Promise<AuditPage>;
}

export interface AuditFilter {
  /** Scope to one tenant. Callers serving HTTP must always set this. */
  tenantId?: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'connector';
  operationType?: ('read' | 'create' | 'update' | 'delete' | 'action' | 'query' | 'link' | 'unlink' | 'function')[];
  objectType?: string;
  objectId?: string;
  actionType?: string;
  functionName?: string;
  result?: 'success' | 'denied' | 'error';
  timeRange?: { from: DateTime; to: DateTime };
  traceId?: string;
}

export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: { field: 'timestamp'; direction: 'asc' | 'desc' };
}

export interface AuditPage {
  records: AuditRecord[];
  totalCount: number;
  hasMore: boolean;
}
