/**
 * AIP LLM in-memory service implementations.
 */

import { randomUUID } from 'node:crypto';
import type {
  EmbeddedCopilotService,
  RequestContext,
  LLMClient,
  EmbeddingStore,
  EvalSuite,
  EvalRunResult,
  EvalMetric,
  CopilotInstance,
  CopilotViewContext,
  CopilotActionSuggestion,
  EmbeddingSearchResult,
} from '@altius/spi';
import { ChangeProposalHumanInTheLoop, generateAgentResponse } from '@altius/spi';
import type {
  ChangeProposalStore,
  AgentService,
  AgentDefinition,
  CreateAgentInput,
  AgentChatMessage,
  AipLlmAgentToolCall,
  AgentRunResult,
  AgentChatInput,
  AgentChatThread,
  ModelCatalogService,
  ModelCatalogEntry,
  LlmApplication,
  CreateLlmApplicationInput,
  PromptPlaygroundInput,
  PromptPlaygroundResult,
  EvalService,
  EvalSuiteInput,
  VectorSearchService,
  EmbeddingModel,
  GenerateEmbeddingInput,
  SemanticSearchInput,
  TokenMeteringService,
  CopilotService,
  CopilotSuggestInput,
  CopilotSuggestion,
  CopilotApplyInput,
  CopilotApplyResult,
  LLMGatewayService,
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  LLMUsageRecord,
  UsageQuery,
  UsageSummary,
  LLMUsageTracker,
} from '@altius/spi';
import { InMemoryAgentEvaluationService } from './in-memory-agent-evaluation.js';
import { InMemoryChangeProposalStore } from './in-memory-change-proposals.js';
import { InMemoryEmbeddedCopilotService } from './in-memory-embedded-copilots.js';

// ===========================================================================
// Governed LLM gateway service
// ===========================================================================

export class InMemoryLLMGatewayService implements LLMGatewayService {
  private readonly models = new Map<string, Map<string, ModelCatalogEntry>>();

  constructor() {}

  async listModels(ctx: RequestContext): Promise<ModelCatalogEntry[]> {
    const m = this.models.get(ctx.tenantId);
    if (m) return Array.from(m.values()).filter(x => x.enabled);
    // Seed a default model so the surface is usable without configuration
    const entry: ModelCatalogEntry = {
      rid: 'ri.ai-models..models.default',
      displayName: 'Default model',
      provider: 'local',
      modelId: 'default',
      contextWindow: 8192,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      supportsTools: true,
      zdr: false,
      geo: 'any',
      enabled: true,
    };
    this.getMap(ctx.tenantId).set(entry.rid, entry);
    return [entry];
  }

