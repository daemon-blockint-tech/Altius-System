/**
 * Ontology Schema REST routes — ontology & schema tooling.
 *
 *   POST /api/v1/actions/:name/form               — action form JSON-Schema config
 *   POST /api/v1/functions/:name/form             — function form JSON-Schema config
 *   GET  /api/v1/ontology/types/:type/property-types — rich property introspection
 *   POST /api/v1/ontology/validate-property       — validate a rich property value
 *   POST /api/v1/ontology/changes                 — save a new ontology change
 *   POST /api/v1/ontology/changes/:id/save        — update a saved ontology change
 *   POST /api/v1/ontology/changes/:id/validate    — validate a change
 *   POST /api/v1/ontology/changes/:id/apply       — apply a change
 *   GET  /api/v1/transform/functions              — list transform functions
 *   POST /api/v1/transform/evaluate               — evaluate a transform expression
 */

import type { ParsedSchema, FieldDefinition } from '@altius/odl';
import type { ApiDependencies } from '../graphql/types.js';
import type { RestResponse, RestRoute } from './types.js';
import { wrapErrorToRest } from './errors.js';

function isParamField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'param');
}

function isLinkField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'link');
}

function isComputedField(field: FieldDefinition): boolean {
  return field.directives.some(d => d.kind === 'computed' || d.kind === 'reducer' || d.kind === 'timeSeries');
}

function asDisplay(d: { kind: string } | undefined):
  | { label?: string; group?: string; order?: number; renderHint?: string; format?: string; hidden?: boolean }
  | undefined {
  return d?.kind === 'display' ? (d as { label?: string; group?: string; order?: number; renderHint?: string; format?: string; hidden?: boolean }) : undefined;
}

function asDefault(d: { kind: string } | undefined): { value?: unknown } | undefined {
  return d?.kind === 'default' ? (d as { value?: unknown }) : undefined;
}

function buildFormConfig(name: string, description: string | undefined, fields: FieldDefinition[], schema: ParsedSchema) {
  const formFields = fields
    .filter(f => isParamField(f) && !isLinkField(f) && !isComputedField(f))
    .map(f => {
      const display = asDisplay(f.directives.find(d => d.kind === 'display'));
      const defaultDir = asDefault(f.directives.find(d => d.kind === 'default'));
      const isReadOnly = f.directives.some(d => d.kind === 'readonly' || d.kind === 'immutable');
      const valueSource = buildValueSource(f.type.name, schema);
      const validation = buildValidationRules(f);
      return {
        name: f.name,
        type: f.type.name,
        required: f.type.nonNull,
        hidden: display?.hidden === true,
        readOnly: isReadOnly,
        label: display?.label ?? f.name,
        group: display?.group,
        order: display?.order,
        renderHint: display?.renderHint,
        format: display?.format,
        defaultValue: defaultDir?.value,
        validation,
        valueSource,
      };
    });

  formFields.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
    name,
    description,
    fields: formFields,
  };
}

function buildValueSource(typeName: string, schema: ParsedSchema) {
  const enumDef = schema.enums.find(e => e.name === typeName);
  if (enumDef) {
    return { kind: 'enum' as const, values: enumDef.values.map(v => v.name) };
  }
  const objectDef = schema.objectTypes.find(o => o.name === typeName);
  if (objectDef) {
    return { kind: 'query' as const, objectType: typeName };
  }
  if (typeName === 'Boolean') {
    return { kind: 'static' as const, values: [true, false] };
  }
  return undefined;
}

function buildValidationRules(field: FieldDefinition) {
  const rules = [];
  if (field.type.nonNull) {
    rules.push({ type: 'required' as const, message: `${field.name} is required` });
  }
  return rules;
}

function richKindFor(typeName: string, isList: boolean, schema: ParsedSchema): 'scalar' | 'struct' | 'array' | 'geoshape' | 'marking' | 'cipher' {
  if (isList) return 'array';
  if (typeName === 'GeoShape') return 'geoshape';
  if (typeName === 'Marking') return 'marking';
  if (typeName === 'Cipher') return 'cipher';
  if (schema.structTypes?.some(s => s.name === typeName)) return 'struct';
  return 'scalar';
}

function storageFor(kind: string): 'jsonb' | 'text' | 'scalar' {
  return kind === 'scalar' || kind === 'marking' ? 'text' : 'jsonb';
}

function validateRichValue(kind: string, value: unknown): string[] {
  const errors: string[] = [];
  switch (kind) {
    case 'geoshape':
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push('GeoShape must be an object');
      } else {
        const v = value as Record<string, unknown>;
        if (!v['type']) errors.push('GeoShape must have a type');
      }
      break;
    case 'marking':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) errors.push('Marking must be an array of strings');
      break;
    case 'cipher':
      if (typeof value !== 'string') errors.push('Cipher must be a string');
      break;
    case 'struct':
      if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push('Struct must be an object');
      break;
    case 'array':
      if (!Array.isArray(value)) errors.push('Array value must be a list');
      break;
    case 'scalar':
    default:
      if (value === null || value === undefined) errors.push('Scalar value is required');
      break;
  }
  return errors;
}

function findOntologyType(schema: ParsedSchema, typeName: string): { fields: FieldDefinition[] } | undefined {
  return schema.objectTypes.find(o => o.name === typeName) ?? schema.structTypes?.find(s => s.name === typeName);
}

// ─── Action/Function form config (must be registered before generic action routes) ───

