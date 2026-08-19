/**
 * Pipeline Data Ops — Pipeline & Data Ops REST routes.
 *
 *   Datasets
 *     GET  /api/v1/datasets/:name/export         — export with projection/paging
 *
 *   Batch transforms
 *     POST /api/v1/transforms                    — create
 *     GET  /api/v1/transforms                    — list
 *     GET  /api/v1/transforms/:id                — get
 *     POST /api/v1/transforms/:id/run            — run
 *
 *   Interactive SQL
 *     POST /api/v1/sql/query                     — submit SQL
 *     POST /api/v1/sql/explain                   — explain SQL
 *     POST /api/v1/sql/validate                  — validate SQL
 *     POST /api/v1/sql/saved                     — save query
 *     GET  /api/v1/sql/saved                     — list saved
 *     GET  /api/v1/sql/saved/:id                 — get saved
 *     POST /api/v1/sql/saved/:id/execute         — execute saved
 *
 *   No-code pipelines
 *     GET  /api/v1/pipelines                     — list
 *     POST /api/v1/pipelines                     — create
 *     GET  /api/v1/pipelines/:id                 — get
 *     POST /api/v1/pipelines/:id/run             — run
 *     GET  /api/v1/pipelines/:id/runs            — list runs
 *
 *   Data expectations
 *     GET  /api/v1/expectations                  — list
 *     POST /api/v1/expectations                  — create
 *     POST /api/v1/expectations/:id/run          — run
 *
 *   Rules engine
 *     GET  /api/v1/rules                         — list
 *     POST /api/v1/rules                         — create
 *     POST /api/v1/rules/:id/run                 — execute
 *
 *   Variable transforms
 *     GET  /api/v1/variables/transforms          — list pipelines
 *     POST /api/v1/variables/transform           — apply pipeline
 *
 *   SQL analytics
 *     POST /api/v1/sql/analytics                 — ad-hoc analytics
 *
 *   CDC sync
 *     POST /api/v1/sync/cdc                      — start sync
 *     GET  /api/v1/sync/cdc/:id/commits          — list commits
 *     POST /api/v1/sync/cdc/:id/apply            — apply commits
 *
 *   Datasource mapping
 *     GET  /api/v1/datasources                   — list
 *     POST /api/v1/datasources                   — create
 *     POST /api/v1/datasources/:id/map           — set mappings
 *     POST /api/v1/datasources/:id/sync          — sync
 *
 *   Builds
 *     GET  /api/v1/builds                        — list builds
 *     POST /api/v1/builds                        — start build
 *     POST /api/v1/builds/:id/run                — retry build
 *
 *   Build triggers
 *     POST /api/v1/build-triggers                — register action trigger
 *     GET  /api/v1/build-triggers                — list
 *     POST /api/v1/build-triggers/:id/trigger    — trigger by action
 */

import type { ApiDependencies } from '../graphql/types.js';
import type { RestResponse, RestRoute } from './types.js';
import { createRestErrorResponse, wrapErrorToRest } from './errors.js';

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => escape(r[c])).join(','))].join('\n');
}

