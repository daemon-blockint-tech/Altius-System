/**
 * Versioned tabular datasets and pipeline services.
 *
 * Seven capabilities:
 *   1. Versioned transactional dataset primitive (branchable, transaction-log-backed)
 *   2. Code-based batch transform framework
 *   3. Dataset projections / query acceleration
 *   4. Dataset REST API metadata + schema retrieval
 *   5. Interactive SQL query service (async job lifecycle)
 *   6. Programmatic tabular read/write SDK (filter pushdown, schema inference, file upload)
 *   7. No-code client-side variable transformations
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Common types
// ===========================================================================

/** A column in a dataset schema. */
export interface DatasetColumn {
  /** Column name. */
  name: string;
  /** Storage type. */
  type: 'string' | 'integer' | 'double' | 'boolean' | 'timestamp' | 'date' | 'binary' | 'json';
  /** Whether the column is nullable. */
  nullable: boolean;
  /** Column description. */
  description?: string;
}

/** A dataset schema definition. */
export interface DatasetSchema {
  /** Columns in declared order. */
  columns: DatasetColumn[];
  /** Primary key column names (if any). */
  primaryKey?: string[];
  /** Schema version monotonically increasing. */
  version: number;
}

// ===========================================================================
// 1. Versioned transactional dataset primitive
// ===========================================================================

/** A dataset — a versioned, transaction-log-backed tabular resource. */
export interface Dataset {
  id: string;
  tenantId: string;
  /** Dataset name (unique within tenant). */
  name: string;
  description: string;
  /** Current schema. */
  schema: DatasetSchema;
  /** Branch this dataset belongs to (defaults to 'main'). */
  branch: string;
  /** Latest transaction ID. */
  latestTransactionId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the dataset. */
  createdBy: string;
}

/** A transaction log entry — append-only record of dataset mutations. */
export interface DatasetTransaction {
  id: string;
  tenantId: string;
  datasetId: string;
  /** Transaction type. */
  type: 'insert' | 'update' | 'delete' | 'schema_change' | 'truncate';
  /** Rows affected by this transaction. */
  rows: Record<string, unknown>[];
  /** Schema at the time of this transaction. */
  schemaVersion: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Actor who performed the transaction. */
  actorId: string;
  /** Branch this transaction was applied to. */
  branch: string;
  /** Optional commit message. */
  message?: string;
}

/** Input for creating a dataset. */
export interface CreateDatasetInput {
  name: string;
  description?: string;
  schema: DatasetSchema;
  branch?: string;
}

/** Input for writing rows to a dataset. */
export interface WriteRowsInput {
  /** Rows to insert or upsert. */
  rows: Record<string, unknown>[];
  /** Whether to upsert (replace on PK match) or insert-only. */
  upsert?: boolean;
  /** Optional commit message. */
  message?: string;
}

/** Result of a write operation. */
export interface WriteResult {
  transactionId: string;
  rowsWritten: number;
  rowsUpserted: number;
}

/** Options for reading rows from a dataset. */
export interface ReadOptions {
  /** Filter expression (column-op-value). */
  filter?: Record<string, unknown>;
  /** Columns to project (subset of schema). */
  columns?: string[];
  /** Sort order. */
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  /** Read as of a specific transaction ID (snapshot isolation). */
  asOfTransactionId?: string;
  /** Read as of a specific schema version. */
  asOfSchemaVersion?: number;
}

/** A page of rows read from a dataset. */
export interface ReadResult {
  rows: Record<string, unknown>[];
  /** Cursor for the next page (null if no more rows). */
  nextCursor?: string;
  /** Total rows matched (if computable). */
  total?: number;
  /** Transaction ID the read was consistent with. */
  transactionId: string;
}

/** A dataset branch — an isolated line of dataset evolution. */
export interface DatasetBranch {
  id: string;
  tenantId: string;
  datasetId: string;
  /** Branch name. */
  name: string;
  /** Parent branch this was created from. */
  parentBranch: string;
  /** Transaction ID at branch creation point. */
  parentTransactionId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the branch. */
  createdBy: string;
}

/**
 * Versioned transactional dataset service — branchable, transaction-log-backed
 * tabular resources with snapshot reads and schema evolution.
 */