export function generateOntologySchemaActionFormRoutes(schema: ParsedSchema, _deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];
  for (const action of schema.actionTypes) {
    routes.push({
      method: 'POST',
      pattern: `/api/v1/actions/${action.name}/form`,
      readOperation: 'query',
      handler: async (req, _ctx): Promise<RestResponse> => {
        try {
          const override = (req.body ?? {}) as Record<string, unknown>;
          const config = buildFormConfig(action.name, action.description, action.fields, schema);
          if (override['overrides'] && typeof override['overrides'] === 'object') {
            const overrides = override['overrides'] as Record<string, Partial<Record<string, unknown>>>;
            config.fields = config.fields.map(f => ({
              ...f,
              ...(overrides[f.name] ?? {}),
            })) as typeof config.fields;
          }
          return { status: 200, body: { data: config } };
        } catch (err) { return wrapErrorToRest(err, _ctx.requestContext.traceId); }
      },
    });
  }
  for (const fn of schema.functionTypes) {
    routes.push({
      method: 'POST',
      pattern: `/api/v1/functions/${fn.name}/form`,
      readOperation: 'query',
      handler: async (_req, _ctx): Promise<RestResponse> => {
        try {
          const config = buildFormConfig(fn.name, fn.description, fn.fields, schema);
          return { status: 200, body: { data: config } };
        } catch (err) { return wrapErrorToRest(err, _ctx.requestContext.traceId); }
      },
    });
  }
  return routes;
}

// ─── Platform routes ───

export function generateOntologySchemaPlatformRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // Rich property introspection
  routes.push({
    method: 'GET',
    pattern: '/api/v1/ontology/types/:type/property-types',
    readOperation: 'query',
    handler: async (req, ctx): Promise<RestResponse> => {
      try {
        const typeName = req.params['type'] ?? '';
        const obj = findOntologyType(ctx.deps.schema, typeName);
        if (!obj) {
          return { status: 404, body: { error: 'NOT_FOUND', message: `Ontology type not found: ${typeName}` } };
        }
        const properties = obj.fields
          .filter(f => !isLinkField(f) && !isComputedField(f))
          .map(f => {
            const kind = richKindFor(f.type.name, f.type.isList, ctx.deps.schema);
            return {
              name: f.name,
              kind,
              baseType: f.type.name,
              isList: f.type.isList,
              elementType: f.type.isList ? f.type.name : undefined,
              storage: storageFor(kind),
            };
          });
        return { status: 200, body: { data: { type: typeName, properties } } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // Rich property validation
  routes.push({
    method: 'POST',
    pattern: '/api/v1/ontology/validate-property',
    handler: async (req, ctx): Promise<RestResponse> => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const kind = typeof body['kind'] === 'string' ? body['kind'] : 'scalar';
        const value = body['value'];
        const errors = validateRichValue(kind, value);
        return { status: 200, body: { data: { valid: errors.length === 0, errors } } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    },
  });

  // Ontology change management
  const changeSvc = deps.ontologyChangeHistoryService;
  if (changeSvc) {
    routes.push({
      method: 'POST',
      pattern: '/api/v1/ontology/changes',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const record = await changeSvc.saveChange(ctx.requestContext, {
            migrationClass: typeof body['migrationClass'] === 'string' ? body['migrationClass'] : 'manual',
            diffSummary: typeof body['diffSummary'] === 'string' ? body['diffSummary'] : undefined,
            snapshot: typeof body['snapshot'] === 'object' && body['snapshot'] !== null ? body['snapshot'] as Record<string, unknown> : {},
          });
          return { status: 201, body: { data: record } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/ontology/changes/:id/save',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const id = req.params['id'] ?? '';
          const record = await changeSvc.getChange(ctx.requestContext, id);
          if (!record) return { status: 404, body: { error: 'NOT_FOUND', message: 'Change record not found' } };
          const body = (req.body ?? {}) as Record<string, unknown>;
          const updated: typeof record = {
            ...record,
            diffSummary: typeof body['diffSummary'] === 'string' ? body['diffSummary'] : record.diffSummary,
            snapshot: typeof body['snapshot'] === 'object' && body['snapshot'] !== null ? body['snapshot'] as Record<string, unknown> : record.snapshot,
          };
          await changeSvc.saveChange(ctx.requestContext, updated);
          return { status: 200, body: { data: updated } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/ontology/changes/:id/validate',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const result = await changeSvc.validateChange(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/ontology/changes/:id/apply',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const result = await changeSvc.applyChange(ctx.requestContext, req.params['id'] ?? '');
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // Transform expression library
  const transformSvc = deps.transformExpressionService;
  if (transformSvc) {
    routes.push({
      method: 'GET',
      pattern: '/api/v1/transform/functions',
      readOperation: 'query',
      handler: async (_req, _ctx): Promise<RestResponse> => {
        try {
          return { status: 200, body: { data: transformSvc.listFunctions() } };
        } catch (err) { return wrapErrorToRest(err, _ctx.requestContext.traceId); }
      },
    });

    routes.push({
      method: 'POST',
      pattern: '/api/v1/transform/evaluate',
      handler: async (req, _ctx): Promise<RestResponse> => {
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const input = {
            function: typeof body['function'] === 'string' ? body['function'] : '',
            inputType: typeof body['inputType'] === 'string' ? body['inputType'] : 'String',
            arguments: typeof body['arguments'] === 'object' && body['arguments'] !== null ? body['arguments'] as Record<string, unknown> : {},
          };
          const result = await transformSvc.evaluate(input);
          return { status: 200, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, _ctx.requestContext.traceId); }
      },
    });
  }

  return routes;
}
