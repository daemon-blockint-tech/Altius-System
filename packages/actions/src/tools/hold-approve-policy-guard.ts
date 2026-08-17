/**
 * HoldApprovePolicyGuard — a concrete PolicyGuard that holds high-risk
 * agent actions for human approval.
 *
 * When a high-risk action is evaluated:
 *   1. A hold record is created with a unique hold ID
 *   2. The action is denied (allowed=false) with the hold ID
 *   3. A human reviewer can later approve or reject the hold
 *   4. If approved, the action can be re-executed with the hold ID
 *      (the guard allows it through)
 *
 * Holds expire after a configurable TTL (default: 1 hour).
 *
 * This is the in-memory implementation. A production deployment would
 * use a database-backed hold store so holds survive process restarts.
 */
import { randomUUID } from 'node:crypto';
import type {
  PolicyGuard,
  PolicyGuardResult,
  RiskLevel,
  AgentContext,
} from './types.js';

/** Status of a hold. */
export type HoldStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** A hold record for a high-risk agent action. */
export interface HoldRecord {
  id: string;
  actionName: string;
  riskLevel: RiskLevel;
  agentContext: AgentContext;
  status: HoldStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  /** ISO timestamp when this hold expires (if not decided). */
  expiresAt: string;
}

/** Configuration for the HoldApprovePolicyGuard. */
export interface HoldApprovePolicyGuardConfig {
  /** Hold TTL in milliseconds. Default: 1 hour. */
  holdTtlMs?: number;
  /** Whether to auto-approve medium-risk actions (default: false). */
  autoApproveMedium?: boolean;
}

export class HoldApprovePolicyGuard implements PolicyGuard {
  private readonly holds = new Map<string, HoldRecord>();
  private readonly holdTtlMs: number;
  private readonly autoApproveMedium: boolean;

  constructor(config: HoldApprovePolicyGuardConfig = {}) {
    this.holdTtlMs = config.holdTtlMs ?? 60 * 60 * 1000;
    this.autoApproveMedium = config.autoApproveMedium ?? false;
  }

  async evaluate(
    actionName: string,
    riskLevel: RiskLevel,
    agentContext: AgentContext,
  ): Promise<PolicyGuardResult> {
    // Low-risk: always allow
    if (riskLevel === 'low') {
      return { allowed: true };
    }

    // Medium-risk: optionally auto-approve
    if (riskLevel === 'medium' && this.autoApproveMedium) {
      return { allowed: true };
    }

    // High-risk (or medium without auto-approve): create a hold
    const now = new Date();
    const holdId = randomUUID();
    const hold: HoldRecord = {
      id: holdId,
      actionName,
      riskLevel,
      agentContext,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.holdTtlMs).toISOString(),
    };
    this.holds.set(holdId, hold);

    return {
      allowed: false,
      holdId,
      reason: `Action ${actionName} held for human approval (risk: ${riskLevel}). Hold ID: ${holdId}`,
    };
  }

  /**
   * Approve a hold, allowing the action to proceed on re-execution.
   */
  approve(holdId: string, approvedBy: string): HoldRecord {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`Hold ${holdId} not found`);
    if (hold.status !== 'pending') {
      throw new Error(`Hold ${holdId} is not pending (status: ${hold.status})`);
    }
    if (this._isExpired(hold)) {
      hold.status = 'expired';
      throw new Error(`Hold ${holdId} has expired`);
    }
    hold.status = 'approved';
    hold.decidedAt = new Date().toISOString();
    hold.decidedBy = approvedBy;
    return { ...hold };
  }

  /**
   * Reject a hold.
   */
  reject(holdId: string, rejectedBy: string, reason?: string): HoldRecord {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`Hold ${holdId} not found`);
    if (hold.status !== 'pending') {
      throw new Error(`Hold ${holdId} is not pending (status: ${hold.status})`);
    }
    hold.status = 'rejected';
    hold.decidedAt = new Date().toISOString();
    hold.decidedBy = rejectedBy;
    hold.reason = reason;
    return { ...hold };
  }

  /**
   * Check if a hold is approved (for re-execution).
   */
  isApproved(holdId: string): boolean {
    const hold = this.holds.get(holdId);
    if (!hold) return false;
    if (hold.status === 'approved' && !this._isExpired(hold)) return true;
    return false;
  }

  /**
   * Get a hold record by ID.
   */
  getHold(holdId: string): HoldRecord | null {
    const hold = this.holds.get(holdId);
    return hold ? { ...hold } : null;
  }

  /**
   * List all holds, optionally filtered by status.
   */
  listHolds(status?: HoldStatus): HoldRecord[] {
    return [...this.holds.values()]
      .filter((h) => !status || h.status === status)
      .map((h) => ({ ...h }));
  }

  /**
   * Clean up expired holds. Returns the number of holds cleaned.
   */
  cleanupExpired(): number {
    let count = 0;
    for (const [id, hold] of this.holds) {
      if (hold.status === 'pending' && this._isExpired(hold)) {
        hold.status = 'expired';
        count++;
      }
    }
    return count;
  }

  private _isExpired(hold: HoldRecord): boolean {
    return new Date(hold.expiresAt).getTime() < Date.now();
  }
}
