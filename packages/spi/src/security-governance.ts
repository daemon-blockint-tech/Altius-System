/**
 * Security governance enhancements.
 *
 * Four capabilities:
 *   1. Justification capture for sensitive actions
 *   2. Access-explanation tooling (why was access granted or denied?)
 *   3. Marking propagation along data lineage
 *   4. Scoped sessions (session-restricted marking subsets)
 */

// ---------------------------------------------------------------------------
// 1. Justification capture
// ---------------------------------------------------------------------------

/** A justification record for a sensitive action. */
export interface JustificationRecord {
  /** Record ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** User who provided the justification. */
  userId: string;
  /** Action name. */
  actionName: string;
  /** Object type being acted upon. */
  objectType?: string;
  /** Object ID being acted upon. */
  objectId?: string;
  /** The justification text provided by the user. */
  justification: string;
  /** Justification category (e.g. 'break-glass', 'routine', 'audit'). */
  category: 'break-glass' | 'routine' | 'audit' | 'emergency' | 'legal';
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Whether the justification was approved (if approval is required). */
  approved?: boolean;
  /** Who approved it (if applicable). */
  approvedBy?: string;
}

/** Input for creating a justification. */
export interface CreateJustificationInput {
  actionName: string;
  objectType?: string;
  objectId?: string;
  justification: string;
  category: JustificationRecord['category'];
}

/** Query for justifications. */
export interface JustificationQuery {
  userId?: string;
  actionName?: string;
  objectType?: string;
  objectId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

/**
 * Justification store — captures and queries justifications for sensitive actions.
 */
export interface JustificationStore {
  create(tenantId: string, userId: string, input: CreateJustificationInput): Promise<JustificationRecord>;
  get(tenantId: string, id: string): Promise<JustificationRecord | null>;
  list(tenantId: string, query?: JustificationQuery): Promise<{ records: JustificationRecord[]; totalCount: number }>;
  approve(tenantId: string, id: string, approvedBy: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// 2. Access explanation
// ---------------------------------------------------------------------------

/** The result of an access-explanation query. */
export interface AccessExplanation {
  /** Whether access was granted. */
  granted: boolean;
  /** The resource being accessed. */
  resource: {
    objectType: string;
    objectId?: string;
    action?: string;
  };
  /** The user requesting access. */
  userId: string;
  /** Detailed reasons for the decision. */
  reasons: AccessExplanationReason[];
  /** Summary message. */
  summary: string;
}

/** A single reason in an access explanation. */
export interface AccessExplanationReason {
  /** The check that was performed. */
  check: 'role' | 'rebac_relation' | 'marking' | 'consent' | 'tenant' | 'ownership';
  /** Whether this check passed. */
  passed: boolean;
  /** Human-readable detail. */
  detail: string;
  /** The specific rule/policy that was evaluated. */
  rule?: string;
}

/**
 * Access explanation service — explains why access was granted or denied.
 */
export interface AccessExplanationService {
  /** Explain why a user can or cannot access a resource. */
  explain(params: {
    tenantId: string;
    userId: string;
    objectType: string;
    objectId?: string;
    action?: string;
  }): Promise<AccessExplanation>;
}

// ---------------------------------------------------------------------------
// 3. Marking propagation along data lineage
//    Types moved to marking-policy.ts; re-exported for backward compatibility.
//    MarkingPropagationService deleted in §5 (dead code — no consumers).
// ---------------------------------------------------------------------------

export type { MarkingPropagationRule, PropagatedMarkings } from './marking-policy.js';

// ---------------------------------------------------------------------------
// 4. Scoped sessions
// ---------------------------------------------------------------------------

/** A scoped session — restricts a user's markings for a session. */
export interface ScopedSession {
  /** Session ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** User ID. */
  userId: string;
  /** The marking subset available in this session. */
  allowedMarkings: string[];
  /** Markings explicitly excluded (even if user holds them). */
  excludedMarkings: string[];
  /** Session label for audit. */
  label: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 expiry timestamp. */
  expiresAt: string;
  /** Whether the session has been revoked. */
  revoked: boolean;
  /** Who created the session. */
  createdBy: string;
}

/** Input for creating a scoped session. */
export interface CreateScopedSessionInput {
  userId: string;
  allowedMarkings: string[];
  excludedMarkings?: string[];
  label: string;
  /** Duration in seconds until expiry. */
  durationSeconds: number;
}

/**
 * Scoped session store — manages session-restricted marking subsets.
 */
export interface ScopedSessionStore {
  create(tenantId: string, createdBy: string, input: CreateScopedSessionInput): Promise<ScopedSession>;
  get(tenantId: string, sessionId: string): Promise<ScopedSession | null>;
  /** Get the active scoped session for a user (non-expired, non-revoked). */
  getActiveForUser(tenantId: string, userId: string): Promise<ScopedSession | null>;
  list(tenantId: string, userId?: string): Promise<ScopedSession[]>;
  revoke(tenantId: string, sessionId: string): Promise<void>;
  /** Check if a marking is allowed in the session. */
  isMarkingAllowed(tenantId: string, sessionId: string, marking: string): Promise<boolean>;
}
