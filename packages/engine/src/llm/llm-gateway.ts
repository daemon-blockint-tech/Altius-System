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
  ChatCompletionStreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  ChatMessage,
  RequestContext,
  LLMClient,
  LLMUsageTracker,
  LLMRateLimiter,
  PiiObfuscator,
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
  /**
   * Optional PII obfuscator. When present, the gateway masks
   * @sensitive-sourced values declared in `ChatCompletionOptions.sensitiveValues`
   * before the payload reaches the LLM client. When absent, the gateway
   * forwards payloads untouched (the read path is the primary redaction
   * layer; the obfuscator is the second layer for callers that build prompts
   * from data they could read under an elevated role).
   */
  piiObfuscator?: PiiObfuscator;
}

export class DefaultLLMGateway implements LLMGateway {
  private readonly llmClient: LLMClient;
  private readonly modelMap: Map<string, ModelCatalogEntry>;
  readonly usageTracker: LLMUsageTracker;
  readonly rateLimiter: LLMRateLimiter;
  private readonly piiObfuscator?: PiiObfuscator;

  constructor(options: LLMGatewayOptions) {
    this.llmClient = options.llmClient;
    this.usageTracker = options.usageTracker;
    this.rateLimiter = options.rateLimiter;
    this.modelMap = new Map(options.models.map(m => [m.rid, m]));
    this.piiObfuscator = options.piiObfuscator;
  }

  async listModels(_ctx: RequestContext): Promise<ModelCatalogEntry[]> {
    return Array.from(this.modelMap.values()).filter(m => m.enabled);
  }

  async getModel(_ctx: RequestContext, rid: string): Promise<ModelCatalogEntry | null> {
    return this.modelMap.get(rid) ?? null;
  }

  private resolveGeo(ctx: RequestContext, options: ChatCompletionOptions): 'EU' | 'US' | 'any' {
    return options.dataRegion ?? (ctx as { dataRegion?: 'EU' | 'US' | 'any' }).dataRegion ?? 'any';
  }

  async chatCompletion(ctx: RequestContext, options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const model = this.resolveModel(options.model);
    this.enforceGovernance(ctx, model);

    // ZDR enforcement: ZDR models require ephemeral retention
    if (model.zdr && options.retention !== 'ephemeral') {
      throw new Error(`Model ${options.model} requires ephemeral retention (ZDR)`);
    }

    // Geo routing: the requested data region must be compatible with the model
    const requestedRegion = this.resolveGeo(ctx, options);
    if (model.geo !== 'any' && requestedRegion !== 'any' && model.geo !== requestedRegion) {
      throw new Error(`Model ${options.model} is not available in region ${requestedRegion}`);
    }

    // PII obfuscation: mask @sensitive-sourced values before token estimation
    // so the redacted (shorter) text drives both the rate-limit check and the
    // prompt sent to the provider. Redaction decisions are logged by the
    // obfuscator via its onRedaction hook.
    const { messages: safeMessages } = await this.applyPiiObfuscation(ctx, options);

    // Estimate tokens (rough: ~4 chars per token)
    const promptText = safeMessages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);

    // Rate limit check
    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(safeMessages);

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

    const { messages: safeMessages } = await this.applyPiiObfuscation(ctx, options);

