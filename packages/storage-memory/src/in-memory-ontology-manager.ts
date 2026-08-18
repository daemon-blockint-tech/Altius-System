/**
 * In-memory ontology manager service.
 */

import { randomUUID } from 'node:crypto';
import type {
  OntologyManagerService,
  OntologyTypeSummary, OntologyTypeDetail,
  OntologyPropertyDetail, OntologyLinkDetail,
  OntologyActionDetail, OntologyFunctionDetail,
  OntologyChangeProposal, CreateChangeProposalInput,
  TypeObservability, ActionObservability, FunctionObservability,
  RequestContext,
} from '@altius/spi';

// Schema reader — allows the service to introspect the current schema
export type SchemaReader = (ctx: RequestContext) => Promise<{
  types: Array<{
    name: string; displayName: string; description: string;
    isAbstract: boolean; parentType?: string; tags: string[];
    properties: OntologyPropertyDetail[];
    links: OntologyLinkDetail[];
  }>;
  actions: Array<{ name: string; displayName: string; description: string; parameterCount: number; targetType?: string; enabled: boolean }>;
  functions: Array<{ name: string; displayName: string; description: string; inputCount: number; outputType: string; enabled: boolean }>;
  version: number;
}>;

// Usage stats reader — for observability tabs
export type UsageStatsReader = (ctx: RequestContext) => Promise<{
  types: Map<string, { reads: number; writes: number; searches: number; activeUsers: number; avgDurationMs: number; errors: number }>;
  actions: Map<string, { executions: number; errors: number; avgDurationMs: number; activeUsers: number; lastExecutedAt?: string }>;
  functions: Map<string, { executions: number; errors: number; avgDurationMs: number; lastExecutedAt?: string }>;
}>;

export class InMemoryOntologyManagerService implements OntologyManagerService {
  private readonly proposals = new Map<string, Map<string, OntologyChangeProposal>>();
  private readonly schemaReader?: SchemaReader;
  private readonly usageReader?: UsageStatsReader;

  constructor(schemaReader?: SchemaReader, usageReader?: UsageStatsReader) {
    this.schemaReader = schemaReader;
    this.usageReader = usageReader;
  }

  // ── Discovery ──

  async listTypes(ctx: RequestContext): Promise<OntologyTypeSummary[]> {
    if (!this.schemaReader) return [];
    const schema = await this.schemaReader(ctx);
    return schema.types.map(t => ({
      name: t.name, displayName: t.displayName, description: t.description,
      propertyCount: t.properties.length, linkCount: t.links.length,
      actionCount: schema.actions.filter(a => a.targetType === t.name).length,
      functionCount: 0, isAbstract: t.isAbstract, parentType: t.parentType,
      tags: t.tags, introducedInVersion: schema.version,
      lastModified: new Date().toISOString(),
    }));
  }

  async getTypeDetail(ctx: RequestContext, typeName: string): Promise<OntologyTypeDetail | null> {
    if (!this.schemaReader) return null;
    const schema = await this.schemaReader(ctx);
    const type = schema.types.find(t => t.name === typeName);
    if (!type) return null;
    const actions = schema.actions.filter(a => a.targetType === typeName);
    const usage = this.usageReader ? await this.usageReader(ctx) : null;
    return {
      name: type.name, displayName: type.displayName, description: type.description,
      propertyCount: type.properties.length, linkCount: type.links.length,
      actionCount: actions.length, functionCount: 0,
      isAbstract: type.isAbstract, parentType: type.parentType, tags: type.tags,
      introducedInVersion: schema.version, lastModified: new Date().toISOString(),
      properties: type.properties, links: type.links,
      actions: actions.map(a => ({
        ...a, usageCount30d: usage?.actions.get(a.name)?.executions ?? 0,
        errorRate: usage?.actions.get(a.name) ? (usage.actions.get(a.name)!.errors / Math.max(1, usage.actions.get(a.name)!.executions)) : 0,
      })),
      functions: schema.functions.map(f => ({
        ...f, usageCount30d: usage?.functions.get(f.name)?.executions ?? 0,
        avgDurationMs: usage?.functions.get(f.name)?.avgDurationMs ?? 0,
      })),
    };
  }

