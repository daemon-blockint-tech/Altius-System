/**
 * REST routes for the governed LLM gateway.
 *
 *   GET  /api/v1/llm/models              — list available models
 *   GET  /api/v1/llm/models/:rid         — get model details
 *   POST /api/v1/llm/chat/completions    — OpenAI-compatible chat completion
 *   GET  /api/v1/llm/usage               — query usage records
 *   GET  /api/v1/llm/usage/summary       — usage summary
 *   GET  /api/v1/llm/rate-limits         — get rate limit config
 *   PUT  /api/v1/llm/rate-limits         — set rate limit config
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext, ChatCompletionOptions, RateLimitConfig } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerLLMGatewayRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.llmGateway) return;
  const gateway = deps.llmGateway;

  // ── GET /api/v1/llm/models — list ──
  app.get('/api/v1/llm/models', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const models = await gateway.listModels(ctx);
      res.status(200).json({ data: models });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/llm/models/:rid — get ──
  app.get('/api/v1/llm/models/:rid', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const model = await gateway.getModel(ctx, req.params['rid']!);
      if (!model) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Model not found' });
        return;
      }
      res.status(200).json({ data: model });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── POST /api/v1/llm/chat/completions — OpenAI-compatible ──
  app.post('/api/v1/llm/chat/completions', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as ChatCompletionOptions;
      if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({ error: 'INVALID', message: 'model and messages are required' });
        return;
      }
      const result = await gateway.chatCompletion(ctx, body);
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      if (message.includes('Rate limit')) {
        res.status(429).json({ error: 'RATE_LIMITED', message });
      } else if (message.includes('not found') || message.includes('disabled')) {
        res.status(404).json({ error: 'NOT_FOUND', message });
      } else {
        res.status(500).json({ error: 'INTERNAL', message });
      }
    }
  });

  // ── GET /api/v1/llm/usage — query usage records ──
  app.get('/api/v1/llm/usage', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const result = await gateway.usageTracker.query({
        tenantId: user.tenantId,
        userId: req.query['userId'] as string | undefined,
        model: req.query['model'] as string | undefined,
        startTime: req.query['startTime'] as string | undefined,
        endTime: req.query['endTime'] as string | undefined,
        limit: req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/llm/usage/summary — usage summary ──
  app.get('/api/v1/llm/usage/summary', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const summary = await gateway.usageTracker.summarize(
        user.tenantId,
        req.query['startTime'] as string | undefined,
        req.query['endTime'] as string | undefined,
      );
      res.status(200).json(summary);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── GET /api/v1/llm/rate-limits — get config ──
  app.get('/api/v1/llm/rate-limits', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const config = await gateway.rateLimiter.getConfig(user.tenantId);
      res.status(200).json(config);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── PUT /api/v1/llm/rate-limits — set config ──
  app.put('/api/v1/llm/rate-limits', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as Partial<RateLimitConfig>;
      const config: RateLimitConfig = {
        requestsPerMinute: body.requestsPerMinute ?? 60,
        tokensPerMinute: body.tokensPerMinute ?? 100_000,
        requestsPerDay: body.requestsPerDay ?? 10_000,
        tokensPerDay: body.tokensPerDay ?? 10_000_000,
      };
      await gateway.rateLimiter.setConfig(user.tenantId, config);
      res.status(200).json(config);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