export interface DatasetService {
  // ── Dataset CRUD ──
  create(ctx: RequestContext, input: CreateDatasetInput): Promise<Dataset>;
  get(ctx: RequestContext, name: string, branch?: string): Promise<Dataset | null>;
  list(ctx: RequestContext): Promise<Dataset[]>;
  /** Drop a dataset (or just a branch if specified). */
  drop(ctx: RequestContext, name: string, branch?: string): Promise<void>;
  updateSchema(ctx: RequestContext, name: string, schema: DatasetSchema, branch?: string): Promise<Dataset>;

  // ── Row writes ──
  insert(ctx: RequestContext, name: string, input: WriteRowsInput, branch?: string): Promise<WriteResult>;
  update(ctx: RequestContext, name: string, filter: Record<string, unknown>, patch: Record<string, unknown>, branch?: string): Promise<WriteResult>;
  delete(ctx: RequestContext, name: string, filter: Record<string, unknown>, branch?: string): Promise<WriteResult>;
  truncate(ctx: RequestContext, name: string, branch?: string): Promise<WriteResult>;

  // ── Row reads ──
  read(ctx: RequestContext, name: string, options?: ReadOptions, branch?: string): Promise<ReadResult>;

  // ── Transaction log ──
  listTransactions(ctx: RequestContext, name: string, branch?: string, limit?: number): Promise<DatasetTransaction[]>;
  getTransaction(ctx: RequestContext, name: string, transactionId: string): Promise<DatasetTransaction | null>;

  // ── Branching ──
  createBranch(ctx: RequestContext, name: string, branchName: string, fromTransactionId?: string): Promise<DatasetBranch>;
  listBranches(ctx: RequestContext, name: string): Promise<DatasetBranch[]>;
  mergeBranch(ctx: RequestContext, name: string, sourceBranch: string, targetBranch?: string): Promise<{ transactionsApplied: number; mergedAt: string }>;
}

// ===========================================================================
// 2. Code-based batch transform framework
// ===========================================================================

/** A code-based batch transform — a function applied to one or more input datasets. */
export interface BatchTransform {
  id: string;
  tenantId: string;
  /** Transform name (unique within tenant). */
  name: string;
  description: string;
  /** Input dataset names. */
  inputs: string[];
  /** Output dataset name. */
  output: string;
  /** Transform kind. */
  kind: 'map' | 'filter' | 'reduce' | 'join' | 'custom';
  /** Source code (TypeScript/SQL expression) — interpreted by the runtime. */
  source: string;
  /** Whether the transform supports incremental processing. */
  incremental: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the transform. */
  createdBy: string;
  /** Last build state. */
  lastBuildState?: 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted';
  /** Last build ID. */
  lastBuildId?: string;
}

/** A transform build — a single execution of a transform. */
export interface TransformBuild {
  id: string;
  tenantId: string;
  transformId: string;
  transformName: string;
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted';
  /** Trigger type. */
  trigger: 'manual' | 'schedule' | 'event' | 'upstream';
  /** ISO 8601 start time. */
  startedAt: string;
  /** ISO 8601 end time. */
  endedAt?: string;
  /** Duration in ms. */
  durationMs?: number;
  /** Who or what triggered the build. */
  triggeredBy: string;
  /** Rows read from inputs. */
  rowsRead: number;
  /** Rows written to output. */
  rowsWritten: number;
  /** Error message (if failed). */
  errorMessage?: string;
  /** Whether this was an incremental build. */
  incremental: boolean;
  /** Checkpoint token for incremental builds. */
  checkpoint?: string;
}

/** Input for creating a batch transform. */
export interface CreateTransformInput {
  name: string;
  description?: string;
  inputs: string[];
  output: string;
  kind: BatchTransform['kind'];
  source: string;
  incremental?: boolean;
}

/** A transform executor — applies a transform to input rows. */
export interface TransformExecutor {
  /** Execute the transform over the given input rows. */
  execute(input: Record<string, unknown>[][]): Record<string, unknown>[];
}

/**
 * Batch transform framework — registers, schedules, and executes code-based
 * transforms over versioned datasets with incremental support.
 */
