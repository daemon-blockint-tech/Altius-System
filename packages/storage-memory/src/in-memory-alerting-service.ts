/**
 * In-memory alerting service.
 */

import { randomUUID } from 'node:crypto';
import type {
  AlertingService,
  ThresholdRule,
  CreateThresholdRuleInput,
  Alert,
  AlertQuery,
  RuleEvaluationResult,
  TimeSeriesPoint,
  RequestContext,
  NotificationStore,
} from '@altius/spi';
import { findConsecutiveRun } from '@altius/spi';

export interface InMemoryAlertingServiceOptions {
  /** Optional notification store for dispatching alert notifications. */
  notificationStore?: NotificationStore;
  /** User ID to notify when an alert is raised. If not set, no notification is dispatched. */
  notifyUserId?: string;
}

export class InMemoryAlertingService implements AlertingService {
  private readonly rules = new Map<string, Map<string, ThresholdRule>>();
  private readonly alerts = new Map<string, Map<string, Alert>>();
  private readonly options: InMemoryAlertingServiceOptions;

  constructor(options?: InMemoryAlertingServiceOptions) {
    this.options = options ?? {};
  }

  // ── Rule management ──

  async createRule(ctx: RequestContext, input: CreateThresholdRuleInput): Promise<ThresholdRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const rule: ThresholdRule = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      objectType: input.objectType,
      objectId: input.objectId,
      property: input.property,
      tagFilter: input.tagFilter,
      operator: input.operator,
      threshold: input.threshold,
      consecutivePoints: input.consecutivePoints ?? 1,
      minDurationSeconds: input.minDurationSeconds,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.getOrCreateMap(this.rules, ctx.tenantId).set(id, rule);
    return rule;
  }

  async getRule(ctx: RequestContext, ruleId: string): Promise<ThresholdRule | null> {
    return this.rules.get(ctx.tenantId)?.get(ruleId) ?? null;
  }

  async listRules(ctx: RequestContext, objectType?: string, objectId?: string): Promise<ThresholdRule[]> {
    const tenantRules = this.rules.get(ctx.tenantId);
    if (!tenantRules) return [];
    let results = Array.from(tenantRules.values());
    if (objectType) results = results.filter(r => r.objectType === objectType);
    if (objectId) results = results.filter(r => r.objectId === objectId);
    return results;
  }

  async updateRule(ctx: RequestContext, ruleId: string, updates: Partial<CreateThresholdRuleInput & { enabled: boolean }>): Promise<ThresholdRule | null> {
    const tenantRules = this.rules.get(ctx.tenantId);
    if (!tenantRules) return null;
    const existing = tenantRules.get(ruleId);
    if (!existing) return null;
    const updated: ThresholdRule = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    tenantRules.set(ruleId, updated);
    return updated;
  }

  async deleteRule(ctx: RequestContext, ruleId: string): Promise<void> {
    this.rules.get(ctx.tenantId)?.delete(ruleId);
  }

  // ── Alert management ──

  async getAlert(ctx: RequestContext, alertId: string): Promise<Alert | null> {
    return this.alerts.get(ctx.tenantId)?.get(alertId) ?? null;
  }

  async listAlerts(ctx: RequestContext, query?: AlertQuery): Promise<{ alerts: Alert[]; totalCount: number }> {
    const tenantAlerts = this.alerts.get(ctx.tenantId);
    if (!tenantAlerts) return { alerts: [], totalCount: 0 };
    let results = Array.from(tenantAlerts.values());
    if (query?.status) results = results.filter(a => a.status === query.status);
    if (query?.ruleId) results = results.filter(a => a.ruleId === query.ruleId);
    if (query?.objectType) results = results.filter(a => a.objectType === query.objectType);
    if (query?.objectId) results = results.filter(a => a.objectId === query.objectId);

    const totalCount = results.length;
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);

    return { alerts: results, totalCount };
  }

  async acknowledgeAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void> {
    const tenantAlerts = this.alerts.get(ctx.tenantId);
    if (!tenantAlerts) return;
    const alert = tenantAlerts.get(alertId);
    if (alert) {
      tenantAlerts.set(alertId, { ...alert, status: 'acknowledged', acknowledgedBy: userId });
    }
  }

  async resolveAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void> {
    const tenantAlerts = this.alerts.get(ctx.tenantId);
    if (!tenantAlerts) return;
    const alert = tenantAlerts.get(alertId);
    if (alert) {
      tenantAlerts.set(alertId, { ...alert, status: 'resolved', acknowledgedBy: userId });
    }
  }

  // ── Evaluation ──

  async evaluateRule(ctx: RequestContext, ruleId: string, points: TimeSeriesPoint[]): Promise<RuleEvaluationResult> {
    const rule = await this.getRule(ctx, ruleId);
    if (!rule) return { ruleId, triggered: false };
    if (!rule.enabled) return { ruleId, triggered: false };

    // Filter by tags if specified
    let filteredPoints = points;
    if (rule.tagFilter) {
      filteredPoints = points.filter(p => {
        if (!p.tags) return false;
        for (const [k, v] of Object.entries(rule.tagFilter!)) {
          if (p.tags[k] !== v) return false;
        }
        return true;
      });
    }

    const required = rule.consecutivePoints ?? 1;
    const run = findConsecutiveRun(filteredPoints, rule.operator, rule.threshold, required, rule.minDurationSeconds);
    if (!run) return { ruleId, triggered: false };

    // Find the triggering point
    const sorted = [...filteredPoints].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const triggerPoint = sorted[run.startIndex + run.count - 1]!;

    // Create alert
    const alertId = randomUUID();
    const now = new Date().toISOString();
    const notificationIds: string[] = [];

    // Dispatch notification if configured
    if (this.options.notificationStore && this.options.notifyUserId) {
      const notif = await this.options.notificationStore.create({
        tenantId: ctx.tenantId,
        userId: this.options.notifyUserId,
        type: 'alert',
        title: `Alert: ${rule.name}`,
        body: `Value ${triggerPoint.value} ${rule.operator} ${rule.threshold} for ${rule.objectType}.${rule.property}`,
        severity: rule.operator === 'gt' || rule.operator === 'gte' ? 'warning' : 'critical',
        sourceObjectType: rule.objectType,
        sourceObjectId: rule.objectId,
        channels: ['platform'],
      });
      notificationIds.push(notif.id);
    }

    const alert: Alert = {
      id: alertId,
      tenantId: ctx.tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      objectType: rule.objectType,
      objectId: rule.objectId,
      property: rule.property,
      triggeredValue: typeof triggerPoint.value === 'number' ? triggerPoint.value : Number(triggerPoint.value),
      threshold: rule.threshold,
      operator: rule.operator,
      triggeredAt: triggerPoint.timestamp,
      createdAt: now,
      status: 'active',
      notificationIds,
    };

    this.getOrCreateMap(this.alerts, ctx.tenantId).set(alertId, alert);

    return { ruleId, triggered: true, alert };
  }

  async evaluateForSeries(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    property: string,
    points: TimeSeriesPoint[],
  ): Promise<RuleEvaluationResult[]> {
    const rules = await this.listRules(ctx, objectType, objectId);
    const matchingRules = rules.filter(r => r.property === property && r.enabled);
    const results: RuleEvaluationResult[] = [];
    for (const rule of matchingRules) {
      const result = await this.evaluateRule(ctx, rule.id, points);
      results.push(result);
    }
    return results;
  }

  // ── Helpers ──

  private getOrCreateMap<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
    }
    return m;
  }
}
