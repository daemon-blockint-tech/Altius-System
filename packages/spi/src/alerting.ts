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

// ─── Anomaly detection ────────────────────────────────────────────────────

/** Anomaly detection method. */
export type AnomalyMethod = 'zscore' | 'iqr' | 'moving_average';

/** Configuration for anomaly detection. */
export interface AnomalyDetectionConfig {
  /** Detection method. */
  method: AnomalyMethod;
  /** Z-score threshold (for 'zscore' method). Default 3.0. */
  zThreshold?: number;
  /** IQR multiplier (for 'iqr' method). Default 1.5. */
  iqrMultiplier?: number;
  /** Window size for moving average (for 'moving_average' method). Default 10. */
  windowSize?: number;
  /** Number of standard deviations for moving average bands. Default 3.0. */
  sigmaThreshold?: number;
}

/** A detected anomaly in a time series. */
export interface AnomalyPoint {
  /** The timestamp of the anomalous point. */
  timestamp: string;
  /** The anomalous value. */
  value: number;
  /** The method that detected the anomaly. */
  method: AnomalyMethod;
  /** Score: z-score, IQR distance, or sigma deviation. */
  score: number;
  /** Expected value (mean, median, or moving average). */
  expected: number;
}

/**
 * Detect anomalies in a time series using statistical methods.
 *
 * - zscore: flags points whose value deviates more than `zThreshold` standard
 *   deviations from the mean.
 * - iqr: flags points outside [Q1 - k*IQR, Q3 + k*IQR] where k is
 *   `iqrMultiplier`.
 * - moving_average: flags points whose value deviates more than
 *   `sigmaThreshold` standard deviations from a rolling moving average.
 */
export function detectAnomalies(
  points: TimeSeriesPoint[],
  config: AnomalyDetectionConfig,
): AnomalyPoint[] {
  const numeric = points.filter((p) => typeof p.value === 'number') as Array<
    TimeSeriesPoint & { value: number }
  >;
  if (numeric.length === 0) return [];

  const anomalies: AnomalyPoint[] = [];

  switch (config.method) {
    case 'zscore': {
      const values = numeric.map((p) => p.value);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance =
        values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      if (std === 0) return [];
      const z = config.zThreshold ?? 3.0;
      for (const p of numeric) {
        const zscore = Math.abs((p.value - mean) / std);
        if (zscore > z) {
          anomalies.push({
            timestamp: p.timestamp,
            value: p.value,
            method: 'zscore',
            score: zscore,
            expected: mean,
          });
        }
      }
      break;
    }
    case 'iqr': {
      const sorted = [...numeric.map((p) => p.value)].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
      const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
      const iqr = q3 - q1;
      const k = config.iqrMultiplier ?? 1.5;
      const lower = q1 - k * iqr;
      const upper = q3 + k * iqr;
      for (const p of numeric) {
        if (p.value < lower || p.value > upper) {
          const dist = p.value < lower ? lower - p.value : p.value - upper;
          anomalies.push({
            timestamp: p.timestamp,
            value: p.value,
            method: 'iqr',
            score: dist,
            expected: p.value < lower ? q1 : q3,
          });
        }
      }
      break;
    }
    case 'moving_average': {
      const window = config.windowSize ?? 10;
      const sigma = config.sigmaThreshold ?? 3.0;
      for (let i = 0; i < numeric.length; i++) {
        const start = Math.max(0, i - window);
        const windowPts = numeric.slice(start, i);
        if (windowPts.length < 3) continue;
        const values = windowPts.map((p) => p.value);
        const ma = values.reduce((s, v) => s + v, 0) / values.length;
        const variance =
          values.reduce((s, v) => s + (v - ma) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);
        if (std === 0) continue;
        const dev = Math.abs((numeric[i]!.value - ma) / std);
        if (dev > sigma) {
          anomalies.push({
            timestamp: numeric[i]!.timestamp,
            value: numeric[i]!.value,
            method: 'moving_average',
            score: dev,
            expected: ma,
          });
        }
      }
      break;
    }
  }

  return anomalies;
}

// ─── Interval detection ───────────────────────────────────────────────────

/** Result of interval detection on a time series. */
export interface IntervalDetectionResult {
  /** Detected median interval between points, in seconds. */
  medianIntervalSeconds: number;
  /** Mean interval between points, in seconds. */
  meanIntervalSeconds: number;
  /** Minimum interval between consecutive points, in seconds. */
  minIntervalSeconds: number;
  /** Maximum interval between consecutive points, in seconds. */
  maxIntervalSeconds: number;
  /** Standard deviation of intervals, in seconds. */
  stdIntervalSeconds: number;
  /** Human-readable bucket label (e.g. "1s", "5m", "1h", "1d"). */
  detectedBucket: string;
  /** Whether the intervals are regular (std/mean < 0.1). */
  isRegular: boolean;
  /** Gaps: intervals that are more than 3x the median. */
  gaps: Array<{ start: string; end: string; durationSeconds: number }>;
}

/**
 * Detect the sampling interval of a time series.
 *
 * Computes the intervals between consecutive points and returns statistics
 * plus a human-readable bucket label. Also identifies gaps where the interval
 * is more than 3x the median.
 */
export function detectInterval(points: TimeSeriesPoint[]): IntervalDetectionResult | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt =
      (new Date(sorted[i]!.timestamp).getTime() -
        new Date(sorted[i - 1]!.timestamp).getTime()) /
      1000;
    if (dt > 0) intervals.push(dt);
  }

  if (intervals.length === 0) return null;

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const median =
    sortedIntervals.length % 2 === 0
      ? (sortedIntervals[sortedIntervals.length / 2 - 1]! +
          sortedIntervals[sortedIntervals.length / 2]!) /
        2
      : sortedIntervals[Math.floor(sortedIntervals.length / 2)]!;
  const min = sortedIntervals[0]!;
  const max = sortedIntervals[sortedIntervals.length - 1]!;
  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const std = Math.sqrt(variance);

  // Detect gaps
  const gaps: Array<{ start: string; end: string; durationSeconds: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt =
      (new Date(sorted[i]!.timestamp).getTime() -
        new Date(sorted[i - 1]!.timestamp).getTime()) /
      1000;
    if (dt > median * 3) {
      gaps.push({
        start: sorted[i - 1]!.timestamp,
        end: sorted[i]!.timestamp,
        durationSeconds: dt,
      });
    }
  }

  return {
    medianIntervalSeconds: median,
    meanIntervalSeconds: mean,
    minIntervalSeconds: min,
    maxIntervalSeconds: max,
    stdIntervalSeconds: std,
    detectedBucket: bucketLabel(median),
    isRegular: std / mean < 0.1,
    gaps,
  };
}

function bucketLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / 604800)}w`;
}
