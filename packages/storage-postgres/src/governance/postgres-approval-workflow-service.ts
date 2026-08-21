/**
 * PostgreSQL-backed approval workflow service.
 *
 * Persists ABAC-governed approval workflows and their submissions. The
 * evaluation logic and state machine are kept identical to the in-memory
 * implementation so the two providers cannot diverge on whether a submission
 * is accepted or what state it is in.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  ApprovalWorkflowService,
  ApprovalWorkflow,
  ApprovalSubmission,
  SubmissionCriterion,
  AttributeCondition,
  RequestContext,
} from '@altius/spi';

/** TIMESTAMPTZ arrives as a Date; the SPI types every timestamp as an ISO string. */
function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T {
  if (v === null || v === undefined) {
    // Cast through unknown to avoid a direct any assignment while still
    // satisfying the JSON-shaped return types the SPI expects.
    return undefined as unknown as T;
  }
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapWorkflow(row: Record<string, unknown>): ApprovalWorkflow {
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['name']),
    description: String(row['description'] ?? ''),
    actionType: String(row['action_type']),
    criteria: parseJsonb<ApprovalWorkflow['criteria']>(row['criteria']) ?? [],
    approverAttributes: parseJsonb<ApprovalWorkflow['approverAttributes']>(row['approver_attributes']) ?? [],
    multiStep: row['multi_step'] === true,
    enabled: row['enabled'] === true,
    createdAt: toIso(row['created_at'])!,
    updatedAt: toIso(row['updated_at'])!,
    createdBy: String(row['created_by'] ?? ''),
  };
}

function mapSubmission(row: Record<string, unknown>): ApprovalSubmission {
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    workflowId: String(row['workflow_id']),
    actionType: String(row['action_type']),
    parameters: parseJsonb<Record<string, unknown>>(row['parameters']) ?? {},
    submitterAttributes: parseJsonb<Record<string, unknown>>(row['submitter_attributes']) ?? {},
    resourceAttributes: parseJsonb<Record<string, unknown>>(row['resource_attributes']) ?? {},
    riskLevel: row['risk_level'] as ApprovalSubmission['riskLevel'],
    state: row['state'] as ApprovalSubmission['state'],
    submittedAt: toIso(row['submitted_at'])!,
    submittedBy: String(row['submitted_by'] ?? ''),
    ...(toIso(row['decided_at']) ? { decidedAt: toIso(row['decided_at'])! } : {}),
    ...(row['decided_by'] ? { decidedBy: String(row['decided_by']) } : {}),
    ...(row['decision_notes'] ? { decisionNotes: String(row['decision_notes']) } : {}),
    criteriaPassed: row['criteria_passed'] === true,
    criteriaDetails: parseJsonb<ApprovalSubmission['criteriaDetails']>(row['criteria_details']) ?? [],
  };
}

export class PostgresApprovalWorkflowService implements ApprovalWorkflowService {
  constructor(private readonly pool: Pool) {}

