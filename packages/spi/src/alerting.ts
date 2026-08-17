/**
 * Time-series rules and alerting.
 *
 * A rule defines a threshold condition over a time series. When the
 * condition is met for a sustained interval, an alert is raised and
 * a notification is dispatched via the NotificationStore.
 */

import type { RequestContext } from './ontology.js';
import type { TimeSeriesPoint } from './time-series.js';

/** Comparison operator for threshold rules. */
export type ThresholdOperator = 'gt' | 'gte' | 'lt' | 'lte';

/** A threshold rule over a time series. */
export interface ThresholdRule {
  /** Rule ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** Rule name. */
  name: string;
  /** Object type the rule applies to. */
  objectType: string;
  /** Object ID the rule applies to. */
  objectId: string;
  /** Time-series property to monitor. */
  property: string;
  /** Tag filter (optional). Only points matching all tags are evaluated. */
  tagFilter?: Record<string, string>;
  /** Threshold operator. */
  operator: ThresholdOperator;
  /** Threshold value. */
  threshold: number;
  /**
   * Number of consecutive points that must satisfy the condition before
   * an alert is raised. Default 1 (immediate).
   */
  consecutivePoints?: number;
  /**
   * Minimum duration in seconds that the condition must hold before an
   * alert is raised. When set, the evaluator checks that the time span
   * between the first and last qualifying points covers this duration.
   */
  minDurationSeconds?: number;
  /** Whether the rule is active. */
  enabled: boolean;
  /** ISO 8601 timestamp when the rule was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the rule was last updated. */
  updatedAt: string;
}

/** Input for creating a threshold rule. */
export interface CreateThresholdRuleInput {
  name: string;
  objectType: string;
  objectId: string;
  property: string;
  tagFilter?: Record<string, string>;
  operator: ThresholdOperator;
  threshold: number;
  consecutivePoints?: number;
  minDurationSeconds?: number;
  enabled?: boolean;
}

/** An alert raised by a rule. */
export interface Alert {
  /** Alert ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** Rule that raised this alert. */
  ruleId: string;
  /** Rule name (snapshot). */
  ruleName: string;
  /** Object type. */
  objectType: string;
  /** Object ID. */
  objectId: string;
  /** Property. */
  property: string;
  /** The value that triggered the alert. */
  triggeredValue: number;
  /** Threshold that was crossed. */
  threshold: number;
  /** Operator. */
  operator: ThresholdOperator;
  /** ISO 8601 timestamp of the triggering point. */
  triggeredAt: string;
  /** ISO 8601 timestamp when the alert was created. */
  createdAt: string;
  /** Alert status. */
  status: 'active' | 'acknowledged' | 'resolved';
  /** User ID who acknowledged/resolved (if any). */
  acknowledgedBy?: string;
  /** Notification IDs dispatched for this alert. */
  notificationIds: string[];
}

/** Query for listing alerts. */
export interface AlertQuery {
  status?: 'active' | 'acknowledged' | 'resolved';
  ruleId?: string;
  objectType?: string;
  objectId?: string;
  limit?: number;
  offset?: number;
}

/** Result of evaluating a rule against a set of points. */
export interface RuleEvaluationResult {
  ruleId: string;
  triggered: boolean;
  alert?: Alert;
}

/**
 * Alerting service — manages threshold rules and alerts over time series.
 *
 * The service evaluates rules against time-series points and raises alerts
 * when conditions are met. Alerts are persisted and notifications are
 * dispatched via the NotificationStore (when available).
 */
export interface AlertingService {
  // ── Rule management ──
  createRule(ctx: RequestContext, input: CreateThresholdRuleInput): Promise<ThresholdRule>;
  getRule(ctx: RequestContext, ruleId: string): Promise<ThresholdRule | null>;
  listRules(ctx: RequestContext, objectType?: string, objectId?: string): Promise<ThresholdRule[]>;
  updateRule(ctx: RequestContext, ruleId: string, updates: Partial<CreateThresholdRuleInput & { enabled: boolean }>): Promise<ThresholdRule | null>;
  deleteRule(ctx: RequestContext, ruleId: string): Promise<void>;

  // ── Alert management ──
  getAlert(ctx: RequestContext, alertId: string): Promise<Alert | null>;
  listAlerts(ctx: RequestContext, query?: AlertQuery): Promise<{ alerts: Alert[]; totalCount: number }>;
  acknowledgeAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void>;
  resolveAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void>;

  // ── Evaluation ──
  /**
   * Evaluate a rule against a set of time-series points.
   * Returns whether the rule was triggered and the alert if raised.
   */
  evaluateRule(ctx: RequestContext, ruleId: string, points: TimeSeriesPoint[]): Promise<RuleEvaluationResult>;

  /**
   * Evaluate all enabled rules for a given object/property.
   * Called after new time-series points are ingested.
   */
  evaluateForSeries(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    property: string,
    points: TimeSeriesPoint[],
  ): Promise<RuleEvaluationResult[]>;
}

/**
 * Check if a single point satisfies a threshold condition.
 */
export function pointSatisfies(point: TimeSeriesPoint, operator: ThresholdOperator, threshold: number): boolean {
  const v = point.value;
  if (typeof v !== 'number') return false;
  switch (operator) {
    case 'gt': return v > threshold;
    case 'gte': return v >= threshold;
    case 'lt': return v < threshold;
    case 'lte': return v <= threshold;
  }
}

/**
 * Check if a sequence of consecutive points satisfies a threshold condition.
 * Returns the index of the first qualifying point and the count of consecutive
 * qualifying points, or null if the condition is not met.
 */
export function findConsecutiveRun(
  points: TimeSeriesPoint[],
  operator: ThresholdOperator,
  threshold: number,
  required: number,
  minDurationSeconds?: number,
): { startIndex: number; count: number; durationSeconds: number } | null {
  if (points.length === 0 || required <= 0) return null;

  // Sort by timestamp ascending
  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let runStart = -1;
  let runCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (pointSatisfies(sorted[i]!, operator, threshold)) {
      if (runStart === -1) runStart = i;
      runCount++;
      if (runCount >= required) {
        const start = sorted[runStart]!;
        const end = sorted[i]!;
        const durationSeconds = (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / 1000;
        if (minDurationSeconds === undefined || durationSeconds >= minDurationSeconds) {
          return { startIndex: runStart, count: runCount, durationSeconds };
        }
        // Duration not met — reset and continue looking
        runStart = -1;
        runCount = 0;
      }
    } else {
      runStart = -1;
      runCount = 0;
    }
  }

  return null;
}
