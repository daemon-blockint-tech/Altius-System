/**
 * In-memory ontology usage metrics service.
 */

import { randomUUID } from 'node:crypto';
import type {
  OntologyUsageMetricsService,
  OntologyUsageEvent,
  ObjectTypeMetrics,
  ActionFunctionMetrics,
  OntologyUsageSummary,
  UsageMetricsQuery,
  UsageMonitoringRule,
  MonitoringRuleResult,
  RequestContext,
} from '@altius/spi';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
  return sorted[idx]!;
}

/** Days of usage events kept. Matches the 30-day window the API reports over. */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Hard ceiling on retained events, independent of age.
 *
 * Every served request writes one event here, so a busy single process would
 * otherwise grow this array until the heap runs out — and it is instrumentation,
 * the one subsystem that must not be able to take the API down. When the cap is
 * hit the OLDEST events are dropped: recent data is what a monitoring rule
 * evaluates, and losing the tail of a 30-day window is recoverable where an
 * OOM is not.
 */
const DEFAULT_MAX_EVENTS = 500_000;

export interface InMemoryUsageMetricsOptions {
  retentionDays?: number;
  maxEvents?: number;
}

export class InMemoryOntologyUsageMetricsService implements OntologyUsageMetricsService {
  private events: OntologyUsageEvent[] = [];
  private readonly rules = new Map<string, Map<string, UsageMonitoringRule>>();
  private readonly retentionMs: number;
  private readonly maxEvents: number;
  /** Events recorded since the last prune, so pruning is amortised. */
  private sincePrune = 0;

  constructor(options: InMemoryUsageMetricsOptions = {}) {
    this.retentionMs = (options.retentionDays ?? DEFAULT_RETENTION_DAYS) * 86_400_000;
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  }

  async record(event: OntologyUsageEvent): Promise<void> {
    this.events.push(event);
    // Amortise: scanning the array on every request would make the metrics
    // layer O(n) per served request, which is worse than the leak it fixes.
    if (++this.sincePrune >= 1000 || this.events.length > this.maxEvents) {
      this.prune();
    }
  }

