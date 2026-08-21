/**
 * In-memory business rules engine.
 */

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

export class InMemoryBusinessRulesService implements BusinessRulesService {
  private readonly rules = new Map<string, Map<string, BusinessRule>>();

  async create(ctx: RequestContext, input: CreateRuleInput): Promise<BusinessRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const nodes: RuleNode[] = input.nodes.map(n => ({ ...n, id: randomUUID() }));
    const rule: BusinessRule = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description,
      nodes,
      state: 'draft',
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      isTimeSeriesBoard: input.isTimeSeriesBoard ?? false,
    };
    this.getMap(ctx.tenantId).set(id, rule);
    return rule;
  }

  async get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null> {
    return this.rules.get(ctx.tenantId)?.get(ruleId) ?? null;
  }

  async list(ctx: RequestContext, state?: BusinessRule['state']): Promise<BusinessRule[]> {
    const tenantRules = this.rules.get(ctx.tenantId);
    if (!tenantRules) return [];
    let results = Array.from(tenantRules.values());
    if (state) results = results.filter(r => r.state === state);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(ctx: RequestContext, ruleId: string, updates: Partial<CreateRuleInput>): Promise<BusinessRule> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    let nodes = rule.nodes;
    if (updates.nodes) {
      // Preserve existing node IDs where possible (match by index)
      const oldNodes = rule.nodes;
      nodes = updates.nodes.map((n, i) => ({
        ...n,
        id: oldNodes[i]?.id ?? randomUUID(),
      }));
    }
    const updated: BusinessRule = {
      ...rule,
      name: updates.name ?? rule.name,
      description: updates.description ?? rule.description,
      nodes,
      isTimeSeriesBoard: updates.isTimeSeriesBoard ?? rule.isTimeSeriesBoard,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async delete(ctx: RequestContext, ruleId: string): Promise<void> {
    this.rules.get(ctx.tenantId)?.delete(ruleId);
  }

  async submitForApproval(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'draft', 'proposed');
  }

  async approve(ctx: RequestContext, ruleId: string, reviewerId: string, notes?: string): Promise<BusinessRule> {
    const rule = await this.transition(ctx, ruleId, 'proposed', 'approved');
    const updated = { ...rule, reviewedBy: reviewerId, reviewNotes: notes, reviewedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async reject(ctx: RequestContext, ruleId: string, reviewerId: string, notes: string): Promise<BusinessRule> {
    const rule = await this.transition(ctx, ruleId, 'proposed', 'rejected');
    const updated = { ...rule, reviewedBy: reviewerId, reviewNotes: notes, reviewedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async activate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'approved', 'active');
  }

  async deactivate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'active', 'inactive');
  }

  async execute(ctx: RequestContext, ruleId: string, data: Map<string, Record<string, unknown>[]>): Promise<RuleExecutionResult> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    return executeBusinessRule(rule, data);
  }

  async validate(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.validateRule(ctx, ruleId);
  }

  async validateRule(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) return { valid: false, errors: ['Rule not found'] };
    return validateBusinessRule(rule);
  }

  private async transition(ctx: RequestContext, ruleId: string, expected: BusinessRule['state'], next: BusinessRule['state']): Promise<BusinessRule> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    if (rule.state !== expected) throw new Error(`Cannot transition from ${rule.state} to ${next}`);
    const updated: BusinessRule = { ...rule, state: next, updatedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  private getMap(tenantId: string): Map<string, BusinessRule> {
    let m = this.rules.get(tenantId);
    if (!m) { m = new Map(); this.rules.set(tenantId, m); }
    return m;
  }
}
