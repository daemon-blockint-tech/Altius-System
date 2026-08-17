/**
 * Data quality, conflict resolution, and pipeline orchestration.
 *
 * Three capabilities:
 *   1. Data expectations / quality checks that gate builds
 *   2. Datasource-vs-user-edit conflict resolution
 *   3. Batch pipeline build orchestration and action-triggered scheduled builds
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// 1. Data expectations / quality checks
// ===========================================================================

/** The type of data quality check. */
export type ExpectationType =
  | 'not_null'      // field must not be null
  | 'unique'        // field must be unique
  | 'range'         // value must be within [min, max]
  | 'regex'         // value must match a regex
  | 'enum'          // value must be in a set
  | 'schema'        // value must match a JSON schema
  | 'row_count'     // table must have between min and max rows
  | 'freshness'     // data must be newer than maxAgeSeconds
  | 'custom';       // custom check function name

/** A data expectation (quality check). */
export interface DataExpectation {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** The object type or dataset this expectation applies to. */
  targetType: string;
  /** The field this expectation checks (if applicable). */
  field?: string;
  /** The type of check. */
  type: ExpectationType;
  /** Check parameters (min, max, regex, values, schema, etc.). */
  params: Record<string, unknown>;
  /** Whether failing this check blocks the build. */
  blocking: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Whether the expectation is enabled. */
  enabled: boolean;
}

/** The result of evaluating a data expectation. */
export interface ExpectationResult {
  expectationId: string;
  expectationName: string;
  passed: boolean;
  /** Number of rows checked. */
  rowsChecked: number;
  /** Number of rows that failed. */
  rowsFailed: number;
  /** Sample of failing values. */
  failingSamples: unknown[];
  /** Error message (if the check itself errored). */
  errorMessage?: string;
  /** ISO 8601 evaluation timestamp. */
  evaluatedAt: string;
}

/** Input for creating a data expectation. */
export interface CreateExpectationInput {
  name: string;
  description: string;
  targetType: string;
  field?: string;
  type: ExpectationType;
  params: Record<string, unknown>;
  blocking?: boolean;
  enabled?: boolean;
}

/**
 * Data expectations service — manages and evaluates data quality checks.
 */
