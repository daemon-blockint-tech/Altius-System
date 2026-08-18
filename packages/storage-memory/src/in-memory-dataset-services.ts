/**
 * In-memory batch transforms, projections, metadata, SQL, SDK, and variable
 * transformations.
 */

import { randomUUID } from 'node:crypto';
import type {
  BatchTransformService,
  BatchTransform,
  TransformBuild,
  CreateTransformInput,
  TransformExecutor,
  DatasetProjectionService,
  DatasetProjection,
  CreateProjectionInput,
  DatasetMetadataService,
  DatasetMetadata,
  SchemaRetrievalOptions,
  DatasetSchema,
  DatasetTransaction,
  SqlQueryService,
  SqlQueryJob,
  SubmitSqlInput,
  TabularSdk,
  TabularReadBuilder,
  TabularWriteBuilder,
  ReadOptions,
  ReadResult,
  WriteResult,
  VariableTransformService,
  TransformPipeline,
  TransformStep,
  CreateTransformPipelineInput,
  RequestContext,
} from '@altius/spi';
import type { InMemoryDatasetService } from './in-memory-datasets.js';

// ===========================================================================
// Batch transforms
// ===========================================================================

export class InMemoryBatchTransformService implements BatchTransformService {
  private readonly transforms = new Map<string, Map<string, BatchTransform>>();
  private readonly builds = new Map<string, Map<string, TransformBuild>>();
  private readonly executors = new Map<string, Map<string, TransformExecutor>>();
  private readonly schedules = new Map<string, Map<string, { id: string; transformName: string; cronExpression: string; enabled: boolean }>>();

  constructor(private readonly datasets: InMemoryDatasetService) {}

