/**
 * No-code business rules engine — Foundry Rules equivalent.
 *
 * Provides:
 *   - Window/aggregation logic (sliding/tumbling windows over data)
 *   - Join logic (combine two data sources on a key)
 *   - Expression logic (computed fields from expressions)
 *   - Select logic (filter/project rows)
 *   - Union logic (combine multiple data sources)
 *   - Rule pipelines (chain multiple rules)
 *   - Time series boards (rules over time series data)
 *   - Proposal/approval workflow for rule deployment
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Rule types
// ===========================================================================

/** The type of a rule logic node. */
export type RuleNodeType =
  | 'source'       // data source (object type or dataset)
  | 'filter'       // filter rows by condition
  | 'select'       // project specific columns
  | 'expression'   // compute a new column from an expression
  | 'aggregate'    // aggregate rows (group by + fn)
  | 'join'         // join two sources on a key
  | 'union'        // union multiple sources
  | 'window'       // windowed aggregation
  | 'sort'         // sort rows
  | 'limit'        // limit number of rows
  | 'output';      // output sink (write results)

/** A condition operator. */
export type ConditionOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with'
  | 'is_null' | 'is_not_null';

/** A filter condition. */
export interface FilterCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  values?: unknown[];
}

/** A join type. */
export type JoinType = 'inner' | 'left' | 'right' | 'full';

/** An aggregation function. */
export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last';

/** A window type. */
export type WindowType = 'tumbling' | 'sliding';

/** A rule logic node — one step in a rule pipeline. */
export interface RuleNode {
  id: string;
  type: RuleNodeType;
  /** Node name. */
  name: string;
  /** Source configuration (for 'source' nodes). */
  source?: {
    targetType: string;
    /** Optional filter for the source. */
    filter?: FilterCondition[];
  };
  /** Filter conditions (for 'filter' nodes). */
  filter?: FilterCondition[];
  /** Columns to select (for 'select' nodes). */
  select?: string[];
  /** Expression configuration (for 'expression' nodes). */
  expression?: {
    outputField: string;
    /** Expression type. */
    exprType: 'arithmetic' | 'string' | 'conditional' | 'date';
    /** Arithmetic operation. */
    operation?: 'add' | 'subtract' | 'multiply' | 'divide';
    /** Operands (field names or literal values). */
    operands: Array<{ field?: string; value?: unknown }>;
  };
  /** Aggregation configuration (for 'aggregate' nodes). */
  aggregate?: {
    groupBy: string[];
    measures: Array<{ field: string; function: AggregateFunction; outputField: string }>;
  };
  /** Join configuration (for 'join' nodes). */
  join?: {
    leftSourceId: string;
    rightSourceId: string;
    joinType: JoinType;
    leftKey: string;
    rightKey: string;
  };
  /** Union configuration (for 'union' nodes). */
  union?: {
    sourceIds: string[];
  };
  /** Window configuration (for 'window' nodes). */
  window?: {
    windowType: WindowType;
    windowSizeMs: number;
    slideMs?: number;
    groupBy: string[];
    measures: Array<{ field: string; function: AggregateFunction; outputField: string }>;
    timestampField: string;
  };
  /** Sort configuration (for 'sort' nodes). */
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  /** Limit configuration (for 'limit' nodes). */
  limit?: number;
  /** Output configuration (for 'output' nodes). */
  output?: {
    targetType: string;
    mode: 'replace' | 'append' | 'upsert';
  };
  /** IDs of upstream nodes. */
  inputs: string[];
}

/** A rule — a pipeline of logic nodes. */
export interface BusinessRule {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** The logic nodes in this rule (DAG). */
  nodes: RuleNode[];
  /** Rule state. */
  state: 'draft' | 'proposed' | 'approved' | 'rejected' | 'active' | 'inactive';
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  createdBy: string;
  /** Whether this is a time series board. */
  isTimeSeriesBoard: boolean;
  /** Reviewer notes (if reviewed). */
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/** The result of executing a rule. */
export interface RuleExecutionResult {
  ruleId: string;
  success: boolean;
  /** Output rows from the rule. */
  outputRows: Record<string, unknown>[];
  /** Number of rows processed. */
  rowsProcessed: number;
  /** Number of rows output. */
  rowsOutput: number;
  /** ISO 8601 execution timestamp. */
  executedAt: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error message (if failed). */
  errorMessage?: string;
  /** Per-node execution stats. */
  nodeStats: Array<{ nodeId: string; nodeName: string; rowsIn: number; rowsOut: number }>;
}

/** Input for creating a rule. */
export interface CreateRuleInput {
  name: string;
  description: string;
  nodes: Omit<RuleNode, 'id'>[];
  isTimeSeriesBoard?: boolean;
}

// ===========================================================================
// Service interface
// ===========================================================================

/**
 * Business rules engine service — manages and executes no-code rules.
 */
export interface BusinessRulesService {
  /** Create a new rule. */
  create(ctx: RequestContext, input: CreateRuleInput): Promise<BusinessRule>;

  /** Get a rule by ID. */
  get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null>;

  /** List rules. */
  list(ctx: RequestContext, state?: BusinessRule['state']): Promise<BusinessRule[]>;

  /** Update a rule. */
  update(ctx: RequestContext, ruleId: string, updates: Partial<CreateRuleInput>): Promise<BusinessRule>;

  /** Delete a rule. */
  delete(ctx: RequestContext, ruleId: string): Promise<void>;

  /** Submit a rule for approval. */
  submitForApproval(ctx: RequestContext, ruleId: string): Promise<BusinessRule>;

  /** Approve a rule. */
  approve(ctx: RequestContext, ruleId: string, reviewerId: string, notes?: string): Promise<BusinessRule>;

  /** Reject a rule. */
  reject(ctx: RequestContext, ruleId: string, reviewerId: string, notes: string): Promise<BusinessRule>;

  /** Activate an approved rule. */
  activate(ctx: RequestContext, ruleId: string): Promise<BusinessRule>;

  /** Deactivate a rule. */
  deactivate(ctx: RequestContext, ruleId: string): Promise<BusinessRule>;

  /** Execute a rule against provided data. */
  execute(ctx: RequestContext, ruleId: string, data: Map<string, Record<string, unknown>[]>): Promise<RuleExecutionResult>;

  /** Validate a rule's DAG (check for cycles, missing inputs). */
  validate(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }>;
}
