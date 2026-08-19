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
  ChatCompletionChunk,
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
    const model = this.resolveModel(options.model);
    this.enforceGovernance(ctx, model);

    // Estimate tokens (rough: ~4 chars per token)
    const promptText = options.messages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);

    // Rate limit check
    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(options.messages);

    // Delegate to LLMClient
    const result = await this.llmClient.complete(ctx, userPrompt, {
      model: model.modelId,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stop: options.stop,
      systemPrompt: systemPrompt || undefined,
    });

    // Record actual usage
    await this.rateLimiter.recordUsage(ctx.tenantId, result.totalTokens);
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

    return this.buildResponse(options.model, result);
  }

  async *streamChatCompletion(ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionChunk> {
    const model = this.resolveModel(options.model);
    if (!model.supportsStreaming) {
      throw new Error(`Model does not support streaming: ${options.model}`);
    }
    this.enforceGovernance(ctx, model);

    // Estimate tokens for rate limit check
    const promptText = options.messages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);

    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(options.messages);
    const completionId = `chatcmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const created = Math.floor(Date.now() / 1000);

    // First chunk: role delta
    yield {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: options.model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finishReason: null }],
    };

    // Stream tokens from LLMClient
    let totalContent = '';
    for await (const chunk of this.llmClient.stream(ctx, userPrompt, {
      model: model.modelId,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stop: options.stop,
      systemPrompt: systemPrompt || undefined,
    })) {
      totalContent += chunk;
      yield {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: options.model,
        choices: [{ index: 0, delta: { content: chunk }, finishReason: null }],
      };
    }

    // Final chunk: finish reason
    yield {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: options.model,
      choices: [{ index: 0, delta: {}, finishReason: 'stop' }],
    };

    // Record usage (estimated — streaming providers don't always report tokens)
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(totalContent.length / 4);
    const totalTokens = promptTokens + completionTokens;
    await this.rateLimiter.recordUsage(ctx.tenantId, totalTokens);
    await this.usageTracker.record({
      tenantId: ctx.tenantId,
      userId: ctx.actorId ?? 'anonymous',
      model: options.model,
      operation: 'stream',
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Private helpers ──

  private resolveModel(rid: string): ModelCatalogEntry {
    const model = this.modelMap.get(rid);
    if (!model) throw new Error(`Model not found in catalog: ${rid}`);
    if (!model.enabled) throw new Error(`Model is disabled: ${rid}`);
    return model;
  }

  /**
   * Enforce ZDR and geo governance flags.
   *
   * - ZDR (zero data retention): models with zdr=true guarantee the provider
   *   does not retain inputs for training. This is informational — the flag
   *   is enforced at the catalog level (only zdr models are enabled for
   *   tenants that require it). Here we just validate the flag is set.
   *
   * - Geo: models with geo='EU' or 'US' restrict where the request can be
   *   processed. The enforcement here is a policy check: if the tenant's
   *   geo restriction doesn't match the model's, the request is rejected.
   *   A real deployment would also route the request to a regional endpoint.
   */
  private enforceGovernance(ctx: RequestContext, model: ModelCatalogEntry): void {
    // Geo enforcement: reject if the model's geo restriction doesn't match
    // the tenant's geo context (if declared). The tenant geo is read from
    // the request context's optional 'geo' field.
    const tenantGeo = (ctx as RequestContext & { geo?: string }).geo;
    if (tenantGeo && model.geo !== 'any' && model.geo !== tenantGeo) {
      throw new Error(
        `Geo governance: model ${model.rid} requires geo='${model.geo}' but tenant is geo='${tenantGeo}'`,
      );
    }

    // ZDR enforcement: if the tenant requires ZDR (ctx.zdrRequired), only
    // models with zdr=true are allowed.
    const zdrRequired = (ctx as RequestContext & { zdrRequired?: boolean }).zdrRequired;
    if (zdrRequired && !model.zdr) {
      throw new Error(
        `ZDR governance: tenant requires zero-data-retention but model ${model.rid} does not guarantee ZDR`,
      );
    }
  }

  private buildPrompts(messages: ChatMessage[]): { systemPrompt: string; userPrompt: string } {
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
    const systemPrompt = systemMessages.join('\n');
    const userPrompt = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    return { systemPrompt, userPrompt };
  }

  private buildResponse(modelRid: string, result: { text: string; finishReason: string; promptTokens: number; completionTokens: number; totalTokens: number }): ChatCompletionResponse {
    return {
      id: `chatcmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelRid,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.text },
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
