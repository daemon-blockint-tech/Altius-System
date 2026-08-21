/**
 * In-memory batch transforms, projections, metadata, SQL, SDK, and variable
 * transformations.
 */

import { randomUUID } from 'node:crypto';
import { applyTransformStep } from '@altius/spi';
import { parseSql } from './sql-parser.js';
import { executeSqlQuery } from '@altius/spi';
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
    // Newest first, with insertion order breaking ties. `startedAt` alone is
    // not a total order: two builds started in the same millisecond compare
    // equal, the sort becomes a no-op for them, and the pair comes back
    // oldest-first — the opposite of what this method promises. The Postgres
    // provider orders by a sequence, so without this the two disagree.
    return Array.from(m.values())
      .filter(b => b.transformName === name)
      .map((b, i) => ({ b, i }))
      .sort((x, y) => y.b.startedAt.localeCompare(x.b.startedAt) || y.i - x.i)
      .map(e => e.b)
      .slice(0, limit);
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
    // For a historical schema version, reconstruct it from the transaction log.
    // schema_change entries carry both the schema they installed
    // (schemaSnapshot) and the one they replaced (previousSchemaSnapshot), so
    // every version that ever existed — including the one before the first
    // change — is recoverable without a separate schema history table.
    let wanted = options?.version;
    if (wanted === undefined && options?.asOfTransactionId) {
      const txs = await this.datasets.listTransactions(ctx, name, options.branch);
      const at = txs.find(t => t.id === options.asOfTransactionId);
      if (!at) return null;
      wanted = at.schemaVersion;
    }
    if (wanted !== undefined && wanted !== d.schema.version) {
      const txs = await this.datasets.listTransactions(ctx, name, options?.branch);
      const schemaTxs = txs.filter(t => t.type === 'schema_change');
      const installed = schemaTxs.find(t => t.schemaSnapshot?.version === wanted);
      if (installed?.schemaSnapshot) return installed.schemaSnapshot;
      const replaced = schemaTxs.find(t => t.previousSchemaSnapshot?.version === wanted);
      if (replaced?.previousSchemaSnapshot) return replaced.previousSchemaSnapshot;
      // Pre-snapshot transaction (written before snapshots were recorded):
      // the version existed but its columns are unrecoverable, so say so
      // rather than passing the current schema off as historical.
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
    // "Async" in name only: the job is written queued, then running, then
    // terminal, all before submit() returns. Matched in the Postgres provider
    // rather than fixed, since a caller polling get() is what the states are
    // for and nothing here ever leaves one pending.
    const running: SqlQueryJob = { ...job, state: 'running', startedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(id, running);
    try {
      // Execution is shared with the Postgres provider: parsing, filter
      // pushdown, the join and projection all live in @altius/spi, so the two
      // cannot disagree about what a query means.
      const { rows, resultColumns } = await executeSqlQuery(ctx, this.datasets, input);
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
    // Newest first, with insertion order breaking ties. `submittedAt` alone is
    // not a total order: two jobs submitted in the same millisecond compare
    // equal, the sort becomes a no-op for them, and the pair comes back
    // oldest-first — the opposite of what this method promises. The Postgres
    // provider orders by a sequence, so without this the two disagree.
    return Array.from(m.values())
      .map((j, i) => ({ j, i }))
      .sort((x, y) => y.j.submittedAt.localeCompare(x.j.submittedAt) || y.i - x.i)
      .map(e => e.j)
      .slice(0, limit);
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

// Step execution lives in @altius/spi so the Postgres provider runs exactly the
// same code: a pipeline is run to produce a value something downstream uses, so
// two providers disagreeing about what a step means would produce different data
// from the same input with neither erring.

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
    return inputs.map(i => p.steps.reduce((acc, step) => applyTransformStep(step, acc), i));
  }

  async executeInline(_ctx: RequestContext, steps: TransformStep[], input: unknown): Promise<unknown> {
    return steps.reduce((acc, step) => applyTransformStep(step, acc), input);
  }

  private getMap(tenantId: string): Map<string, TransformPipeline> {
    let m = this.pipelines.get(tenantId);
    if (!m) { m = new Map(); this.pipelines.set(tenantId, m); }
    return m;
  }
}
