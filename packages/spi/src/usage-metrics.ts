/**
 * Ontology usage metrics — per-type reads/writes/active users,
 * per-action and per-function usage with monitoring rules.
 */

import type { RequestContext } from './ontology.js';

// ---------------------------------------------------------------------------
// Usage event types
// ---------------------------------------------------------------------------

/** The kind of ontology operation being tracked. */
export type OntologyOperationType =
  | 'read'        // object read/query
  | 'create'      // object create
  | 'update'      // object update
  | 'delete'      // object delete
  | 'search'      // full-text search
  | 'aggregate'   // aggregation query
  | 'action'      // action execution
  | 'function'    // function execution
  | 'link'        // link traversal
  | 'subscription'; // subscription event

/** A usage event for an ontology operation. */
export interface OntologyUsageEvent {
  /** Tenant ID. */
  tenantId: string;
  /** User ID (if authenticated). */
  userId?: string;
  /** Operation type. */
  operation: OntologyOperationType;
  /** Object type involved. */
  objectType: string;
  /** Object ID (if applicable). */
  objectId?: string;
  /** Action or function name (if applicable). */
  actionOrFunctionName?: string;
  /** Whether the operation succeeded. */
  success: boolean;
  /** Duration in milliseconds. */
  durationMs: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Metrics aggregation
// ---------------------------------------------------------------------------

/** Per-type metrics over a time window. */
export interface ObjectTypeMetrics {
  objectType: string;
  totalReads: number;
  totalWrites: number;
  totalSearches: number;
  totalAggregates: number;
  totalActions: number;
  totalFunctions: number;
  totalErrors: number;
  activeUsers: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

/** Per-action/function metrics. */
export interface ActionFunctionMetrics {
  name: string;
  type: 'action' | 'function';
  totalExecutions: number;
  totalErrors: number;
  activeUsers: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

/** Overall usage summary for a tenant. */
export interface OntologyUsageSummary {
  tenantId: string;
  startTime: string;
  endTime: string;
  totalOperations: number;
  totalErrors: number;
  activeUsers: number;
  byObjectType: ObjectTypeMetrics[];
  byActionOrFunction: ActionFunctionMetrics[];
}

/** Query for usage metrics. */
export interface UsageMetricsQuery {
  startTime?: string;
  endTime?: string;
  objectType?: string;
  operation?: OntologyOperationType;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Monitoring rules
// ---------------------------------------------------------------------------

/** A monitoring rule over ontology usage. */
export interface UsageMonitoringRule {
  id: string;
  tenantId: string;
  name: string;
  /** The metric to monitor. */
  metric: 'error_rate' | 'avg_duration' | 'p95_duration' | 'request_count';
  /** Object type to monitor (or '*' for all). */
  objectType: string;
  /** Operation type to monitor (or '*' for all). */
  operation: OntologyOperationType | '*';
  /** Threshold value. */
  threshold: number;
  /** Comparison operator. */
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  /** Time window in seconds for the metric calculation. */
  windowSeconds: number;
  /** Whether the rule is enabled. */
  enabled: boolean;
  createdAt: string;
}

/** Result of evaluating a monitoring rule. */
export interface MonitoringRuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  currentValue: number;
  threshold: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Ontology usage metrics service.
 *
 * Records usage events and provides aggregated metrics for observability
 * and change-impact analysis.
 */
export interface OntologyUsageMetricsService {
  /** Record a usage event. */
  record(event: OntologyUsageEvent): Promise<void>;

  /** Get per-type metrics for a tenant. */
  getObjectTypeMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ObjectTypeMetrics[]>;

  /** Get per-action/function metrics for a tenant. */
  getActionFunctionMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ActionFunctionMetrics[]>;

  /** Get a full usage summary for a tenant. */
  getSummary(tenantId: string, startTime?: string, endTime?: string): Promise<OntologyUsageSummary>;

  /** Query raw usage events. */
  queryEvents(tenantId: string, query: UsageMetricsQuery): Promise<{ events: OntologyUsageEvent[]; totalCount: number }>;

  /** Get active user count for a tenant over a time window. */
  getActiveUserCount(tenantId: string, startTime?: string, endTime?: string): Promise<number>;

  // ── Monitoring rules ──
  createMonitoringRule(ctx: RequestContext, rule: Omit<UsageMonitoringRule, 'id' | 'tenantId' | 'createdAt'>): Promise<UsageMonitoringRule>;
  listMonitoringRules(ctx: RequestContext): Promise<UsageMonitoringRule[]>;
  deleteMonitoringRule(ctx: RequestContext, ruleId: string): Promise<void>;
  evaluateMonitoringRules(ctx: RequestContext): Promise<MonitoringRuleResult[]>;
}
