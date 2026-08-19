/**
 * Pipeline Data Ops — Pipeline & Data Ops surface types.
 *
 * Adds the missing service contracts for no-code pipeline authoring,
 * Foundry-style rules engine surfacing, CDC sync, backing datasource mapping,
 * action-triggered builds, and ad-hoc SQL analytics.
 */

import type { RequestContext } from './ontology.js';
import type { DataExpectation, ExpectationResult } from './data-pipelines.js';
import type { BusinessRule, RuleExecutionResult } from './business-rules.js';
import type { PipelineBuild } from './data-pipelines.js';

// Re-export already-defined capability contracts under Pipeline Data Ops surface names
export type { DataExpectationsService } from './data-pipelines.js';
export type { BatchTransformService, SqlQueryService, VariableTransformService } from './datasets.js';
export type { OntologySqlService } from './ontology-sql.js';

export type { DataExpectation, ExpectationResult };

/** Rules engine service — surface alias for the no-code business rules engine. */
export type RulesEngineService = {
  create(ctx: RequestContext, input: { name: string; description?: string; nodes: unknown[]; isTimeSeriesBoard?: boolean }): Promise<BusinessRule>;
  get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null>;
  list(ctx: RequestContext): Promise<BusinessRule[]>;
  delete(ctx: RequestContext, ruleId: string): Promise<void>;
  execute(ctx: RequestContext, ruleId: string, data: Record<string, Record<string, unknown>[]>): Promise<RuleExecutionResult>;
};

// ===========================================================================
// No-code pipeline authoring
// ===========================================================================

/** A configurable pipeline node. */
export interface PipelineNode {
  id: string;
  type: 'source' | 'transform' | 'sink' | 'filter' | 'union';
  name?: string;
  config: Record<string, unknown>;
  inputs: string[];
}

/** A no-code pipeline definition. */
export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** A single pipeline run. */
export interface PipelineRun {
  id: string;
  tenantId: string;
  pipelineId: string;
  pipelineName: string;
  state: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  endedAt?: string;
  triggeredBy: string;
  buildId?: string;
}

/** Input for creating a pipeline. */
export interface CreatePipelineInput {
  name: string;
  description?: string;
  nodes: Omit<PipelineNode, 'id'>[];
}

/** No-code pipeline authoring service. */
export interface PipelineService {
  create(ctx: RequestContext, input: CreatePipelineInput): Promise<Pipeline>;
  get(ctx: RequestContext, id: string): Promise<Pipeline | null>;
  list(ctx: RequestContext): Promise<Pipeline[]>;
  update(ctx: RequestContext, id: string, updates: Partial<CreatePipelineInput>): Promise<Pipeline>;
  delete(ctx: RequestContext, id: string): Promise<void>;
  run(ctx: RequestContext, id: string): Promise<PipelineRun>;
  listRuns(ctx: RequestContext, id: string): Promise<PipelineRun[]>;
}

// ===========================================================================
// CDC sync ingestion with edit versioning
// ===========================================================================

/** A CDC commit record. */
export interface CdcCommit {
  id: string;
  tenantId: string;
  syncId: string;
  sourceVersion: number;
  editVersion: number;
  operation: 'insert' | 'update' | 'delete';
  primaryKey: Record<string, unknown>;
  payload: Record<string, unknown>;
  committedAt: string;
  applied: boolean;
}

/** A CDC sync job. */
export interface CdcSyncJob {
  id: string;
  tenantId: string;
  sourceSystem: string;
  objectType: string;
  state: 'running' | 'paused' | 'completed' | 'failed';
  lastSourceVersion: number;
  lastEditVersion: number;
  startedAt: string;
}

/** CDC sync service. */
export interface SyncCdcService {
  start(ctx: RequestContext, sourceSystem: string, objectType: string): Promise<CdcSyncJob>;
  get(ctx: RequestContext, syncId: string): Promise<CdcSyncJob | null>;
  list(ctx: RequestContext): Promise<CdcSyncJob[]>;
  listCommits(ctx: RequestContext, syncId: string, limit?: number): Promise<CdcCommit[]>;
  apply(ctx: RequestContext, syncId: string, commitIds?: string[]): Promise<{ applied: number; commits: CdcCommit[] }>;
}

// ===========================================================================
// Backing datasources and property-to-column mapping
// ===========================================================================

/** A column-to-property mapping. */
export interface PropertyColumnMapping {
  column: string;
  property: string;
  transform?: string;
}

/** A backing datasource. */
export interface Datasource {
  id: string;
  tenantId: string;
  name: string;
  connector: string;
  connection: Record<string, unknown>;
  objectType: string;
  mappings: PropertyColumnMapping[];
  lastSyncedAt?: string;
}

/** Datasource mapping service. */
export interface DatasourceService {
  create(ctx: RequestContext, input: { name: string; connector: string; connection: Record<string, unknown>; objectType: string }): Promise<Datasource>;
  get(ctx: RequestContext, id: string): Promise<Datasource | null>;
  list(ctx: RequestContext): Promise<Datasource[]>;
  map(ctx: RequestContext, id: string, mappings: PropertyColumnMapping[]): Promise<Datasource>;
  sync(ctx: RequestContext, id: string): Promise<{ rows: number; durationMs: number }>;
}

// ===========================================================================
// Action-triggered builds
// ===========================================================================

/** Action-to-build trigger config. */
export interface BuildTriggerConfig {
  id: string;
  tenantId: string;
  actionName: string;
  pipelineName: string;
  enabled: boolean;
}

/** Build trigger service — action-triggered builds. */
export interface BuildTriggerService {
  list(ctx: RequestContext): Promise<BuildTriggerConfig[]>;
  create(ctx: RequestContext, actionName: string, pipelineName: string): Promise<BuildTriggerConfig>;
  remove(ctx: RequestContext, id: string): Promise<void>;
  trigger(ctx: RequestContext, actionName: string): Promise<PipelineBuild[]>;
}

// ===========================================================================
// Ad-hoc SQL analytics over the ontology
// ===========================================================================

/** A SQL analytics result table. */
export interface SqlAnalyticsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  inferredSchema: Record<string, string>;
}

/** Ad-hoc SQL analytics service. */
export interface SqlAnalyticsService {
  query(ctx: RequestContext, sql: string, limit?: number): Promise<SqlAnalyticsResult>;
  explain(ctx: RequestContext, sql: string): Promise<{ tables: string[]; columns: string[]; valid: boolean; errors: string[] }>;
}