  async getModel(ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null> {
    const m = this.models.get(ctx.tenantId);
    return m?.get(rid) ?? null;
  }

  async chatCompletion(ctx: RequestContext, options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const models = await this.listModels(ctx);
    const model = models.find(m => m.rid === options.model);
    if (!model) throw new Error(`Model not found: ${options.model}`);
    const prompt = options.messages.map(m => m.content).join('\n');
    const promptTokens = Math.ceil(prompt.length / 4);
    const completion = `This is a generated response from ${model.displayName}.`;
    const completionTokens = Math.ceil(completion.length / 4);
    return {
      id: `chatcmpl_${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: options.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: completion },
        finishReason: 'stop',
      }],
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    };
  }

  async *chatCompletionStream(_ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionStreamChunk> {
    const completion = `This is a generated response from ${options.model}.`;
    const id = `chatcmpl_${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    yield {
      id,
      object: 'chat.completion.chunk',
      created,
      model: options.model,
      choices: [{ index: 0, delta: { content: completion }, finishReason: null }],
    };
    yield {
      id,
      object: 'chat.completion.chunk',
      created,
      model: options.model,
      choices: [{ index: 0, delta: {}, finishReason: 'stop' }],
    };
  }

  async createEmbedding(_ctx: RequestContext, options: EmbeddingOptions): Promise<EmbeddingResult> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const dims = 64;
    const data = inputs.map((text, i) => {
      const vector: number[] = [];
      for (let d = 0; d < dims; d++) {
        const hash = (text.length + i * 31 + d * 17) % 1000;
        vector.push((hash / 1000) - 0.5);
      }
      return { index: i, embedding: vector };
    });
    const totalTokens = data.reduce((sum, d) => sum + d.embedding.length, 0);
    return {
      object: 'list',
      model: options.model,
      data,
      usage: { promptTokens: totalTokens, totalTokens },
    };
  }

  private getMap(tenantId: string): Map<string, ModelCatalogEntry> {
    let m = this.models.get(tenantId);
    if (!m) { m = new Map(); this.models.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Agent construction and orchestration
// ===========================================================================

export class InMemoryAgentService implements AgentService {
  private readonly agents = new Map<string, Map<string, AgentDefinition>>();
  private readonly threads = new Map<string, Map<string, AgentChatThread>>();

  constructor(private readonly llmClient?: LLMClient) {}

  async create(ctx: RequestContext, input: CreateAgentInput): Promise<AgentDefinition> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const agent: AgentDefinition = {
      id,
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
    this.getMap(ctx.tenantId).set(id, agent);
    return agent;
  }

  async list(ctx: RequestContext): Promise<AgentDefinition[]> {
    const m = this.agents.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async get(ctx: RequestContext, id: string): Promise<AgentDefinition | null> {
    return this.agents.get(ctx.tenantId)?.get(id) ?? null;
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateAgentInput>): Promise<AgentDefinition> {
    const agent = this.agents.get(ctx.tenantId)?.get(id);
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
    this.getMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    this.agents.get(ctx.tenantId)?.delete(id);
  }

  async run(ctx: RequestContext, id: string, input: { prompt?: string; useTools?: boolean }): Promise<AgentRunResult> {
    const agent = await this.get(ctx, id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const prompt = input.prompt ?? 'Hello';
    const result = await this.generate(ctx, agent, prompt);
    return {
      threadId: randomUUID(),
      response: result,
      toolCalls: (input.useTools ? agent.tools.map(t => ({ id: randomUUID(), name: t.name, arguments: {} })) : []) as AipLlmAgentToolCall[],
      model: agent.modelRid ?? 'local',
      tokensUsed: Math.ceil(result.length / 4),
    };
  }

  async chat(ctx: RequestContext, id: string, input: AgentChatInput): Promise<AgentChatThread> {
    const agent = await this.get(ctx, id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const threadId = input.threadId ?? randomUUID();
    const existing = this.threads.get(ctx.tenantId)?.get(threadId);
    const now = new Date().toISOString();
    const userMessage: AgentChatMessage = { id: randomUUID(), role: 'user', content: input.message, createdAt: now };
    const messages = existing ? [...existing.messages, userMessage] : [userMessage];
    const response = await this.generate(ctx, agent, input.message);
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
    this.getThreadMap(ctx.tenantId).set(threadId, thread);
    return thread;
  }

  private async generate(ctx: RequestContext, agent: AgentDefinition, message: string): Promise<string> {
    return generateAgentResponse(this.llmClient, ctx, agent, message);
  }

  private getMap(tenantId: string): Map<string, AgentDefinition> {
    let m = this.agents.get(tenantId);
    if (!m) { m = new Map(); this.agents.set(tenantId, m); }
    return m;
  }

  private getThreadMap(tenantId: string): Map<string, AgentChatThread> {
    let m = this.threads.get(tenantId);
    if (!m) { m = new Map(); this.threads.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// LLM application platform
// ===========================================================================

export class InMemoryModelCatalogService implements ModelCatalogService {
  private readonly models = new Map<string, Map<string, ModelCatalogEntry>>();
  private readonly applications = new Map<string, Map<string, LlmApplication>>();

  constructor(private readonly llmClient?: LLMClient) {}

  async listModels(ctx: RequestContext): Promise<ModelCatalogEntry[]> {
    const m = this.models.get(ctx.tenantId);
    if (m) return Array.from(m.values()).filter(x => x.enabled);
    const entry: ModelCatalogEntry = {
      rid: 'ri.ai-models..models.default',
      displayName: 'Default model',
      provider: 'local',
      modelId: 'default',
      contextWindow: 8192,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      supportsTools: true,
      zdr: false,
      geo: 'any',
      enabled: true,
    };
    this.getModelMap(ctx.tenantId).set(entry.rid, entry);
    return [entry];
  }

  async getModel(ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null> {
    return this.models.get(ctx.tenantId)?.get(rid) ?? null;
  }

  async createApplication(ctx: RequestContext, input: CreateLlmApplicationInput): Promise<LlmApplication> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const app: LlmApplication = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      modelRid: input.modelRid,
      systemPrompt: input.systemPrompt,
      userPromptTemplate: input.userPromptTemplate,
      outputSchema: input.outputSchema,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getAppMap(ctx.tenantId).set(id, app);
    return app;
  }

  async listApplications(ctx: RequestContext): Promise<LlmApplication[]> {
    const m = this.applications.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async getApplication(ctx: RequestContext, id: string): Promise<LlmApplication | null> {
    return this.applications.get(ctx.tenantId)?.get(id) ?? null;
  }

  async runPromptPlayground(ctx: RequestContext, input: PromptPlaygroundInput): Promise<PromptPlaygroundResult> {
    const prompt = input.userPrompt;
    if (this.llmClient?.isConfigured()) {
      try {
        const result = await this.llmClient.complete(ctx, prompt, {
          model: input.modelRid,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        });
        return {
          response: result.text,
          model: input.modelRid,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          finishReason: result.finishReason,
        };
      } catch {
        // fall through
      }
    }
    const response = `Playground response for "${prompt}" using ${input.modelRid}`;
    const tokens = Math.ceil(response.length / 4);
    return {
      response,
      model: input.modelRid,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: tokens,
      totalTokens: Math.ceil(prompt.length / 4) + tokens,
      finishReason: 'stop',
    };
  }

  private getModelMap(tenantId: string): Map<string, ModelCatalogEntry> {
    let m = this.models.get(tenantId);
    if (!m) { m = new Map(); this.models.set(tenantId, m); }
    return m;
  }

  private getAppMap(tenantId: string): Map<string, LlmApplication> {
    let m = this.applications.get(tenantId);
    if (!m) { m = new Map(); this.applications.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Agent evaluation framework
// ===========================================================================

export class InMemoryEvalService implements EvalService {
  private readonly inner = new InMemoryAgentEvaluationService();

  private toSpiInput(input: EvalSuiteInput): { name: string; description: string; agentIdentifier: string; testCases: { name: string; description: string; input: string; expected?: string; context?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>; metrics: EvalMetric[]; tags: string[] }[]; tags?: string[] } {
    return {
      name: input.name,
      description: input.description ?? '',
      agentIdentifier: input.agentIdentifier ?? 'default',
      testCases: input.testCases.map(tc => ({
        name: tc.name,
        description: '',
        input: tc.input,
        expected: tc.expected,
        context: undefined,
        metrics: tc.metrics,
        tags: [],
      })),
      tags: input.tags,
    };
  }

  async createSuite(ctx: RequestContext, input: EvalSuiteInput): Promise<EvalSuite> {
    return this.inner.createSuite(ctx, this.toSpiInput(input));
  }

  async listSuites(ctx: RequestContext, agentIdentifier?: string): Promise<EvalSuite[]> {
    return this.inner.listSuites(ctx, agentIdentifier);
  }

  async getSuite(ctx: RequestContext, id: string): Promise<EvalSuite | null> {
    return this.inner.getSuite(ctx, id);
  }

  async runSuite(ctx: RequestContext, id: string, executor?: import('@altius/spi').AgentExecutor): Promise<EvalRunResult> {
    const exec = executor ?? { execute: async () => ({ response: 'mock', toolsCalled: [] as string[], latencyMs: 0 }) };
    return this.inner.runEvaluation(ctx, id, exec);
  }

  async getRunResult(ctx: RequestContext, runId: string): Promise<EvalRunResult | null> {
    return this.inner.getRunResult(ctx, runId);
  }

  async listRunResults(ctx: RequestContext, suiteId: string): Promise<EvalRunResult[]> {
    return this.inner.listRunResults(ctx, suiteId);
  }
}

// ===========================================================================
// Human-in-the-loop
// ===========================================================================

/**
 * The five methods are a rename of ChangeProposalStore's, so they live once in
 * @altius/spi and both providers extend the same adapter.
 *
 * The store is a constructor argument, defaulted rather than required so the
 * existing call sites keep working. Passing one in is the point: this class
 * used to build its own private store, which meant the /api/v1/ai-proposals
 * surface and the /api/v1/change-proposals surface answered about different
 * records without either of them erring. The API now hands both the same
 * instance.
 */
export class InMemoryHumanInTheLoopService extends ChangeProposalHumanInTheLoop {
  constructor(store: ChangeProposalStore = new InMemoryChangeProposalStore()) {
    super(store);
  }
}

// ===========================================================================
// Vector search / embedding services
// ===========================================================================

export class InMemoryVectorSearchService implements VectorSearchService {
  constructor(
    private readonly embeddingStore: EmbeddingStore,
    private readonly llmClient?: LLMClient,
  ) {}

  async listModels(_ctx: RequestContext): Promise<EmbeddingModel[]> {
    return [
      { rid: 'ri.ai-models..embeddings.default', name: 'Default embeddings', provider: 'local', dimensions: 64, enabled: true },
      { rid: 'ri.ai-models..embeddings.small', name: 'Small embeddings', provider: 'local', dimensions: 32, enabled: true },
    ];
  }

  async embed(ctx: RequestContext, input: GenerateEmbeddingInput): Promise<{ vector: number[]; model: string; dimensions: number }> {
    const model = input.model ?? 'ri.ai-models..embeddings.default';
    let vector: number[];
    if (this.llmClient?.isConfigured()) {
      try {
        const result = await this.llmClient.embed(ctx, input.text, { model });
        vector = result.vector;
        if (input.store && input.objectType && input.objectId && input.field) {
          await this.embeddingStore.upsert(ctx, {
            objectType: input.objectType,
            objectId: input.objectId,
            field: input.field,
            vector,
            model,
            dimensions: result.dimensions,
          });
        }
        return { vector, model, dimensions: result.dimensions };
      } catch {
        // fall through to deterministic
      }
    }
    const dims = 64;
    vector = [];
    for (let d = 0; d < dims; d++) {
      const hash = (input.text.length + d * 17) % 1000;
      vector.push((hash / 1000) - 0.5);
    }
    if (input.store && input.objectType && input.objectId && input.field) {
      await this.embeddingStore.upsert(ctx, {
        objectType: input.objectType,
        objectId: input.objectId,
        field: input.field,
        vector,
        model,
        dimensions: dims,
      });
    }
    return { vector, model, dimensions: dims };
  }

  async search(ctx: RequestContext, input: SemanticSearchInput): Promise<EmbeddingSearchResult> {
    const { vector } = await this.embed(ctx, { text: input.text });
    return this.embeddingStore.search(
      ctx,
      input.objectType ?? 'Document',
      input.field ?? 'embedding',
      vector,
      { limit: input.limit ?? 10, minScore: input.minScore },
    );
  }
}

// ===========================================================================
// Token metering
// ===========================================================================

export class InMemoryTokenMeteringService implements TokenMeteringService {
  constructor(private readonly usageTracker: LLMUsageTracker) {}

  async queryUsage(_ctx: RequestContext, query: UsageQuery): Promise<{ records: LLMUsageRecord[]; totalCount: number }> {
    return this.usageTracker.query(query);
  }

  async getUserUsage(_ctx: RequestContext, userId: string, startTime?: string, endTime?: string): Promise<{ records: LLMUsageRecord[]; totalCount: number }> {
    return this.usageTracker.query({ userId, startTime, endTime, limit: 1000 });
  }

  async getSummary(ctx: RequestContext, startTime?: string, endTime?: string): Promise<UsageSummary> {
    return this.usageTracker.summarize(ctx.tenantId, startTime, endTime);
  }
}

// ===========================================================================
// Embedded AI copilots
// ===========================================================================

/**
 * The view-facing half of the copilot surface: suggest, then apply.
 *
 * It stores nothing of its own — every copilot it touches belongs to the
 * `EmbeddedCopilotService` handed in. That store is a constructor argument,
 * defaulted so existing call sites keep working, and the API passes the same
 * instance it gives `deps.embeddedCopilotService`.
 *
 * ── Why the argument matters ──
 *
 * This class used to construct its own private `InMemoryEmbeddedCopilotService`.
 * Because copilot ids are generated UUIDs and `suggest` is called with an id
 * chosen by the caller, the lookup in that private store never matched — so
 * `ensureCopilot` fell through to creating a fresh copilot, with
 * `canExecuteActions: true`, on every call.
 *
 * That is not only a visibility split. `getSuggestedActions` is the one place
 * the `canExecuteActions` flag is enforced, and `createCopilot` defaults it to
 * *false*. So a copilot configured with action execution switched off was never
 * consulted, and suggestions were served from a fabricated copilot with it
 * switched on. Sharing the store is what makes the configured copilot the one
 * that answers.
 */
export class InMemoryCopilotService implements CopilotService {
  constructor(private readonly inner: EmbeddedCopilotService = new InMemoryEmbeddedCopilotService()) {}

  /**
   * The configured copilot, or a permissive default when the id is unknown.
   *
   * The `canExecuteActions: true` below is NOT the fix's doing — it is the
   * original behaviour, kept so this change does exactly one thing. It is worth
   * flagging on its own: an unrecognised copilot id still yields a copilot that
   * may suggest actions, which is the opposite of `createCopilot`'s own default.
   * Narrowing it is a contract change and belongs in its own change.
   */
  private async ensureCopilot(ctx: RequestContext, copilotId: string): Promise<CopilotInstance> {
    const existing = await this.inner.getCopilot(ctx, copilotId);
    if (existing) return existing;
    return this.inner.createCopilot(ctx, {
      name: `copilot-${copilotId}`,
      appContext: 'general',
      systemPrompt: 'You are an embedded AI copilot.',
      suggestedPrompts: ['Summarize', 'Find related'],
      canExecuteActions: true,
      canReadData: true,
      enabled: true,
    });
  }

  async suggest(ctx: RequestContext, input: CopilotSuggestInput): Promise<CopilotSuggestion> {
    const copilot = await this.ensureCopilot(ctx, input.copilotId);
    const viewContext: CopilotViewContext = {
      objectType: input.objectType,
      objectId: input.objectId,
      filter: input.filter,
      selectedObjectIds: input.selectedObjectIds,
      actionName: input.actionName,
    };
    const [prompts, actions] = await Promise.all([
      this.inner.getSuggestedPrompts(ctx, copilot.id, viewContext),
      this.inner.getSuggestedActions(ctx, copilot.id, viewContext),
    ]);
    return {
      prompts,
      actions: actions.map((a: CopilotActionSuggestion) => ({
        actionName: a.actionName,
        label: a.label,
        prefill: a.prefillParams ?? {},
        confidence: a.confidence,
      })),
      response: input.message ? `You asked: ${input.message}` : undefined,
    };
  }

  async apply(ctx: RequestContext, input: CopilotApplyInput): Promise<CopilotApplyResult> {
    await this.ensureCopilot(ctx, input.copilotId);
    return {
      applied: true,
      actionName: input.actionName,
      result: input.params,
      message: `Applied suggestion ${input.suggestionId}`,
    };
  }
}