export interface BatchTransformService {
  create(ctx: RequestContext, input: CreateTransformInput): Promise<BatchTransform>;
  get(ctx: RequestContext, name: string): Promise<BatchTransform | null>;
  list(ctx: RequestContext): Promise<BatchTransform[]>;
  update(ctx: RequestContext, name: string, updates: Partial<CreateTransformInput>): Promise<BatchTransform>;
  delete(ctx: RequestContext, name: string): Promise<void>;

  /** Register a runtime executor for a transform (overrides source interpretation). */
  registerExecutor(ctx: RequestContext, name: string, executor: TransformExecutor): Promise<void>;

  /** Start a build for a transform. */
  startBuild(ctx: RequestContext, name: string, trigger: TransformBuild['trigger']): Promise<TransformBuild>;
  getBuild(ctx: RequestContext, buildId: string): Promise<TransformBuild | null>;
  listBuilds(ctx: RequestContext, name: string, limit?: number): Promise<TransformBuild[]>;
  abortBuild(ctx: RequestContext, buildId: string): Promise<void>;

  /** Schedule a transform to run on a cron expression. */
  schedule(ctx: RequestContext, name: string, cronExpression: string): Promise<{ scheduleId: string }>;
  listSchedules(ctx: RequestContext): Promise<Array<{ id: string; transformName: string; cronExpression: string; enabled: boolean }>>;
  deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void>;
}

// ===========================================================================
// 3. Dataset projections / query acceleration
// ===========================================================================

/** A projection — a precomputed, filtered/joined view of one or more datasets. */
export interface DatasetProjection {
  id: string;
  tenantId: string;
  /** Projection name. */
  name: string;
  description: string;
  /** Source dataset for the projection. */
  source: string;
  /** Filter applied to the source (column-op-value). */
  filter?: Record<string, unknown>;
  /** Columns to include (subset of source schema). */
  columns?: string[];
  /** Optional join with another dataset. */
  join?: {
    dataset: string;
    leftKey: string;
    rightKey: string;
    kind: 'inner' | 'left' | 'right' | 'outer';
  };
  /** Optional aggregation. */
  aggregation?: {
    groupBy: string[];
    measures: Array<{ field: string; fn: 'count' | 'sum' | 'avg' | 'min' | 'max' }>;
  };
  /** Branch the projection is materialized on. */
  branch: string;
  /** Whether the projection is materialized (precomputed) or virtual. */
  materialized: boolean;
  /** ISO 8601 last refresh timestamp. */
  lastRefreshedAt?: string;
  /** Row count after last materialization. */
  rowCount?: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the projection. */
  createdBy: string;
}

/** Input for creating a projection. */
export interface CreateProjectionInput {
  name: string;
  description?: string;
  source: string;
  filter?: Record<string, unknown>;
  columns?: string[];
  join?: DatasetProjection['join'];
  aggregation?: DatasetProjection['aggregation'];
  materialized?: boolean;
}

/**
 * Dataset projection service — defines and materializes query-accelerating
 * projections (filtered/joined/aggregated views) over datasets.
 */
export interface DatasetProjectionService {
  create(ctx: RequestContext, input: CreateProjectionInput): Promise<DatasetProjection>;
  get(ctx: RequestContext, name: string): Promise<DatasetProjection | null>;
  list(ctx: RequestContext): Promise<DatasetProjection[]>;
  update(ctx: RequestContext, name: string, updates: Partial<CreateProjectionInput>): Promise<DatasetProjection>;
  delete(ctx: RequestContext, name: string): Promise<void>;

  /** Materialize (refresh) a projection. */
  refresh(ctx: RequestContext, name: string): Promise<{ rowsMaterialized: number; refreshedAt: string }>;

  /** Read rows from a projection (virtual or materialized). */
  read(ctx: RequestContext, name: string, options?: ReadOptions): Promise<ReadResult>;
}

// ===========================================================================
// 4. Dataset REST API metadata + schema retrieval
// ===========================================================================

/** Dataset metadata returned by the REST API. */
export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  schema: DatasetSchema;
  branch: string;
  latestTransactionId: string;
  rowCount: number;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Schema retrieval options. */
