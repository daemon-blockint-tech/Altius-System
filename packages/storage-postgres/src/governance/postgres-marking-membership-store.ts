import type { Pool } from 'pg';
import type { MarkingMembership, MarkingMembershipStore } from '@altius/spi';

/**
 * Postgres marking memberships. Table: governance.marking_memberships,
 * PK (tenant_id, user_id, marking) — grant is an UPSERT so re-granting
 * refreshes provenance instead of erroring. All queries tenant-scoped.
 */
export class PostgresMarkingMembershipStore implements MarkingMembershipStore {
  constructor(private readonly pool: Pool) {}

  async grant(tenantId: string, userId: string, marking: string, grantedBy: string): Promise<MarkingMembership> {
    const res = await this.pool.query(
      `INSERT INTO "governance"."marking_memberships" ("tenant_id","user_id","marking","granted_by","granted_at")
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT ("tenant_id","user_id","marking")
       DO UPDATE SET "granted_by" = EXCLUDED."granted_by", "granted_at" = NOW()
       RETURNING "tenant_id","user_id","marking","granted_by","granted_at"`,
      [tenantId, userId, marking, grantedBy],
    );
    const r = res.rows[0];
    return { tenantId: r.tenant_id, userId: r.user_id, marking: r.marking, grantedBy: r.granted_by, grantedAt: new Date(r.granted_at).toISOString() };
  }

  async revoke(tenantId: string, userId: string, marking: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM "governance"."marking_memberships" WHERE "tenant_id"=$1 AND "user_id"=$2 AND "marking"=$3`,
      [tenantId, userId, marking],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listForUser(tenantId: string, userId: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT "marking" FROM "governance"."marking_memberships" WHERE "tenant_id"=$1 AND "user_id"=$2 ORDER BY "marking"`,
      [tenantId, userId],
    );
    return res.rows.map(r => r.marking);
  }

  async listMembers(tenantId: string, marking: string, opts?: { limit?: number; offset?: number }): Promise<MarkingMembership[]> {
    const res = await this.pool.query(
      `SELECT "tenant_id","user_id","marking","granted_by","granted_at"
       FROM "governance"."marking_memberships" WHERE "tenant_id"=$1 AND "marking"=$2
       ORDER BY "user_id" LIMIT $3 OFFSET $4`,
      [tenantId, marking, opts?.limit ?? 100, opts?.offset ?? 0],
    );
    return res.rows.map(r => ({ tenantId: r.tenant_id, userId: r.user_id, marking: r.marking, grantedBy: r.granted_by, grantedAt: new Date(r.granted_at).toISOString() }));
  }
}
