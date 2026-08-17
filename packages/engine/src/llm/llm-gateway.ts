/**
 * Default LLM gateway implementation.
 *
 * Wraps an LLMClient with model catalog, usage tracking, rate limiting,
 * and governance flags (ZDR, geo).
 */

import type {
  LLMGateway,
  ModelCatalogEntry,
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatMessage,
  RequestContext,
  LLMClient,
  LLMUsageTracker,
  LLMRateLimiter,
} from '@altius/spi';

export interface LLMGatewayOptions {
  /** The underlying LLM client. */
  llmClient: LLMClient;
  /** Model catalog entries. */
  models: ModelCatalogEntry[];
  /** Usage tracker. */
  usageTracker: LLMUsageTracker;
  /** Rate limiter. */
  rateLimiter: LLMRateLimiter;
}

export class DefaultLLMGateway implements LLMGateway {
  private readonly llmClient: LLMClient;
  private readonly modelMap: Map<string, ModelCatalogEntry>;
  readonly usageTracker: LLMUsageTracker;
  readonly rateLimiter: LLMRateLimiter;

  constructor(options: LLMGatewayOptions) {
    this.llmClient = options.llmClient;
    this.usageTracker = options.usageTracker;
    this.rateLimiter = options.rateLimiter;
    this.modelMap = new Map(options.models.map(m => [m.rid, m]));
  }

  async listModels(_ctx: RequestContext): Promise<ModelCatalogEntry[]> {
    return Array.from(this.modelMap.values()).filter(m => m.enabled);
  }

  async getModel(_ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null> {
    return this.modelMap.get(rid) ?? null;
  }

  async chatCompletion(ctx: RequestContext, options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const model = this.modelMap.get(options.model);
    if (!model) {
      throw new Error(`Model not found in catalog: ${options.model}`);
    }
    if (!model.enabled) {
      throw new Error(`Model is disabled: ${options.model}`);
    }

    // Estimate tokens (rough: ~4 chars per token)
    const promptText = options.messages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);

    // Rate limit check
    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    // Build a single prompt from messages (system + user conversation)
    const systemMessages = options.messages.filter(m => m.role === 'system').map(m => m.content);
    const systemPrompt = systemMessages.join('\n');
    const userPrompt = options.messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // Delegate to LLMClient
    const result = await this.llmClient.complete(ctx, userPrompt, {
      model: model.modelId,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stop: options.stop,
      systemPrompt: systemPrompt || undefined,
    });

    // Record actual usage
    const actualTokens = result.totalTokens;
    await this.rateLimiter.recordUsage(ctx.tenantId, actualTokens);
    await this.usageTracker.record({
      tenantId: ctx.tenantId,
      userId: ctx.actorId ?? 'anonymous',
      model: options.model,
      operation: 'completion',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      timestamp: new Date().toISOString(),
    });

    // Build OpenAI-compatible response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: result.text,
    };

    return {
      id: `chatcmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: options.model,
      choices: [
        {
          index: 0,
          message: assistantMessage,
          finishReason: result.finishReason,
        },
      ],
      usage: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
      },
    };
  }
}
