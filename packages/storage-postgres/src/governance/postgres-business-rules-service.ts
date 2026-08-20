/**
 * PostgreSQL business rules service — approval-gated no-code rule DAGs.
 *
 * A rule is a DAG of logic nodes that only applies once it has been proposed,
 * approved and activated. `state` is therefore not metadata: it is the thing
 * that decides whether the rule governs anything. Losing it silently reverts a
 * rule to draft, which looks like nothing happening rather than like a
 * failure — the worst shape a data loss can take.
 *
 * That state lived in a `Map`. #14's gate withheld the service under Postgres
 * rather than let it accept approvals it would drop, so the routes answered
 * 404 — honest, and useless. This makes them work.
 *
 * Execution and validation are NOT reimplemented here. Running a rule is a
 * pure function of the rule and its input data, so it lives in
 * @altius/spi's business-rule-engine and both providers call it. Two providers
 * that stored the same rule and disagreed about what it produced would be a
 * far worse defect than one that lost it, because nothing would look broken.
 *
 * The state machine is the in-memory service's, unchanged: draft → proposed →
 * approved → active → inactive, with reject leaving proposed → rejected, and
 * the same `Cannot transition from X to Y` refusal.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { executeBusinessRule, validateBusinessRule } from '@altius/spi';
import type {
  BusinessRulesService,
  BusinessRule,
  RuleNode,
  RuleExecutionResult,
  CreateRuleInput,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapRule(r: Record<string, unknown>): BusinessRule {
  const nodes = r['nodes'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    name: String(r['name']),
    description: String(r['description'] ?? ''),
    nodes: (typeof nodes === 'string' ? JSON.parse(nodes) : nodes ?? []) as RuleNode[],
    state: r['state'] as BusinessRule['state'],
    createdAt: toIso(r['created_at'])!,
    updatedAt: toIso(r['updated_at'])!,
    createdBy: String(r['created_by'] ?? ''),
    isTimeSeriesBoard: r['is_time_series_board'] === true,
    // Omitted rather than set to undefined, so a rule round-trips to the same
    // shape the in-memory service returns.
    ...(r['review_notes'] ? { reviewNotes: String(r['review_notes']) } : {}),
    ...(r['reviewed_by'] ? { reviewedBy: String(r['reviewed_by']) } : {}),
    ...(toIso(r['reviewed_at']) ? { reviewedAt: toIso(r['reviewed_at'])! } : {}),
  };
}

export class PostgresBusinessRulesService implements BusinessRulesService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateRuleInput): Promise<BusinessRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    // Node ids are minted here, not by the caller: the DAG's edges reference
    // them, so they have to be stable and unique within the rule.
    const nodes: RuleNode[] = input.nodes.map(n => ({ ...n, id: randomUUID() }));
    const r = await this.pool.query(
      `INSERT INTO "governance"."business_rules"
         ("id","tenant_id","name","description","nodes","state",
          "is_time_series_board","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$7,$8)
       RETURNING *`,
      [id, ctx.tenantId, input.name, input.description, JSON.stringify(nodes),
       input.isTimeSeriesBoard ?? false, now, ctx.actorId ?? 'system'],
    );
    return mapRule(r.rows[0]!);
  }

  async get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."business_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, ruleId],
    );
    return r.rows[0] ? mapRule(r.rows[0]) : null;
  }

  async list(ctx: RequestContext, state?: BusinessRule['state']): Promise<BusinessRule[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "governance"."business_rules" WHERE "tenant_id"=$1`;
    if (state) { params.push(state); sql += ` AND "state"=$${params.length}`; }
    // `id` breaks ties on created_at: rules created in the same millisecond
    // would otherwise come back in an arbitrary order on each call.
    sql += ` ORDER BY "created_at" DESC, "id" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapRule);
  }

  async update(ctx: RequestContext, ruleId: string, updates: Partial<CreateRuleInput>): Promise<BusinessRule> {
    const rule = await this.require(ctx, ruleId);
    let nodes = rule.nodes;
    if (updates.nodes) {
      // Node ids are preserved positionally so an edit that only changes a
      // node's config does not orphan the edges pointing at it.
      const old = rule.nodes;
      nodes = updates.nodes.map((n, i) => ({ ...n, id: old[i]?.id ?? randomUUID() }));
    }
    const r = await this.pool.query(
      `UPDATE "governance"."business_rules"
          SET "name"=$3, "description"=$4, "nodes"=$5, "is_time_series_board"=$6, "updated_at"=$7
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, ruleId,
        updates.name ?? rule.name,
        updates.description ?? rule.description,
        JSON.stringify(nodes),
        updates.isTimeSeriesBoard ?? rule.isTimeSeriesBoard,
        new Date().toISOString(),
      ],
    );
    return mapRule(r.rows[0]!);
  }

  async delete(ctx: RequestContext, ruleId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."business_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, ruleId],
    );
  }

  async submitForApproval(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'draft', 'proposed');
  }

  async approve(ctx: RequestContext, ruleId: string, reviewerId: string, notes?: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'proposed', 'approved', reviewerId, notes);
  }

  async reject(ctx: RequestContext, ruleId: string, reviewerId: string, notes: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'proposed', 'rejected', reviewerId, notes);
  }

  async activate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'approved', 'active');
  }

  async deactivate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'active', 'inactive');
  }

  async execute(ctx: RequestContext, ruleId: string, data: Map<string, Record<string, unknown>[]>): Promise<RuleExecutionResult> {
    const rule = await this.get(ctx, ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    return executeBusinessRule(rule, data);
  }

  async validate(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.validateRule(ctx, ruleId);
  }

  async validateRule(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    const rule = await this.get(ctx, ruleId);
    if (!rule) return { valid: false, errors: ['Rule not found'] };
    return validateBusinessRule(rule);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Move a rule between states, refusing any move the machine does not allow.
   *
   * The guard is expressed in the UPDATE's WHERE clause as well as checked
   * beforehand: two concurrent approvals would otherwise both read `proposed`
   * and both write `approved`, recording the second reviewer over the first.
   * Zero rows updated means another request won, so this one refuses.
   */
  private async transition(
    ctx: RequestContext,
    ruleId: string,
    expected: BusinessRule['state'],
    next: BusinessRule['state'],
    reviewerId?: string,
    notes?: string,
  ): Promise<BusinessRule> {
    const current = await this.require(ctx, ruleId);
    if (current.state !== expected) {
      throw new Error(`Cannot transition from ${current.state} to ${next}`);
    }
    const now = new Date().toISOString();
    const review = reviewerId !== undefined;
    const r = await this.pool.query(
      `UPDATE "governance"."business_rules"
          SET "state"=$4, "updated_at"=$5
              ${review ? `, "reviewed_by"=$6, "review_notes"=$7, "reviewed_at"=$5` : ''}
        WHERE "tenant_id"=$1 AND "id"=$2 AND "state"=$3
        RETURNING *`,
      review
        ? [ctx.tenantId, ruleId, expected, next, now, reviewerId, notes ?? null]
        : [ctx.tenantId, ruleId, expected, next, now],
    );
    if (!r.rows[0]) {
      // The row moved out from under us between the read and the write.
      const latest = await this.get(ctx, ruleId);
      throw new Error(`Cannot transition from ${latest?.state ?? 'deleted'} to ${next}`);
    }
    return mapRule(r.rows[0]);
  }

  private async require(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    const rule = await this.get(ctx, ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    return rule;
  }
}
