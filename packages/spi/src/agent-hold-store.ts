/**
 * Agent hold store — durable persistence for human-in-the-loop approval holds.
 *
 * High-risk agent actions create a hold (denied pending review). A human
 * reviewer approves or rejects it; an approved hold is consumed one-shot on
 * re-execution. The store must survive process restarts so a hold created
 * before a crash is still answerable after recovery.
 *
 * Tenant isolation: every method is tenant-scoped from the hold's
 * `agentContext.tenantId`. A hold created in tenant A is invisible to a
 * reviewer in tenant B (fail closed).
 */

/** Status of a hold. `consumed` = approved and already spent on one execution. */
export type HoldStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

/** Risk level that triggered the hold. */
export type HoldRiskLevel = 'low' | 'medium' | 'high';

/** Agent context captured at hold creation time. */
export interface HoldAgentContext {
  agentId: string;
  sessionId?: string;
  dryRun: boolean;
  model?: string;
  tenantId?: string;
}

/** A hold record for a high-risk agent action. */
export interface AgentHoldRecord {
  id: string;
  actionName: string;
  riskLevel: HoldRiskLevel;
  agentContext: HoldAgentContext;
  status: HoldStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  /** ISO timestamp when this hold expires (if not decided). */
  expiresAt: string;
}

/**
 * Durable store for agent approval holds.
 *
 * All methods are async — the Postgres implementation issues SQL, the memory
 * implementation is async for interface conformance. Methods that mutate a
 * hold return the updated record so the caller can audit the transition.
 */
export interface AgentHoldStore {
  /** Create a new pending hold. Returns the created record. */
  create(hold: AgentHoldRecord): Promise<AgentHoldRecord>;

  /** Get a hold by ID. Returns null when not found or tenant mismatch. */
  get(tenantId: string, holdId: string): Promise<AgentHoldRecord | null>;

  /**
   * Transition a pending hold to approved. Throws if not found, not pending,
   * or expired. Returns the updated record.
   */
  approve(tenantId: string, holdId: string, approvedBy: string): Promise<AgentHoldRecord>;

  /**
   * Transition a pending hold to rejected. Throws if not found or not pending.
   * Returns the updated record.
   */
  reject(tenantId: string, holdId: string, rejectedBy: string, reason?: string): Promise<AgentHoldRecord>;

  /**
   * Transition an approved hold to consumed (one-shot). No-op if not approved.
   * Returns true if the hold was consumed, false otherwise.
   */
  consume(tenantId: string, holdId: string): Promise<boolean>;

  /**
   * List holds for a tenant, optionally filtered by status.
   * Sorted by createdAt descending (newest first).
   */
  list(tenantId: string, status?: HoldStatus): Promise<AgentHoldRecord[]>;

  /**
   * Mark expired pending holds as expired. Returns the number of holds
   * transitioned. Called periodically by the guard or a scheduler.
   */
  cleanupExpired(): Promise<number>;
}
