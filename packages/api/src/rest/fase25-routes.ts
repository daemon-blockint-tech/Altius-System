/**
 * Fase 25 — AIP/LLM Platform REST routes.
 */

import type { ApiDependencies } from '../graphql/types.js';
import type { RestRoute, RestResponse } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

export function generateFase25Routes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // ── Agent construction and orchestration ─────────────────────────────────
  if (deps.agentService) {
    const svc = deps.agentService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/agents',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/agents',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
          const agent = await svc.create(ctx.requestContext, body as unknown as Parameters<typeof svc.create>[1]);
          return { status: 201, body: { data: agent } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'GET',
      pattern: '/api/v1/agents/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const agent = await svc.get(ctx.requestContext, req.params['id'] ?? '');
          if (!agent) return { status: 404, body: { error: 'NOT_FOUND', message: 'Agent not found' } };
          return { status: 200, body: { data: agent } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/agents/:id/run',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const result = await svc.run(ctx.requestContext, req.params['id'] ?? '', { prompt: typeof body['prompt'] === 'string' ? body['prompt'] : undefined, useTools: body['useTools'] === true });
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/agents/:id/chat',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const message = typeof body['message'] === 'string' ? body['message'] : '';
          const thread = await svc.chat(ctx.requestContext, req.params['id'] ?? '', {
            message,
            threadId: typeof body['threadId'] === 'string' ? body['threadId'] : undefined,
            useTools: body['useTools'] === true,
          });
          return { status: 200, body: { data: thread } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── LLM application platform / multi-model catalog ───────────────────────
  if (deps.modelCatalogService) {
    const svc = deps.modelCatalogService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/llm/models',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { return { status: 200, body: { data: await svc.listModels(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'GET',
      pattern: '/api/v1/llm/models/:rid',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const model = await svc.getModel(ctx.requestContext, req.params['rid'] ?? '');
          if (!model) return { status: 404, body: { error: 'NOT_FOUND', message: 'Model not found' } };
          return { status: 200, body: { data: model } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/llm/applications',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['name'] || !body['modelRid'] || !body['userPromptTemplate']) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name, modelRid and userPromptTemplate are required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const app = await svc.createApplication(ctx.requestContext, body as unknown as Parameters<typeof svc.createApplication>[1]);
          return { status: 201, body: { data: app } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'GET',
      pattern: '/api/v1/llm/applications',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { return { status: 200, body: { data: await svc.listApplications(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'GET',
      pattern: '/api/v1/llm/applications/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const app = await svc.getApplication(ctx.requestContext, req.params['id'] ?? '');
          if (!app) return { status: 404, body: { error: 'NOT_FOUND', message: 'Application not found' } };
          return { status: 200, body: { data: app } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/llm/playground',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['modelRid'] || !body['userPrompt']) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'modelRid and userPrompt are required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const result = await svc.runPromptPlayground(ctx.requestContext, body as unknown as Parameters<typeof svc.runPromptPlayground>[1]);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Agent evaluation framework ───────────────────────────────────────────
  if (deps.evalService) {
    const svc = deps.evalService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/evals',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const agentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
          return { status: 200, body: { data: await svc.listSuites(ctx.requestContext, agentId) } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/evals',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['name'] || !Array.isArray(body['testCases'])) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name and testCases are required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const suite = await svc.createSuite(ctx.requestContext, body as unknown as Parameters<typeof svc.createSuite>[1]);
          return { status: 201, body: { data: suite } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'GET',
      pattern: '/api/v1/evals/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const suite = await svc.getSuite(ctx.requestContext, req.params['id'] ?? '');
          if (!suite) return { status: 404, body: { error: 'NOT_FOUND', message: 'Eval suite not found' } };
          return { status: 200, body: { data: suite } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/evals/:id/run',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const result = await svc.runSuite(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Human-in-the-loop ────────────────────────────────────────────────────
  if (deps.humanInTheLoopService) {
    const svc = deps.humanInTheLoopService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/ai-proposals',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const state = typeof req.query['state'] === 'string' ? req.query['state'] : undefined;
          const result = await svc.listProposals(ctx.requestContext, state ? { state: state as any } : undefined);
          return { status: 200, body: result };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/ai-proposals',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['title'] || !body['type'] || !Array.isArray(body['changes'])) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'title, type and changes are required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const proposal = await svc.createProposal(ctx.requestContext, body as unknown as Parameters<typeof svc.createProposal>[1]);
          return { status: 201, body: { data: proposal } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/ai-proposals/:id/approve',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const comments = typeof body['comments'] === 'string' ? body['comments'] : undefined;
          const proposal = await svc.approve(ctx.requestContext, req.params['id'] ?? '', comments);
          return { status: 200, body: { data: proposal } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/ai-proposals/:id/reject',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const comments = typeof body['comments'] === 'string' ? body['comments'] : undefined;
          const proposal = await svc.reject(ctx.requestContext, req.params['id'] ?? '', comments);
          return { status: 200, body: { data: proposal } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Vector/embedding services ────────────────────────────────────────────
  if (deps.vectorSearchService) {
    const svc = deps.vectorSearchService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/embeddings/models',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { return { status: 200, body: { data: await svc.listModels(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/embeddings',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (typeof body['text'] !== 'string') {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'text is required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const result = await svc.embed(ctx.requestContext, body as unknown as Parameters<typeof svc.embed>[1]);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/embeddings/search',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (typeof body['text'] !== 'string') {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'text is required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const result = await svc.search(ctx.requestContext, body as unknown as Parameters<typeof svc.search>[1]);
          return { status: 200, body: result as unknown as Record<string, unknown> };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Token metering ───────────────────────────────────────────────────────
  if (deps.llmGateway) {
    const tracker = deps.llmGateway.usageTracker;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/llm/usage/:user',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const result = await tracker.query({
            tenantId: ctx.requestContext.tenantId,
            userId: req.params['user'] ?? '',
            startTime: typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined,
            endTime: typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined,
            limit: typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined,
          });
          return { status: 200, body: result };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Embedded copilots ────────────────────────────────────────────────────
  if (deps.copilotService) {
    const svc = deps.copilotService;
    routes.push({
      method: 'POST',
      pattern: '/api/v1/copilots/suggest',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['copilotId']) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'copilotId is required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const result = await svc.suggest(ctx.requestContext, body as unknown as Parameters<typeof svc.suggest>[1]);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
    routes.push({
      method: 'POST',
      pattern: '/api/v1/copilots/apply',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!body['copilotId'] || !body['suggestionId']) {
            return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'copilotId and suggestionId are required', retryable: false, traceId: ctx.requestContext.traceId });
          }
          const result = await svc.apply(ctx.requestContext, body as unknown as Parameters<typeof svc.apply>[1]);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  return routes;
}
