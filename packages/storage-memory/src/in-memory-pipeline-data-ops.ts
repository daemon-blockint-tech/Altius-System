/**
 * Pipeline Data Ops in-memory service implementations.
 */

import { randomUUID } from 'node:crypto';
import type {
  RulesEngineService,
  PipelineService,
  Pipeline,
  PipelineRun,
  CreatePipelineInput,
  SyncCdcService,
  CdcSyncJob,
  CdcCommit,
  DatasourceService,
  Datasource,
  PropertyColumnMapping,
  BuildTriggerService,
  BuildTriggerConfig,
  SqlAnalyticsService,
  SqlAnalyticsResult,
  BusinessRule,
  RuleExecutionResult,
  PipelineBuild,
  BuildTrigger,
} from '@altius/spi';
import type { RequestContext } from '@altius/spi';
import { parseSql } from './sql-parser.js';

// ===========================================================================
// Rules engine
// ===========================================================================

export class InMemoryRulesEngineService implements RulesEngineService {
  private readonly rules = new Map<string, Map<string, BusinessRule>>();

  async create(ctx: RequestContext, input: { name: string; description?: string; nodes: unknown[]; isTimeSeriesBoard?: boolean }): Promise<BusinessRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const rule: BusinessRule = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      nodes: input.nodes as BusinessRule['nodes'],
      state: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      isTimeSeriesBoard: input.isTimeSeriesBoard ?? false,
    };
    this.getMap(ctx.tenantId).set(id, rule);
    return rule;
  }

  async get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null> {
    return this.rules.get(ctx.tenantId)?.get(ruleId) ?? null;
  }

  async list(ctx: RequestContext): Promise<BusinessRule[]> {
    const m = this.rules.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async delete(ctx: RequestContext, ruleId: string): Promise<void> {
    this.rules.get(ctx.tenantId)?.delete(ruleId);
  }

  async execute(ctx: RequestContext, ruleId: string, data: Record<string, Record<string, unknown>[]>): Promise<RuleExecutionResult> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    const start = Date.now();
    const inputRows = Object.values(data).flat();
    const outputRows = inputRows;
    return {
      ruleId,
      success: true,
      outputRows,
      rowsProcessed: inputRows.length,
      rowsOutput: outputRows.length,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      nodeStats: rule.nodes.map(n => ({ nodeId: n.id, nodeName: n.name ?? n.id, rowsIn: inputRows.length, rowsOut: outputRows.length })),
    };
  }

  private getMap(tenantId: string): Map<string, BusinessRule> {
    let m = this.rules.get(tenantId);
    if (!m) { m = new Map(); this.rules.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Pipeline authoring
// ===========================================================================

export class InMemoryPipelineService implements PipelineService {
  private readonly pipelines = new Map<string, Map<string, Pipeline>>();
  private readonly runs = new Map<string, Map<string, PipelineRun[]>>();

  async create(ctx: RequestContext, input: CreatePipelineInput): Promise<Pipeline> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const p: Pipeline = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      nodes: input.nodes.map(n => ({ ...n, id: randomUUID() })),
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getMap(ctx.tenantId).set(id, p);
    return p;
  }

  async get(ctx: RequestContext, id: string): Promise<Pipeline | null> {
    return this.pipelines.get(ctx.tenantId)?.get(id) ?? null;
  }

  async list(ctx: RequestContext): Promise<Pipeline[]> {
    const m = this.pipelines.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreatePipelineInput>): Promise<Pipeline> {
    const p = this.pipelines.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Pipeline not found: ${id}`);
    const updated: Pipeline = {
      ...p,
      name: updates.name ?? p.name,
      description: updates.description ?? p.description,
      nodes: updates.nodes ? updates.nodes.map(n => ({ ...n, id: randomUUID() })) : p.nodes,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    this.pipelines.get(ctx.tenantId)?.delete(id);
    this.runs.get(ctx.tenantId)?.delete(id);
  }

  async run(ctx: RequestContext, id: string): Promise<PipelineRun> {
    const p = this.pipelines.get(ctx.tenantId)?.get(id);
    if (!p) throw new Error(`Pipeline not found: ${id}`);
    const now = new Date().toISOString();
    const run: PipelineRun = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      pipelineId: id,
      pipelineName: p.name,
      state: 'succeeded',
      startedAt: now,
      endedAt: now,
      triggeredBy: ctx.actorId ?? 'system',
      buildId: randomUUID(),
    };
    const m = this.getRunsMap(ctx.tenantId);
    const list = m.get(id) ?? [];
    list.unshift(run);
    m.set(id, list);
    return run;
  }

  async listRuns(ctx: RequestContext, id: string): Promise<PipelineRun[]> {
    return this.runs.get(ctx.tenantId)?.get(id) ?? [];
  }

  private getMap(tenantId: string): Map<string, Pipeline> {
    let m = this.pipelines.get(tenantId);
    if (!m) { m = new Map(); this.pipelines.set(tenantId, m); }
    return m;
  }

  private getRunsMap(tenantId: string): Map<string, PipelineRun[]> {
    let m = this.runs.get(tenantId);
    if (!m) { m = new Map(); this.runs.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// CDC sync
// ===========================================================================

export class InMemorySyncCdcService implements SyncCdcService {
  private readonly jobs = new Map<string, Map<string, CdcSyncJob>>();
  private readonly commits = new Map<string, Map<string, CdcCommit[]>>();

  async start(ctx: RequestContext, sourceSystem: string, objectType: string): Promise<CdcSyncJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: CdcSyncJob = {
      id,
      tenantId: ctx.tenantId,
      sourceSystem,
      objectType,
      state: 'running',
      lastSourceVersion: 0,
      lastEditVersion: 0,
      startedAt: now,
    };
    this.getMap(ctx.tenantId).set(id, job);
    // Seed some commits
    const commit: CdcCommit = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      syncId: id,
      sourceVersion: 1,
      editVersion: 1,
      operation: 'insert',
      primaryKey: { id: '1' },
      payload: { id: '1', name: 'example' },
      committedAt: now,
      applied: false,
    };
    this.getCommitsMap(ctx.tenantId).set(id, [commit]);
    return job;
  }

  async get(ctx: RequestContext, syncId: string): Promise<CdcSyncJob | null> {
    return this.jobs.get(ctx.tenantId)?.get(syncId) ?? null;
  }

  async list(ctx: RequestContext): Promise<CdcSyncJob[]> {
    const m = this.jobs.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async listCommits(ctx: RequestContext, syncId: string, limit = 100): Promise<CdcCommit[]> {
    return (this.commits.get(ctx.tenantId)?.get(syncId) ?? []).slice(0, limit);
  }

  async apply(ctx: RequestContext, syncId: string, commitIds?: string[]): Promise<{ applied: number; commits: CdcCommit[] }> {
    const list = this.commits.get(ctx.tenantId)?.get(syncId) ?? [];
    const toApply = commitIds ? list.filter(c => commitIds.includes(c.id)) : list;
    const applied: CdcCommit[] = [];
    for (const c of toApply) {
      if (!c.applied) {
        c.applied = true;
        applied.push(c);
      }
    }
    return { applied: applied.length, commits: applied };
  }

  private getMap(tenantId: string): Map<string, CdcSyncJob> {
    let m = this.jobs.get(tenantId);
    if (!m) { m = new Map(); this.jobs.set(tenantId, m); }
    return m;
  }

  private getCommitsMap(tenantId: string): Map<string, CdcCommit[]> {
    let m = this.commits.get(tenantId);
    if (!m) { m = new Map(); this.commits.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Datasource mapping
// ===========================================================================

export class InMemoryDatasourceService implements DatasourceService {
  private readonly datasources = new Map<string, Map<string, Datasource>>();

  async create(ctx: RequestContext, input: { name: string; connector: string; connection: Record<string, unknown>; objectType: string }): Promise<Datasource> {
    const id = randomUUID();
    const ds: Datasource = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      connector: input.connector,
      connection: input.connection,
      objectType: input.objectType,
      mappings: [],
    };
    this.getMap(ctx.tenantId).set(id, ds);
    return ds;
  }

  async get(ctx: RequestContext, id: string): Promise<Datasource | null> {
    return this.datasources.get(ctx.tenantId)?.get(id) ?? null;
  }

  async list(ctx: RequestContext): Promise<Datasource[]> {
    const m = this.datasources.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async map(ctx: RequestContext, id: string, mappings: PropertyColumnMapping[]): Promise<Datasource> {
    const ds = this.datasources.get(ctx.tenantId)?.get(id);
    if (!ds) throw new Error(`Datasource not found: ${id}`);
    const updated: Datasource = { ...ds, mappings };
    this.getMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async sync(ctx: RequestContext, id: string): Promise<{ rows: number; durationMs: number }> {
    const ds = this.datasources.get(ctx.tenantId)?.get(id);
    if (!ds) throw new Error(`Datasource not found: ${id}`);
    const now = new Date().toISOString();
    this.getMap(ctx.tenantId).set(id, { ...ds, lastSyncedAt: now });
    return { rows: ds.mappings.length, durationMs: 10 };
  }

  private getMap(tenantId: string): Map<string, Datasource> {
    let m = this.datasources.get(tenantId);
    if (!m) { m = new Map(); this.datasources.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Build triggers
// ===========================================================================

export class InMemoryBuildTriggerService implements BuildTriggerService {
  private readonly triggers = new Map<string, Map<string, BuildTriggerConfig>>();
  private readonly builds = new Map<string, PipelineBuild[]>();

  async list(ctx: RequestContext): Promise<BuildTriggerConfig[]> {
    const m = this.triggers.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async create(ctx: RequestContext, actionName: string, pipelineName: string): Promise<BuildTriggerConfig> {
    const id = randomUUID();
    const cfg: BuildTriggerConfig = {
      id,
      tenantId: ctx.tenantId,
      actionName,
      pipelineName,
      enabled: true,
    };
    this.getMap(ctx.tenantId).set(id, cfg);
    return cfg;
  }

  async remove(ctx: RequestContext, id: string): Promise<void> {
    this.triggers.get(ctx.tenantId)?.delete(id);
  }

  async trigger(ctx: RequestContext, actionName: string): Promise<PipelineBuild[]> {
    const all = this.triggers.get(ctx.tenantId);
    if (!all) return [];
    const matches = Array.from(all.values()).filter(t => t.actionName === actionName && t.enabled);
    const builds: PipelineBuild[] = [];
    const now = new Date().toISOString();
    for (const m of matches) {
      const build: PipelineBuild = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        pipelineName: m.pipelineName,
        state: 'succeeded',
        trigger: 'action' as BuildTrigger,
        startedAt: now,
        endedAt: now,
        durationMs: 10,
        triggeredBy: ctx.actorId ?? 'system',
        retryCount: 0,
        maxRetries: 3,
        steps: [{ name: 'action-trigger', state: 'succeeded', durationMs: 10 }],
        expectationGated: false,
      };
      builds.push(build);
      const list = this.builds.get(ctx.tenantId) ?? [];
      list.push(build);
      this.builds.set(ctx.tenantId, list);
    }
    return builds;
  }

  private getMap(tenantId: string): Map<string, BuildTriggerConfig> {
    let m = this.triggers.get(tenantId);
    if (!m) { m = new Map(); this.triggers.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// SQL analytics
// ===========================================================================

export class InMemorySqlAnalyticsService implements SqlAnalyticsService {
  async query(ctx: RequestContext, sql: string, limit = 100): Promise<SqlAnalyticsResult> {
    const ast = parseSql(sql);
    const inferred: Record<string, string> = {};
    for (const col of ast.columns === '*' ? [] : ast.columns) {
      inferred[col] = 'string';
    }
    if (ast.columns === '*') inferred['id'] = 'string';
    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] = [{ id: randomUUID(), _queryTime: now, _tenantId: ctx.tenantId }];
    return {
      columns: ast.columns === '*' ? ['id'] : ast.columns,
      rows: rows.slice(0, limit),
      inferredSchema: inferred,
    };
  }

  async explain(_ctx: RequestContext, sql: string): Promise<{ tables: string[]; columns: string[]; valid: boolean; errors: string[] }> {
    const ast = parseSql(sql);
    const columns = ast.columns === '*' ? [] : ast.columns;
    return { tables: [ast.from], columns, valid: true, errors: [] };
  }
}
