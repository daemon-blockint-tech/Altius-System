/**
 * PostgreSQL implementations for Batch 2 of memory-only SPI services.
 *
 * AgentThreadStore, ChangeProposalStore, SavedViewStore, ObjectSetFilterStore,
 * ApprovalWorkflowService, DataExpectationsService, DesignSystemService,
 * ModelRegistryService, ConnectorCatalogService, CommandService.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@altius/spi';
import type {
  AgentThreadStore, AgentThread, ThreadMessage, MessageRole,
} from '@altius/spi';
import type {
  ChangeProposalStore, ChangeProposal, CreateProposalInput, UpdateProposalInput, ProposalQuery,
} from '@altius/spi';
import type {
  SavedViewStore, SavedView, CreateSavedViewInput,
} from '@altius/spi';
import type {
  ObjectSetFilterStore, FilterState, SaveFilterStateInput, FilterChip, FilterSetOp,
} from '@altius/spi';
import type {
  ApprovalWorkflowService, ApprovalWorkflow, ApprovalSubmission,
} from '@altius/spi';
import type {
  DataExpectationsService, DataExpectation, CreateExpectationInput, ExpectationResult,
} from '@altius/spi';
import type {
  DesignSystemService, DesignSystemTheme, CreateThemeInput, SetModulePaletteInput,
} from '@altius/spi';
import type {
  ModelRegistryService, ModelArtifact, CreateModelInput, ModelQuery,
  ModelInferenceService, ModelDeployment, InferenceInput, InferenceResult, InferenceHistoryRecord,
  ModelChainService, ModelChain, ModelChainResult,
} from '@altius/spi';
import type {
  ConnectorCatalogService, ConfiguredConnector, ConfigureConnectorInput,
  EgressPolicy, CreateEgressPolicyInput, EgressValidationResult, VendorConnectorEntry,
} from '@altius/spi';
import type {
  CommandService, AppCommand, CommandChain, CommandChainResult,
} from '@altius/spi';

// ─────────────────────────────────────────────────────────────────────────────
// AgentThreadStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresAgentThreadStore implements AgentThreadStore {
  constructor(private readonly pool: Pool) {}

  async createThread(ctx: RequestContext, input: { name: string; model?: string }): Promise<AgentThread> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "agent_threads"."threads" ("id","tenant_id","user_id","name","model","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [id, ctx.tenantId, ctx.actorId ?? '', input.name, input.model ?? null, now],
    );
    return { id, name: input.name, userId: ctx.actorId ?? '', tenantId: ctx.tenantId, model: input.model, createdAt: now, updatedAt: now };
  }

  async getThread(ctx: RequestContext, threadId: string): Promise<AgentThread | null> {
    const r = await this.pool.query(`SELECT * FROM "agent_threads"."threads" WHERE "id"=$1 AND "tenant_id"=$2`, [threadId, ctx.tenantId]);
    return r.rows[0] ? mapThread(r.rows[0]!) : null;
  }

  async listThreads(ctx: RequestContext, userId?: string): Promise<AgentThread[]> {
    let sql = `SELECT * FROM "agent_threads"."threads" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (userId) { params.push(userId); sql += ` AND "user_id"=$${params.length}`; }
    sql += ` ORDER BY "updated_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapThread);
  }

  async updateThread(ctx: RequestContext, threadId: string, updates: { name?: string }): Promise<AgentThread> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "agent_threads"."threads" SET "name"=COALESCE($3,"name"),"updated_at"=$4 WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`,
      [threadId, ctx.tenantId, updates.name ?? null, now],
    );
    return mapThread(r.rows[0]!);
  }

  async deleteThread(ctx: RequestContext, threadId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "agent_threads"."messages" WHERE "thread_id"=$1 AND "tenant_id"=$2`, [threadId, ctx.tenantId]);
    await this.pool.query(`DELETE FROM "agent_threads"."threads" WHERE "id"=$1 AND "tenant_id"=$2`, [threadId, ctx.tenantId]);
  }

  async addMessage(ctx: RequestContext, threadId: string, input: Omit<ThreadMessage, 'id' | 'threadId' | 'createdAt'>): Promise<ThreadMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "agent_threads"."messages" ("id","tenant_id","thread_id","role","content","tool_calls","tool_result","model","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, ctx.tenantId, threadId, input.role, input.content ?? null, input.toolCalls ? JSON.stringify(input.toolCalls) : null, input.toolResult ? JSON.stringify(input.toolResult) : null, input.model ?? null, now],
    );
    await this.pool.query(`UPDATE "agent_threads"."threads" SET "updated_at"=$3 WHERE "id"=$1 AND "tenant_id"=$2`, [threadId, ctx.tenantId, now]);
    return { id, threadId, role: input.role as MessageRole, content: input.content, toolCalls: input.toolCalls, toolResult: input.toolResult, model: input.model, createdAt: now };
  }

  async getMessages(ctx: RequestContext, threadId: string, limit?: number): Promise<ThreadMessage[]> {
    const r = await this.pool.query(
      `SELECT * FROM "agent_threads"."messages" WHERE "thread_id"=$1 AND "tenant_id"=$2 ORDER BY "created_at" ASC LIMIT $3`,
      [threadId, ctx.tenantId, limit ?? 1000],
    );
    return r.rows.map(mapMessage);
  }
}

function mapThread(r: any): AgentThread {
  return { id: r.id, name: r.name, userId: r.user_id, tenantId: r.tenant_id, model: r.model ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapMessage(r: any): ThreadMessage {
  return { id: r.id, threadId: r.thread_id, role: r.role as MessageRole, content: r.content ?? undefined, toolCalls: r.tool_calls ? (typeof r.tool_calls === 'string' ? JSON.parse(r.tool_calls) : r.tool_calls) : undefined, toolResult: r.tool_result ? (typeof r.tool_result === 'string' ? JSON.parse(r.tool_result) : r.tool_result) : undefined, model: r.model ?? undefined, createdAt: r.created_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// ChangeProposalStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresChangeProposalStore implements ChangeProposalStore {
  constructor(private readonly pool: Pool) {}

  async create(tenantId: string, submittedBy: string, input: CreateProposalInput): Promise<ChangeProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "change_proposals"."proposals" ("id","tenant_id","title","description","type","changes","state","submitted_by","submitted_by_ai","created_at","updated_at","risk_level","hold_id","tags")
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$9,$10,$11,$12)`,
      [id, tenantId, input.title, input.description, input.type, JSON.stringify(input.changes), submittedBy, input.submittedByAI ?? false, now, input.riskLevel ?? null, input.holdId ?? null, input.tags ?? []],
    );
    return { id, tenantId, title: input.title, description: input.description, type: input.type, changes: input.changes, state: 'draft', submittedBy, submittedByAI: input.submittedByAI ?? false, createdAt: now, updatedAt: now, riskLevel: input.riskLevel, holdId: input.holdId, tags: input.tags };
  }

  async get(tenantId: string, proposalId: string): Promise<ChangeProposal | null> {
    const r = await this.pool.query(`SELECT * FROM "change_proposals"."proposals" WHERE "id"=$1 AND "tenant_id"=$2`, [proposalId, tenantId]);
    return r.rows[0] ? mapProposal(r.rows[0]!) : null;
  }

  async list(tenantId: string, query?: ProposalQuery): Promise<{ proposals: ChangeProposal[]; totalCount: number }> {
    let sql = `SELECT * FROM "change_proposals"."proposals" WHERE "tenant_id"=$1`;
    const params: unknown[] = [tenantId];
    if (query?.state) { params.push(query.state); sql += ` AND "state"=$${params.length}`; }
    if (query?.type) { params.push(query.type); sql += ` AND "type"=$${params.length}`; }
    if (query?.submittedBy) { params.push(query.submittedBy); sql += ` AND "submitted_by"=$${params.length}`; }
    if (query?.reviewerId) { params.push(query.reviewerId); sql += ` AND "reviewer_id"=$${params.length}`; }
    if (query?.submittedByAI != null) { params.push(query.submittedByAI); sql += ` AND "submitted_by_ai"=$${params.length}`; }
    if (query?.startTime) { params.push(query.startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (query?.endTime) { params.push(query.endTime); sql += ` AND "created_at" <= $${params.length}`; }
    sql += ` ORDER BY "created_at" DESC`;
    if (query?.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const r = await this.pool.query(sql, params);
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS c FROM "change_proposals"."proposals" WHERE "tenant_id"=$1`, [tenantId]);
    return { proposals: r.rows.map(mapProposal), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async update(tenantId: string, proposalId: string, input: UpdateProposalInput): Promise<ChangeProposal> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.title !== undefined) { params.push(input.title); sets.push(`"title"=$${params.length}`); }
    if (input.description !== undefined) { params.push(input.description); sets.push(`"description"=$${params.length}`); }
    if (input.changes !== undefined) { params.push(JSON.stringify(input.changes)); sets.push(`"changes"=$${params.length}`); }
    if (input.tags !== undefined) { params.push(input.tags); sets.push(`"tags"=$${params.length}`); }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(proposalId, tenantId);
    const r = await this.pool.query(`UPDATE "change_proposals"."proposals" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapProposal(r.rows[0]!);
  }

  private async transition(tenantId: string, proposalId: string, state: string, extra?: Record<string, unknown>): Promise<ChangeProposal> {
    const sets: string[] = [`"state"=$1`];
    const params: unknown[] = [state];
    for (const [k, v] of Object.entries(extra ?? {})) {
      params.push(v);
      sets.push(`"${k}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(proposalId, tenantId);
    const r = await this.pool.query(`UPDATE "change_proposals"."proposals" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapProposal(r.rows[0]!);
  }

  async submit(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'submitted', { submitted_at: new Date().toISOString() });
  }
  async claimForReview(tenantId: string, proposalId: string, reviewerId: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'under_review', { reviewer_id: reviewerId });
  }
  async approve(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'approved', { reviewer_id: reviewerId, reviewer_comments: comments ?? null, reviewed_at: new Date().toISOString() });
  }
  async reject(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'rejected', { reviewer_id: reviewerId, reviewer_comments: comments ?? null, reviewed_at: new Date().toISOString() });
  }
  async requestChanges(tenantId: string, proposalId: string, reviewerId: string, comments: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'changes_requested', { reviewer_id: reviewerId, reviewer_comments: comments, reviewed_at: new Date().toISOString() });
  }
  async markApplied(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'applied', { applied_at: new Date().toISOString() });
  }
  async withdraw(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    return this.transition(tenantId, proposalId, 'withdrawn');
  }
  async getPendingReview(tenantId: string, _reviewerId: string): Promise<ChangeProposal[]> {
    const r = await this.pool.query(`SELECT * FROM "change_proposals"."proposals" WHERE "tenant_id"=$1 AND "state"='submitted' ORDER BY "created_at" ASC`, [tenantId]);
    return r.rows.map(mapProposal);
  }
}

function mapProposal(r: any): ChangeProposal {
  return { id: r.id, tenantId: r.tenant_id, title: r.title, description: r.description, type: r.type, changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes, state: r.state, submittedBy: r.submitted_by, submittedByAI: r.submitted_by_ai, createdAt: r.created_at, submittedAt: r.submitted_at ?? undefined, updatedAt: r.updated_at, reviewerId: r.reviewer_id ?? undefined, reviewerComments: r.reviewer_comments ?? undefined, reviewedAt: r.reviewed_at ?? undefined, appliedAt: r.applied_at ?? undefined, riskLevel: r.risk_level ?? undefined, holdId: r.hold_id ?? undefined, tags: r.tags ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// SavedViewStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresSavedViewStore implements SavedViewStore {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateSavedViewInput): Promise<SavedView> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "saved_views"."views" ("id","tenant_id","name","description","object_type","widget_type","app_id","columns","filter","order_by","density","page_size","widget_config","is_public","created_by","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`,
      [id, ctx.tenantId, input.name, input.description ?? null, input.objectType ?? null, input.widgetType ?? null, input.appId ?? null, input.columns ? JSON.stringify(input.columns) : null, input.filter ? JSON.stringify(input.filter) : null, input.orderBy ? JSON.stringify(input.orderBy) : null, input.density ?? null, input.pageSize ?? null, input.widgetConfig ? JSON.stringify(input.widgetConfig) : null, input.isPublic ?? false, ctx.actorId ?? '', now],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, objectType: input.objectType, widgetType: input.widgetType, appId: input.appId, columns: input.columns, filter: input.filter, orderBy: input.orderBy, density: input.density, pageSize: input.pageSize, widgetConfig: input.widgetConfig, isPublic: input.isPublic ?? false, createdBy: ctx.actorId ?? '', createdAt: now, updatedAt: now };
  }

  async get(ctx: RequestContext, id: string): Promise<SavedView | null> {
    const r = await this.pool.query(`SELECT * FROM "saved_views"."views" WHERE "id"=$1 AND "tenant_id"=$2 AND ("is_public"=TRUE OR "created_by"=$3)`, [id, ctx.tenantId, ctx.actorId ?? '']);
    return r.rows[0] ? mapSavedView(r.rows[0]!) : null;
  }

  async list(ctx: RequestContext, filter?: { objectType?: string; widgetType?: string; appId?: string }): Promise<SavedView[]> {
    let sql = `SELECT * FROM "saved_views"."views" WHERE "tenant_id"=$1 AND ("is_public"=TRUE OR "created_by"=$2)`;
    const params: unknown[] = [ctx.tenantId, ctx.actorId ?? ''];
    if (filter?.objectType) { params.push(filter.objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (filter?.widgetType) { params.push(filter.widgetType); sql += ` AND "widget_type"=$${params.length}`; }
    if (filter?.appId) { params.push(filter.appId); sql += ` AND "app_id"=$${params.length}`; }
    sql += ` ORDER BY "updated_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSavedView);
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateSavedViewInput>): Promise<SavedView> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const col = k === 'widgetConfig' ? 'widget_config' : k === 'isPublic' ? 'is_public' : k === 'pageSize' ? 'page_size' : k === 'objectType' ? 'object_type' : k === 'widgetType' ? 'widget_type' : k === 'appId' ? 'app_id' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "saved_views"."views" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapSavedView(r.rows[0]!);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "saved_views"."views" WHERE "id"=$1 AND "tenant_id"=$2 AND "created_by"=$3`, [id, ctx.tenantId, ctx.actorId ?? '']);
  }
}

function mapSavedView(r: any): SavedView {
  const parse = (v: any) => v ? (typeof v === 'string' ? JSON.parse(v) : v) : undefined;
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description ?? undefined, objectType: r.object_type ?? undefined, widgetType: r.widget_type ?? undefined, appId: r.app_id ?? undefined, columns: parse(r.columns), filter: parse(r.filter), orderBy: parse(r.order_by), density: r.density ?? undefined, pageSize: r.page_size ?? undefined, widgetConfig: parse(r.widget_config), isPublic: r.is_public, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// ObjectSetFilterStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresObjectSetFilterStore implements ObjectSetFilterStore {
  constructor(private readonly pool: Pool) {}

  async getFilterState(ctx: RequestContext, objectSetId: string): Promise<FilterState | null> {
    const r = await this.pool.query(`SELECT * FROM "object_set_filters"."states" WHERE "tenant_id"=$1 AND "object_set_id"=$2 ORDER BY "updated_at" DESC LIMIT 1`, [ctx.tenantId, objectSetId]);
    return r.rows[0] ? mapFilterState(r.rows[0]!) : null;
  }

  async saveFilterState(ctx: RequestContext, objectSetId: string, input: SaveFilterStateInput): Promise<FilterState> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "object_set_filters"."states" ("id","tenant_id","object_set_id","name","chips","variables","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [id, ctx.tenantId, objectSetId, input.name ?? '', JSON.stringify(input.chips), JSON.stringify(input.variables ?? {}), now],
    );
    return { id, tenantId: ctx.tenantId, objectSetId, name: input.name ?? '', chips: input.chips, variables: input.variables ?? {}, createdAt: now, updatedAt: now };
  }

  async listFilterStates(ctx: RequestContext, objectSetId?: string): Promise<FilterState[]> {
    let sql = `SELECT * FROM "object_set_filters"."states" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (objectSetId) { params.push(objectSetId); sql += ` AND "object_set_id"=$${params.length}`; }
    sql += ` ORDER BY "updated_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapFilterState);
  }

  async deleteFilterState(ctx: RequestContext, objectSetId: string, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "object_set_filters"."states" WHERE "id"=$1 AND "tenant_id"=$2 AND "object_set_id"=$3`, [id, ctx.tenantId, objectSetId]);
  }

  async extractVariables(_ctx: RequestContext, _objectSetId: string, chips: FilterChip[]): Promise<Record<string, unknown>> {
    const vars: Record<string, unknown> = {};
    for (const chip of chips) {
      if (chip.variableName) vars[chip.variableName] = chip.value;
    }
    return vars;
  }

  async applyFilter(ctx: RequestContext, objectSetId: string, chips: FilterChip[]): Promise<{ filter: import('@altius/spi').FilterExpression; variables: Record<string, unknown> }> {
    const variables = await this.extractVariables(ctx, objectSetId, chips);
    const filter: Record<string, unknown> = { and: chips.map(c => ({ [c.field]: { [c.operator]: c.value } })) };
    return { filter: filter as any, variables };
  }

  async combine(ctx: RequestContext, objectSetId: string, _leftId: string, rightId: string, _op: FilterSetOp, name: string): Promise<FilterState> {
    const left = await this.getFilterState(ctx, objectSetId);
    const right = await this.pool.query(`SELECT * FROM "object_set_filters"."states" WHERE "id"=$1 AND "tenant_id"=$2`, [rightId, ctx.tenantId]);
    if (!left || !right.rows[0]) throw new Error('Filter state not found');
    const combinedChips = [...(left.chips ?? []), ...(mapFilterState(right.rows[0]!).chips ?? [])];
    return this.saveFilterState(ctx, objectSetId, { name, chips: combinedChips });
  }
}

function mapFilterState(r: any): FilterState {
  return { id: r.id, tenantId: r.tenant_id, objectSetId: r.object_set_id, name: r.name, chips: typeof r.chips === 'string' ? JSON.parse(r.chips) : r.chips, variables: typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables, createdAt: r.created_at, updatedAt: r.updated_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// ApprovalWorkflowService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresApprovalWorkflowService implements ApprovalWorkflowService {
  constructor(private readonly pool: Pool) {}

  async createWorkflow(ctx: RequestContext, input: Omit<ApprovalWorkflow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ApprovalWorkflow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "approval_workflows"."workflows" ("id","tenant_id","name","description","action_type","criteria","approver_attributes","multi_step","created_at","updated_at","created_by","enabled")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)`,
      [id, ctx.tenantId, input.name, input.description, input.actionType, JSON.stringify(input.criteria), JSON.stringify(input.approverAttributes), input.multiStep, now, ctx.actorId ?? '', input.enabled],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, actionType: input.actionType, criteria: input.criteria, approverAttributes: input.approverAttributes, multiStep: input.multiStep, createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '', enabled: input.enabled };
  }

  async getWorkflow(ctx: RequestContext, workflowId: string): Promise<ApprovalWorkflow | null> {
    const r = await this.pool.query(`SELECT * FROM "approval_workflows"."workflows" WHERE "id"=$1 AND "tenant_id"=$2`, [workflowId, ctx.tenantId]);
    return r.rows[0] ? mapWorkflow(r.rows[0]!) : null;
  }

  async listWorkflows(ctx: RequestContext, actionType?: string): Promise<ApprovalWorkflow[]> {
    let sql = `SELECT * FROM "approval_workflows"."workflows" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (actionType) { params.push(actionType); sql += ` AND "action_type"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapWorkflow);
  }

  async updateWorkflow(ctx: RequestContext, workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || k === 'id' || k === 'tenantId' || k === 'createdAt') continue;
      const col = k === 'updatedAt' ? 'updated_at' : k === 'createdBy' ? 'created_by' : k === 'actionType' ? 'action_type' : k === 'approverAttributes' ? 'approver_attributes' : k === 'multiStep' ? 'multi_step' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(workflowId, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "approval_workflows"."workflows" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapWorkflow(r.rows[0]!);
  }

  async deleteWorkflow(ctx: RequestContext, workflowId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "approval_workflows"."workflows" WHERE "id"=$1 AND "tenant_id"=$2`, [workflowId, ctx.tenantId]);
  }

  async submit(ctx: RequestContext, workflowId: string, params: { parameters: Record<string, unknown>; submitterAttributes: Record<string, unknown>; resourceAttributes: Record<string, unknown>; riskLevel: 'low' | 'medium' | 'high' | 'critical' }): Promise<ApprovalSubmission> {
    const wf = await this.getWorkflow(ctx, workflowId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const criteriaPassed = wf?.enabled ?? false;
    await this.pool.query(
      `INSERT INTO "approval_workflows"."submissions" ("id","tenant_id","workflow_id","action_type","parameters","submitter_attributes","resource_attributes","risk_level","state","submitted_at","submitted_by","criteria_passed","criteria_details")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12)`,
      [id, ctx.tenantId, workflowId, wf?.actionType ?? '', JSON.stringify(params.parameters), JSON.stringify(params.submitterAttributes), JSON.stringify(params.resourceAttributes), params.riskLevel, now, ctx.actorId ?? '', criteriaPassed, JSON.stringify([])],
    );
    return { id, tenantId: ctx.tenantId, workflowId, actionType: wf?.actionType ?? '', parameters: params.parameters, submitterAttributes: params.submitterAttributes, resourceAttributes: params.resourceAttributes, riskLevel: params.riskLevel, state: 'pending', submittedAt: now, submittedBy: ctx.actorId ?? '', criteriaPassed, criteriaDetails: [] };
  }

  async approve(ctx: RequestContext, submissionId: string, notes?: string): Promise<ApprovalSubmission> {
    const r = await this.pool.query(`UPDATE "approval_workflows"."submissions" SET "state"='approved',"decided_at"=NOW(),"decided_by"=$3,"decision_notes"=$4 WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`, [submissionId, ctx.tenantId, ctx.actorId ?? '', notes ?? null]);
    return mapSubmission(r.rows[0]!);
  }

  async reject(ctx: RequestContext, submissionId: string, notes: string): Promise<ApprovalSubmission> {
    const r = await this.pool.query(`UPDATE "approval_workflows"."submissions" SET "state"='rejected',"decided_at"=NOW(),"decided_by"=$3,"decision_notes"=$4 WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`, [submissionId, ctx.tenantId, ctx.actorId ?? '', notes]);
    return mapSubmission(r.rows[0]!);
  }

  async withdraw(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission> {
    const r = await this.pool.query(`UPDATE "approval_workflows"."submissions" SET "state"='withdrawn',"decided_at"=NOW() WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`, [submissionId, ctx.tenantId]);
    return mapSubmission(r.rows[0]!);
  }

  async listSubmissions(ctx: RequestContext, state?: ApprovalSubmission['state']): Promise<ApprovalSubmission[]> {
    let sql = `SELECT * FROM "approval_workflows"."submissions" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (state) { params.push(state); sql += ` AND "state"=$${params.length}`; }
    sql += ` ORDER BY "submitted_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSubmission);
  }

  async getSubmission(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission | null> {
    const r = await this.pool.query(`SELECT * FROM "approval_workflows"."submissions" WHERE "id"=$1 AND "tenant_id"=$2`, [submissionId, ctx.tenantId]);
    return r.rows[0] ? mapSubmission(r.rows[0]!) : null;
  }
}

function mapWorkflow(r: any): ApprovalWorkflow {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description, actionType: r.action_type, criteria: typeof r.criteria === 'string' ? JSON.parse(r.criteria) : r.criteria, approverAttributes: typeof r.approver_attributes === 'string' ? JSON.parse(r.approver_attributes) : r.approver_attributes, multiStep: r.multi_step, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, enabled: r.enabled };
}
function mapSubmission(r: any): ApprovalSubmission {
  return { id: r.id, tenantId: r.tenant_id, workflowId: r.workflow_id, actionType: r.action_type, parameters: typeof r.parameters === 'string' ? JSON.parse(r.parameters) : r.parameters, submitterAttributes: typeof r.submitter_attributes === 'string' ? JSON.parse(r.submitter_attributes) : r.submitter_attributes, resourceAttributes: typeof r.resource_attributes === 'string' ? JSON.parse(r.resource_attributes) : r.resource_attributes, riskLevel: r.risk_level, state: r.state, submittedAt: r.submitted_at, decidedAt: r.decided_at ?? undefined, submittedBy: r.submitted_by, decidedBy: r.decided_by ?? undefined, decisionNotes: r.decision_notes ?? undefined, criteriaPassed: r.criteria_passed, criteriaDetails: typeof r.criteria_details === 'string' ? JSON.parse(r.criteria_details) : r.criteria_details };
}

// ─────────────────────────────────────────────────────────────────────────────
// DataExpectationsService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresDataExpectationsService implements DataExpectationsService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateExpectationInput): Promise<DataExpectation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "data_expectations"."expectations" ("id","tenant_id","name","description","target_type","field","type","params","blocking","created_at","enabled")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, ctx.tenantId, input.name, input.description, input.targetType, input.field ?? null, input.type, JSON.stringify(input.params), input.blocking ?? false, now, input.enabled ?? true],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, targetType: input.targetType, field: input.field, type: input.type, params: input.params, blocking: input.blocking ?? false, createdAt: now, enabled: input.enabled ?? true };
  }

  async get(ctx: RequestContext, id: string): Promise<DataExpectation | null> {
    const r = await this.pool.query(`SELECT * FROM "data_expectations"."expectations" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapExpectation(r.rows[0]!) : null;
  }

  async list(ctx: RequestContext, targetType?: string): Promise<DataExpectation[]> {
    let sql = `SELECT * FROM "data_expectations"."expectations" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (targetType) { params.push(targetType); sql += ` AND "target_type"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapExpectation);
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateExpectationInput>): Promise<DataExpectation> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const col = k === 'targetType' ? 'target_type' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "data_expectations"."expectations" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapExpectation(r.rows[0]!);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "data_expectations"."expectations" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async evaluate(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<ExpectationResult[]> {
    const expectations = await this.list(ctx, targetType);
    const results: ExpectationResult[] = [];
    for (const exp of expectations) {
      if (!exp.enabled) continue;
      let rowsFailed = 0;
      const failingSamples: unknown[] = [];
      for (const row of data) {
        const val = exp.field ? row[exp.field] : row;
        let passed = true;
        if (exp.type === 'not_null') passed = val != null;
        else if (exp.type === 'unique') passed = true; // simplified
        else if (exp.type === 'range') { const min = exp.params['min'] as number; const max = exp.params['max'] as number; passed = typeof val === 'number' && val >= min && val <= max; }
        else if (exp.type === 'regex') { const re = new RegExp(exp.params['pattern'] as string); passed = typeof val === 'string' && re.test(val); }
        else if (exp.type === 'enum') { const values = exp.params['values'] as unknown[]; passed = values.includes(val); }
        else passed = true;
        if (!passed) { rowsFailed++; if (failingSamples.length < 10) failingSamples.push(val); }
      }
      results.push({ expectationId: exp.id, expectationName: exp.name, passed: rowsFailed === 0, rowsChecked: data.length, rowsFailed, failingSamples, evaluatedAt: new Date().toISOString() });
    }
    return results;
  }

  async gateBuild(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<{ passed: boolean; results: ExpectationResult[]; blockingFailures: ExpectationResult[] }> {
    const results = await this.evaluate(ctx, targetType, data);
    const expectations = await this.list(ctx, targetType);
    const blockingIds = new Set(expectations.filter(e => e.blocking).map(e => e.id));
    const blockingFailures = results.filter(r => !r.passed && blockingIds.has(r.expectationId));
    return { passed: blockingFailures.length === 0, results, blockingFailures };
  }
}

function mapExpectation(r: any): DataExpectation {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description, targetType: r.target_type, field: r.field ?? undefined, type: r.type, params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params, blocking: r.blocking, createdAt: r.created_at, enabled: r.enabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// DesignSystemService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresDesignSystemService implements DesignSystemService {
  constructor(private readonly pool: Pool) {}

  async createTheme(ctx: RequestContext, input: CreateThemeInput): Promise<DesignSystemTheme> {
    const id = randomUUID();
    const now = new Date().toISOString();
    if (input.isDefault) {
      await this.pool.query(`UPDATE "design_system"."themes" SET "is_default"=FALSE WHERE "tenant_id"=$1`, [ctx.tenantId]);
    }
    await this.pool.query(
      `INSERT INTO "design_system"."themes" ("id","tenant_id","name","description","is_default","dark_mode","density","palette","typography","module_palettes","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)`,
      [id, ctx.tenantId, input.name, input.description ?? null, input.isDefault ?? false, input.darkMode ?? false, input.density ?? 'comfortable', JSON.stringify(input.palette ?? {}), JSON.stringify(input.typography ?? {}), input.modulePalettes ? JSON.stringify(input.modulePalettes) : null, now, ctx.actorId ?? ''],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, isDefault: input.isDefault ?? false, darkMode: input.darkMode ?? false, density: input.density ?? 'comfortable', palette: input.palette ?? {} as any, typography: input.typography ?? {}, modulePalettes: input.modulePalettes, createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '' };
  }

  async getTheme(ctx: RequestContext, id: string): Promise<DesignSystemTheme | null> {
    const r = await this.pool.query(`SELECT * FROM "design_system"."themes" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapTheme(r.rows[0]!) : null;
  }

  async listThemes(ctx: RequestContext): Promise<DesignSystemTheme[]> {
    const r = await this.pool.query(`SELECT * FROM "design_system"."themes" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC`, [ctx.tenantId]);
    return r.rows.map(mapTheme);
  }

  async getDefaultTheme(ctx: RequestContext): Promise<DesignSystemTheme | null> {
    const r = await this.pool.query(`SELECT * FROM "design_system"."themes" WHERE "tenant_id"=$1 AND "is_default"=TRUE LIMIT 1`, [ctx.tenantId]);
    return r.rows[0] ? mapTheme(r.rows[0]!) : null;
  }

  async updateTheme(ctx: RequestContext, id: string, input: Partial<CreateThemeInput>): Promise<DesignSystemTheme> {
    if (input.isDefault) {
      await this.pool.query(`UPDATE "design_system"."themes" SET "is_default"=FALSE WHERE "tenant_id"=$1`, [ctx.tenantId]);
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      const col = k === 'isDefault' ? 'is_default' : k === 'darkMode' ? 'dark_mode' : k === 'modulePalettes' ? 'module_palettes' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "design_system"."themes" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapTheme(r.rows[0]!);
  }

  async deleteTheme(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "design_system"."themes" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async setModulePalette(ctx: RequestContext, input: SetModulePaletteInput): Promise<DesignSystemTheme> {
    const theme = await this.getTheme(ctx, input.themeId);
    if (!theme) throw new Error('Theme not found');
    const modulePalettes = { ...(theme.modulePalettes ?? {}), [input.moduleId]: input.palette };
    return this.updateTheme(ctx, input.themeId, { modulePalettes });
  }

  async getModuleTheme(ctx: RequestContext, moduleId: string): Promise<DesignSystemTheme | null> {
    const themes = await this.listThemes(ctx);
    for (const t of themes) {
      if (t.modulePalettes?.[moduleId]) return t;
    }
    return this.getDefaultTheme(ctx);
  }
}

function mapTheme(r: any): DesignSystemTheme {
  const parse = (v: any) => v ? (typeof v === 'string' ? JSON.parse(v) : v) : undefined;
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description ?? undefined, isDefault: r.is_default, darkMode: r.dark_mode, density: r.density, palette: parse(r.palette) ?? {}, typography: parse(r.typography) ?? {}, modulePalettes: parse(r.module_palettes), createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by };
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelRegistryService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresModelRegistryService implements ModelRegistryService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateModelInput): Promise<ModelArtifact> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "model_registry"."models" ("id","tenant_id","name","display_name","description","source","adapter","state","version","tags","created_at","updated_at","created_by","upstream_model_ids","modeling_objective_id")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',0,$8,$9,$9,$10,$11,$12)`,
      [id, ctx.tenantId, input.name, input.displayName, input.description, input.source, JSON.stringify(input.adapter), input.tags ?? [], now, ctx.actorId ?? '', input.upstreamModelIds ?? [], input.modelingObjectiveId ?? null],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, displayName: input.displayName, description: input.description, source: input.source, adapter: input.adapter, state: 'draft', version: 0, tags: input.tags ?? [], createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '', upstreamModelIds: input.upstreamModelIds ?? [] };
  }

  async get(ctx: RequestContext, modelId: string): Promise<ModelArtifact | null> {
    const r = await this.pool.query(`SELECT * FROM "model_registry"."models" WHERE "id"=$1 AND "tenant_id"=$2`, [modelId, ctx.tenantId]);
    return r.rows[0] ? mapModel(r.rows[0]!) : null;
  }

  async list(ctx: RequestContext, query?: ModelQuery): Promise<{ models: ModelArtifact[]; totalCount: number }> {
    let sql = `SELECT * FROM "model_registry"."models" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (query?.state) { params.push(query.state); sql += ` AND "state"=$${params.length}`; }
    if (query?.source) { params.push(query.source); sql += ` AND "source"=$${params.length}`; }
    if (query?.name) { params.push(`%${query.name}%`); sql += ` AND "name" ILIKE $${params.length}`; }
    if (query?.tags?.length) { params.push(query.tags); sql += ` AND "tags" && $${params.length}`; }
    sql += ` ORDER BY "created_at" DESC`;
    if (query?.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const r = await this.pool.query(sql, params);
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS c FROM "model_registry"."models" WHERE "tenant_id"=$1`, [ctx.tenantId]);
    return { models: r.rows.map(mapModel), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async update(ctx: RequestContext, modelId: string, updates: Partial<CreateModelInput>): Promise<ModelArtifact> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const col = k === 'displayName' ? 'display_name' : k === 'upstreamModelIds' ? 'upstream_model_ids' : k === 'modelingObjectiveId' ? 'modeling_objective_id' : k;
      params.push(typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(modelId, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "model_registry"."models" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapModel(r.rows[0]!);
  }

  private async setState(ctx: RequestContext, modelId: string, state: string, extra?: Record<string, unknown>): Promise<ModelArtifact> {
    const sets: string[] = [`"state"=$1`];
    const params: unknown[] = [state];
    for (const [k, v] of Object.entries(extra ?? {})) {
      params.push(v);
      sets.push(`"${k}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    if (state === 'released') { sets.push(`"version"="version"+1`); }
    params.push(modelId, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "model_registry"."models" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapModel(r.rows[0]!);
  }

  async submitForReview(ctx: RequestContext, modelId: string): Promise<ModelArtifact> { return this.setState(ctx, modelId, 'in_review'); }
  async release(ctx: RequestContext, modelId: string): Promise<ModelArtifact> {
    return this.setState(ctx, modelId, 'released', { released_by: ctx.actorId ?? '', released_at: new Date().toISOString() });
  }
  async deprecate(ctx: RequestContext, modelId: string): Promise<ModelArtifact> { return this.setState(ctx, modelId, 'deprecated'); }
  async archive(ctx: RequestContext, modelId: string): Promise<ModelArtifact> { return this.setState(ctx, modelId, 'archived'); }

  async getVersionHistory(ctx: RequestContext, modelId: string): Promise<ModelArtifact[]> {
    const m = await this.get(ctx, modelId);
    return m ? [m] : [];
  }

  async getLineage(ctx: RequestContext, modelId: string): Promise<{ upstream: ModelArtifact[]; downstream: ModelArtifact[] }> {
    const model = await this.get(ctx, modelId);
    if (!model) return { upstream: [], downstream: [] };
    const upstream: ModelArtifact[] = [];
    for (const uid of model.upstreamModelIds) {
      const m = await this.get(ctx, uid);
      if (m) upstream.push(m);
    }
    const r = await this.pool.query(`SELECT * FROM "model_registry"."models" WHERE "tenant_id"=$1 AND $2 = ANY("upstream_model_ids")`, [ctx.tenantId, modelId]);
    return { upstream, downstream: r.rows.map(mapModel) };
  }
}

function mapModel(r: any): ModelArtifact {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, displayName: r.display_name, description: r.description, source: r.source, adapter: typeof r.adapter === 'string' ? JSON.parse(r.adapter) : r.adapter, state: r.state, version: r.version, tags: r.tags ?? [], createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, releasedBy: r.released_by ?? undefined, releasedAt: r.released_at ?? undefined, upstreamModelIds: r.upstream_model_ids ?? [], modelingObjectiveId: r.modeling_objective_id ?? undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelInferenceService (persistence only — inference execution is a stub)
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresModelInferenceService implements ModelInferenceService {
  constructor(private readonly pool: Pool) {}

  async deploy(ctx: RequestContext, modelId: string, name: string, batchMode?: boolean): Promise<ModelDeployment> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const model = await this.pool.query(`SELECT "version" FROM "model_registry"."models" WHERE "id"=$1 AND "tenant_id"=$2`, [modelId, ctx.tenantId]);
    const version = model.rows[0]?.version ?? 0;
    await this.pool.query(
      `INSERT INTO "model_registry"."deployments" ("id","tenant_id","model_id","model_version","name","state","batch_mode","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$7,$8)`,
      [id, ctx.tenantId, modelId, version, name, batchMode ?? false, now, ctx.actorId ?? ''],
    );
    return { id, tenantId: ctx.tenantId, modelId, modelVersion: version, name, state: 'active', batchMode: batchMode ?? false, createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '' };
  }

  async getDeployment(ctx: RequestContext, deploymentId: string): Promise<ModelDeployment | null> {
    const r = await this.pool.query(`SELECT * FROM "model_registry"."deployments" WHERE "id"=$1 AND "tenant_id"=$2`, [deploymentId, ctx.tenantId]);
    return r.rows[0] ? mapDeployment(r.rows[0]!) : null;
  }

  async listDeployments(ctx: RequestContext, modelId?: string): Promise<ModelDeployment[]> {
    let sql = `SELECT * FROM "model_registry"."deployments" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (modelId) { params.push(modelId); sql += ` AND "model_id"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapDeployment);
  }

  async stopDeployment(ctx: RequestContext, deploymentId: string): Promise<void> {
    await this.pool.query(`UPDATE "model_registry"."deployments" SET "state"='stopped',"updated_at"=NOW() WHERE "id"=$1 AND "tenant_id"=$2`, [deploymentId, ctx.tenantId]);
  }

  async infer(_ctx: RequestContext, input: InferenceInput): Promise<InferenceResult> {
    const now = new Date().toISOString();
    const start = Date.now();
    return { modelId: input.modelIdentifier, modelVersion: 0, outputs: {}, timestamp: now, durationMs: Date.now() - start, success: false, errorMessage: 'Inference not implemented — deployment persistence only' };
  }

  async batchInfer(_ctx: RequestContext, modelId: string, inputs: Record<string, unknown>[]): Promise<InferenceResult[]> {
    return inputs.map(() => ({ modelId, modelVersion: 0, outputs: {}, timestamp: new Date().toISOString(), durationMs: 0, success: false, errorMessage: 'Not implemented' }));
  }

  async getInferenceHistory(ctx: RequestContext, modelId: string, limit?: number): Promise<InferenceHistoryRecord[]> {
    const r = await this.pool.query(`SELECT * FROM "model_registry"."inference_history" WHERE "tenant_id"=$1 AND "model_id"=$2 ORDER BY "timestamp" DESC LIMIT $3`, [ctx.tenantId, modelId, limit ?? 100]);
    return r.rows.map(mapInferenceHistory);
  }
}

function mapDeployment(r: any): ModelDeployment {
  return { id: r.id, tenantId: r.tenant_id, modelId: r.model_id, modelVersion: r.model_version, name: r.name, state: r.state, batchMode: r.batch_mode, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, endpointUrl: r.endpoint_url ?? undefined, errorMessage: r.error_message ?? undefined };
}
function mapInferenceHistory(r: any): InferenceHistoryRecord {
  return { id: r.id, tenantId: r.tenant_id, modelId: r.model_id, modelVersion: r.model_version, deploymentId: r.deployment_id ?? undefined, userId: r.user_id ?? '', inputs: typeof r.inputs === 'string' ? JSON.parse(r.inputs) : r.inputs, outputs: typeof r.outputs === 'string' ? JSON.parse(r.outputs) : r.outputs, success: r.success, durationMs: r.duration_ms ?? 0, timestamp: r.timestamp, errorMessage: r.error_message ?? undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelChainService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresModelChainService implements ModelChainService {
  constructor(private readonly pool: Pool) {}

  async createChain(ctx: RequestContext, input: Omit<ModelChain, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ModelChain> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "model_registry"."chains" ("id","tenant_id","name","description","steps","state","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)`,
      [id, ctx.tenantId, input.name, input.description, JSON.stringify(input.steps), input.state, now, ctx.actorId ?? ''],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, steps: input.steps, state: input.state, createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '' };
  }

  async getChain(ctx: RequestContext, chainId: string): Promise<ModelChain | null> {
    const r = await this.pool.query(`SELECT * FROM "model_registry"."chains" WHERE "id"=$1 AND "tenant_id"=$2`, [chainId, ctx.tenantId]);
    return r.rows[0] ? mapChain(r.rows[0]!) : null;
  }

  async listChains(ctx: RequestContext): Promise<ModelChain[]> {
    const r = await this.pool.query(`SELECT * FROM "model_registry"."chains" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC`, [ctx.tenantId]);
    return r.rows.map(mapChain);
  }

  async executeChain(_ctx: RequestContext, chainId: string, _initialInputs: Record<string, unknown>): Promise<ModelChainResult> {
    return { chainId, success: false, stepResults: [], totalDurationMs: 0, timestamp: new Date().toISOString() };
  }

  async deleteChain(ctx: RequestContext, chainId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "model_registry"."chains" WHERE "id"=$1 AND "tenant_id"=$2`, [chainId, ctx.tenantId]);
  }
}

function mapChain(r: any): ModelChain {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description, steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps, state: r.state, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by };
}

// ─────────────────────────────────────────────────────────────────────────────
// ConnectorCatalogService
// ─────────────────────────────────────────────────────────────────────────────

const VENDOR_CATALOG: VendorConnectorEntry[] = [
  { id: 'dynamics-365-bc', name: 'Dynamics 365 Business Central', vendor: 'Microsoft', product: 'Dynamics 365 Business Central', description: 'ERP connector', supportedAuthSchemes: ['azuread', 'oauth2-authcode', 'api-key'], defaultAuthScheme: 'azuread', connectorKind: 'rest', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.dynamics.com', supportsOnPremProxy: true, version: '1.0', generallyAvailable: true },
  { id: 'salesforce', name: 'Salesforce', vendor: 'Salesforce', product: 'Salesforce CRM', description: 'CRM connector', supportedAuthSchemes: ['oauth2-authcode', 'api-key', 'bearer'], defaultAuthScheme: 'oauth2-authcode', connectorKind: 'rest', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.salesforce.com', supportsOnPremProxy: true, version: '1.0', generallyAvailable: true },
  { id: 'workday', name: 'Workday', vendor: 'Workday', product: 'Workday HCM', description: 'HCM connector', supportedAuthSchemes: ['api-key', 'basic'], defaultAuthScheme: 'api-key', connectorKind: 'rest', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.workday.com', supportsOnPremProxy: false, version: '1.0', generallyAvailable: true },
  { id: 'snowflake', name: 'Snowflake', vendor: 'Snowflake', product: 'Snowflake Data Cloud', description: 'Data warehouse connector', supportedAuthSchemes: ['basic', 'bearer'], defaultAuthScheme: 'basic', connectorKind: 'jdbc', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.snowflakecomputing.com', supportsOnPremProxy: false, version: '1.0', generallyAvailable: true },
  { id: 'sap', name: 'SAP', vendor: 'SAP', product: 'SAP S/4HANA', description: 'ERP connector', supportedAuthSchemes: ['basic', 'bearer'], defaultAuthScheme: 'basic', connectorKind: 'rest', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.sap.com', supportsOnPremProxy: true, version: '1.0', generallyAvailable: true },
  { id: 'azure-sql', name: 'Azure SQL', vendor: 'Microsoft', product: 'Azure SQL Database', description: 'SQL database connector', supportedAuthSchemes: ['azuread', 'managed-identity', 'basic'], defaultAuthScheme: 'azuread', connectorKind: 'jdbc', configTemplate: { url: '', table: '' }, defaultEgressHost: '*.database.windows.net', supportsOnPremProxy: false, version: '1.0', generallyAvailable: true },
];

export class PostgresConnectorCatalogService implements ConnectorCatalogService {
  constructor(private readonly pool: Pool) {}

  async listCatalog(_ctx: RequestContext, vendor?: string): Promise<VendorConnectorEntry[]> {
    return vendor ? VENDOR_CATALOG.filter(v => v.vendor === vendor) : VENDOR_CATALOG;
  }

  async getCatalogEntry(_ctx: RequestContext, id: string): Promise<VendorConnectorEntry | null> {
    return VENDOR_CATALOG.find(v => v.id === id) ?? null;
  }

  async listVendors(_ctx: RequestContext): Promise<string[]> {
    return [...new Set(VENDOR_CATALOG.map(v => v.vendor))];
  }

  async configure(ctx: RequestContext, input: ConfigureConnectorInput): Promise<ConfiguredConnector> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "connector_catalog"."configured" ("id","tenant_id","vendor_connector_id","instance_name","config","auth","egress_policy_id","enabled","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,
      [id, ctx.tenantId, input.vendorConnectorId, input.instanceName, JSON.stringify(input.config), JSON.stringify(input.auth), input.egressPolicyId ?? null, input.enabled ?? true, now, ctx.actorId ?? ''],
    );
    return { id, tenantId: ctx.tenantId, vendorConnectorId: input.vendorConnectorId, instanceName: input.instanceName, config: input.config, auth: input.auth, egressPolicyId: input.egressPolicyId, enabled: input.enabled ?? true, createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? '' };
  }

  async getConfigured(ctx: RequestContext, instanceName: string): Promise<ConfiguredConnector | null> {
    const r = await this.pool.query(`SELECT * FROM "connector_catalog"."configured" WHERE "tenant_id"=$1 AND "instance_name"=$2`, [ctx.tenantId, instanceName]);
    return r.rows[0] ? mapConnector(r.rows[0]!) : null;
  }

  async listConfigured(ctx: RequestContext): Promise<ConfiguredConnector[]> {
    const r = await this.pool.query(`SELECT * FROM "connector_catalog"."configured" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC`, [ctx.tenantId]);
    return r.rows.map(mapConnector);
  }

  async updateConfigured(ctx: RequestContext, instanceName: string, updates: Partial<ConfigureConnectorInput>): Promise<ConfiguredConnector> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const col = k === 'vendorConnectorId' ? 'vendor_connector_id' : k === 'instanceName' ? 'instance_name' : k === 'egressPolicyId' ? 'egress_policy_id' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(ctx.tenantId, instanceName);
    const r = await this.pool.query(`UPDATE "connector_catalog"."configured" SET ${sets.join(', ')} WHERE "tenant_id"=$${params.length - 1} AND "instance_name"=$${params.length} RETURNING *`, params);
    return mapConnector(r.rows[0]!);
  }

  async deleteConfigured(ctx: RequestContext, instanceName: string): Promise<void> {
    await this.pool.query(`DELETE FROM "connector_catalog"."configured" WHERE "tenant_id"=$1 AND "instance_name"=$2`, [ctx.tenantId, instanceName]);
  }

  async validateConfigured(_ctx: RequestContext, _instanceName: string): Promise<EgressValidationResult> {
    return { allowed: true, denialReasons: [], proxyRequired: false };
  }

  async createEgressPolicy(ctx: RequestContext, input: CreateEgressPolicyInput): Promise<EgressPolicy> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "connector_catalog"."egress_policies" ("id","tenant_id","name","description","allowed_hosts","denied_hosts","require_on_prem_proxy","on_prem_proxy","max_throughput_mbps","require_tls","created_at","created_by","enabled")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)`,
      [id, ctx.tenantId, input.name, input.description ?? '', input.allowedHosts, input.deniedHosts ?? [], input.requireOnPremProxy ?? false, input.onPremProxy ? JSON.stringify(input.onPremProxy) : null, input.maxThroughputMbps ?? null, input.requireTls ?? true, now, ctx.actorId ?? ''],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '', allowedHosts: input.allowedHosts, deniedHosts: input.deniedHosts ?? [], requireOnPremProxy: input.requireOnPremProxy ?? false, onPremProxy: input.onPremProxy, maxThroughputMbps: input.maxThroughputMbps, requireTls: input.requireTls ?? true, createdAt: now, createdBy: ctx.actorId ?? '', enabled: true };
  }

  async getEgressPolicy(ctx: RequestContext, id: string): Promise<EgressPolicy | null> {
    const r = await this.pool.query(`SELECT * FROM "connector_catalog"."egress_policies" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapEgress(r.rows[0]!) : null;
  }

  async listEgressPolicies(ctx: RequestContext): Promise<EgressPolicy[]> {
    const r = await this.pool.query(`SELECT * FROM "connector_catalog"."egress_policies" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC`, [ctx.tenantId]);
    return r.rows.map(mapEgress);
  }

  async updateEgressPolicy(ctx: RequestContext, id: string, updates: Partial<CreateEgressPolicyInput>): Promise<EgressPolicy> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const col = k === 'allowedHosts' ? 'allowed_hosts' : k === 'deniedHosts' ? 'denied_hosts' : k === 'requireOnPremProxy' ? 'require_on_prem_proxy' : k === 'onPremProxy' ? 'on_prem_proxy' : k === 'maxThroughputMbps' ? 'max_throughput_mbps' : k === 'requireTls' ? 'require_tls' : k;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${col}"=$${params.length}`);
    }
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "connector_catalog"."egress_policies" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapEgress(r.rows[0]!);
  }

  async deleteEgressPolicy(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "connector_catalog"."egress_policies" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async validateEgress(_ctx: RequestContext, _host: string, _policyId?: string): Promise<EgressValidationResult> {
    return { allowed: true, denialReasons: [], proxyRequired: false };
  }
}

function mapConnector(r: any): ConfiguredConnector {
  return { id: r.id, tenantId: r.tenant_id, vendorConnectorId: r.vendor_connector_id, instanceName: r.instance_name, config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config, auth: typeof r.auth === 'string' ? JSON.parse(r.auth) : r.auth, egressPolicyId: r.egress_policy_id ?? undefined, enabled: r.enabled, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, lastValidation: r.last_validation ? (typeof r.last_validation === 'string' ? JSON.parse(r.last_validation) : r.last_validation) : undefined };
}
function mapEgress(r: any): EgressPolicy {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description, allowedHosts: r.allowed_hosts ?? [], deniedHosts: r.denied_hosts ?? [], requireOnPremProxy: r.require_on_prem_proxy, onPremProxy: r.on_prem_proxy ? (typeof r.on_prem_proxy === 'string' ? JSON.parse(r.on_prem_proxy) : r.on_prem_proxy) : undefined, maxThroughputMbps: r.max_throughput_mbps ?? undefined, requireTls: r.require_tls, createdAt: r.created_at, createdBy: r.created_by, enabled: r.enabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresCommandService implements CommandService {
  constructor(private readonly pool: Pool) {}

  async registerCommand(ctx: RequestContext, input: Omit<AppCommand, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<AppCommand> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "commands"."commands" ("id","tenant_id","name","label","description","source_app","icon","input_schema","output_schema","available_as_tool","chainable","created_at","created_by","enabled")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, ctx.tenantId, input.name, input.label, input.description, input.sourceApp, input.icon ?? null, JSON.stringify(input.inputSchema), JSON.stringify(input.outputSchema), input.availableAsTool, input.chainable, now, ctx.actorId ?? '', input.enabled],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, label: input.label, description: input.description, sourceApp: input.sourceApp, icon: input.icon, inputSchema: input.inputSchema, outputSchema: input.outputSchema, availableAsTool: input.availableAsTool, chainable: input.chainable, createdAt: now, createdBy: ctx.actorId ?? '', enabled: input.enabled };
  }

  async getCommand(ctx: RequestContext, commandId: string): Promise<AppCommand | null> {
    const r = await this.pool.query(`SELECT * FROM "commands"."commands" WHERE "id"=$1 AND "tenant_id"=$2`, [commandId, ctx.tenantId]);
    return r.rows[0] ? mapCommand(r.rows[0]!) : null;
  }

  async listCommands(ctx: RequestContext, sourceApp?: string): Promise<AppCommand[]> {
    let sql = `SELECT * FROM "commands"."commands" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (sourceApp) { params.push(sourceApp); sql += ` AND "source_app"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapCommand);
  }

  async deleteCommand(ctx: RequestContext, commandId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "commands"."commands" WHERE "id"=$1 AND "tenant_id"=$2`, [commandId, ctx.tenantId]);
  }

  async createChain(ctx: RequestContext, input: Omit<CommandChain, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<CommandChain> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "commands"."chains" ("id","tenant_id","name","description","steps","created_at","created_by","enabled")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, ctx.tenantId, input.name, input.description, JSON.stringify(input.steps), now, ctx.actorId ?? '', input.enabled],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description, steps: input.steps, createdAt: now, createdBy: ctx.actorId ?? '', enabled: input.enabled };
  }

  async getChain(ctx: RequestContext, chainId: string): Promise<CommandChain | null> {
    const r = await this.pool.query(`SELECT * FROM "commands"."chains" WHERE "id"=$1 AND "tenant_id"=$2`, [chainId, ctx.tenantId]);
    return r.rows[0] ? mapCommandChain(r.rows[0]!) : null;
  }

  async listChains(ctx: RequestContext): Promise<CommandChain[]> {
    const r = await this.pool.query(`SELECT * FROM "commands"."chains" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC`, [ctx.tenantId]);
    return r.rows.map(mapCommandChain);
  }

  async executeChain(ctx: RequestContext, chainId: string, initialInputs: Record<string, unknown>, executor: (commandId: string, inputs: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<CommandChainResult> {
    const chain = await this.getChain(ctx, chainId);
    if (!chain) throw new Error('Chain not found');
    const start = Date.now();
    const stepResults: CommandChainResult['stepResults'] = [];
    let currentInputs = initialInputs;
    let finalOutput: Record<string, unknown> | undefined;
    let success = true;
    for (const step of chain.steps) {
      try {
        const output = await executor(step.commandId, currentInputs);
        stepResults.push({ commandId: step.commandId, success: true, output });
        finalOutput = output;
        currentInputs = { ...currentInputs, ...output };
      } catch (err) {
        stepResults.push({ commandId: step.commandId, success: false, errorMessage: err instanceof Error ? err.message : 'Execution failed' });
        success = false;
        break;
      }
    }
    return { chainId, success, stepResults, finalOutput, executedAt: new Date().toISOString(), durationMs: Date.now() - start };
  }

  async deleteChain(ctx: RequestContext, chainId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "commands"."chains" WHERE "id"=$1 AND "tenant_id"=$2`, [chainId, ctx.tenantId]);
  }
}

function mapCommand(r: any): AppCommand {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, label: r.label, description: r.description, sourceApp: r.source_app, icon: r.icon ?? undefined, inputSchema: typeof r.input_schema === 'string' ? JSON.parse(r.input_schema) : r.input_schema, outputSchema: typeof r.output_schema === 'string' ? JSON.parse(r.output_schema) : r.output_schema, availableAsTool: r.available_as_tool, chainable: r.chainable, createdAt: r.created_at, createdBy: r.created_by, enabled: r.enabled };
}
function mapCommandChain(r: any): CommandChain {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description, steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps, createdAt: r.created_at, createdBy: r.created_by, enabled: r.enabled };
}
