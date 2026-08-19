/**
 * Workshop UI REST routes — mobile design/launch, cross-app drag-drop/commands,
 * interactive graph visualization, and object-set filter state.
 */

import type { ParsedSchema, ObjectType } from '@altius/odl';
import type { ApiDependencies } from '../graphql/types.js';
import type { RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

function lowerFirst(s: string): string { return s.charAt(0).toLowerCase() + s.slice(1); }
function pluralize(s: string): string { return lowerFirst(s) + 's'; }

function withSvc<T>(svc: T | undefined, fn: (svc: T) => RestRoute[]): RestRoute[] {
  if (!svc) return [];
  return fn(svc);
}

// ─── Mobile design / launch ──────────────────────────────────────────────

export function generateMobileWorkshopRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.workshopPlatformService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/workshop/mobile/preview',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const appId = typeof req.query['appId'] === 'string' ? req.query['appId'] : '';
          if (!appId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'appId is required', retryable: false, traceId: ctx.requestContext.traceId });
          const config = await svc.getMobileConfig(ctx.requestContext, appId);
          if (!config) return { status: 404, body: { error: 'NOT_FOUND', message: 'Mobile config not found' } };
          return { status: 200, body: { data: config } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/workshop/mobile/launch',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const appId = typeof body['appId'] === 'string' ? body['appId'] : '';
          const device = (body['device'] ?? {}) as { platform?: string; model?: string; osVersion?: string };
          if (!appId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'appId is required', retryable: false, traceId: ctx.requestContext.traceId });
          const session = await svc.launchMobileSession(ctx.requestContext, appId, device as never);
          return { status: 201, body: { data: session, deepLink: `/workshop/mobile/${appId}/${session.id}` } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Cross-app drag-drop / pairing ───────────────────────────────────────

export function generateCommandExchangeRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.commandExchangeService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/commands',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const sourceAppId = typeof req.query['sourceAppId'] === 'string' ? req.query['sourceAppId'] : undefined;
          const commands = await svc.listDeclaredCommands(ctx.requestContext, sourceAppId);
          return { status: 200, body: { data: commands } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/commands',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const input = {
            name: typeof body['name'] === 'string' ? body['name'] : '',
            description: typeof body['description'] === 'string' ? body['description'] : undefined,
            sourceAppId: typeof body['sourceAppId'] === 'string' ? body['sourceAppId'] : '',
            targetAppIds: Array.isArray(body['targetAppIds']) ? body['targetAppIds'] as string[] : undefined,
            inputSchema: typeof body['inputSchema'] === 'object' ? body['inputSchema'] as Record<string, unknown> : undefined,
            outputSchema: typeof body['outputSchema'] === 'object' ? body['outputSchema'] as Record<string, unknown> : undefined,
            availableAsTool: body['availableAsTool'] === true,
            chainable: body['chainable'] === true,
          };
          if (!input.name || !input.sourceAppId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name and sourceAppId are required', retryable: false, traceId: ctx.requestContext.traceId });
          const cmd = await svc.declareCommand(ctx.requestContext, input as never);
          return { status: 201, body: { data: cmd } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/commands/:id/execute',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const targetAppId = typeof body['targetAppId'] === 'string' ? body['targetAppId'] : '';
          const payload = typeof body['payload'] === 'object' ? body['payload'] as Record<string, unknown> : {};
          if (!targetAppId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'targetAppId is required', retryable: false, traceId: ctx.requestContext.traceId });
          const exec = await svc.executeCommand(ctx.requestContext, req.params['id'] ?? '', { targetAppId, payload });
          return { status: 200, body: { data: exec } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/commands/drag-drop',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const sourceAppId = typeof body['sourceAppId'] === 'string' ? body['sourceAppId'] : '';
          const mediaType = typeof body['mediaType'] === 'string' ? body['mediaType'] : '';
          const payload = typeof body['payload'] === 'object' ? body['payload'] as Record<string, unknown> : {};
          if (!sourceAppId || !mediaType) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'sourceAppId and mediaType are required', retryable: false, traceId: ctx.requestContext.traceId });
          const event = await svc.recordDragDrop(ctx.requestContext, {
            sourceAppId,
            targetAppId: typeof body['targetAppId'] === 'string' ? body['targetAppId'] : undefined,
            mediaType,
            payload,
            completed: body['completed'] !== false,
          });
          return { status: 201, body: { data: event } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/commands/pair',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const appAId = typeof body['appAId'] === 'string' ? body['appAId'] : '';
          const appBId = typeof body['appBId'] === 'string' ? body['appBId'] : '';
          if (!appAId || !appBId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'appAId and appBId are required', retryable: false, traceId: ctx.requestContext.traceId });
          const pairing = await svc.recordPair(ctx.requestContext, {
            appAId,
            appBId,
            sharedKeys: Array.isArray(body['sharedKeys']) ? body['sharedKeys'] as string[] : undefined,
            bidirectional: body['bidirectional'] !== false,
          });
          return { status: 201, body: { data: pairing } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Object-set filter state ─────────────────────────────────────────────

export function generateObjectSetFilterRoutes(_schema: ParsedSchema, deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.objectSetFilterStore, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/object-sets/:id/filter-state',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const state = await svc.getFilterState(ctx.requestContext, req.params['id'] ?? '');
          if (!state) return { status: 200, body: { data: { chips: [], variables: {} } } };
          return { status: 200, body: { data: state } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/object-sets/:id/filter-state',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const chips = Array.isArray(body['chips']) ? body['chips'] as never[] : [];
          const name = typeof body['name'] === 'string' ? body['name'] : undefined;
          const variables = typeof body['variables'] === 'object' ? body['variables'] as Record<string, unknown> : undefined;
          const state = await svc.saveFilterState(ctx.requestContext, req.params['id'] ?? '', { chips, name, variables } as never);
          return { status: 201, body: { data: state } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/object-sets/:id/apply-filter',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const chips = Array.isArray(body['chips']) ? body['chips'] as never[] : [];
          const result = await svc.applyFilter(ctx.requestContext, req.params['id'] ?? '', chips as never);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/object-sets/:id/extract-variables',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const chips = Array.isArray(body['chips']) ? body['chips'] as never[] : [];
          const variables = await svc.extractVariables(ctx.requestContext, req.params['id'] ?? '', chips as never);
          return { status: 200, body: { data: variables } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/object-sets/:id/combine',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const left = typeof body['leftFilterStateId'] === 'string' ? body['leftFilterStateId'] : '';
          const right = typeof body['rightFilterStateId'] === 'string' ? body['rightFilterStateId'] : '';
          const op = typeof body['op'] === 'string' ? (body['op'] as 'UNION' | 'INTERSECT' | 'DIFFERENCE') : 'UNION';
          const name = typeof body['name'] === 'string' ? body['name'] : 'Combined';
          if (!left || !right) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'leftFilterStateId and rightFilterStateId are required', retryable: false, traceId: ctx.requestContext.traceId });
          const state = await svc.combine(ctx.requestContext, req.params['id'] ?? '', left, right, op, name);
          return { status: 201, body: { data: state } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Graph visualization ─────────────────────────────────────────────────

export function generateGraphVisualizationRoutes(obj: ObjectType, deps: ApiDependencies): RestRoute[] {
  const plural = pluralize(obj.name);
  const objectType = obj.name;
  return withSvc(deps.graphService, (svc) => [
    {
      method: 'POST',
      pattern: `/api/v1/${plural}/:id/graph`,
      readOperation: 'query',
      objectType: obj.name,
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const input = {
            layout: typeof body['layout'] === 'string' ? (body['layout'] as 'force' | 'circle' | 'grid' | 'hierarchical') : undefined,
            maxDepth: typeof body['maxDepth'] === 'number' ? body['maxDepth'] : undefined,
            linkTypes: Array.isArray(body['linkTypes']) ? body['linkTypes'] as string[] : undefined,
          };
          const graph = await svc.buildGraph(ctx.requestContext, objectType, req.params['id'] ?? '', input as never);
          return { status: 200, body: { data: graph } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

export function generateGlobalGraphRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.graphService, (svc) => [
    {
      method: 'POST',
      pattern: '/api/v1/ontology/graph',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const rootObjectType = typeof body['rootObjectType'] === 'string' ? body['rootObjectType'] : '';
          const rootObjectId = typeof body['rootObjectId'] === 'string' ? body['rootObjectId'] : '';
          if (!rootObjectType || !rootObjectId) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'rootObjectType and rootObjectId are required', retryable: false, traceId: ctx.requestContext.traceId });
          const input = {
            layout: typeof body['layout'] === 'string' ? (body['layout'] as 'force' | 'circle' | 'grid' | 'hierarchical') : undefined,
            maxDepth: typeof body['maxDepth'] === 'number' ? body['maxDepth'] : undefined,
            linkTypes: Array.isArray(body['linkTypes']) ? body['linkTypes'] as string[] : undefined,
          };
          const graph = await svc.buildGraph(ctx.requestContext, rootObjectType, rootObjectId, input as never);
          return { status: 200, body: { data: graph } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/graph/views',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const view = await svc.saveView(ctx.requestContext, body as never);
          return { status: 201, body: { data: view } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/graph/views',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const rootObjectType = typeof req.query['rootObjectType'] === 'string' ? req.query['rootObjectType'] : undefined;
          const views = await svc.listViews(ctx.requestContext, rootObjectType);
          return { status: 200, body: { data: views } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Aggregate wiring for route-generator ────────────────────────────────

export function generateWorkshopUiObjectRoutes(schema: ParsedSchema, deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];
  for (const obj of schema.objectTypes) {
    routes.push(...generateGraphVisualizationRoutes(obj, deps));
  }
  routes.push(...generateObjectSetFilterRoutes(schema, deps));
  return routes;
}

export function generateWorkshopUiPlatformRoutes(deps: ApiDependencies): RestRoute[] {
  return [
    ...generateMobileWorkshopRoutes(deps),
    ...generateCommandExchangeRoutes(deps),
    ...generateGlobalGraphRoutes(deps),
  ];
}
