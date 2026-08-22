/**
 * Postgres-backed AgentService — durable AIP agent definitions and chat threads,
 * so user-authored agents (system prompt, tools, model) and conversation history
 * survive restart and are shared across replicas. Tenant-scoped throughout
 * (composite PK (tenant_id, id)). Response behaviour is the shared
 * generateAgentResponse, so it matches the in-memory provider exactly.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { generateAgentResponse } from '@altius/spi';
import type {
  AgentService,
  AgentDefinition,
  CreateAgentInput,
  AgentRunResult,
  AgentChatInput,
  AgentChatThread,
  AgentChatMessage,
  AipLlmAgentToolCall,
  RequestContext,
  LLMClient,
} from '@altius/spi';

export class PostgresAgentService implements AgentService {
  constructor(private readonly pool: Pool, private readonly llmClient?: LLMClient) {}

  async create(ctx: RequestContext, input: CreateAgentInput): Promise<AgentDefinition> {
    const now = new Date().toISOString();
    const agent: AgentDefinition = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      systemPrompt: input.systemPrompt ?? 'You are a helpful assistant.',
      promptTemplates: input.promptTemplates ?? [],
      tools: input.tools ?? [],
      modelRid: input.modelRid,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    await this.pool.query(
      `INSERT INTO "aip"."agents"
         ("id","tenant_id","name","description","system_prompt","prompt_templates","tools","model_rid","enabled","created_by","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [agent.id, agent.tenantId, agent.name, agent.description, agent.systemPrompt,
       JSON.stringify(agent.promptTemplates), JSON.stringify(agent.tools), agent.modelRid ?? null,
       agent.enabled, agent.createdBy, agent.createdAt, agent.updatedAt],
    );
    return agent;
  }

  async list(ctx: RequestContext): Promise<AgentDefinition[]> {
    const r = await this.pool.query(`SELECT * FROM "aip"."agents" WHERE "tenant_id" = $1 ORDER BY "created_at" ASC`, [ctx.tenantId]);
    return r.rows.map(mapAgent);
  }

  async get(ctx: RequestContext, id: string): Promise<AgentDefinition | null> {
    const r = await this.pool.query(`SELECT * FROM "aip"."agents" WHERE "tenant_id" = $1 AND "id" = $2`, [ctx.tenantId, id]);
    return r.rows[0] ? mapAgent(r.rows[0]) : null;
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateAgentInput>): Promise<AgentDefinition> {
    const agent = await this.get(ctx, id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const updated: AgentDefinition = {
      ...agent,
      name: updates.name ?? agent.name,
      description: updates.description ?? agent.description,
      systemPrompt: updates.systemPrompt ?? agent.systemPrompt,
      promptTemplates: updates.promptTemplates ?? agent.promptTemplates,
      tools: updates.tools ?? agent.tools,
      modelRid: updates.modelRid ?? agent.modelRid,
      enabled: updates.enabled ?? agent.enabled,
      updatedAt: new Date().toISOString(),
    };
    await this.pool.query(
      `UPDATE "aip"."agents"
         SET "name"=$3,"description"=$4,"system_prompt"=$5,"prompt_templates"=$6,"tools"=$7,"model_rid"=$8,"enabled"=$9,"updated_at"=$10
       WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id, updated.name, updated.description, updated.systemPrompt,
       JSON.stringify(updated.promptTemplates), JSON.stringify(updated.tools), updated.modelRid ?? null,
       updated.enabled, updated.updatedAt],
    );
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "aip"."agents" WHERE "tenant_id" = $1 AND "id" = $2`, [ctx.tenantId, id]);
  }

  async run(ctx: RequestContext, id: string, input: { prompt?: string; useTools?: boolean }): Promise<AgentRunResult> {
    const agent = await this.get(ctx, id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const prompt = input.prompt ?? 'Hello';
    const response = await generateAgentResponse(this.llmClient, ctx, agent, prompt);
    return {
      threadId: randomUUID(),
      response,
      toolCalls: (input.useTools ? agent.tools.map(t => ({ id: randomUUID(), name: t.name, arguments: {} })) : []) as AipLlmAgentToolCall[],
      model: agent.modelRid ?? 'local',
      tokensUsed: Math.ceil(response.length / 4),
    };
  }

  async chat(ctx: RequestContext, id: string, input: AgentChatInput): Promise<AgentChatThread> {
    const agent = await this.get(ctx, id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const threadId = input.threadId ?? randomUUID();
    const existing = await this.getThread(ctx.tenantId, threadId);
    const now = new Date().toISOString();
    const userMessage: AgentChatMessage = { id: randomUUID(), role: 'user', content: input.message, createdAt: now };
    const messages = existing ? [...existing.messages, userMessage] : [userMessage];
    const response = await generateAgentResponse(this.llmClient, ctx, agent, input.message);
    const assistantMessage: AgentChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: response,
      toolCalls: input.useTools ? agent.tools.map(t => ({ id: randomUUID(), name: t.name, arguments: {} })) : undefined,
      createdAt: new Date().toISOString(),
    };
    messages.push(assistantMessage);
    const thread: AgentChatThread = {
      id: threadId,
      tenantId: ctx.tenantId,
      agentId: id,
      userId: ctx.actorId ?? 'anonymous',
      messages,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.pool.query(
      `INSERT INTO "aip"."agent_threads" ("id","tenant_id","agent_id","user_id","messages","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("tenant_id","id") DO UPDATE SET "messages" = EXCLUDED."messages", "updated_at" = EXCLUDED."updated_at"`,
      [thread.id, thread.tenantId, thread.agentId, thread.userId, JSON.stringify(thread.messages), thread.createdAt, thread.updatedAt],
    );
    return thread;
  }

  private async getThread(tenantId: string, threadId: string): Promise<AgentChatThread | null> {
    const r = await this.pool.query(`SELECT * FROM "aip"."agent_threads" WHERE "tenant_id" = $1 AND "id" = $2`, [tenantId, threadId]);
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      id: row['id'], tenantId: row['tenant_id'], agentId: row['agent_id'], userId: row['user_id'],
      messages: row['messages'] ?? [], createdAt: row['created_at'], updatedAt: row['updated_at'],
    };
  }
}

function mapAgent(row: Record<string, unknown>): AgentDefinition {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    systemPrompt: row['system_prompt'] as string,
    promptTemplates: (row['prompt_templates'] as AgentDefinition['promptTemplates']) ?? [],
    tools: (row['tools'] as AgentDefinition['tools']) ?? [],
    modelRid: (row['model_rid'] as string | null) ?? undefined,
    enabled: row['enabled'] as boolean,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
    createdBy: row['created_by'] as string,
  };
}