export interface DataExpectationsService {
  create(ctx: RequestContext, input: CreateExpectationInput): Promise<DataExpectation>;
  get(ctx: RequestContext, id: string): Promise<DataExpectation | null>;
  list(ctx: RequestContext, targetType?: string): Promise<DataExpectation[]>;
  update(ctx: RequestContext, id: string, updates: Partial<CreateExpectationInput>): Promise<DataExpectation>;
  delete(ctx: RequestContext, id: string): Promise<void>;
  /** Evaluate all expectations for a target type against provided data. */
  evaluate(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<ExpectationResult[]>;
  /** Evaluate expectations and return whether the build should be gated. */
  gateBuild(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<{ passed: boolean; results: ExpectationResult[]; blockingFailures: ExpectationResult[] }>;
}

// ===========================================================================
// 2. Datasource-vs-user-edit conflict resolution
// ===========================================================================

/** The conflict resolution strategy. */
export type ConflictStrategy = 'user_edits_win' | 'latest_value_wins' | 'merge' | 'manual';

/** A conflict between a datasource sync and a user edit. */
export interface DataConflict {
  id: string;
  tenantId: string;
  objectType: string;
  objectId: string;
  /** The field in conflict. */
  field: string;
  /** The value from the datasource (sync). */
  datasourceValue: unknown;
  /** The value from the user edit. */
  userValue: unknown;
  /** The timestamp of the datasource value. */
  datasourceTimestamp: string;
  /** The timestamp of the user edit. */
  userTimestamp: string;
  /** The resolved value (after applying strategy). */
  resolvedValue?: unknown;
  /** How the conflict was resolved. */
  resolvedBy?: ConflictStrategy;
  /** Whether the conflict is resolved. */
  resolved: boolean;
  /** ISO 8601 detection timestamp. */
  detectedAt: string;
  /** ISO 8601 resolution timestamp. */
  resolvedAt?: string;
}

/**
 * Conflict resolution service — resolves conflicts between datasource syncs and user edits.
 */
export interface ConflictResolutionService {
  /** Detect a conflict and record it. */
  detect(ctx: RequestContext, conflict: Omit<DataConflict, 'id' | 'tenantId' | 'resolved' | 'detectedAt'>): Promise<DataConflict>;

  /** Get a conflict by ID. */
  get(ctx: RequestContext, conflictId: string): Promise<DataConflict | null>;

  /** List unresolved conflicts. */
  listUnresolved(ctx: RequestContext, objectType?: string): Promise<DataConflict[]>;

  /** Resolve a conflict using the specified strategy. */
  resolve(ctx: RequestContext, conflictId: string, strategy: ConflictStrategy, manualValue?: unknown): Promise<DataConflict>;

  /** Auto-resolve conflicts using the tenant's default strategy. */
  autoResolve(ctx: RequestContext, strategy: ConflictStrategy): Promise<{ resolved: number; conflicts: DataConflict[] }>;

  /** Set the default strategy for a tenant. */
  setDefaultStrategy(ctx: RequestContext, strategy: ConflictStrategy): Promise<void>;

  /** Get the default strategy for a tenant. */
  getDefaultStrategy(ctx: RequestContext): Promise<ConflictStrategy>;
}

// ===========================================================================
// 3. Batch pipeline build orchestration
// ===========================================================================

/** The state of a pipeline build. */
export type BuildState = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted' | 'skipped';

/** The trigger type for a pipeline build. */
export type BuildTrigger = 'manual' | 'schedule' | 'event' | 'action' | 'upstream';

/** A pipeline build. */
export interface PipelineBuild {
  id: string;
  tenantId: string;
  /** Pipeline name. */
  pipelineName: string;
  /** Build state. */
  state: BuildState;
  /** Trigger type. */
  trigger: BuildTrigger;
  /** ISO 8601 start time. */
  startedAt: string;
  /** ISO 8601 end time. */
  endedAt?: string;
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Who triggered the build. */
  triggeredBy: string;
  /** Retry count. */
  retryCount: number;
  /** Max retries. */
  maxRetries: number;
  /** Error message (if failed). */
  errorMessage?: string;
  /** Build steps/results. */
  steps: Array<{
    name: string;
    state: BuildState;
    durationMs?: number;
    errorMessage?: string;
  }>;
  /** Whether data expectations gated this build. */
  expectationGated: boolean;
  /** Expectation results (if gated). */
  expectationResults?: ExpectationResult[];
}

/** A pipeline schedule. */
export interface PipelineSchedule {
  id: string;
  tenantId: string;
  pipelineName: string;
  /** Cron expression or interval. */
  cronExpression: string;
  /** Whether the schedule is enabled. */
  enabled: boolean;
  /** Max retries per build. */
  maxRetries: number;
  /** Abort on failure. */
  abortOnFailure: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last run timestamp. */
  lastRunAt?: string;
  /** Next scheduled run. */
  nextRunAt?: string;
  createdBy: string;
}

/** Input for creating a schedule. */
export interface CreateScheduleInput {
  pipelineName: string;
  cronExpression: string;
  enabled?: boolean;
  maxRetries?: number;
  abortOnFailure?: boolean;
}

/**
 * Pipeline build orchestration service — manages builds, schedules, and triggers.
 */
export interface PipelineBuildService {
  // ── Builds ──
  startBuild(ctx: RequestContext, pipelineName: string, trigger: BuildTrigger): Promise<PipelineBuild>;
  getBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild | null>;
  listBuilds(ctx: RequestContext, pipelineName?: string, limit?: number): Promise<PipelineBuild[]>;
  abortBuild(ctx: RequestContext, buildId: string): Promise<void>;
  retryBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild>;

  // ── Schedules ──
  createSchedule(ctx: RequestContext, input: CreateScheduleInput): Promise<PipelineSchedule>;
  listSchedules(ctx: RequestContext): Promise<PipelineSchedule[]>;
  updateSchedule(ctx: RequestContext, scheduleId: string, updates: Partial<CreateScheduleInput>): Promise<PipelineSchedule>;
  deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void>;

  // ── Action-triggered builds ──
  /** Register an action-to-pipeline trigger. */
  registerActionTrigger(ctx: RequestContext, actionName: string, pipelineName: string): Promise<void>;
  /** Get pipelines triggered by an action. */
  getActionTriggers(ctx: RequestContext, actionName: string): Promise<string[]>;
  /** Trigger builds for a given action. */
  triggerForAction(ctx: RequestContext, actionName: string): Promise<PipelineBuild[]>;
}
