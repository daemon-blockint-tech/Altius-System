/**
 * PostgreSQL BranchStore — branch lifecycle and merge proposals.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { BranchStore, Branch, MergeProposal, MergeResult } from '@altius/spi';

export class PostgresBranchStore implements BranchStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createBranch(branch: Omit<Branch, 'createdAt' | 'status'> & { status?: Branch['status'] }): Promise<Branch> {
    const now = new Date().toISOString();
    const status = branch.status ?? 'open';
    await this.pool.query(
      `INSERT INTO "branch"."branches" ("name", "tenant_id", "parent", "created_by", "created_at", "status", "description")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [branch.name, branch.tenantId, branch.parent, branch.createdBy ?? null, now, status, branch.description ?? null],
    );
    return { ...branch, createdAt: now, status };
  }

  async getBranch(tenantId: string, name: string): Promise<Branch | null> {
    const result = await this.pool.query(
      `SELECT "name", "tenant_id", "parent", "created_by", "created_at", "status", "description", "merged_at"
       FROM "branch"."branches" WHERE "tenant_id" = $1 AND "name" = $2`,
      [tenantId, name],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0]!;
    return {
      name: r['name'],
      tenantId: r['tenant_id'],
      parent: r['parent'],
      createdAt: r['created_at'],
      createdBy: r['created_by'] ?? undefined,
      status: r['status'],
      description: r['description'] ?? undefined,
      mergedAt: r['merged_at'] ?? undefined,
    };
  }

  async listBranches(tenantId: string): Promise<Branch[]> {
    const result = await this.pool.query(
      `SELECT "name", "tenant_id", "parent", "created_by", "created_at", "status", "description", "merged_at"
       FROM "branch"."branches" WHERE "tenant_id" = $1 ORDER BY "created_at" DESC`,
      [tenantId],
    );
    return result.rows.map((r) => ({
      name: r['name'],
      tenantId: r['tenant_id'],
      parent: r['parent'],
      createdAt: r['created_at'],
      createdBy: r['created_by'] ?? undefined,
      status: r['status'],
      description: r['description'] ?? undefined,
      mergedAt: r['merged_at'] ?? undefined,
    }));
  }

  async abandonBranch(tenantId: string, name: string): Promise<void> {
    await this.pool.query(
      `UPDATE "branch"."branches" SET "status" = 'abandoned' WHERE "tenant_id" = $1 AND "name" = $2`,
      [tenantId, name],
    );
  }

  async mergeBranch(tenantId: string, branchName: string, _actorId?: string): Promise<MergeResult> {
    // Mark the branch as merged. Actual data merge is handled by the storage
    // provider's branch-aware read/write layer — this is metadata only.
    await this.pool.query(
      `UPDATE "branch"."branches" SET "status" = 'merged', "merged_at" = NOW() WHERE "tenant_id" = $1 AND "name" = $2`,
      [tenantId, branchName],
    );
    return { objectsMerged: 0, linksMerged: 0, success: true };
  }

  async createProposal(proposal: Omit<MergeProposal, 'id' | 'createdAt' | 'status'> & { status?: MergeProposal['status'] }): Promise<MergeProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = proposal.status ?? 'draft';
    await this.pool.query(
      `INSERT INTO "branch"."proposals"
        ("id", "tenant_id", "branch_name", "target_branch", "status", "created_by", "created_at", "summary")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, proposal.tenantId, proposal.branchName, proposal.targetBranch, status, proposal.createdBy ?? null, now, proposal.summary ?? null],
    );
    return { ...proposal, id, createdAt: now, status };
  }

  async getProposal(tenantId: string, proposalId: string): Promise<MergeProposal | null> {
    const result = await this.pool.query(
      `SELECT * FROM "branch"."proposals" WHERE "id" = $1 AND "tenant_id" = $2`,
      [proposalId, tenantId],
    );
    if (result.rows.length === 0) return null;
    return mapProposal(result.rows[0]!);
  }

  async listProposals(tenantId: string, branchName?: string): Promise<MergeProposal[]> {
    if (branchName) {
      const result = await this.pool.query(
        `SELECT * FROM "branch"."proposals" WHERE "tenant_id" = $1 AND "branch_name" = $2 ORDER BY "created_at" DESC`,
        [tenantId, branchName],
      );
      return result.rows.map(r => mapProposal(r));
    }
    const result = await this.pool.query(
      `SELECT * FROM "branch"."proposals" WHERE "tenant_id" = $1 ORDER BY "created_at" DESC`,
      [tenantId],
    );
    return result.rows.map(r => mapProposal(r));
  }

  async submitProposal(tenantId: string, proposalId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "branch"."proposals" SET "status" = 'submitted' WHERE "id" = $1 AND "tenant_id" = $2`,
      [proposalId, tenantId],
    );
  }

  async approveProposal(tenantId: string, proposalId: string, reviewerId: string, comment?: string): Promise<MergeResult> {
    await this.pool.query(
      `UPDATE "branch"."proposals" SET "status" = 'approved', "reviewed_by" = $3, "reviewed_at" = NOW(), "review_comment" = $4
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [proposalId, tenantId, reviewerId, comment ?? null],
    );
    return { objectsMerged: 0, linksMerged: 0, success: true };
  }

  async rejectProposal(tenantId: string, proposalId: string, reviewerId: string, comment?: string): Promise<void> {
    await this.pool.query(
      `UPDATE "branch"."proposals" SET "status" = 'rejected', "reviewed_by" = $3, "reviewed_at" = NOW(), "review_comment" = $4
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [proposalId, tenantId, reviewerId, comment ?? null],
    );
  }
}

function mapProposal(r: Record<string, unknown>): MergeProposal {
  return {
    id: r['id'] as string,
    branchName: r['branch_name'] as string,
    targetBranch: r['target_branch'] as string,
    tenantId: r['tenant_id'] as string,
    status: r['status'] as MergeProposal['status'],
    createdAt: r['created_at'] as string,
    createdBy: r['created_by'] as string | undefined,
    reviewedBy: r['reviewed_by'] as string | undefined,
    reviewedAt: r['reviewed_at'] as string | undefined,
    reviewComment: r['review_comment'] as string | undefined,
    summary: r['summary'] as string | undefined,
  };
}