export interface SchemaRetrievalOptions {
  /** Branch to read schema from. */
  branch?: string;
  /** Schema version (defaults to latest). */
  version?: number;
  /** Transaction ID for time-travel schema. */
  asOfTransactionId?: string;
}

/**
 * Dataset REST API service — metadata + schema retrieval by branch,
 * transaction, and schema version.
 */
export interface DatasetMetadataService {
  /** List all datasets with metadata. */
  list(ctx: RequestContext, branch?: string): Promise<DatasetMetadata[]>;
  /** Get metadata for one dataset. */
  get(ctx: RequestContext, name: string, branch?: string): Promise<DatasetMetadata | null>;
  /** Retrieve the schema of a dataset (optionally at a specific version/transaction). */
  getSchema(ctx: RequestContext, name: string, options?: SchemaRetrievalOptions): Promise<DatasetSchema | null>;
  /** List branches for a dataset. */
  listBranches(ctx: RequestContext, name: string): Promise<string[]>;
  /** List transactions for a dataset. */
  listTransactions(ctx: RequestContext, name: string, branch?: string, limit?: number): Promise<DatasetTransaction[]>;
}

// ===========================================================================
// 5. Interactive SQL query service
// ===========================================================================

/** A SQL query job — async execution of a SQL statement over datasets. */
export interface SqlQueryJob {
  id: string;
  tenantId: string;
  /** The SQL statement. */
  sql: string;
  /** Job state. */
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  /** ISO 8601 submission timestamp. */
  submittedAt: string;
  /** ISO 8601 start timestamp. */
  startedAt?: string;
  /** ISO 8601 completion timestamp. */
  completedAt?: string;
  /** Duration in ms. */
  durationMs?: number;
  /** Who submitted the job. */
  submittedBy: string;
  /** Result rows (when succeeded). */
  rows?: Record<string, unknown>[];
  /** Result schema columns (when succeeded). */
  resultColumns?: string[];
  /** Error message (when failed). */
  errorMessage?: string;
  /** Rows returned (when succeeded). */
  rowCount?: number;
}

/** Input for submitting a SQL query. */
export interface SubmitSqlInput {
  sql: string;
  /** Default dataset namespace/branch. */
  branch?: string;
  /** Max rows to return. */
  limit?: number;
}

/**
 * Interactive SQL query service — async SQL job lifecycle over datasets.
 *
 * The in-memory implementation supports a small SQL subset:
 *   SELECT [cols|*] FROM <dataset> [WHERE col op value [AND ...]] [ORDER BY col [ASC|DESC]] [LIMIT n]
 *   SELECT ... FROM <a> JOIN <b> ON a.x = b.y
 */
export interface SqlQueryService {
  /** Submit a SQL query for async execution. */
  submit(ctx: RequestContext, input: SubmitSqlInput): Promise<SqlQueryJob>;
  /** Get a job by ID. */
  get(ctx: RequestContext, jobId: string): Promise<SqlQueryJob | null>;
  /** List jobs (most recent first). */
  list(ctx: RequestContext, limit?: number): Promise<SqlQueryJob[]>;
  /** Cancel a running or queued job. */
  cancel(ctx: RequestContext, jobId: string): Promise<void>;
  /** Fetch results for a succeeded job. */
  results(ctx: RequestContext, jobId: string, limit?: number): Promise<Record<string, unknown>[]>;
}

// ===========================================================================
// 6. Programmatic tabular read/write SDK
// ===========================================================================

/** A read builder — fluent programmatic read with filter pushdown. */
export interface TabularReadBuilder {
  /** Project columns (subset of schema). */
  select(...columns: string[]): TabularReadBuilder;
  /** Add an equality filter (pushed down to the dataset service). */
  where(field: string, operator: string, value: unknown): TabularReadBuilder;
  /** Add ordering. */
  orderBy(field: string, direction?: 'asc' | 'desc'): TabularReadBuilder;
  /** Limit rows returned. */
  limit(n: number): TabularReadBuilder;
  /** Offset for pagination. */
  offset(n: number): TabularReadBuilder;
  /** Read at a specific transaction (snapshot). */
  asOf(transactionId: string): TabularReadBuilder;
  /** Execute the read. */
  execute(): Promise<ReadResult>;
}

