/**
 * WorkflowMonitor — logs workflow events and tracks ontology metrics.
 *
 * Foundry's "workflow monitoring" pitch is: log actions taken and track
 * Ontology metrics to improve and debug workflows. Altius already had audit
 * records, CloudEvents, and OpenTelemetry metrics, but they were not
 * correlated into a *workflow* view — an operator could see that action X
 * ran and that metric Y increased, but not that action X caused function Z
 * which wrote object W.
 *
 * The monitor adds:
 *
 *   - **WorkflowEvent records** with a `workflowId` correlation id, so a
 *     multi-step workflow (action → function → object write) can be
 *     reconstructed end-to-end from a single query.
 *   - **Metrics** emitted through the existing observability package:
 *     workflow event count, duration, and failures. Labels are bounded
 *     (workflow kind, outcome) — never tenant or user data — so cardinality
 *     cannot explode.
 *   - **A query surface** for debugging: given a workflowId, return the
 *     ordered event log; given a tenant, return recent workflow summaries.
 *
 * The monitor is an in-memory implementation suitable for MVP and tests.
 * Production deployments back it with the same audit store used for
 * compliance records (the `WorkflowEventStore` interface mirrors
 * `AuditStore` so a Postgres implementation is a thin adapter).
 */

import type { AltiusMetrics } from '@altius/observability';
import type { DateTime } from '@altius/spi';

// ---------------------------------------------------------------------------
// Workflow event model
// ---------------------------------------------------------------------------

export type WorkflowEventKind = 'action' | 'function' | 'object_write' | 'llm_call' | 'sync';

export type WorkflowOutcome = 'success' | 'failure' | 'in_progress';

export interface WorkflowEvent {
  id: string;
  /** Correlation id linking the steps of one workflow run. */
  workflowId: string;
  tenantId: string;
  kind: WorkflowEventKind;
  /** Action name, function name, object type, etc. — bounded, no user data. */
  label: string;
  outcome: WorkflowOutcome;
  timestamp: DateTime;
  /** Duration of the step in milliseconds, when known. */
  durationMs?: number;
  /** Object type/id touched, when applicable. */
  objectType?: string;
  objectId?: string;
  /** Error message on failure. */
  error?: string;
  /** Tokens consumed for `kind: 'llm_call'`. */
  tokens?: number;
  /** Retry count for `kind: 'llm_call'` or `kind: 'function'`. */
  retries?: number;
}

export interface WorkflowSummary {
  workflowId: string;
  tenantId: string;
  eventCount: number;
  startedAt: DateTime;
  lastUpdatedAt: DateTime;
  outcomes: Record<WorkflowOutcome, number>;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface WorkflowEventStore {
  write(event: WorkflowEvent): Promise<void>;
  queryByWorkflow(tenantId: string, workflowId: string): Promise<WorkflowEvent[]>;
  queryRecent(tenantId: string, limit?: number): Promise<WorkflowEvent[]>;
}

/**
 * In-memory WorkflowEventStore for MVP and tests.
 *
 * Stored as an array; query is a linear scan. Suitable for a single-process
 * deployment or tests; a production implementation indexes by (tenant,
 * workflowId) and persists to the audit table.
 */
export class InMemoryWorkflowEventStore implements WorkflowEventStore {
  private readonly events: WorkflowEvent[] = [];

  async write(event: WorkflowEvent): Promise<void> {
    this.events.push(event);
  }

  async queryByWorkflow(tenantId: string, workflowId: string): Promise<WorkflowEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.workflowId === workflowId)
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  }

  async queryRecent(tenantId: string, limit = 100): Promise<WorkflowEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId)
      .slice(-limit)
      .reverse();
  }

  /** Test utility. */
  clear(): void {
    this.events.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export interface WorkflowMonitorConfig {
  store: WorkflowEventStore;
  metrics?: AltiusMetrics;
}

/**
 * Records workflow events and emits metrics.
 *
 * The monitor is the single entry point for workflow-level observability: a
 * caller that records an event here gets both a queryable log row *and* the
 * relevant OTel counters/histograms, with consistent labels. Splitting the
 * two would let them drift; a workflow that emits a metric but no log row is
 * un-debuggable, and a log row with no metric is un-alertable.
 */
export class WorkflowMonitor {
  private readonly store: WorkflowEventStore;
  private readonly metrics?: AltiusMetrics;
  private counter = 0;

  constructor(config: WorkflowMonitorConfig) {
    this.store = config.store;
    this.metrics = config.metrics;
  }

  /**
   * Record a workflow step.
   *
   * Returns the created event (with its generated id) so the caller can
   * later update it (e.g. mark an in_progress step as success/failure).
   */
  async record(input: Omit<WorkflowEvent, 'id' | 'timestamp'> & { timestamp?: DateTime }): Promise<WorkflowEvent> {
    const event: WorkflowEvent = {
      ...input,
      id: `wf-${++this.counter}`,
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    await this.store.write(event);
    this.emitMetrics(event);
    return event;
  }

  /**
   * Update an existing event's outcome and duration (e.g. on completion of
   * an in_progress step). Implemented as an append: the original record is
   * left immutable (audit evidence) and a new row with the same workflowId
   * and label carries the final outcome.
   */
  async complete(
    workflowId: string,
    tenantId: string,
    kind: WorkflowEventKind,
    label: string,
    outcome: 'success' | 'failure',
    fields?: Partial<Pick<WorkflowEvent, 'durationMs' | 'error' | 'tokens' | 'retries' | 'objectType' | 'objectId'>>,
  ): Promise<WorkflowEvent> {
    return this.record({
      workflowId,
      tenantId,
      kind,
      label,
      outcome,
      ...fields,
    });
  }

  /** Query the ordered event log for a workflow. */
  async getWorkflowLog(tenantId: string, workflowId: string): Promise<WorkflowEvent[]> {
    return this.store.queryByWorkflow(tenantId, workflowId);
  }

  /** Query recent workflow events for a tenant. */
  async getRecentEvents(tenantId: string, limit?: number): Promise<WorkflowEvent[]> {
    return this.store.queryRecent(tenantId, limit);
  }

  /**
   * Summarise a workflow: event count, time span, outcome counts.
   */
  async summarizeWorkflow(tenantId: string, workflowId: string): Promise<WorkflowSummary | null> {
    const events = await this.store.queryByWorkflow(tenantId, workflowId);
    if (events.length === 0) return null;
    const outcomes: Record<WorkflowOutcome, number> = { success: 0, failure: 0, in_progress: 0 };
    for (const e of events) outcomes[e.outcome]++;
    const first = events[0]!;
    const last = events[events.length - 1]!;
    return {
      workflowId,
      tenantId,
      eventCount: events.length,
      startedAt: first.timestamp,
      lastUpdatedAt: last.timestamp,
      outcomes,
    };
  }

  private emitMetrics(event: WorkflowEvent): void {
    const m = this.metrics;
    if (!m) return;
    m.workflowEvents.add(1);
    if (event.outcome === 'failure') m.workflowFailures.add(1);
    if (event.durationMs !== undefined) m.workflowDuration.record(event.durationMs);
  }
}

/**
 * Generate a new workflow id. Stable, sortable, and unique enough for
 * correlation across a single workflow run.
 */
export function newWorkflowId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
