/**
 * In-memory agent hold store — same contract as Postgres.
 *
 * Tenant-scoped: get/approve/reject/consume/list all filter by tenantId from
 * the hold's agentContext. A hold without tenantId is invisible to every
 * tenant-scoped query (fail closed).
 */
import type { AgentHoldRecord, AgentHoldStore, HoldStatus } from '@altius/spi';

export class InMemoryAgentHoldStore implements AgentHoldStore {
  private readonly holds = new Map<string, AgentHoldRecord>();

  async create(hold: AgentHoldRecord): Promise<AgentHoldRecord> {
    this.holds.set(hold.id, { ...hold });
    return { ...hold };
  }

  async get(tenantId: string, holdId: string): Promise<AgentHoldRecord | null> {
    const hold = this.holds.get(holdId);
    if (!hold) return null;
    if (hold.agentContext.tenantId !== tenantId) return null;
    return { ...hold };
  }

  async approve(tenantId: string, holdId: string, approvedBy: string): Promise<AgentHoldRecord> {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`Hold ${holdId} not found`);
    if (hold.agentContext.tenantId !== tenantId) throw new Error(`Hold ${holdId} not found`);
    if (hold.status !== 'pending') throw new Error(`Hold ${holdId} is not pending (status: ${hold.status})`);
    if (this.isExpired(hold)) {
      hold.status = 'expired';
      throw new Error(`Hold ${holdId} has expired`);
    }
    hold.status = 'approved';
    hold.decidedAt = new Date().toISOString();
    hold.decidedBy = approvedBy;
    return { ...hold };
  }

  async reject(tenantId: string, holdId: string, rejectedBy: string, reason?: string): Promise<AgentHoldRecord> {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`Hold ${holdId} not found`);
    if (hold.agentContext.tenantId !== tenantId) throw new Error(`Hold ${holdId} not found`);
    if (hold.status !== 'pending') throw new Error(`Hold ${holdId} is not pending (status: ${hold.status})`);
    hold.status = 'rejected';
    hold.decidedAt = new Date().toISOString();
    hold.decidedBy = rejectedBy;
    hold.reason = reason;
    return { ...hold };
  }

  async consume(tenantId: string, holdId: string): Promise<boolean> {
    const hold = this.holds.get(holdId);
    if (!hold) return false;
    if (hold.agentContext.tenantId !== tenantId) return false;
    if (hold.status === 'approved') {
      hold.status = 'consumed';
      return true;
    }
    return false;
  }

  async list(tenantId: string, status?: HoldStatus): Promise<AgentHoldRecord[]> {
    return [...this.holds.values()]
      .filter((h) => h.agentContext.tenantId === tenantId)
      .filter((h) => !status || h.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((h) => ({ ...h }));
  }

  async cleanupExpired(): Promise<number> {
    let count = 0;
    for (const hold of this.holds.values()) {
      if (hold.status === 'pending' && this.isExpired(hold)) {
        hold.status = 'expired';
        count++;
      }
    }
    return count;
  }

  private isExpired(hold: AgentHoldRecord): boolean {
    return new Date(hold.expiresAt).getTime() < Date.now();
  }
}
