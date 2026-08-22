import type { MarkingMembership, MarkingMembershipStore } from '@altius/spi';

/** Tenant-scoped in-memory marking memberships. Same contract as Postgres. */
export class InMemoryMarkingMembershipStore implements MarkingMembershipStore {
  private rows = new Map<string, MarkingMembership>(); // key: tenant|user|marking

  private key(t: string, u: string, m: string): string { return `${t}|${u}|${m}`; }

  async grant(tenantId: string, userId: string, marking: string, grantedBy: string): Promise<MarkingMembership> {
    const row: MarkingMembership = { tenantId, userId, marking, grantedBy, grantedAt: new Date().toISOString() };
    this.rows.set(this.key(tenantId, userId, marking), row);
    return row;
  }

  async revoke(tenantId: string, userId: string, marking: string): Promise<boolean> {
    return this.rows.delete(this.key(tenantId, userId, marking));
  }

  async listForUser(tenantId: string, userId: string): Promise<string[]> {
    const out: string[] = [];
    for (const r of this.rows.values()) if (r.tenantId === tenantId && r.userId === userId) out.push(r.marking);
    return out.sort();
  }

  async listMembers(tenantId: string, marking: string, opts?: { limit?: number; offset?: number }): Promise<MarkingMembership[]> {
    const all = [...this.rows.values()]
      .filter(r => r.tenantId === tenantId && r.marking === marking)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const offset = opts?.offset ?? 0;
    return all.slice(offset, offset + (opts?.limit ?? 100));
  }
}