  async create(ctx: RequestContext, input: CreateTransformInput): Promise<BatchTransform> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const t: BatchTransform = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      inputs: input.inputs, output: input.output,
      kind: input.kind, source: input.source,
      incremental: input.incremental ?? false,
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getMap(ctx.tenantId).set(input.name, t);
    return t;
  }

  async get(ctx: RequestContext, name: string): Promise<BatchTransform | null> {
    return this.transforms.get(ctx.tenantId)?.get(name) ?? null;
  }

  async list(ctx: RequestContext): Promise<BatchTransform[]> {
    const m = this.transforms.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async update(ctx: RequestContext, name: string, updates: Partial<CreateTransformInput>): Promise<BatchTransform> {
    const t = this.transforms.get(ctx.tenantId)?.get(name);
    if (!t) throw new Error(`Transform not found: ${name}`);
    const updated: BatchTransform = {
      ...t,
      name: updates.name ?? t.name,
      description: updates.description ?? t.description,
      inputs: updates.inputs ?? t.inputs,
      output: updates.output ?? t.output,
      kind: updates.kind ?? t.kind,
      source: updates.source ?? t.source,
      incremental: updates.incremental ?? t.incremental,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(name, updated);
    return updated;
  }

  async delete(ctx: RequestContext, name: string): Promise<void> {
    this.transforms.get(ctx.tenantId)?.delete(name);
    this.executors.get(ctx.tenantId)?.delete(name);
  }

  async registerExecutor(ctx: RequestContext, name: string, executor: TransformExecutor): Promise<void> {
    let m = this.executors.get(ctx.tenantId);
    if (!m) { m = new Map(); this.executors.set(ctx.tenantId, m); }
    m.set(name, executor);
  }

  async startBuild(ctx: RequestContext, name: string, trigger: TransformBuild['trigger']): Promise<TransformBuild> {
    const t = this.transforms.get(ctx.tenantId)?.get(name);
    if (!t) throw new Error(`Transform not found: ${name}`);
    const id = randomUUID();
    const now = new Date().toISOString();
    const build: TransformBuild = {
      id, tenantId: ctx.tenantId,
      transformId: t.id, transformName: name,
      state: 'running', trigger,
      startedAt: now, triggeredBy: ctx.actorId ?? 'system',
      rowsRead: 0, rowsWritten: 0,
      incremental: t.incremental,
    };
    this.getBuildMap(ctx.tenantId).set(id, build);
    // Execute: read inputs, apply transform, write output
    const inputs: Record<string, unknown>[][] = [];
    for (const inputName of t.inputs) {
      const result = await this.datasets.read(ctx, inputName);
      inputs.push(result.rows);
    }
    let outputRows: Record<string, unknown>[] = [];
    const executor = this.executors.get(ctx.tenantId)?.get(name);
    if (executor) {
      outputRows = executor.execute(inputs);
    } else {
      // Default: pass-through first input (map) or merge all (join)
      if (t.kind === 'join') {
        outputRows = inputs.length > 0 ? inputs[0]! : [];
        for (let i = 1; i < inputs.length; i++) {
          outputRows = [...outputRows, ...inputs[i]!];
        }
      } else {
        outputRows = inputs.length > 0 ? inputs[0]! : [];
      }
    }
    // Write to output dataset
    const writeResult = await this.datasets.insert(ctx, t.output, { rows: outputRows, upsert: true });
    const completed: TransformBuild = {
      ...build,
      state: 'succeeded',
      endedAt: new Date().toISOString(),
      durationMs: 100,
      rowsRead: inputs.reduce((s, r) => s + r.length, 0),
      rowsWritten: writeResult.rowsWritten,
    };
    this.getBuildMap(ctx.tenantId).set(id, completed);
    // Update transform's last build
    const updated = { ...t, lastBuildState: 'succeeded' as const, lastBuildId: id };
    this.getMap(ctx.tenantId).set(name, updated);
    return completed;
  }

  async getBuild(ctx: RequestContext, buildId: string): Promise<TransformBuild | null> {
    return this.builds.get(ctx.tenantId)?.get(buildId) ?? null;
  }

  async listBuilds(ctx: RequestContext, name: string, limit = 100): Promise<TransformBuild[]> {
    const m = this.builds.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(b => b.transformName === name).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async abortBuild(ctx: RequestContext, buildId: string): Promise<void> {
    const b = this.builds.get(ctx.tenantId)?.get(buildId);
    if (b) this.getBuildMap(ctx.tenantId).set(buildId, { ...b, state: 'aborted', endedAt: new Date().toISOString() });
  }

  async schedule(ctx: RequestContext, name: string, cronExpression: string): Promise<{ scheduleId: string }> {
    const id = randomUUID();
    const m = this.getSchedMap(ctx.tenantId);
    m.set(id, { id, transformName: name, cronExpression, enabled: true });
    return { scheduleId: id };
  }

  async listSchedules(ctx: RequestContext): Promise<Array<{ id: string; transformName: string; cronExpression: string; enabled: boolean }>> {
    const m = this.schedules.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void> {
    this.schedules.get(ctx.tenantId)?.delete(scheduleId);
  }

  private getMap(tenantId: string): Map<string, BatchTransform> {
    let m = this.transforms.get(tenantId);
    if (!m) { m = new Map(); this.transforms.set(tenantId, m); }
    return m;
  }
  private getBuildMap(tenantId: string): Map<string, TransformBuild> {
    let m = this.builds.get(tenantId);
    if (!m) { m = new Map(); this.builds.set(tenantId, m); }
    return m;
  }
  private getSchedMap(tenantId: string): Map<string, { id: string; transformName: string; cronExpression: string; enabled: boolean }> {
    let m = this.schedules.get(tenantId);
    if (!m) { m = new Map(); this.schedules.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Projections
// ===========================================================================

export class InMemoryDatasetProjectionService implements DatasetProjectionService {
  private readonly projections = new Map<string, Map<string, DatasetProjection>>();

  constructor(private readonly datasets: InMemoryDatasetService) {}

  async create(ctx: RequestContext, input: CreateProjectionInput): Promise<DatasetProjection> {
    const id = randomUUID();
    const p: DatasetProjection = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      source: input.source, filter: input.filter, columns: input.columns,
      join: input.join, aggregation: input.aggregation,
      branch: 'main', materialized: input.materialized ?? false,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getMap(ctx.tenantId).set(input.name, p);
    if (p.materialized) await this.refresh(ctx, input.name);
    return p;
  }

  async get(ctx: RequestContext, name: string): Promise<DatasetProjection | null> {
    return this.projections.get(ctx.tenantId)?.get(name) ?? null;
  }

  async list(ctx: RequestContext): Promise<DatasetProjection[]> {
    const m = this.projections.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async update(ctx: RequestContext, name: string, updates: Partial<CreateProjectionInput>): Promise<DatasetProjection> {
    const p = this.projections.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Projection not found: ${name}`);
    const updated: DatasetProjection = {
      ...p,
      description: updates.description ?? p.description,
      filter: updates.filter ?? p.filter,
      columns: updates.columns ?? p.columns,
      join: updates.join ?? p.join,
      aggregation: updates.aggregation ?? p.aggregation,
      materialized: updates.materialized ?? p.materialized,
    };
    this.getMap(ctx.tenantId).set(name, updated);
    return updated;
  }

  async delete(ctx: RequestContext, name: string): Promise<void> {
    this.projections.get(ctx.tenantId)?.delete(name);
  }

  async refresh(ctx: RequestContext, name: string): Promise<{ rowsMaterialized: number; refreshedAt: string }> {
    const p = this.projections.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Projection not found: ${name}`);
    const result = await this.read(ctx, name);
    const now = new Date().toISOString();
    const updated = { ...p, lastRefreshedAt: now, rowCount: result.rows.length };
    this.getMap(ctx.tenantId).set(name, updated);
    return { rowsMaterialized: result.rows.length, refreshedAt: now };
  }

  async read(ctx: RequestContext, name: string, options?: ReadOptions): Promise<ReadResult> {
    const p = this.projections.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Projection not found: ${name}`);
    // Read source
    let result = await this.datasets.read(ctx, p.source, { filter: p.filter, columns: p.columns }, p.branch);
    let rows = result.rows;
    // Apply join
    if (p.join) {
      const rightResult = await this.datasets.read(ctx, p.join.dataset, undefined, p.branch);
      const rightMap = new Map<string, Record<string, unknown>>();
      for (const r of rightResult.rows) rightMap.set(String(r[p.join.rightKey]), r);
      const joined: Record<string, unknown>[] = [];
      for (const l of rows) {
        const r = rightMap.get(String(l[p.join!.leftKey]));
        if (r) {
          joined.push({ ...l, ...r });
        } else if (p.join.kind === 'left' || p.join.kind === 'outer') {
          joined.push(l);
        }
      }
      if (p.join.kind === 'right' || p.join.kind === 'outer') {
        const leftKeys = new Set(rows.map(l => String(l[p.join!.leftKey])));
        for (const r of rightResult.rows) {
          if (!leftKeys.has(String(r[p.join!.rightKey]))) joined.push(r);
        }
      }
      rows = joined;
    }
    // Apply aggregation
    if (p.aggregation) {
      const groups = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const key = p.aggregation.groupBy.map(g => String(row[g] ?? '')).join('\u0000');
        if (!groups.has(key)) {
          const g: Record<string, unknown> = {};
          for (const col of p.aggregation.groupBy) g[col] = row[col];
          for (const m of p.aggregation.measures) g[`${m.fn}_${m.field}`] = [];
          groups.set(key, g);
        }
        const g = groups.get(key)!;
        for (const m of p.aggregation.measures) {
          const arr = g[`${m.fn}_${m.field}`] as unknown[];
          arr.push(row[m.field]);
        }
      }
      const aggregated: Record<string, unknown>[] = [];
      for (const g of groups.values()) {
        const out: Record<string, unknown> = {};
        for (const col of p.aggregation.groupBy) out[col] = g[col];
        for (const m of p.aggregation.measures) {
          const arr = g[`${m.fn}_${m.field}`] as unknown[];
          switch (m.fn) {
            case 'count': out[`${m.fn}_${m.field}`] = arr.length; break;
            case 'sum': out[`${m.fn}_${m.field}`] = (arr as number[]).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0); break;
            case 'avg': out[`${m.fn}_${m.field}`] = arr.length > 0 ? (arr as number[]).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) / arr.length : 0; break;
            case 'min': out[`${m.fn}_${m.field}`] = (arr as unknown[]).reduce<number>((s, v) => s === undefined || (typeof v === 'number' && v < s) ? v as number : s, undefined as unknown as number); break;
            case 'max': out[`${m.fn}_${m.field}`] = (arr as unknown[]).reduce<number>((s, v) => s === undefined || (typeof v === 'number' && v > s) ? v as number : s, undefined as unknown as number); break;
          }
        }
        aggregated.push(out);
      }
      rows = aggregated;
    }
    // Apply read options (limit/offset/orderBy on top of projection)
    if (options?.orderBy) {
      const sorted = [...rows];
      for (const { field, direction } of [...options.orderBy].reverse()) {
        sorted.sort((a, b) => {
          const av = a[field], bv = b[field];
          if (av === bv) return 0;
          if (typeof av === 'number' && typeof bv === 'number') return direction === 'asc' ? av - bv : bv - av;
          return direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
      }
      rows = sorted;
    }
    const total = rows.length;
    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
    return { rows, total, transactionId: result.transactionId };
  }

  private getMap(tenantId: string): Map<string, DatasetProjection> {
    let m = this.projections.get(tenantId);
    if (!m) { m = new Map(); this.projections.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Dataset metadata
// ===========================================================================

export class InMemoryDatasetMetadataService implements DatasetMetadataService {
  constructor(private readonly datasets: InMemoryDatasetService) {}

  async list(ctx: RequestContext, branch?: string): Promise<DatasetMetadata[]> {
    const ds = await this.datasets.list(ctx);
    const out: DatasetMetadata[] = [];
    for (const d of ds) {
      const meta = await this.toMetadata(ctx, d, branch ?? d.branch);
      out.push(meta);
    }
    return out;
  }

  async get(ctx: RequestContext, name: string, branch?: string): Promise<DatasetMetadata | null> {
    const d = await this.datasets.get(ctx, name, branch);
    if (!d) return null;
    return this.toMetadata(ctx, d, branch ?? d.branch);
  }

  async getSchema(ctx: RequestContext, name: string, options?: SchemaRetrievalOptions): Promise<DatasetSchema | null> {
    const d = await this.datasets.get(ctx, name, options?.branch);
    if (!d) return null;
    // For historical schema version, look up via transactions
    if (options?.version !== undefined && options.version !== d.schema.version) {
      const txs = await this.datasets.listTransactions(ctx, name, options.branch);
      // Find the schema_change transaction with the requested version
      const schemaTx = txs.find(t => t.type === 'schema_change' && t.schemaVersion === options.version);
      if (schemaTx) {
        // We don't store historical schemas in the in-memory impl; return current with version override
        return { ...d.schema, version: options.version };
      }
      return null;
    }
    return d.schema;
  }

  async listBranches(ctx: RequestContext, name: string): Promise<string[]> {
    const branches = await this.datasets.listBranches(ctx, name);
    return branches.map(b => b.name);
  }

  async listTransactions(ctx: RequestContext, name: string, branch?: string, limit?: number): Promise<DatasetTransaction[]> {
    return this.datasets.listTransactions(ctx, name, branch, limit);
  }

  private async toMetadata(ctx: RequestContext, d: { id: string; name: string; description: string; schema: DatasetSchema; branch: string; latestTransactionId: string; createdAt: string; updatedAt: string; createdBy: string }, branch: string): Promise<DatasetMetadata> {
    const fullRead = await this.datasets.read(ctx, d.name, undefined, branch);
    return {
      id: d.id, name: d.name, description: d.description, schema: d.schema,
      branch, latestTransactionId: d.latestTransactionId,
      rowCount: fullRead.total ?? 0,
      createdAt: d.createdAt, updatedAt: d.updatedAt, createdBy: d.createdBy,
    };
  }
}

// ===========================================================================
// SQL query service
// ===========================================================================

interface SqlAst {
  columns: string[] | '*';
  from: string;
  alias?: string;
  where?: Array<{ field: string; op: string; value: unknown }>;
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  join?: { table: string; leftKey: string; rightKey: string; kind: 'inner' | 'left' | 'right' | 'outer' };
}

function parseSql(sql: string): SqlAst {
  const s = sql.trim().replace(/;$/, '');
  const upper = s.toUpperCase();
  if (!upper.startsWith('SELECT')) throw new Error('Only SELECT statements supported');
  const fromIdx = upper.indexOf(' FROM ');
  if (fromIdx < 0) throw new Error('Missing FROM clause');
  const colsPart = s.slice(6, fromIdx).trim();
  const columns = colsPart === '*' ? '*' : colsPart.split(',').map(c => c.trim());
  // FROM ... [JOIN ... ON ...] [WHERE ...] [ORDER BY ...] [LIMIT n]
  const rest = s.slice(fromIdx + 6);
  // Extract LIMIT
  let limit: number | undefined;
  const limitMatch = rest.match(/\s+LIMIT\s+(\d+)\s*$/i);
  let restNoLimit = rest;
  if (limitMatch) {
    limit = parseInt(limitMatch[1]!, 10);
    restNoLimit = rest.slice(0, limitMatch.index);
  }
  // Extract ORDER BY
  let orderBy: Array<{ field: string; direction: 'asc' | 'desc' }> | undefined;
  const orderMatch = restNoLimit.match(/\s+ORDER\s+BY\s+(.+)$/i);
  let restNoOrder = restNoLimit;
  if (orderMatch) {
    restNoOrder = restNoLimit.slice(0, orderMatch.index);
    orderBy = orderMatch[1]!.split(',').map(p => {
      const [field, dir] = p.trim().split(/\s+/);
      return { field: field!, direction: (dir?.toUpperCase() === 'DESC' ? 'desc' : 'asc') as 'asc' | 'desc' };
    });
  }
  // Extract WHERE
  let where: Array<{ field: string; op: string; value: unknown }> | undefined;
  const whereMatch = restNoOrder.match(/\s+WHERE\s+(.+)$/i);
  let restNoWhere = restNoOrder;
  if (whereMatch) {
    restNoWhere = restNoOrder.slice(0, whereMatch.index);
    where = whereMatch[1]!.split(/\s+AND\s+/i).map(cond => {
      const m = cond.match(/^(\w+)\s*(=|!=|<>|<=|>=|<|>)\s*(.+)$/);
      if (!m) throw new Error(`Unsupported WHERE condition: ${cond}`);
      const field = m[1]!;
      const op = m[2] === '=' ? 'eq' : m[2] === '!=' || m[2] === '<>' ? 'neq' : m[2] === '<' ? 'lt' : m[2] === '>' ? 'gt' : m[2] === '<=' ? 'lte' : 'gte';
      let value: unknown = m[3]!;
      value = (value as string).replace(/^['"]|['"]$/g, '');
      if (/^-?\d+(\.\d+)?$/.test(value as string)) value = Number(value);
      return { field, op, value };
    });
  }
  // Extract JOIN
  let join: SqlAst['join'] | undefined;
  let from = restNoWhere.trim();
  const joinMatch = from.match(/^(.+?)\s+(INNER|LEFT|RIGHT|OUTER)?\s*JOIN\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)$/i);
  if (joinMatch) {
    from = joinMatch[1]!.trim();
    const kindRaw = (joinMatch[2] ?? 'INNER').toUpperCase();
    const kind = (kindRaw === 'LEFT' ? 'left' : kindRaw === 'RIGHT' ? 'right' : kindRaw === 'OUTER' ? 'outer' : 'inner') as 'inner' | 'left' | 'right' | 'outer';
    join = { table: joinMatch[3]!, leftKey: joinMatch[5]!, rightKey: joinMatch[7]!, kind };
  }
  // FROM may have alias: "dataset a" or "dataset AS a"
  const fromParts = from.split(/\s+(?:AS\s+)?/i);
  return {
    columns: columns as string[] | '*',
    from: fromParts[0]!,
    alias: fromParts[1],
    where, orderBy, limit, join,
  };
}

export class InMemorySqlQueryService implements SqlQueryService {
  private readonly jobs = new Map<string, Map<string, SqlQueryJob>>();

  constructor(private readonly datasets: InMemoryDatasetService) {}

  async submit(ctx: RequestContext, input: SubmitSqlInput): Promise<SqlQueryJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: SqlQueryJob = {
      id, tenantId: ctx.tenantId,
      sql: input.sql, state: 'queued',
      submittedAt: now, submittedBy: ctx.actorId ?? 'system',
    };
    this.getMap(ctx.tenantId).set(id, job);
    // Execute synchronously (in-memory)
    const running: SqlQueryJob = { ...job, state: 'running', startedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(id, running);
    try {
      const ast = parseSql(input.sql);
      const readOpts: ReadOptions = {};
      if (ast.where) {
        const filter: Record<string, unknown> = {};
        for (const w of ast.where) filter[w.field] = { [w.op]: w.value };
        readOpts.filter = filter;
      }
      if (ast.orderBy) readOpts.orderBy = ast.orderBy;
      if (ast.limit !== undefined) readOpts.limit = ast.limit;
      else if (input.limit !== undefined) readOpts.limit = input.limit;
      if (ast.columns !== '*') readOpts.columns = ast.columns;
      let result = await this.datasets.read(ctx, ast.from, readOpts, input.branch);
      let rows = result.rows;
      if (ast.join) {
        const rightResult = await this.datasets.read(ctx, ast.join.table, undefined, input.branch);
        const rightMap = new Map<string, Record<string, unknown>>();
        for (const r of rightResult.rows) rightMap.set(String(r[ast.join.rightKey]), r);
        const joined: Record<string, unknown>[] = [];
        for (const l of rows) {
          const r = rightMap.get(String(l[ast.join.leftKey]));
          if (r) joined.push({ ...l, ...r });
          else if (ast.join.kind === 'left' || ast.join.kind === 'outer') joined.push(l);
        }
        if (ast.join.kind === 'right' || ast.join.kind === 'outer') {
          const leftKeys = new Set(rows.map(l => String(l[ast.join!.leftKey])));
          for (const r of rightResult.rows) {
            if (!leftKeys.has(String(r[ast.join!.rightKey]))) joined.push(r);
          }
        }
        rows = joined;
      }
      const resultColumns = ast.columns === '*' ? (rows[0] ? Object.keys(rows[0]!) : []) : ast.columns;
      const completed: SqlQueryJob = {
        ...running, state: 'succeeded',
        completedAt: new Date().toISOString(),
        durationMs: 100,
        rows, resultColumns,
        rowCount: rows.length,
      };
      this.getMap(ctx.tenantId).set(id, completed);
      return completed;
    } catch (err) {
      const failed: SqlQueryJob = {
        ...running, state: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : 'SQL execution failed',
      };
      this.getMap(ctx.tenantId).set(id, failed);
      return failed;
    }
  }

  async get(ctx: RequestContext, jobId: string): Promise<SqlQueryJob | null> {
    return this.jobs.get(ctx.tenantId)?.get(jobId) ?? null;
  }

  async list(ctx: RequestContext, limit = 100): Promise<SqlQueryJob[]> {
    const m = this.jobs.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, limit);
  }

  async cancel(ctx: RequestContext, jobId: string): Promise<void> {
    const j = this.jobs.get(ctx.tenantId)?.get(jobId);
    if (j && (j.state === 'queued' || j.state === 'running')) {
      this.getMap(ctx.tenantId).set(jobId, { ...j, state: 'cancelled', completedAt: new Date().toISOString() });
    }
  }

  async results(ctx: RequestContext, jobId: string, limit?: number): Promise<Record<string, unknown>[]> {
    const j = this.jobs.get(ctx.tenantId)?.get(jobId);
    if (!j || j.state !== 'succeeded' || !j.rows) return [];
    return limit !== undefined ? j.rows.slice(0, limit) : j.rows;
  }

  private getMap(tenantId: string): Map<string, SqlQueryJob> {
    let m = this.jobs.get(tenantId);
    if (!m) { m = new Map(); this.jobs.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Tabular SDK
// ===========================================================================

export class InMemoryTabularSdk implements TabularSdk {
  constructor(private readonly datasets: InMemoryDatasetService) {}

  read(ctx: RequestContext, dataset: string, branch?: string): TabularReadBuilder {
    return new InMemoryTabularReadBuilder(this.datasets, ctx, dataset, branch);
  }

  write(ctx: RequestContext, dataset: string, branch?: string): TabularWriteBuilder {
    return new InMemoryTabularWriteBuilder(this.datasets, ctx, dataset, branch);
  }

  inferSchema(rows: Record<string, unknown>[]): DatasetSchema {
    if (rows.length === 0) return { columns: [], version: 1 };
    const sample = rows[0]!;
    const columns: DatasetSchema['columns'] = [];
    for (const [name, value] of Object.entries(sample)) {
      let type: DatasetSchema['columns'][number]['type'] = 'string';
      if (typeof value === 'number') type = Number.isInteger(value) ? 'integer' : 'double';
      else if (typeof value === 'boolean') type = 'boolean';
      else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) type = 'timestamp';
      else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) type = 'date';
      else if (value === null) type = 'json';
      columns.push({ name, type, nullable: true });
    }
    return { columns, version: 1 };
  }

  parseCsv(content: string): Record<string, unknown>[] {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(',').map(h => h.trim());
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i]!.split(',').map(c => c.trim());
      const row: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        const v = cells[j] ?? '';
        if (/^-?\d+(\.\d+)?$/.test(v)) row[headers[j]!] = Number(v);
        else if (v === 'true' || v === 'false') row[headers[j]!] = v === 'true';
        else row[headers[j]!] = v;
      }
      rows.push(row);
    }
    return rows;
  }

  parseJson(content: string, format: 'json' | 'ndjson'): Record<string, unknown>[] {
    if (format === 'ndjson') {
      return content.trim().split(/\r?\n/).filter(l => l).map(l => JSON.parse(l));
    }
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
}

class InMemoryTabularReadBuilder implements TabularReadBuilder {
  private columns?: string[];
  private filters: Array<{ field: string; operator: string; value: unknown }> = [];
  private orderBys: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
  private limitN?: number;
  private offsetN?: number;
  private asOfTx?: string;

  constructor(
    private readonly datasets: InMemoryDatasetService,
    private readonly ctx: RequestContext,
    private readonly dataset: string,
    private readonly branch?: string,
  ) {}

  select(...columns: string[]): TabularReadBuilder { this.columns = columns; return this; }
  where(field: string, operator: string, value: unknown): TabularReadBuilder { this.filters.push({ field, operator, value }); return this; }
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): TabularReadBuilder { this.orderBys.push({ field, direction }); return this; }
  limit(n: number): TabularReadBuilder { this.limitN = n; return this; }
  offset(n: number): TabularReadBuilder { this.offsetN = n; return this; }
  asOf(transactionId: string): TabularReadBuilder { this.asOfTx = transactionId; return this; }

  async execute(): Promise<ReadResult> {
    const filter: Record<string, unknown> = {};
    for (const f of this.filters) filter[f.field] = { [f.operator]: f.value };
    return this.datasets.read(this.ctx, this.dataset, {
      columns: this.columns,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      orderBy: this.orderBys.length > 0 ? this.orderBys : undefined,
      limit: this.limitN,
      offset: this.offsetN,
      asOfTransactionId: this.asOfTx,
    }, this.branch);
  }
}

class InMemoryTabularWriteBuilder implements TabularWriteBuilder {
  private rows: Record<string, unknown>[] = [];
  private upsertEnabled = false;
  private msg?: string;

  constructor(
    private readonly datasets: InMemoryDatasetService,
    private readonly ctx: RequestContext,
    private readonly dataset: string,
    private readonly branch?: string,
  ) {}

  addRow(row: Record<string, unknown>): TabularWriteBuilder { this.rows.push(row); return this; }
  addRows(rows: Record<string, unknown>[]): TabularWriteBuilder { this.rows.push(...rows); return this; }
  upload(content: string, format: 'csv' | 'json' | 'ndjson'): TabularWriteBuilder {
    if (format === 'csv') this.rows.push(...new InMemoryTabularSdk(this.datasets).parseCsv(content));
    else this.rows.push(...new InMemoryTabularSdk(this.datasets).parseJson(content, format));
    return this;
  }
  upsert(enabled: boolean): TabularWriteBuilder { this.upsertEnabled = enabled; return this; }
  message(msg: string): TabularWriteBuilder { this.msg = msg; return this; }

  async execute(): Promise<WriteResult> {
    return this.datasets.insert(this.ctx, this.dataset, {
      rows: this.rows, upsert: this.upsertEnabled, message: this.msg,
    }, this.branch);
  }
}

// ===========================================================================
// Variable transforms
// ===========================================================================

function applyStep(step: TransformStep, input: unknown): unknown {
  const { kind, args } = step;
  const a = args as Record<string, unknown>;
  switch (kind) {
    // String operations
    case 'upper': return String(input).toUpperCase();
    case 'lower': return String(input).toLowerCase();
    case 'trim': return String(input).trim();
    case 'substring': {
      const s = String(input);
      const start = (a.start as number) ?? 0;
      const end = a.end as number | undefined;
      return end !== undefined ? s.slice(start, end) : s.slice(start);
    }
    case 'concat': return String(input) + String(a.suffix ?? '');
    case 'replace': return String(input).split(a.from as string).join(a.to as string);
    case 'split': return String(input).split(a.delimiter as string);
    case 'pad': {
      const len = a.length as number;
      const pad = a.pad as string ?? ' ';
      const s = String(input);
      return s.length >= len ? s : (a.side === 'left' ? pad.repeat(len - s.length) + s : s + pad.repeat(len - s.length));
    }
    // Math operations
    case 'add': return (input as number) + (a.value as number);
    case 'subtract': return (input as number) - (a.value as number);
    case 'multiply': return (input as number) * (a.value as number);
    case 'divide': return (input as number) / (a.value as number);
    case 'round': return Math.round(input as number);
    case 'abs': return Math.abs(input as number);
    case 'mod': return (input as number) % (a.value as number);
    case 'power': return Math.pow(input as number, a.value as number);
    // Date operations
    case 'formatDate': return new Date(input as string).toISOString();
    case 'parseDate': return new Date(input as string).getTime();
    case 'dateAdd': {
      const d = new Date(input as string);
      const n = a.amount as number;
      const unit = a.unit as string;
      if (unit === 'days') d.setDate(d.getDate() + n);
      else if (unit === 'hours') d.setHours(d.getHours() + n);
      else if (unit === 'minutes') d.setMinutes(d.getMinutes() + n);
      return d.toISOString();
    }
    case 'dateDiff': {
      const d1 = new Date(input as string).getTime();
      const d2 = new Date(a.other as string).getTime();
      const unit = a.unit as string;
      const ms = d1 - d2;
      if (unit === 'days') return ms / 86400000;
      if (unit === 'hours') return ms / 3600000;
      if (unit === 'minutes') return ms / 60000;
      return ms;
    }
    case 'extractDatePart': {
      const d = new Date(input as string);
      const part = a.part as string;
      if (part === 'year') return d.getFullYear();
      if (part === 'month') return d.getMonth() + 1;
      if (part === 'day') return d.getDate();
      if (part === 'hour') return d.getHours();
      if (part === 'minute') return d.getMinutes();
      return null;
    }
    // Array operations
    case 'arrayLength': return Array.isArray(input) ? input.length : 0;
    case 'arrayJoin': return Array.isArray(input) ? input.join(a.delimiter as string ?? ',') : '';
    case 'arrayMap': {
      if (!Array.isArray(input)) return [];
      const expr = a.expr as string;
      return input.map((v) => {
        if (expr === 'upper') return String(v).toUpperCase();
        if (expr === 'lower') return String(v).toLowerCase();
        if (expr === 'trim') return String(v).trim();
        return v;
      });
    }
    case 'arrayFilter': {
      if (!Array.isArray(input)) return [];
      const op = a.op as string;
      const val = a.value;
      return input.filter(v => {
        if (op === 'eq') return v === val;
        if (op === 'neq') return v !== val;
        if (op === 'gt') return (v as number) > (val as number);
        if (op === 'lt') return (v as number) < (val as number);
        return true;
      });
    }
    case 'arraySort': {
      if (!Array.isArray(input)) return [];
      const dir = a.direction as string ?? 'asc';
      return [...input].sort((x, y) => {
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return dir === 'asc' ? (x < y ? -1 : 1) : (x > y ? -1 : 1);
      });
    }
    // Object operations
    case 'getField': return (input as Record<string, unknown>)?.[a.field as string];
    case 'setField': return { ...(input as Record<string, unknown>), [a.field as string]: a.value };
    case 'pickFields': {
      const fields = a.fields as string[];
      const obj = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) if (f in obj) out[f] = obj[f];
      return out;
    }
    case 'omitFields': {
      const fields = new Set(a.fields as string[]);
      const obj = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) if (!fields.has(k)) out[k] = v;
      return out;
    }
    case 'mergeObjects': return { ...(input as Record<string, unknown>), ...(a.other as Record<string, unknown>) };
    // Type conversions
    case 'toString': return String(input);
    case 'toNumber': return Number(input);
    case 'toBoolean': return Boolean(input);
    case 'toDate': return new Date(input as string).toISOString();
    // Conditional
    case 'ifElse': return input ? a.then : a.else;
    case 'coalesce': return input !== null && input !== undefined ? input : a.value;
    case 'nullIf': return input === a.value ? null : input;
    default: return input;
  }
}

export class InMemoryVariableTransformService implements VariableTransformService {
  private readonly pipelines = new Map<string, Map<string, TransformPipeline>>();

  async create(ctx: RequestContext, input: CreateTransformPipelineInput): Promise<TransformPipeline> {
    const id = randomUUID();
    const p: TransformPipeline = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      steps: input.steps,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getMap(ctx.tenantId).set(input.name, p);
    return p;
  }

  async get(ctx: RequestContext, name: string): Promise<TransformPipeline | null> {
    return this.pipelines.get(ctx.tenantId)?.get(name) ?? null;
  }

  async list(ctx: RequestContext): Promise<TransformPipeline[]> {
    const m = this.pipelines.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async update(ctx: RequestContext, name: string, updates: Partial<CreateTransformPipelineInput>): Promise<TransformPipeline> {
    const p = this.pipelines.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Transform pipeline not found: ${name}`);
    const updated: TransformPipeline = {
      ...p,
      name: updates.name ?? p.name,
      description: updates.description ?? p.description,
      steps: updates.steps ?? p.steps,
    };
    this.getMap(ctx.tenantId).set(name, updated);
    return updated;
  }

  async delete(ctx: RequestContext, name: string): Promise<void> {
    this.pipelines.get(ctx.tenantId)?.delete(name);
  }

  async execute(ctx: RequestContext, name: string, input: unknown): Promise<unknown> {
    const p = this.pipelines.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Transform pipeline not found: ${name}`);
    return this.executeInline(ctx, p.steps, input);
  }

  async executeBatch(ctx: RequestContext, name: string, inputs: unknown[]): Promise<unknown[]> {
    const p = this.pipelines.get(ctx.tenantId)?.get(name);
    if (!p) throw new Error(`Transform pipeline not found: ${name}`);
    return inputs.map(i => p.steps.reduce((acc, step) => applyStep(step, acc), i));
  }

  async executeInline(_ctx: RequestContext, steps: TransformStep[], input: unknown): Promise<unknown> {
    return steps.reduce((acc, step) => applyStep(step, acc), input);
  }

  private getMap(tenantId: string): Map<string, TransformPipeline> {
    let m = this.pipelines.get(tenantId);
    if (!m) { m = new Map(); this.pipelines.set(tenantId, m); }
    return m;
  }
}