  async createWorkflow(
    ctx: RequestContext,
    input: Omit<ApprovalWorkflow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  ): Promise<ApprovalWorkflow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "governance"."approval_workflows"
         ("id","tenant_id","name","description","action_type","criteria","approver_attributes",
          "multi_step","enabled","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name,
        input.description ?? '',
        input.actionType,
        JSON.stringify(input.criteria ?? []),
        JSON.stringify(input.approverAttributes ?? []),
        input.multiStep ?? false,
        input.enabled ?? true,
        now,
        ctx.actorId ?? 'system',
      ],
    );
    return mapWorkflow(r.rows[0]!);
  }

  async getWorkflow(ctx: RequestContext, workflowId: string): Promise<ApprovalWorkflow | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."approval_workflows" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, workflowId],
    );
    return r.rows[0] ? mapWorkflow(r.rows[0]!) : null;
  }

  async listWorkflows(ctx: RequestContext, actionType?: string): Promise<ApprovalWorkflow[]> {
    let sql = `SELECT * FROM "governance"."approval_workflows" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (actionType) {
      params.push(actionType);
      sql += ` AND "action_type"=$${params.length}`;
    }
    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapWorkflow);
  }

  async updateWorkflow(
    ctx: RequestContext,
    workflowId: string,
    updates: Partial<ApprovalWorkflow>,
  ): Promise<ApprovalWorkflow> {
    const current = await this.getWorkflow(ctx, workflowId);
    if (!current) throw new Error(`Workflow not found: ${workflowId}`);

    const columnMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      actionType: 'action_type',
      criteria: 'criteria',
      approverAttributes: 'approver_attributes',
      multiStep: 'multi_step',
      enabled: 'enabled',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy'].includes(key)) continue;
      const column = columnMap[key];
      if (!column) continue;
      if (key === 'criteria' || key === 'approverAttributes') {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
      sets.push(`"${column}"=$${params.length}`);
    }

    if (sets.length === 0) {
      return current;
    }

    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(workflowId, ctx.tenantId);

    const r = await this.pool.query(
      `UPDATE "governance"."approval_workflows" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`,
      params,
    );
    if (!r.rows[0]) throw new Error(`Workflow not found: ${workflowId}`);
    return mapWorkflow(r.rows[0]!);
  }

  async deleteWorkflow(ctx: RequestContext, workflowId: string): Promise<void> {
    // Submissions reference workflows; delete them first to keep the
    // foreign-key relationship clean without cascading in the DDL.
    await this.pool.query(
      `DELETE FROM "governance"."approval_submissions" WHERE "tenant_id"=$1 AND "workflow_id"=$2`,
      [ctx.tenantId, workflowId],
    );
    await this.pool.query(
      `DELETE FROM "governance"."approval_workflows" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, workflowId],
    );
  }

  async submit(
    ctx: RequestContext,
    workflowId: string,
    params: {
      parameters: Record<string, unknown>;
      submitterAttributes: Record<string, unknown>;
      resourceAttributes: Record<string, unknown>;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    },
  ): Promise<ApprovalSubmission> {
    const wf = await this.getWorkflow(ctx, workflowId);
    if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
    if (!wf.enabled) throw new Error('Workflow is not enabled');

    const criteriaDetails = wf.criteria.map((c) => {
      const passed = this.evaluateCriterion(c, params.submitterAttributes, params.resourceAttributes, params.riskLevel);
      return { criterionName: c.name, passed, reason: passed ? 'All conditions met' : 'Conditions not met' };
    });
    const criteriaPassed = wf.criteria.length === 0 || criteriaDetails.every((d) => d.passed);

    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "governance"."approval_submissions"
         ("id","tenant_id","workflow_id","action_type","parameters","submitter_attributes",
          "resource_attributes","risk_level","state","submitted_at","submitted_by",
          "criteria_passed","criteria_details")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        workflowId,
        wf.actionType,
        JSON.stringify(params.parameters),
        JSON.stringify(params.submitterAttributes),
        JSON.stringify(params.resourceAttributes),
        params.riskLevel,
        now,
        ctx.actorId ?? 'system',
        criteriaPassed,
        JSON.stringify(criteriaDetails),
      ],
    );
    return mapSubmission(r.rows[0]!);
  }

  async approve(ctx: RequestContext, submissionId: string, notes?: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'approved', notes);
  }

  async reject(ctx: RequestContext, submissionId: string, notes: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'rejected', notes);
  }

  async withdraw(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'withdrawn');
  }

  async listSubmissions(ctx: RequestContext, state?: ApprovalSubmission['state']): Promise<ApprovalSubmission[]> {
    let sql = `SELECT * FROM "governance"."approval_submissions" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (state) {
      params.push(state);
      sql += ` AND "state"=$${params.length}`;
    }
    sql += ` ORDER BY "submitted_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSubmission);
  }

  async getSubmission(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."approval_submissions" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, submissionId],
    );
    return r.rows[0] ? mapSubmission(r.rows[0]!) : null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async decide(
    ctx: RequestContext,
    submissionId: string,
    state: ApprovalSubmission['state'],
    notes?: string,
  ): Promise<ApprovalSubmission> {
    const sub = await this.getSubmission(ctx, submissionId);
    if (!sub) throw new Error(`Submission not found: ${submissionId}`);
    if (sub.state !== 'pending') throw new Error(`Cannot ${state} a ${sub.state} submission`);

    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."approval_submissions"
          SET "state"=$3, "decided_at"=$4, "decided_by"=$5, "decision_notes"=$6
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, submissionId, state, now, ctx.actorId ?? 'system', notes ?? null],
    );
    return mapSubmission(r.rows[0]!);
  }

  private evaluateCriterion(
    criterion: SubmissionCriterion,
    userAttrs: Record<string, unknown>,
    resourceAttrs: Record<string, unknown>,
    riskLevel: string,
  ): boolean {
    if (criterion.minRiskLevel && this.riskLevelValue(riskLevel) < this.riskLevelValue(criterion.minRiskLevel)) {
      return true; // Criterion doesn't apply to this risk level
    }
    const userResults = criterion.userAttributes.map((c) => this.evaluateCondition(c, userAttrs));
    const resourceResults = criterion.resourceAttributes.map((c) => this.evaluateCondition(c, resourceAttrs));
    const allResults = [...userResults, ...resourceResults];
    if (allResults.length === 0) return true;
    return criterion.matchMode === 'all' ? allResults.every(Boolean) : allResults.some(Boolean);
  }

  private evaluateCondition(cond: AttributeCondition, attrs: Record<string, unknown>): boolean {
    const val = attrs[cond.attribute];
    switch (cond.operator) {
      case 'eq':
        return val === cond.value;
      case 'ne':
        return val !== cond.value;
      case 'in':
        return Array.isArray(cond.values) && cond.values.includes(val);
      case 'not_in':
        return Array.isArray(cond.values) && !cond.values.includes(val);
      case 'gt':
        return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
      case 'lt':
        return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
      case 'gte':
        return typeof val === 'number' && typeof cond.value === 'number' && val >= cond.value;
      case 'lte':
        return typeof val === 'number' && typeof cond.value === 'number' && val <= cond.value;
      case 'exists':
        return val !== undefined && val !== null;
      default:
        return false;
    }
  }

  private riskLevelValue(level: string): number {
    return { low: 1, medium: 2, high: 3, critical: 4 }[level] ?? 0;
  }
}