    // Estimate tokens for rate limit check
    const promptText = safeMessages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);

    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(safeMessages);
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

  /**
   * Run the PII obfuscator over the request's messages when one is wired and
   * the caller declared sensitive values. Returns the (possibly masked)
   * messages to send downstream. When no obfuscator is configured, returns
   * the original messages unchanged — the read path remains the primary
   * redaction layer.
   */
  private async applyPiiObfuscation(
    ctx: RequestContext,
    options: ChatCompletionOptions,
  ): Promise<{ messages: ChatMessage[] }> {
    if (!this.piiObfuscator || !options.sensitiveValues || options.sensitiveValues.length === 0) {
      return { messages: options.messages };
    }
    const { messages } = await this.piiObfuscator.obfuscate(
      ctx,
      options.messages,
      options.sensitiveValues,
      options.model,
    );
    return { messages };
  }

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

  async *chatCompletionStream(ctx: RequestContext, options: ChatCompletionOptions): AsyncIterable<ChatCompletionStreamChunk> {
    const model = this.modelMap.get(options.model);
    if (!model) {
      throw new Error(`Model not found in catalog: ${options.model}`);
    }
    if (!model.enabled) {
      throw new Error(`Model is disabled: ${options.model}`);
    }
    if (model.zdr && options.retention !== 'ephemeral') {
      throw new Error(`Model ${options.model} requires ephemeral retention (ZDR)`);
    }
    const requestedRegion = this.resolveGeo(ctx, options);
    if (model.geo !== 'any' && requestedRegion !== 'any' && model.geo !== requestedRegion) {
      throw new Error(`Model ${options.model} is not available in region ${requestedRegion}`);
    }

    const { messages: safeMessages } = await this.applyPiiObfuscation(ctx, options);

    const promptText = safeMessages.map(m => m.content).join('\n');
    const estimatedTokens = Math.ceil(promptText.length / 4) + (options.maxTokens ?? 1000);
    const rateLimit = await this.rateLimiter.check(ctx.tenantId, estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.reason ?? 'Rate limit exceeded');
    }

    const systemMessages = safeMessages.filter(m => m.role === 'system').map(m => m.content);
    const systemPrompt = systemMessages.join('\n');
    const userPrompt = safeMessages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const id = `chatcmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const created = Math.floor(Date.now() / 1000);

    let promptTokens = 0;
    let completionTokens = 0;
    let fullText = '';
    try {
      for await (const chunk of this.llmClient.stream(ctx, userPrompt, {
        model: model.modelId,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stop: options.stop,
        systemPrompt: systemPrompt || undefined,
      })) {
        fullText += chunk;
        completionTokens += chunk.length;
        yield {
          id,
          object: 'chat.completion.chunk',
          created,
          model: options.model,
          choices: [{ index: 0, delta: { content: chunk }, finishReason: null }],
        };
      }
    } catch {
      // If streaming is unsupported, fall back to one-shot and emit a single chunk.
      const result = await this.llmClient.complete(ctx, userPrompt, {
        model: model.modelId,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stop: options.stop,
        systemPrompt: systemPrompt || undefined,
      });
      fullText = result.text;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
      yield {
        id,
        object: 'chat.completion.chunk',
        created,
        model: options.model,
        choices: [{ index: 0, delta: { content: fullText }, finishReason: null }],
      };
    }

    promptTokens = promptTokens || Math.ceil(promptText.length / 4);
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

    yield {
      id,
      object: 'chat.completion.chunk',
      created,
      model: options.model,
      choices: [{ index: 0, delta: {}, finishReason: 'stop' }],
    };
  }

  async createEmbedding(ctx: RequestContext, options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = this.modelMap.get(options.model);
    if (!model) {
      throw new Error(`Model not found in catalog: ${options.model}`);
    }
    if (!model.enabled) {
      throw new Error(`Model is disabled: ${options.model}`);
    }

    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const data: EmbeddingResult['data'] = [];
    let totalTokens = 0;

    for (const [i, text] of inputs.entries()) {
      const result = await this.llmClient.embed(ctx, text, { model: model.modelId });
      data.push({ index: i, embedding: result.vector });
      totalTokens += result.vector.length;
    }

    await this.usageTracker.record({
      tenantId: ctx.tenantId,
      userId: ctx.actorId ?? 'anonymous',
      model: options.model,
      operation: 'embedding',
      promptTokens: totalTokens,
      completionTokens: 0,
      totalTokens,
      timestamp: new Date().toISOString(),
    });

    return {
      object: 'list',
      model: options.model,
      data,
      usage: { promptTokens: totalTokens, totalTokens },
    };
  }
}
