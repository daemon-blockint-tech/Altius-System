/**
 * AIP LLM — AIP/LLM Platform surface types.
 *
 * Consolidates the missing platform contracts for governed LLM gateway,
 * agent construction and orchestration, multi-model catalog and prompt
 * playground, agent evaluation, human-in-the-loop AI proposals, vector
 * search, token metering attribution, and embedded AI copilots.
 */

import type { RequestContext } from './ontology.js';
import type { ModelCatalogEntry, ChatCompletionOptions, ChatCompletionResponse, ChatCompletionStreamChunk, EmbeddingOptions, EmbeddingResult, LLMUsageRecord, UsageQuery, UsageSummary } from './llm-gateway.js';
import type { ChangeProposal, CreateProposalInput, ProposalQuery } from './change-proposals.js';
import type { EvalSuite, EvalTestCase, EvalMetric, TestCaseResult, EvalRunResult, AgentExecutor } from './agent-evaluation.js';
import type { EmbeddingSearchResult } from './embeddings.js';

// Re-export core LLM gateway aliases
export type { ModelCatalogEntry };
export type { ChatCompletionOptions, ChatCompletionResponse, ChatCompletionStreamChunk };
export type { EmbeddingOptions, EmbeddingResult };

// ===========================================================================
// Governed LLM gateway service
// ===========================================================================

/** Alias for the governed LLM gateway, exposed as a platform service. */
export type LLMGatewayService = {
  listModels(ctx: RequestContext): Promise<ModelCatalogEntry[]>;
  getModel(ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null>;
  chatCompletion(ctx: RequestContext, options: ChatCompletionOptions): Promise<ChatCompletionResponse>;
  chatCompletionStream(ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionStreamChunk>;
  createEmbedding(ctx: RequestContext, options: EmbeddingOptions): Promise<EmbeddingResult>;
};

// ===========================================================================
// Agent construction and orchestration
// ===========================================================================

/** A tool the agent can call. */
export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** A prompt template for an agent. */
export interface AgentPromptTemplate {
  name: string;
  template: string;
  tools?: string[];
}

/** An agent definition. */
export interface AgentDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  systemPrompt: string;
  promptTemplates: AgentPromptTemplate[];
  tools: AgentTool[];
  modelRid?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Input for creating an agent. */
export interface CreateAgentInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  promptTemplates?: AgentPromptTemplate[];
  tools?: AgentTool[];
  modelRid?: string;
  enabled?: boolean;
}

/** A single message in an agent thread. */
export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: AgentToolCall[];
  createdAt: string;
}

/** A tool call issued by the agent. */
export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

