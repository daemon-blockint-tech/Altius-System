/**
 * LLM REST routes (Section AIP).
 *
 * POST /api/v1/llm/generate — generate a completion
 * POST /api/v1/llm/embed    — generate an embedding vector
 *
 * Both routes require an authenticated user and delegate to the LLMClient
 * in ApiDependencies. When no client is configured (NoOpLLMClient), the
 * routes return a 503 "not configured" error.
 */

import type { LLMCompleteOptions, LLMEmbedOptions } from '@altius/spi';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { RestRequest, RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateLlmRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // POST /api/v1/llm/generate
  routes.push({
    method: 'POST',
    pattern: '/api/v1/llm/generate',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.llmClient || !deps.llmClient.isConfigured()) {
          return createRestErrorResponse({
            code: 'LLM_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'No LLM provider is configured. Set LLM_PROVIDER and associated credentials.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const body = (req.body ?? {}) as Record<string, unknown>;
        const prompt = body['prompt'] as string | undefined;
        if (!prompt || typeof prompt !== 'string') {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'A "prompt" string is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const options: LLMCompleteOptions = {};
        if (typeof body['model'] === 'string') options.model = body['model'];
        if (typeof body['temperature'] === 'number') options.temperature = body['temperature'];
        if (typeof body['maxTokens'] === 'number') options.maxTokens = body['maxTokens'];
        if (typeof body['systemPrompt'] === 'string') options.systemPrompt = body['systemPrompt'];
        if (Array.isArray(body['stop'])) options.stop = body['stop'] as string[];

        const result = await deps.llmClient.complete(ctx.requestContext, prompt, options);

        return {
          status: 200,
          body: {
            data: {
              text: result.text,
              model: result.model,
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              totalTokens: result.totalTokens,
              finishReason: result.finishReason,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  // POST /api/v1/llm/embed
  routes.push({
    method: 'POST',
    pattern: '/api/v1/llm/embed',
    handler: async (req: RestRequest, ctx: ResolverContext): Promise<RestResponse> => {
      try {
        if (!deps.llmClient || !deps.llmClient.isConfigured()) {
          return createRestErrorResponse({
            code: 'LLM_NOT_CONFIGURED',
            category: 'unsupported',
            message: 'No LLM provider is configured. Set LLM_PROVIDER and associated credentials.',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const body = (req.body ?? {}) as Record<string, unknown>;
        const text = body['text'] as string | undefined;
        if (!text || typeof text !== 'string') {
          return createRestErrorResponse({
            code: 'MISSING_PARAMETER',
            category: 'validation',
            message: 'A "text" string is required',
            retryable: false,
            traceId: ctx.requestContext.traceId,
          });
        }

        const options: LLMEmbedOptions = {};
        if (typeof body['model'] === 'string') options.model = body['model'];

        const result = await deps.llmClient.embed(ctx.requestContext, text, options);

        return {
          status: 200,
          body: {
            data: {
              vector: result.vector,
              model: result.model,
              dimensions: result.dimensions,
            },
          },
        };
      } catch (err) {
        return wrapErrorToRest(err, ctx.requestContext.traceId);
      }
    },
  });

  return routes;
}
