/**
 * Fase 21 REST routes — shared implementation for the backlog surface work.
 *
 * This module exports per-object and global route generators for:
 *   - data freshness (per-type GET/POST on /{plural})
 *   - ontology change history
 *   - value and conditional formatting
 *   - design system theming
 *   - function-backed widget data
 *   - live data push / auto-refresh
 *   - device capture (QR/camera/deep links)
 *   - visual ontology manager
 *   - ontology metadata catalog
 *   - kiosk mode
 *
 * The thin per-subtask files in this directory re-export the relevant
 * generator(s) so the exact file names requested in the phase spec still
 * exist in the repo.
 */

import type { ParsedSchema, ObjectType } from '@altius/odl';
import type { OntologyObject, FilterExpression } from '@altius/spi';
import type { ApiDependencies } from '../graphql/types.js';
import type { RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';
import { invokeFunction } from '../functions/invoke-function.js';

function lowerFirst(s: string): string { return s.charAt(0).toLowerCase() + s.slice(1); }
function pluralize(s: string): string { return lowerFirst(s) + 's'; }

function withSvc<T>(svc: T | undefined, fn: (svc: T) => RestRoute[]): RestRoute[] {
  if (!svc) return [];
  return fn(svc);
}

// ─── Data freshness (per object type) ───

export function generateObjectDataFreshnessRoutes(obj: ObjectType, deps: ApiDependencies): RestRoute[] {
  const svc = deps.dataFreshnessService;
  if (!svc) return [];
  const plural = pluralize(obj.name);
  const objectType = obj.name;
  return [
    {
      method: 'GET',
      pattern: `/api/v1/${plural}/freshness`,
      readOperation: 'read',
      objectType: obj.name,
      handler: async (_req, ctx): Promise<RestResponse> => {
        try {
          const record = await svc.getFreshnessForType(ctx.requestContext, objectType);
          if (!record) return { status: 404, body: { error: 'NOT_FOUND', message: `No freshness record for ${objectType}` } };
          return { status: 200, body: { data: record } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: `/api/v1/${plural}/sync`,
      objectType: obj.name,
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const record = await svc.recordSync(ctx.requestContext, {
            objectType,
            datasource: typeof body['datasource'] === 'string' ? body['datasource'] : undefined,
            recordCount: typeof body['recordCount'] === 'number' ? body['recordCount'] : 0,
            succeeded: body['succeeded'] !== false,
            error: typeof body['error'] === 'string' ? body['error'] : undefined,
            intervalMs: typeof body['intervalMs'] === 'number' ? body['intervalMs'] : undefined,
          });
          return { status: 201, body: { data: record } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ];
}

// ─── Ontology change history ───

export function generateOntologyChangeHistoryRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.ontologyChangeHistoryService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/ontology/changes',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const q: Record<string, unknown> = {};
          if (typeof req.query['objectType'] === 'string') q['objectType'] = req.query['objectType'];
          if (typeof req.query['migrationClass'] === 'string') q['migrationClass'] = req.query['migrationClass'];
          if (typeof req.query['fromVersion'] === 'string') q['fromVersion'] = parseInt(req.query['fromVersion'], 10);
          if (typeof req.query['toVersion'] === 'string') q['toVersion'] = parseInt(req.query['toVersion'], 10);
          if (typeof req.query['limit'] === 'string') q['limit'] = parseInt(req.query['limit'], 10);
          if (typeof req.query['offset'] === 'string') q['offset'] = parseInt(req.query['offset'], 10);
          const records = await svc.listChanges(ctx.requestContext, q);
          return { status: 200, body: { data: records } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/changes/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const record = await svc.getChange(ctx.requestContext, req.params['id'] ?? '');
          if (!record) return { status: 404, body: { error: 'NOT_FOUND', message: 'Change record not found' } };
          return { status: 200, body: { data: record } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/changes/:id/restore',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const objectType = typeof body['objectType'] === 'string' ? body['objectType'] : '';
          if (!objectType) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'objectType is required', retryable: false, traceId: ctx.requestContext.traceId });
          const result = await svc.restore(ctx.requestContext, req.params['id'] ?? '', objectType);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Value and conditional formatting ───

export function generateObjectValueFormattingRoutes(obj: ObjectType, deps: ApiDependencies): RestRoute[] {
  const svc = deps.valueFormattingService;
  if (!svc) return [];
  const plural = pluralize(obj.name);
  const objectType = obj.name;
  const fgaType = objectType.toLowerCase();
  return [
    {
      method: 'POST',
      pattern: `/api/v1/${plural}/format`,
      readOperation: 'read',
      objectType: obj.name,
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const field = typeof body['field'] === 'string' ? body['field'] : '';
          const filter = body['filter'] as FilterExpression | undefined;
          const rule = body['rule'] as { kind: string; params?: Record<string, unknown> } | undefined;
          const conditional = body['conditionalRules'] as never[] | undefined;
          if (!field || !rule) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'field and rule are required', retryable: false, traceId: ctx.requestContext.traceId });

          const allowed = await deps.authorizationService.listObjects(`user:${ctx.user.id}`, 'viewer', fgaType, ctx.requestContext.tenantId);
          const all = allowed.length === 1 && allowed[0] === '*';
          const resolvedFilter = (filter ?? (all ? undefined : { field: '_id', operator: 'in', value: allowed })) as FilterExpression;
          const page = await deps.objectManager.query(objectType, resolvedFilter, { limit: 1000, offset: 0 }, ctx.requestContext);
          const formatted = await svc.formatCollection(ctx.requestContext, {
            objectType,
            field,
            objects: page.items.map((o: OntologyObject) => objectToRest(o, obj)),
            rule: { kind: rule.kind as never, params: rule.params },
            conditionalRules: conditional,
          });
          return { status: 200, body: { data: formatted } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ];
}

function objectToRest(obj: OntologyObject, objectType: ObjectType): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of objectType.fields) {
    if (field.directives.some(d => d.kind === 'primary')) result[field.name] = obj._id;
    else if (!field.directives.some(d => d.kind === 'computed' || d.kind === 'link')) result[field.name] = obj[field.name];
  }
  result._id = obj._id;
  result._version = obj._version;
  result._redactedFields = null;
  result._consentRestricted = false;
  return result;
}

// ─── Design system theming ───

export function generateDesignSystemRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.designSystemService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/theme',
      readOperation: 'read',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try {
          const theme = await svc.getDefaultTheme(ctx.requestContext);
          if (!theme) return { status: 404, body: { error: 'NOT_FOUND', message: 'No default theme' } };
          return { status: 200, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/theme',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const name = typeof body['name'] === 'string' ? body['name'] : '';
          if (!name) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
          const theme = await svc.createTheme(ctx.requestContext, body as never);
          return { status: 201, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/theme/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const theme = await svc.getTheme(ctx.requestContext, req.params['id'] ?? '');
          if (!theme) return { status: 404, body: { error: 'NOT_FOUND', message: 'Theme not found' } };
          return { status: 200, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/v1/theme/:id',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const theme = await svc.updateTheme(ctx.requestContext, req.params['id'] ?? '', (req.body ?? {}) as never);
          return { status: 200, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'DELETE',
      pattern: '/api/v1/theme/:id',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          await svc.deleteTheme(ctx.requestContext, req.params['id'] ?? '');
          return { status: 204, body: {} };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/modules/:id/theme',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const theme = await svc.getModuleTheme(ctx.requestContext, req.params['id'] ?? '');
          if (!theme) return { status: 404, body: { error: 'NOT_FOUND', message: 'No theme for module' } };
          return { status: 200, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'PUT',
      pattern: '/api/v1/modules/:id/theme',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const themeId = typeof body['themeId'] === 'string' ? body['themeId'] : '';
          const palette = body['palette'] as never;
          if (!themeId || !palette) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'themeId and palette are required', retryable: false, traceId: ctx.requestContext.traceId });
          const theme = await svc.setModulePalette(ctx.requestContext, { themeId, moduleId: req.params['id'] ?? '', palette });
          return { status: 200, body: { data: theme } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Function-backed widget data ───

export function generateObjectFunctionBackedRoutes(obj: ObjectType, deps: ApiDependencies): RestRoute[] {
  if (!deps.functionExecutor) return [];
  const plural = pluralize(obj.name);
  const objectType = obj.name;
  return [
    {
      method: 'POST',
      pattern: `/api/v1/${plural}/:id/function/:functionName`,
      readOperation: 'read',
      objectType: obj.name,
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const functionName = req.params['functionName'] ?? '';
          const objectId = req.params['id'] ?? '';
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (!deps.functionExecutor) return createRestErrorResponse({ code: 'NOT_CONFIGURED', category: 'system', message: 'Function executor not configured', retryable: false, traceId: ctx.requestContext.traceId });

          const fn = deps.schema.functionTypes.find(f => f.name === functionName);
          if (!fn) return createRestErrorResponse({ code: 'NOT_FOUND', category: 'validation', message: `Function not found: ${functionName}`, retryable: false, traceId: ctx.requestContext.traceId });

          const result = await invokeFunction(fn, deps, ctx, {
            ...body,
            _objectType: objectType,
            _objectId: objectId,
          });
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ];
}

// ─── Live data push / auto-refresh ───

export function generateObjectLiveDataRoutes(obj: ObjectType, deps: ApiDependencies): RestRoute[] {
  const plural = pluralize(obj.name);
  const objectType = obj.name;
  return [
    {
      method: 'POST',
      pattern: `/api/v1/${plural}/aggregate/poll`,
      readOperation: 'read',
      objectType: obj.name,
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const fields = Array.isArray(body['fields']) ? body['fields'] as Array<{ field: string; fn: string }> : [];
          const filter = body['filter'] as FilterExpression | undefined;
          if (fields.length === 0) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'fields are required', retryable: false, traceId: ctx.requestContext.traceId });
          const aggregate = await deps.objectManager.aggregate(objectType, {
            fields: fields.map(f => ({ field: f.field, fn: f.fn as never, alias: f.field })),
            groupBy: [],
            filter,
          }, ctx.requestContext);
          return { status: 200, body: { data: aggregate, polledAt: new Date().toISOString() } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ];
}

export function generateLiveDataRoutes(deps: ApiDependencies): RestRoute[] {
  if (!deps.objectSetManager) return [];
  const mgr = deps.objectSetManager;
  return [
    {
      method: 'POST',
      pattern: '/api/v1/object-sets/:id/refresh',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const result = await mgr.execute(req.params['id'] ?? '', ctx.requestContext);
          return { status: 200, body: { data: result, refreshedAt: new Date().toISOString() } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ];
}

// ─── Device capture (QR / camera / deep links) ───

export function generateDeviceCaptureRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.layoutDeviceCaptureService, (svc) => [
    {
      method: 'POST',
      pattern: '/api/v1/captures',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const kind = body['kind'] as 'qr_code' | 'camera_frame' | 'geolocation' | 'barcode' | undefined;
          if (!kind) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'kind is required', retryable: false, traceId: ctx.requestContext.traceId });
          const capture = await svc.recordCapture(ctx.requestContext, {
            kind,
            data: body['data'] as Record<string, unknown>,
            objectType: typeof body['objectType'] === 'string' ? body['objectType'] : undefined,
            objectId: typeof body['objectId'] === 'string' ? body['objectId'] : undefined,
          } as never);
          return { status: 201, body: { data: capture } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/captures',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const kind = typeof req.query['kind'] === 'string' ? (req.query['kind'] as 'qr_code' | 'camera_frame' | 'geolocation' | 'barcode') : undefined;
          const captures = await svc.listCaptures(ctx.requestContext, kind);
          return { status: 200, body: { data: captures } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/captures/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const capture = await svc.getCapture(ctx.requestContext, req.params['id'] ?? '');
          if (!capture) return { status: 404, body: { error: 'NOT_FOUND', message: 'Capture not found' } };
          return { status: 200, body: { data: capture } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'DELETE',
      pattern: '/api/v1/captures/:id',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          await svc.deleteCapture(ctx.requestContext, req.params['id'] ?? '');
          return { status: 204, body: {} };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/deep-links/resolve',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const url = typeof body['url'] === 'string' ? body['url'] as string : '';
          if (!url) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'url is required', retryable: false, traceId: ctx.requestContext.traceId });
          const resolved = await svc.resolveDeepLink(ctx.requestContext, url);
          return { status: 200, body: { data: resolved } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Visual ontology manager + ontology metadata catalog ───

export function generateOntologyManagerRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.ontologyManagerService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/types',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { const types = await svc.listTypes(ctx.requestContext); return { status: 200, body: { data: types } }; }
        catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/types/:name',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const detail = await svc.getTypeDetail(ctx.requestContext, req.params['name'] ?? '');
          if (!detail) return { status: 404, body: { error: 'NOT_FOUND', message: 'Type not found' } };
          return { status: 200, body: { data: detail } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/types/:name/observability',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const obs = await svc.getTypeObservability(ctx.requestContext, req.params['name'] ?? '');
          return { status: 200, body: { data: obs } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/actions',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { const actions = await svc.listActions(ctx.requestContext); return { status: 200, body: { data: actions } }; }
        catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/functions',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { const functions = await svc.listFunctions(ctx.requestContext); return { status: 200, body: { data: functions } }; }
        catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/manager/proposals',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const proposal = await svc.createProposal(ctx.requestContext, body as never);
          return { status: 201, body: { data: proposal } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/proposals',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const status = typeof req.query['status'] === 'string' ? req.query['status'] as never : undefined;
          const proposals = await svc.listProposals(ctx.requestContext, status);
          return { status: 200, body: { data: proposals } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/manager/proposals/:id/validate',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const p = await svc.validateProposal(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: p } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/manager/proposals/:id/submit',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const p = await svc.submitProposal(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: p } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/ontology/manager/proposals/:id/apply',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const p = await svc.applyProposal(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: p } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/manager/observability',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try {
          const obs = await svc.getAllObservability(ctx.requestContext);
          return { status: 200, body: { data: obs } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

export function generateOntologyMetadataRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.ontologyManagerService, (svc) => [
    {
      method: 'GET',
      pattern: '/api/v1/ontology/metadata/catalog',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try {
          const types = await svc.listTypes(ctx.requestContext);
          const actions = await svc.listActions(ctx.requestContext);
          const functions = await svc.listFunctions(ctx.requestContext);
          return { status: 200, body: { data: { types, actions, functions } } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/metadata/search',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
          const types = await svc.searchTypes(ctx.requestContext, q);
          return { status: 200, body: { data: types } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/ontology/metadata/types',
      readOperation: 'query',
      handler: async (_req, ctx): Promise<RestResponse> => {
        try { const types = await svc.listTypes(ctx.requestContext); return { status: 200, body: { data: types } }; }
        catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Kiosk mode ───

export function generateKioskRoutes(deps: ApiDependencies): RestRoute[] {
  return withSvc(deps.kioskService, (svc) => [
    {
      method: 'POST',
      pattern: '/api/v1/kiosk/sessions',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const name = typeof body['name'] === 'string' ? body['name'] : '';
          const location = typeof body['location'] === 'string' ? body['location'] : '';
          const permissions = body['permissions'] as { objectTypes: string[]; readOnly: true } | undefined;
          const durationSeconds = typeof body['durationSeconds'] === 'number' ? body['durationSeconds'] : 3600;
          if (!name || !location || !permissions) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name, location and permissions are required', retryable: false, traceId: ctx.requestContext.traceId });
          const session = await svc.createSession(ctx.requestContext, {
            name,
            location,
            kioskUserId: ctx.user.id,
            permissions,
            durationSeconds,
            allowedOrigins: Array.isArray(body['allowedOrigins']) ? body['allowedOrigins'] as string[] : undefined,
          });
          return { status: 201, body: { data: session } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/kiosk/sessions',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const state = typeof req.query['state'] === 'string' ? req.query['state'] as 'active' | 'expired' | 'revoked' : undefined;
          const sessions = await svc.listSessions(ctx.requestContext, state);
          return { status: 200, body: { data: sessions } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/kiosk/sessions/:id',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const session = await svc.getSession(ctx.requestContext, req.params['id'] ?? '');
          if (!session) return { status: 404, body: { error: 'NOT_FOUND', message: 'Kiosk session not found' } };
          return { status: 200, body: { data: session } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/kiosk/sessions/:id/refresh',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const session = await svc.refreshSession(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: session } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'POST',
      pattern: '/api/v1/kiosk/sessions/:id/revoke',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          await svc.revokeSession(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: { revoked: true } } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
    {
      method: 'GET',
      pattern: '/api/v1/kiosk/sessions/:id/access/:objectType',
      readOperation: 'read',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const allowed = await svc.canAccess(ctx.requestContext, req.params['id'] ?? '', req.params['objectType'] ?? '');
          return { status: 200, body: { data: { allowed } } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    },
  ]);
}

// ─── Aggregate wiring for route-generator ───

export function generateFase21ObjectRoutes(schema: ParsedSchema, deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];
  for (const obj of schema.objectTypes) {
    routes.push(...generateObjectDataFreshnessRoutes(obj, deps));
    routes.push(...generateObjectValueFormattingRoutes(obj, deps));
    routes.push(...generateObjectFunctionBackedRoutes(obj, deps));
    routes.push(...generateObjectLiveDataRoutes(obj, deps));
  }
  return routes;
}

export function generateFase21PlatformRoutes(deps: ApiDependencies): RestRoute[] {
  return [
    ...generateOntologyChangeHistoryRoutes(deps),
    ...generateDesignSystemRoutes(deps),
    ...generateLiveDataRoutes(deps),
    ...generateDeviceCaptureRoutes(deps),
    ...generateOntologyManagerRoutes(deps),
    ...generateOntologyMetadataRoutes(deps),
    ...generateKioskRoutes(deps),
  ];
}