/** An agent conversation thread. */
export interface AgentChatThread {
  id: string;
  tenantId: string;
  agentId: string;
  userId: string;
  messages: AgentChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Result of running an agent. */
export interface AgentRunResult {
  threadId: string;
  response: string;
  toolCalls: AgentToolCall[];
  model: string;
  tokensUsed: number;
}

/** Input for a chat turn. */
export interface AgentChatInput {
  message: string;
  threadId?: string;
  useTools?: boolean;
}

/** Agent construction and orchestration service. */
export interface AgentService {
  create(ctx: RequestContext, input: CreateAgentInput): Promise<AgentDefinition>;
  list(ctx: RequestContext): Promise<AgentDefinition[]>;
  get(ctx: RequestContext, id: string): Promise<AgentDefinition | null>;
  update(ctx: RequestContext, id: string, updates: Partial<CreateAgentInput>): Promise<AgentDefinition>;
  delete(ctx: RequestContext, id: string): Promise<void>;
  run(ctx: RequestContext, id: string, input: { prompt?: string; useTools?: boolean }): Promise<AgentRunResult>;
  chat(ctx: RequestContext, id: string, input: AgentChatInput): Promise<AgentChatThread>;
}

// ===========================================================================
// LLM application platform / multi-model catalog
// ===========================================================================

/** A saved LLM application (prompt playground). */
export interface LlmApplication {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  modelRid: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  outputSchema?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Input for creating an LLM application. */
export interface CreateLlmApplicationInput {
  name: string;
  description?: string;
  modelRid: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  outputSchema?: Record<string, unknown>;
}

/** Input for the prompt playground. */
export interface PromptPlaygroundInput {
  modelRid: string;
  systemPrompt?: string;
  userPrompt: string;
  variables?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

/** Result of a prompt playground run. */
export interface PromptPlaygroundResult {
  response: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
}

/** Multi-model catalog and LLM application service. */
export interface ModelCatalogService {
  listModels(ctx: RequestContext): Promise<ModelCatalogEntry[]>;
  getModel(ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null>;
  createApplication(ctx: RequestContext, input: CreateLlmApplicationInput): Promise<LlmApplication>;
  listApplications(ctx: RequestContext): Promise<LlmApplication[]>;
  getApplication(ctx: RequestContext, id: string): Promise<LlmApplication | null>;
  runPromptPlayground(ctx: RequestContext, input: PromptPlaygroundInput): Promise<PromptPlaygroundResult>;
}

// ===========================================================================
// Agent evaluation framework
// ===========================================================================

/** Test case input used for eval creation. */
export interface EvalTestCaseInput {
  name: string;
  input: string;
  expected?: string;
  context?: Record<string, unknown>;
  metrics: EvalMetric[];
}

/** Input for creating an eval suite. */
export interface EvalSuiteInput {
  name: string;
  description?: string;
  agentIdentifier?: string;
  testCases: EvalTestCaseInput[];
  tags?: string[];
}

/** Agent evaluation service. */
export interface EvalService {
  createSuite(ctx: RequestContext, input: EvalSuiteInput): Promise<EvalSuite>;
  listSuites(ctx: RequestContext, agentIdentifier?: string): Promise<EvalSuite[]>;
  getSuite(ctx: RequestContext, id: string): Promise<EvalSuite | null>;
  runSuite(ctx: RequestContext, id: string, executor?: AgentExecutor): Promise<EvalRunResult>;
  getRunResult(ctx: RequestContext, runId: string): Promise<EvalRunResult | null>;
  listRunResults(ctx: RequestContext, suiteId: string): Promise<EvalRunResult[]>;
}

// Re-export the underlying evaluation types
export type { EvalSuite, EvalTestCase, EvalMetric, TestCaseResult, EvalRunResult };

// ===========================================================================
// Human-in-the-loop for AI-driven change proposals
// ===========================================================================

/** Human-in-the-loop service for reviewing AI-driven proposals. */
export interface HumanInTheLoopService {
  listProposals(ctx: RequestContext, query?: ProposalQuery): Promise<{ proposals: ChangeProposal[]; totalCount: number }>;
  getProposal(ctx: RequestContext, id: string): Promise<ChangeProposal | null>;
  createProposal(ctx: RequestContext, input: CreateProposalInput): Promise<ChangeProposal>;
  approve(ctx: RequestContext, id: string, comments?: string): Promise<ChangeProposal>;
  reject(ctx: RequestContext, id: string, comments?: string): Promise<ChangeProposal>;
}

// ===========================================================================
// Vector search / embedding services
// ===========================================================================

/** Embedding model descriptor. */
export interface EmbeddingModel {
  rid: string;
  name: string;
  provider: string;
  dimensions: number;
  enabled: boolean;
}

/** Input to generate an embedding. */
export interface GenerateEmbeddingInput {
  text: string;
  model?: string;
  objectType?: string;
  objectId?: string;
  field?: string;
  store?: boolean;
}

/** Input for semantic search. */
export interface SemanticSearchInput {
  objectType?: string;
  field?: string;
  text: string;
  limit?: number;
  minScore?: number;
}

/** Vector search service. */
export interface VectorSearchService {
  listModels(ctx: RequestContext): Promise<EmbeddingModel[]>;
  embed(ctx: RequestContext, input: GenerateEmbeddingInput): Promise<{ vector: number[]; model: string; dimensions: number }>;
  search(ctx: RequestContext, input: SemanticSearchInput): Promise<EmbeddingSearchResult>;
}

// ===========================================================================
// LLM token metering and attribution
// ===========================================================================

/** Token metering service. */
export interface TokenMeteringService {
  queryUsage(ctx: RequestContext, query: UsageQuery): Promise<{ records: LLMUsageRecord[]; totalCount: number }>;
  getUserUsage(ctx: RequestContext, userId: string, startTime?: string, endTime?: string): Promise<{ records: LLMUsageRecord[]; totalCount: number }>;
  getSummary(ctx: RequestContext, startTime?: string, endTime?: string): Promise<UsageSummary>;
}

// ===========================================================================
// Embedded AI copilots
// ===========================================================================

/** A copilot suggestion request. */
export interface CopilotSuggestInput {
  copilotId: string;
  objectType?: string;
  objectId?: string;
  filter?: Record<string, unknown>;
  selectedObjectIds?: string[];
  actionName?: string;
  message?: string;
}

/** A copilot suggestion. */
export interface CopilotSuggestion {
  prompts: string[];
  actions: Array<{ actionName: string; label: string; prefill: Record<string, unknown>; confidence: number }>;
  response?: string;
}

/** A copilot apply request. */
export interface CopilotApplyInput {
  copilotId: string;
  suggestionId: string;
  actionName?: string;
  params?: Record<string, unknown>;
}

/** Result of applying a copilot suggestion. */
export interface CopilotApplyResult {
  applied: boolean;
  actionName?: string;
  result?: unknown;
  message: string;
}

/** Embedded AI copilot service. */
export interface CopilotService {
  suggest(ctx: RequestContext, input: CopilotSuggestInput): Promise<CopilotSuggestion>;
  apply(ctx: RequestContext, input: CopilotApplyInput): Promise<CopilotApplyResult>;
}