  /** Drop events past the retention window, then past the count ceiling. */
  private prune(): void {
    this.sincePrune = 0;
    const cutoff = Date.now() - this.retentionMs;
    this.events = this.events.filter(e => Date.parse(e.timestamp) >= cutoff);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(this.events.length - this.maxEvents);
    }
  }

  async getObjectTypeMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ObjectTypeMetrics[]> {
    const events = this.filterEvents(tenantId, startTime, endTime);
    const byType = new Map<string, OntologyUsageEvent[]>();

    for (const e of events) {
      const arr = byType.get(e.objectType) ?? [];
      arr.push(e);
      byType.set(e.objectType, arr);
    }

    const results: ObjectTypeMetrics[] = [];
    for (const [objectType, typeEvents] of byType) {
      const users = new Set(typeEvents.map(e => e.userId).filter(Boolean));
      const durations = typeEvents.map(e => e.durationMs).sort((a, b) => a - b);
      results.push({
        objectType,
        totalReads: typeEvents.filter(e => e.operation === 'read').length,
        totalWrites: typeEvents.filter(e => e.operation === 'create' || e.operation === 'update' || e.operation === 'delete').length,
        totalSearches: typeEvents.filter(e => e.operation === 'search').length,
        totalAggregates: typeEvents.filter(e => e.operation === 'aggregate').length,
        totalActions: typeEvents.filter(e => e.operation === 'action').length,
        totalFunctions: typeEvents.filter(e => e.operation === 'function').length,
        totalErrors: typeEvents.filter(e => !e.success).length,
        activeUsers: users.size,
        avgDurationMs: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
        p95DurationMs: percentile(durations, 95),
      });
    }
    return results.sort((a, b) => a.objectType.localeCompare(b.objectType));
  }

  async getActionFunctionMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ActionFunctionMetrics[]> {
    const events = this.filterEvents(tenantId, startTime, endTime);
    const actionEvents = events.filter(e => (e.operation === 'action' || e.operation === 'function') && e.actionOrFunctionName);
    const byName = new Map<string, OntologyUsageEvent[]>();

    for (const e of actionEvents) {
      const name = e.actionOrFunctionName!;
      const arr = byName.get(name) ?? [];
      arr.push(e);
      byName.set(name, arr);
    }

    const results: ActionFunctionMetrics[] = [];
    for (const [name, nameEvents] of byName) {
      const users = new Set(nameEvents.map(e => e.userId).filter(Boolean));
      const durations = nameEvents.map(e => e.durationMs).sort((a, b) => a - b);
      results.push({
        name,
        type: nameEvents[0]!.operation === 'action' ? 'action' : 'function',
        totalExecutions: nameEvents.length,
        totalErrors: nameEvents.filter(e => !e.success).length,
        activeUsers: users.size,
        avgDurationMs: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
        p95DurationMs: percentile(durations, 95),
      });
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSummary(tenantId: string, startTime?: string, endTime?: string): Promise<OntologyUsageSummary> {
    const events = this.filterEvents(tenantId, startTime, endTime);
    const users = new Set(events.map(e => e.userId).filter(Boolean));
    const byObjectType = await this.getObjectTypeMetrics(tenantId, startTime, endTime);
    const byActionOrFunction = await this.getActionFunctionMetrics(tenantId, startTime, endTime);

    return {
      tenantId,
      startTime: startTime ?? events[0]?.timestamp ?? new Date().toISOString(),
      endTime: endTime ?? events[events.length - 1]?.timestamp ?? new Date().toISOString(),
      totalOperations: events.length,
      totalErrors: events.filter(e => !e.success).length,
      activeUsers: users.size,
      byObjectType,
      byActionOrFunction,
    };
  }

  async queryEvents(tenantId: string, query?: UsageMetricsQuery): Promise<{ events: OntologyUsageEvent[]; totalCount: number }> {
    let events = this.filterEvents(tenantId, query?.startTime, query?.endTime);
    if (query?.objectType) events = events.filter(e => e.objectType === query.objectType);
    if (query?.operation) events = events.filter(e => e.operation === query.operation);
    if (query?.userId) events = events.filter(e => e.userId === query.userId);

    const totalCount = events.length;
    events = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return { events, totalCount };
  }

  async getActiveUserCount(tenantId: string, startTime?: string, endTime?: string): Promise<number> {
    const events = this.filterEvents(tenantId, startTime, endTime);
    const users = new Set(events.map(e => e.userId).filter(Boolean));
    return users.size;
  }

  // ── Monitoring rules ──

  async createMonitoringRule(ctx: RequestContext, rule: Omit<UsageMonitoringRule, 'id' | 'tenantId' | 'createdAt'>): Promise<UsageMonitoringRule> {
    const id = randomUUID();
    const full: UsageMonitoringRule = {
      ...rule,
      id,
      tenantId: ctx.tenantId,
      createdAt: new Date().toISOString(),
    };
    this.getOrCreateRules(ctx.tenantId).set(id, full);
    return full;
  }

  async listMonitoringRules(ctx: RequestContext): Promise<UsageMonitoringRule[]> {
    return Array.from(this.getOrCreateRules(ctx.tenantId).values());
  }

  async deleteMonitoringRule(ctx: RequestContext, ruleId: string): Promise<void> {
    this.getOrCreateRules(ctx.tenantId).delete(ruleId);
  }

  async evaluateMonitoringRules(ctx: RequestContext): Promise<MonitoringRuleResult[]> {
    const rules = await this.listMonitoringRules(ctx);
    const now = Date.now();
    const results: MonitoringRuleResult[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;
      const startTime = new Date(now - rule.windowSeconds * 1000).toISOString();
      let events = this.filterEvents(ctx.tenantId, startTime);
      if (rule.objectType !== '*') events = events.filter(e => e.objectType === rule.objectType);
      if (rule.operation !== '*') events = events.filter(e => e.operation === rule.operation);

      let currentValue = 0;
      switch (rule.metric) {
        case 'error_rate':
          currentValue = events.length > 0 ? events.filter(e => !e.success).length / events.length : 0;
          break;
        case 'avg_duration':
          currentValue = events.length > 0 ? events.reduce((s, e) => s + e.durationMs, 0) / events.length : 0;
          break;
        case 'p95_duration': {
          const durations = events.map(e => e.durationMs).sort((a, b) => a - b);
          currentValue = percentile(durations, 95);
          break;
        }
        case 'request_count':
          currentValue = events.length;
          break;
      }

      let triggered = false;
      switch (rule.operator) {
        case 'gt': triggered = currentValue > rule.threshold; break;
        case 'gte': triggered = currentValue >= rule.threshold; break;
        case 'lt': triggered = currentValue < rule.threshold; break;
        case 'lte': triggered = currentValue <= rule.threshold; break;
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered,
        currentValue,
        threshold: rule.threshold,
        message: triggered ? `${rule.metric} (${currentValue.toFixed(2)}) ${rule.operator} ${rule.threshold}` : undefined,
      });
    }

    return results;
  }

  // ── Helpers ──

  private filterEvents(tenantId: string, startTime?: string, endTime?: string): OntologyUsageEvent[] {
    let events = this.events.filter(e => e.tenantId === tenantId);
    if (startTime) events = events.filter(e => e.timestamp >= startTime!);
    if (endTime) events = events.filter(e => e.timestamp <= endTime!);
    return events;
  }

  private getOrCreateRules(tenantId: string): Map<string, UsageMonitoringRule> {
    let m = this.rules.get(tenantId);
    if (!m) {
      m = new Map();
      this.rules.set(tenantId, m);
    }
    return m;
  }
}
