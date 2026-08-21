/**
 * Postgres agent hold store. Table: governance.agent_holds,
 * PK (id) — one row per hold. All queries tenant-scoped via
 * agent_context->>'tenantId' (fail closed: a hold without tenantId is
 * invisible to every tenant-scoped query).
 */
import type { Pool } from 'pg';
import type { AgentHoldRecord, AgentHoldStore, HoldStatus, HoldAgentContext, HoldRiskLevel } from '@altius/spi';

export class PostgresAgentHoldStore implements AgentHoldStore {
  constructor(private readonly pool: Pool) {}

  async create(hold: AgentHoldRecord): Promise<AgentHoldRecord> {
    await this.pool.query(
      `INSERT INTO "governance"."agent_holds"
         ("id","action_name","risk_level","agent_context","status","created_at","expires_at","decided_at","decided_by","reason")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        hold.id,
        hold.actionName,
        hold.riskLevel,
        JSON.stringify(hold.agentContext),
        hold.status,
        hold.createdAt,
        hold.expiresAt,
        hold.decidedAt ?? null,
        hold.decidedBy ?? null,
        hold.reason ?? null,
      ],
    );
    return { ...hold };
  }

  async get(tenantId: string, holdId: string): Promise<AgentHoldRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM "governance"."agent_holds"
       WHERE "id" = $1 AND "agent_context"->>'tenantId' = $2`,
      [holdId, tenantId],
    );
    return res.rows[0] ? this.mapRow(res.rows[0]!) : null;
  }

  async approve(tenantId: string, holdId: string, approvedBy: string): Promise<AgentHoldRecord> {
    const res = await this.pool.query(
      `UPDATE "governance"."agent_holds"
       SET "status" = 'approved', "decided_at" = NOW(), "decided_by" = $3
       WHERE "id" = $1 AND "agent_context"->>'tenantId' = $2
         AND "status" = 'pending' AND "expires_at" > NOW()
       RETURNING *`,
      [holdId, tenantId, approvedBy],
    );
    if (res.rowCount === 0) {
      // Either not found, not pending, or expired — check which
      const existing = await this.getRaw(holdId);
      if (!existing || existing.agentContext.tenantId !== tenantId) {
        throw new Error(`Hold ${holdId} not found`);
      }
      if (existing.status !== 'pending') {
        throw new Error(`Hold ${holdId} is not pending (status: ${existing.status})`);
      }
      throw new Error(`Hold ${holdId} has expired`);
    }
    return this.mapRow(res.rows[0]!);
  }

  async reject(tenantId: string, holdId: string, rejectedBy: string, reason?: string): Promise<AgentHoldRecord> {
    const res = await this.pool.query(
      `UPDATE "governance"."agent_holds"
       SET "status" = 'rejected', "decided_at" = NOW(), "decided_by" = $3, "reason" = $4
       WHERE "id" = $1 AND "agent_context"->>'tenantId' = $2 AND "status" = 'pending'
       RETURNING *`,
      [holdId, tenantId, rejectedBy, reason ?? null],
    );
    if (res.rowCount === 0) {
      const existing = await this.getRaw(holdId);
      if (!existing || existing.agentContext.tenantId !== tenantId) {
        throw new Error(`Hold ${holdId} not found`);
      }
      throw new Error(`Hold ${holdId} is not pending (status: ${existing.status})`);
    }
    return this.mapRow(res.rows[0]!);
  }

  async consume(tenantId: string, holdId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE "governance"."agent_holds"
       SET "status" = 'consumed'
       WHERE "id" = $1 AND "agent_context"->>'tenantId' = $2 AND "status" = 'approved'
       RETURNING "id"`,
      [holdId, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async list(tenantId: string, status?: HoldStatus): Promise<AgentHoldRecord[]> {
    const res = status
      ? await this.pool.query(
          `SELECT * FROM "governance"."agent_holds"
           WHERE "agent_context"->>'tenantId' = $1 AND "status" = $2
           ORDER BY "created_at" DESC`,
          [tenantId, status],
        )
      : await this.pool.query(
          `SELECT * FROM "governance"."agent_holds"
           WHERE "agent_context"->>'tenantId' = $1
           ORDER BY "created_at" DESC`,
          [tenantId],
        );
    return res.rows.map((r) => this.mapRow(r));
  }

  async cleanupExpired(): Promise<number> {
    const res = await this.pool.query(
      `UPDATE "governance"."agent_holds"
       SET "status" = 'expired'
       WHERE "status" = 'pending' AND "expires_at" <= NOW()`,
    );
    return res.rowCount ?? 0;
  }

  /** Get without tenant filter — internal use for error diagnostics. */
  private async getRaw(holdId: string): Promise<AgentHoldRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM "governance"."agent_holds" WHERE "id" = $1`,
      [holdId],
    );
    return res.rows[0] ? this.mapRow(res.rows[0]!) : null;
  }

  private mapRow(row: Record<string, unknown>): AgentHoldRecord {
    const agentContext = typeof row['agent_context'] === 'string'
      ? JSON.parse(row['agent_context'] as string) as HoldAgentContext
      : row['agent_context'] as HoldAgentContext;
    return {
      id: row['id'] as string,
      actionName: row['action_name'] as string,
      riskLevel: row['risk_level'] as HoldRiskLevel,
      agentContext,
      status: row['status'] as HoldStatus,
      createdAt: new Date(row['created_at'] as string).toISOString(),
      expiresAt: new Date(row['expires_at'] as string).toISOString(),
      decidedAt: row['decided_at'] ? new Date(row['decided_at'] as string).toISOString() : undefined,
      decidedBy: (row['decided_by'] as string) ?? undefined,
      reason: (row['reason'] as string) ?? undefined,
    };
  }
}