function rowsToNdjson(rows: Record<string, unknown>[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
}

export function generatePipelineDataOpsRoutes(deps: ApiDependencies): RestRoute[] {
  const routes: RestRoute[] = [];

  // ── Dataset export ───────────────────────────────────────────────────────
  if (deps.datasetService && deps.datasetMetadataService) {
    const svc = deps.datasetService;
    routes.push({
      method: 'GET',
      pattern: '/api/v1/datasets/:name/export',
      readOperation: 'query',
      handler: async (req, ctx): Promise<RestResponse> => {
        try {
          const name = req.params['name'] ?? '';
          const branch = typeof req.query['branch'] === 'string' ? req.query['branch'] : undefined;
          const ds = await svc.get(ctx.requestContext, name, branch);
          if (!ds) return { status: 404, body: { error: 'NOT_FOUND', message: 'Dataset not found' } };

          const options: { columns?: string[]; limit?: number; offset?: number; filter?: Record<string, unknown>; orderBy?: { field: string; direction: 'asc' | 'desc' }[]; asOfTransactionId?: string; asOfSchemaVersion?: number } = {};
          if (typeof req.query['limit'] === 'string') options.limit = parseInt(req.query['limit'], 10);
          if (typeof req.query['offset'] === 'string') options.offset = parseInt(req.query['offset'], 10);
          if (typeof req.query['asOfTransactionId'] === 'string') options.asOfTransactionId = req.query['asOfTransactionId'];
          if (typeof req.query['asOfSchemaVersion'] === 'string') {
            const v = parseInt(req.query['asOfSchemaVersion'], 10);
            if (isNaN(v)) return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'asOfSchemaVersion must be an integer', retryable: false, traceId: ctx.requestContext.traceId });
            options.asOfSchemaVersion = v;
          }

          const schemaColumns = new Set(ds.schema.columns.map(c => c.name));
          if (typeof req.query['columns'] === 'string' && req.query['columns'].length > 0) {
            const cols = req.query['columns'].split(',').map(c => c.trim()).filter(Boolean);
            const unknown = cols.filter(c => !schemaColumns.has(c));
            if (unknown.length > 0) return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `Unknown column(s): ${unknown.join(', ')}`, retryable: false, traceId: ctx.requestContext.traceId });
            options.columns = cols;
          }

          if (typeof req.query['filter'] === 'string' && req.query['filter'].length > 0) {
            try { options.filter = JSON.parse(req.query['filter']) as Record<string, unknown>; } catch {
              return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'filter must be JSON', retryable: false, traceId: ctx.requestContext.traceId });
            }
          }

          if (typeof req.query['orderBy'] === 'string' && req.query['orderBy'].length > 0) {
            const parsed: { field: string; direction: 'asc' | 'desc' }[] = [];
            for (const part of req.query['orderBy'].split(',')) {
              const [field, dir] = part.split(':').map(t => t.trim());
              if (!field) continue;
              if (!schemaColumns.has(field)) return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: `Unknown orderBy column: ${field}`, retryable: false, traceId: ctx.requestContext.traceId });
              if (dir && dir !== 'asc' && dir !== 'desc') return createRestErrorResponse({ code: 'VALIDATION_ERROR', category: 'validation', message: 'orderBy direction must be asc or desc', retryable: false, traceId: ctx.requestContext.traceId });
              parsed.push({ field, direction: (dir as 'asc' | 'desc' | undefined) ?? 'asc' });
            }
            if (parsed.length > 0) options.orderBy = parsed;
          }

          const result = await svc.read(ctx.requestContext, name, options, branch);
          const format = (typeof req.query['format'] === 'string' ? req.query['format'] : 'ndjson').toLowerCase();
          const columns = options.columns ?? ds.schema.columns.map(c => c.name);

          if (format === 'csv') {
            return { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'X-Dataset-Transaction-Id': result.transactionId }, body: rowsToCsv(columns, result.rows) };
          }
          if (format === 'ndjson') {
            return { status: 200, headers: { 'Content-Type': 'application/x-ndjson', 'X-Dataset-Transaction-Id': result.transactionId }, body: rowsToNdjson(result.rows) };
          }
          if (format === 'arrow') {
            return { status: 200, headers: { 'Content-Type': 'application/vnd.apache.arrow.file', 'X-Dataset-Transaction-Id': result.transactionId }, body: JSON.stringify({ rows: result.rows, columns, transactionId: result.transactionId, note: 'Arrow placeholder; IPC not yet serialized' }) };
          }
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: { data: result } };
        } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
      },
    });
  }

  // ── Batch transforms ─────────────────────────────────────────────────────
  if (deps.batchTransformService) {
    const svc = deps.batchTransformService;
    routes.push({ method: 'POST', pattern: '/api/v1/transforms', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        const t = await svc.create(ctx.requestContext, {
          name: String(body['name']),
          description: typeof body['description'] === 'string' ? body['description'] : undefined,
          inputs: Array.isArray(body['inputs']) ? body['inputs'] as string[] : [],
          output: String(body['output'] ?? ''),
          kind: (body['kind'] as 'map' | 'filter' | 'reduce' | 'join' | 'custom') ?? 'map',
          source: typeof body['source'] === 'string' ? body['source'] : '',
          incremental: body['incremental'] === true,
        });
        return { status: 201, body: { data: t } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/transforms', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/transforms/:id', readOperation: 'read', handler: async (req, ctx) => {
      try {
        const t = await svc.get(ctx.requestContext, req.params['id'] ?? '');
        if (!t) return { status: 404, body: { error: 'NOT_FOUND', message: 'Transform not found' } };
        return { status: 200, body: { data: t } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/transforms/:id/run', handler: async (req, ctx) => {
      try {
        const build = await svc.startBuild(ctx.requestContext, req.params['id'] ?? '', 'manual');
        return { status: 200, body: { data: build } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Interactive SQL ──────────────────────────────────────────────────────
  if (deps.sqlQueryService) {
    const svc = deps.sqlQueryService;
    routes.push({ method: 'POST', pattern: '/api/v1/sql/query', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const job = await svc.submit(ctx.requestContext, { sql: String(body['sql'] ?? ''), branch: typeof body['branch'] === 'string' ? body['branch'] : undefined, limit: typeof body['limit'] === 'number' ? body['limit'] : undefined });
        return { status: 202, body: { data: job } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/sql/jobs', readOperation: 'query', handler: async (req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext, typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/sql/jobs/:id', readOperation: 'read', handler: async (req, ctx) => {
      try {
        const job = await svc.get(ctx.requestContext, req.params['id'] ?? '');
        if (!job) return { status: 404, body: { error: 'NOT_FOUND', message: 'Job not found' } };
        return { status: 200, body: { data: job } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/sql/explain', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sql = String(body['sql'] ?? '');
        // In-memory SQL service has no explain; submit and inspect the job.
        const job = await svc.submit(ctx.requestContext, { sql, branch: typeof body['branch'] === 'string' ? body['branch'] : undefined });
        return { status: 200, body: { data: { sql, state: job.state, columns: job.resultColumns, rowCount: job.rowCount } } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/sql/validate', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const sql = String(body['sql'] ?? '');
        const job = await svc.submit(ctx.requestContext, { sql, branch: typeof body['branch'] === 'string' ? body['branch'] : undefined });
        return { status: 200, body: { data: { valid: job.state === 'succeeded', sql, state: job.state, error: job.errorMessage } } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // Saved SQL queries via OntologySqlService
  if (deps.ontologySqlService) {
    const svc = deps.ontologySqlService;
    routes.push({ method: 'POST', pattern: '/api/v1/sql/saved', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const q = await svc.createSavedQuery(ctx.requestContext, { name: String(body['name']), description: typeof body['description'] === 'string' ? body['description'] : undefined, sql: String(body['sql'] ?? '') });
        return { status: 201, body: { data: q } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/sql/saved', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.listSavedQueries(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/sql/saved/:id', readOperation: 'read', handler: async (req, ctx) => {
      try {
        const q = await svc.getSavedQuery(ctx.requestContext, req.params['id'] ?? '');
        if (!q) return { status: 404, body: { error: 'NOT_FOUND', message: 'Saved query not found' } };
        return { status: 200, body: { data: q } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/sql/saved/:id/execute', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await svc.executeSavedQuery(ctx.requestContext, req.params['id'] ?? '', { limit: typeof body['limit'] === 'number' ? body['limit'] : undefined });
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── No-code pipelines ────────────────────────────────────────────────────
  if (deps.pipelineService) {
    const svc = deps.pipelineService;
    routes.push({ method: 'POST', pattern: '/api/v1/pipelines', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        const p = await svc.create(ctx.requestContext, {
          name: String(body['name']),
          description: typeof body['description'] === 'string' ? body['description'] : undefined,
          nodes: Array.isArray(body['nodes']) ? body['nodes'] as { id?: string; type: 'source' | 'transform' | 'sink' | 'filter' | 'union'; config: Record<string, unknown>; inputs: string[]; name?: string }[] : [],
        });
        return { status: 201, body: { data: p } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/pipelines', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/pipelines/:id', readOperation: 'read', handler: async (req, ctx) => {
      try {
        const p = await svc.get(ctx.requestContext, req.params['id'] ?? '');
        if (!p) return { status: 404, body: { error: 'NOT_FOUND', message: 'Pipeline not found' } };
        return { status: 200, body: { data: p } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/pipelines/:id/run', handler: async (req, ctx) => {
      try {
        const run = await svc.run(ctx.requestContext, req.params['id'] ?? '');
        return { status: 200, body: { data: run } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/pipelines/:id/runs', readOperation: 'query', handler: async (req, ctx) => {
      try { return { status: 200, body: { data: await svc.listRuns(ctx.requestContext, req.params['id'] ?? '') } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Data expectations ────────────────────────────────────────────────────
  if (deps.dataExpectationsService) {
    const svc = deps.dataExpectationsService;
    routes.push({ method: 'POST', pattern: '/api/v1/expectations', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        const e = await svc.create(ctx.requestContext, {
          name: String(body['name']),
          description: typeof body['description'] === 'string' ? body['description'] : '',
          targetType: String(body['targetType'] ?? ''),
          field: typeof body['field'] === 'string' ? body['field'] : undefined,
          type: (body['type'] as 'not_null' | 'unique' | 'range' | 'regex' | 'enum' | 'schema' | 'row_count' | 'freshness' | 'custom') ?? 'not_null',
          params: typeof body['params'] === 'object' && body['params'] !== null ? body['params'] as Record<string, unknown> : {},
          blocking: body['blocking'] !== false,
          enabled: body['enabled'] !== false,
        });
        return { status: 201, body: { data: e } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/expectations', readOperation: 'query', handler: async (req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext, typeof req.query['targetType'] === 'string' ? req.query['targetType'] : undefined) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/expectations/:id/run', handler: async (req, ctx) => {
      try {
        const exp = await svc.get(ctx.requestContext, req.params['id'] ?? '');
        if (!exp) return { status: 404, body: { error: 'NOT_FOUND', message: 'Expectation not found' } };
        const body = (req.body ?? {}) as Record<string, unknown>;
        const data = Array.isArray(body['data']) ? body['data'] as Record<string, unknown>[] : [];
        const results = await svc.evaluate(ctx.requestContext, exp.targetType, data);
        return { status: 200, body: { data: results } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Rules engine ─────────────────────────────────────────────────────────
  if (deps.rulesEngineService) {
    const svc = deps.rulesEngineService;
    routes.push({ method: 'POST', pattern: '/api/v1/rules', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        const r = await svc.create(ctx.requestContext, {
          name: String(body['name']),
          description: typeof body['description'] === 'string' ? body['description'] : '',
          nodes: Array.isArray(body['nodes']) ? body['nodes'] as unknown[] : [],
        });
        return { status: 201, body: { data: r } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/rules', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/rules/:id/run', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const data = typeof body['data'] === 'object' && body['data'] !== null ? body['data'] as Record<string, Record<string, unknown>[]> : {};
        const result = await svc.execute(ctx.requestContext, req.params['id'] ?? '', data);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Variable transforms ──────────────────────────────────────────────────
  if (deps.variableTransformService) {
    const svc = deps.variableTransformService;
    routes.push({ method: 'GET', pattern: '/api/v1/variables/transforms', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/variables/transform', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = typeof body['pipeline'] === 'string' ? body['pipeline'] : '';
        const input = body['input'];
        const result = await svc.execute(ctx.requestContext, name, input);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── SQL analytics ────────────────────────────────────────────────────────
  if (deps.sqlAnalyticsService) {
    const svc = deps.sqlAnalyticsService;
    routes.push({ method: 'POST', pattern: '/api/v1/sql/analytics', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await svc.query(ctx.requestContext, String(body['sql'] ?? ''), typeof body['limit'] === 'number' ? body['limit'] : undefined);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── CDC sync ─────────────────────────────────────────────────────────────
  if (deps.syncCdcService) {
    const svc = deps.syncCdcService;
    routes.push({ method: 'POST', pattern: '/api/v1/sync/cdc', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const job = await svc.start(ctx.requestContext, String(body['sourceSystem'] ?? ''), String(body['objectType'] ?? ''));
        return { status: 201, body: { data: job } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/sync/cdc/:id/commits', readOperation: 'query', handler: async (req, ctx) => {
      try { return { status: 200, body: { data: await svc.listCommits(ctx.requestContext, req.params['id'] ?? '') } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/sync/cdc/:id/apply', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const commitIds = Array.isArray(body['commitIds']) ? body['commitIds'] as string[] : undefined;
        const result = await svc.apply(ctx.requestContext, req.params['id'] ?? '', commitIds);
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Datasource mapping ───────────────────────────────────────────────────
  if (deps.datasourceService) {
    const svc = deps.datasourceService;
    routes.push({ method: 'POST', pattern: '/api/v1/datasources', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!body['name']) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'name is required', retryable: false, traceId: ctx.requestContext.traceId });
        const ds = await svc.create(ctx.requestContext, {
          name: String(body['name']),
          connector: String(body['connector'] ?? ''),
          connection: typeof body['connection'] === 'object' && body['connection'] !== null ? body['connection'] as Record<string, unknown> : {},
          objectType: String(body['objectType'] ?? ''),
        });
        return { status: 201, body: { data: ds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'GET', pattern: '/api/v1/datasources', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/datasources/:id/map', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const mappings = Array.isArray(body['mappings']) ? body['mappings'] as { column: string; property: string; transform?: string }[] : [];
        const ds = await svc.map(ctx.requestContext, req.params['id'] ?? '', mappings);
        return { status: 200, body: { data: ds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/datasources/:id/sync', handler: async (req, ctx) => {
      try {
        const result = await svc.sync(ctx.requestContext, req.params['id'] ?? '');
        return { status: 200, body: { data: result } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Builds ───────────────────────────────────────────────────────────────
  if (deps.pipelineBuildService) {
    const svc = deps.pipelineBuildService;
    routes.push({ method: 'GET', pattern: '/api/v1/builds', readOperation: 'query', handler: async (req, ctx) => {
      try { return { status: 200, body: { data: await svc.listBuilds(ctx.requestContext, typeof req.query['pipelineName'] === 'string' ? req.query['pipelineName'] : undefined) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/builds', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const pipelineName = String(body['pipelineName'] ?? '');
        if (!pipelineName) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'pipelineName is required', retryable: false, traceId: ctx.requestContext.traceId });
        const build = await svc.startBuild(ctx.requestContext, pipelineName, (body['trigger'] as 'manual' | 'schedule' | 'event' | 'action' | 'upstream') ?? 'manual');
        return { status: 201, body: { data: build } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/builds/:id/run', handler: async (req, ctx) => {
      try {
        const build = await svc.retryBuild(ctx.requestContext, req.params['id'] ?? '');
        return { status: 200, body: { data: build } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  // ── Build triggers (action-triggered builds) ─────────────────────────────
  if (deps.buildTriggerService) {
    const svc = deps.buildTriggerService;
    routes.push({ method: 'GET', pattern: '/api/v1/build-triggers', readOperation: 'query', handler: async (_req, ctx) => {
      try { return { status: 200, body: { data: await svc.list(ctx.requestContext) } }; } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/build-triggers', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const actionName = String(body['actionName'] ?? '');
        const pipelineName = String(body['pipelineName'] ?? '');
        if (!actionName || !pipelineName) return createRestErrorResponse({ code: 'MISSING_PARAMETER', category: 'validation', message: 'actionName and pipelineName are required', retryable: false, traceId: ctx.requestContext.traceId });
        const cfg = await svc.create(ctx.requestContext, actionName, pipelineName);
        return { status: 201, body: { data: cfg } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
    routes.push({ method: 'POST', pattern: '/api/v1/build-triggers/:id/trigger', handler: async (req, ctx) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const builds = await svc.trigger(ctx.requestContext, String(body['actionName'] ?? req.params['id'] ?? ''));
        return { status: 200, body: { data: builds } };
      } catch (err) { return wrapErrorToRest(err, ctx.requestContext.traceId); }
    } });
  }

  return routes;
}