/** A write builder — fluent programmatic write with schema inference. */
export interface TabularWriteBuilder {
  /** Add a single row. */
  addRow(row: Record<string, unknown>): TabularWriteBuilder;
  /** Add multiple rows. */
  addRows(rows: Record<string, unknown>[]): TabularWriteBuilder;
  /** Upload rows from a CSV/JSON string (auto-infers schema if dataset is new). */
  upload(content: string, format: 'csv' | 'json' | 'ndjson'): TabularWriteBuilder;
  /** Whether to upsert on primary key. */
  upsert(enabled: boolean): TabularWriteBuilder;
  /** Commit message. */
  message(msg: string): TabularWriteBuilder;
  /** Execute the write. */
  execute(): Promise<WriteResult>;
}

/** Programmatic tabular read/write SDK — fluent builders over datasets. */
export interface TabularSdk {
  /** Open a read builder for a dataset. */
  read(ctx: RequestContext, dataset: string, branch?: string): TabularReadBuilder;
  /** Open a write builder for a dataset. */
  write(ctx: RequestContext, dataset: string, branch?: string): TabularWriteBuilder;
  /** Infer a schema from rows. */
  inferSchema(rows: Record<string, unknown>[]): DatasetSchema;
  /** Parse CSV content into rows. */
  parseCsv(content: string): Record<string, unknown>[];
  /** Parse JSON/NDJSON content into rows. */
  parseJson(content: string, format: 'json' | 'ndjson'): Record<string, unknown>[];
}

// ===========================================================================
// 7. No-code client-side variable transformations
// ===========================================================================

/** A transformation kind — the operation applied to a value. */
export type TransformKind =
  // String operations
  | 'upper' | 'lower' | 'trim' | 'substring' | 'concat' | 'replace' | 'split' | 'pad'
  // Math operations
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'round' | 'abs' | 'mod' | 'power'
  // Date operations
  | 'formatDate' | 'parseDate' | 'dateAdd' | 'dateDiff' | 'extractDatePart'
  // Array operations
  | 'arrayLength' | 'arrayJoin' | 'arrayMap' | 'arrayFilter' | 'arraySort'
  // Object operations
  | 'getField' | 'setField' | 'pickFields' | 'omitFields' | 'mergeObjects'
  // Type conversions
  | 'toString' | 'toNumber' | 'toBoolean' | 'toDate'
  // Conditional
  | 'ifElse' | 'coalesce' | 'nullIf';

/** A single transformation step. */
export interface TransformStep {
  /** Operation kind. */
  kind: TransformKind;
  /** Arguments for the operation. */
  args: Record<string, unknown>;
}

/** A transformation pipeline — a sequence of steps applied to an input value. */
export interface TransformPipeline {
  id: string;
  tenantId: string;
  /** Pipeline name. */
  name: string;
  description: string;
  /** Ordered steps. */
  steps: TransformStep[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the pipeline. */
  createdBy: string;
}

/** Input for creating a transform pipeline. */
export interface CreateTransformPipelineInput {
  name: string;
  description?: string;
  steps: TransformStep[];
}

/**
 * No-code variable transformation service — defines and executes declarative
 * transformation pipelines over variable values (string/math/date/array/object).
 */
export interface VariableTransformService {
  create(ctx: RequestContext, input: CreateTransformPipelineInput): Promise<TransformPipeline>;
  get(ctx: RequestContext, name: string): Promise<TransformPipeline | null>;
  list(ctx: RequestContext): Promise<TransformPipeline[]>;
  update(ctx: RequestContext, name: string, updates: Partial<CreateTransformPipelineInput>): Promise<TransformPipeline>;
  delete(ctx: RequestContext, name: string): Promise<void>;

  /** Execute a pipeline against a single input value. */
  execute(ctx: RequestContext, name: string, input: unknown): Promise<unknown>;

  /** Execute a pipeline against a batch of input values. */
  executeBatch(ctx: RequestContext, name: string, inputs: unknown[]): Promise<unknown[]>;

  /** Execute an inline pipeline (no persistence) against a single input. */
  executeInline(ctx: RequestContext, steps: TransformStep[], input: unknown): Promise<unknown>;
}