  async searchTypes(ctx: RequestContext, query: string): Promise<OntologyTypeSummary[]> {
    const types = await this.listTypes(ctx);
    const q = query.toLowerCase();
    return types.filter(t => t.name.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }

  async listActions(ctx: RequestContext): Promise<OntologyActionDetail[]> {
    if (!this.schemaReader) return [];
    const schema = await this.schemaReader(ctx);
    const usage = this.usageReader ? await this.usageReader(ctx) : null;
    return schema.actions.map(a => ({
      ...a, usageCount30d: usage?.actions.get(a.name)?.executions ?? 0,
      errorRate: usage?.actions.get(a.name) ? (usage.actions.get(a.name)!.errors / Math.max(1, usage.actions.get(a.name)!.executions)) : 0,
    }));
  }

  async listFunctions(ctx: RequestContext): Promise<OntologyFunctionDetail[]> {
    if (!this.schemaReader) return [];
    const schema = await this.schemaReader(ctx);
    const usage = this.usageReader ? await this.usageReader(ctx) : null;
    return schema.functions.map(f => ({
      ...f, usageCount30d: usage?.functions.get(f.name)?.executions ?? 0,
      avgDurationMs: usage?.functions.get(f.name)?.avgDurationMs ?? 0,
    }));
  }

  // ── Editing ──

  async createProposal(ctx: RequestContext, input: CreateChangeProposalInput): Promise<OntologyChangeProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const proposal: OntologyChangeProposal = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      kind: input.kind, targetType: input.targetType,
      change: input.change,
      validationStatus: 'pending', validationErrors: [],
      isBreaking: false, migrationPlan: input.migrationPlan,
      reviewStatus: 'draft',
      ownerId: ctx.actorId ?? 'system',
      createdAt: now, updatedAt: now,
    };
    this.getProposalMap(ctx.tenantId).set(id, proposal);
    return proposal;
  }

  async getProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal | null> {
    return this.proposals.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listProposals(ctx: RequestContext, status?: OntologyChangeProposal['reviewStatus']): Promise<OntologyChangeProposal[]> {
    const m = this.proposals.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (status) list = list.filter(p => p.reviewStatus === status);
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async validateProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal> {
    const p = this.proposals.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Proposal not found: ${id}`);
    const errors: string[] = [];
    // Basic validation rules
    if (!p.change || Object.keys(p.change).length === 0) errors.push('Change definition is empty');
    if (p.kind === 'remove_type' || p.kind === 'remove_property') p.isBreaking = true;
    if (p.kind === 'modify_property' && p.change['type'] !== undefined) p.isBreaking = true;
    if (p.isBreaking && !p.migrationPlan) errors.push('Breaking change requires a migration plan');
    const updated: OntologyChangeProposal = {
      ...p, validationStatus: errors.length === 0 ? 'valid' : 'invalid',
      validationErrors: errors, updatedAt: new Date().toISOString(),
    };
    this.getProposalMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async submitProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal> {
    const p = this.proposals.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Proposal not found: ${id}`);
    if (p.validationStatus === 'pending') await this.validateProposal(ctx, id);
    const current = this.proposals.get(ctx.tenantId)!.get(id)!;
    if (current.validationStatus === 'invalid') throw new Error('Cannot submit an invalid proposal');
    const updated = { ...current, reviewStatus: 'submitted' as const, updatedAt: new Date().toISOString() };
    this.getProposalMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async reviewProposal(ctx: RequestContext, id: string, decision: 'approved' | 'rejected', comments?: string): Promise<OntologyChangeProposal> {
    const p = this.proposals.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Proposal not found: ${id}`);
    if (p.reviewStatus !== 'submitted') throw new Error('Can only review submitted proposals');
    const updated: OntologyChangeProposal = {
      ...p, reviewStatus: decision, reviewerId: ctx.actorId ?? 'system',
      reviewComments: comments, updatedAt: new Date().toISOString(),
    };
    this.getProposalMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async applyProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal> {
    const p = this.proposals.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Proposal not found: ${id}`);
    if (p.reviewStatus !== 'approved') throw new Error('Can only apply approved proposals');
    // In-memory: we don't actually modify the schema, just mark as applied
    const updated: OntologyChangeProposal = {
      ...p, reviewStatus: 'applied', appliedVersion: Date.now(),
      updatedAt: new Date().toISOString(),
    };
    this.getProposalMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteProposal(ctx: RequestContext, id: string): Promise<void> {
    this.proposals.get(ctx.tenantId)?.delete(id);
  }

  // ── Observability ──

  async getTypeObservability(ctx: RequestContext, typeName: string): Promise<TypeObservability> {
    if (!this.usageReader) return { typeName, reads30d: 0, writes30d: 0, searches30d: 0, activeUsers30d: 0, avgDurationMs: 0, errors30d: 0 };
    const usage = await this.usageReader(ctx);
    const stats = usage.types.get(typeName);
    return stats
      ? { typeName, reads30d: stats.reads, writes30d: stats.writes, searches30d: stats.searches, activeUsers30d: stats.activeUsers, avgDurationMs: stats.avgDurationMs, errors30d: stats.errors }
      : { typeName, reads30d: 0, writes30d: 0, searches30d: 0, activeUsers30d: 0, avgDurationMs: 0, errors30d: 0 };
  }

  async getActionObservability(ctx: RequestContext, actionName: string): Promise<ActionObservability> {
    if (!this.usageReader) return { actionName, executions30d: 0, errors30d: 0, avgDurationMs: 0, activeUsers30d: 0 };
    const usage = await this.usageReader(ctx);
    const stats = usage.actions.get(actionName);
    return stats
      ? { actionName, executions30d: stats.executions, errors30d: stats.errors, avgDurationMs: stats.avgDurationMs, activeUsers30d: stats.activeUsers, lastExecutedAt: stats.lastExecutedAt }
      : { actionName, executions30d: 0, errors30d: 0, avgDurationMs: 0, activeUsers30d: 0 };
  }

  async getFunctionObservability(ctx: RequestContext, functionName: string): Promise<FunctionObservability> {
    if (!this.usageReader) return { functionName, executions30d: 0, errors30d: 0, avgDurationMs: 0 };
    const usage = await this.usageReader(ctx);
    const stats = usage.functions.get(functionName);
    return stats
      ? { functionName, executions30d: stats.executions, errors30d: stats.errors, avgDurationMs: stats.avgDurationMs, lastExecutedAt: stats.lastExecutedAt }
      : { functionName, executions30d: 0, errors30d: 0, avgDurationMs: 0 };
  }

  async getAllObservability(ctx: RequestContext): Promise<{ types: TypeObservability[]; actions: ActionObservability[]; functions: FunctionObservability[] }> {
    if (!this.usageReader) return { types: [], actions: [], functions: [] };
    const usage = await this.usageReader(ctx);
    const types: TypeObservability[] = Array.from(usage.types.entries()).map(([name, s]) => ({
      typeName: name, reads30d: s.reads, writes30d: s.writes, searches30d: s.searches,
      activeUsers30d: s.activeUsers, avgDurationMs: s.avgDurationMs, errors30d: s.errors,
    }));
    const actions: ActionObservability[] = Array.from(usage.actions.entries()).map(([name, s]) => ({
      actionName: name, executions30d: s.executions, errors30d: s.errors,
      avgDurationMs: s.avgDurationMs, activeUsers30d: s.activeUsers, lastExecutedAt: s.lastExecutedAt,
    }));
    const functions: FunctionObservability[] = Array.from(usage.functions.entries()).map(([name, s]) => ({
      functionName: name, executions30d: s.executions, errors30d: s.errors,
      avgDurationMs: s.avgDurationMs, lastExecutedAt: s.lastExecutedAt,
    }));
    return { types, actions, functions };
  }

  private getProposalMap(t: string) {
    let m = this.proposals.get(t);
    if (!m) { m = new Map(); this.proposals.set(t, m); }
    return m;
  }
}
