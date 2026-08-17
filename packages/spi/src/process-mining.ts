/**
 * Process mining, event objects, and timeline analytics.
 *
 * Provides:
 *   - Event objects with start/end timestamps, badges, thresholds
 *   - Process mining (derive process models from historical event logs)
 *   - Process monitoring (compare actual events against defined process)
 *   - Timeline analytics (time selection, scrubbing, event ordering)
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Event objects
// ===========================================================================

/** An event object — something that happened with a time span. */
export interface EventObject {
  id: string;
  tenantId: string;
  /** Event type (e.g. 'admission', 'surgery', 'discharge'). */
  eventType: string;
  /** The case/process instance this event belongs to. */
  caseId: string;
  /** The object this event is about. */
  objectId?: string;
  /** The object type this event is about. */
  objectType?: string;
  /** ISO 8601 start timestamp. */
  startTime: string;
  /** ISO 8601 end timestamp (optional for instantaneous events). */
  endTime?: string;
  /** Duration in milliseconds (computed from start/end). */
  durationMs?: number;
  /** The actor/user who triggered the event. */
  actorId?: string;
  /** Event badges (labels/tags for display). */
  badges: string[];
  /** Whether this event breached a threshold. */
  thresholdBreached?: boolean;
  /** Threshold details (if breached). */
  thresholdDetails?: {
    metric: string;
    value: number;
    threshold: number;
    direction: 'above' | 'below';
  };
  /** Custom attributes. */
  attributes: Record<string, unknown>;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Input for creating an event object. */
export interface CreateEventInput {
  eventType: string;
  caseId: string;
  objectId?: string;
  objectType?: string;
  startTime: string;
  endTime?: string;
  actorId?: string;
  badges?: string[];
  attributes?: Record<string, unknown>;
}

/** Query for event objects. */
export interface EventQuery {
  caseId?: string;
  eventType?: string;
  objectId?: string;
  objectType?: string;
  actorId?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  thresholdBreached?: boolean;
  badges?: string[];
  limit?: number;
  offset?: number;
}

// ===========================================================================
// Process mining
// ===========================================================================

/** A process model node — an activity in the process. */
export interface ProcessNode {
  activityName: string;
  /** Frequency of this activity in the event log. */
  frequency: number;
  /** Average duration in milliseconds. */
  avgDurationMs: number;
  /** Min duration. */
  minDurationMs: number;
  /** Max duration. */
  maxDurationMs: number;
}

/** A process model edge — a transition between activities. */
export interface ProcessEdge {
  fromActivity: string;
  toActivity: string;
  /** Frequency of this transition. */
  frequency: number;
  /** Average waiting time between activities in ms. */
  avgWaitingMs: number;
}

/** A discovered process model. */
export interface ProcessModel {
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  /** Total cases analyzed. */
  totalCases: number;
  /** Total events analyzed. */
  totalEvents: number;
  /** Start activities. */
  startActivities: string[];
  /** End activities. */
  endActivities: string[];
  /** ISO 8601 discovery timestamp. */
  discoveredAt: string;
}

/** A process variant — a specific sequence of activities. */
export interface ProcessVariant {
  /** Activity sequence. */
  activities: string[];
  /** Number of cases following this variant. */
  caseCount: number;
  /** Percentage of total cases. */
  percentage: number;
  /** Average total duration in ms. */
  avgDurationMs: number;
}

/** A process conformance check result. */
export interface ConformanceResult {
  /** Total cases checked. */
  totalCases: number;
  /** Cases that conform to the defined process. */
  conformingCases: number;
  /** Cases that deviate. */
  deviatingCases: number;
  /** Fitness score (0-1). */
  fitness: number;
  /** Per-case deviations. */
  deviations: Array<{
    caseId: string;
    expectedActivity?: string;
    actualActivity: string;
    deviationType: 'missing' | 'unexpected' | 'order';
  }>;
}

// ===========================================================================
// Service interfaces
// ===========================================================================

/**
 * Event object service — manages event objects with time spans.
 */
export interface EventObjectService {
  create(ctx: RequestContext, input: CreateEventInput): Promise<EventObject>;
  get(ctx: RequestContext, eventId: string): Promise<EventObject | null>;
  list(ctx: RequestContext, query?: EventQuery): Promise<{ events: EventObject[]; totalCount: number }>;
  update(ctx: RequestContext, eventId: string, updates: Partial<CreateEventInput>): Promise<EventObject>;
  delete(ctx: RequestContext, eventId: string): Promise<void>;
  /** Set a threshold for an event type and mark breaches. */
  setThreshold(ctx: RequestContext, eventType: string, metric: string, threshold: number, direction: 'above' | 'below'): Promise<void>;
  /** Get events for a time range (timeline scrubbing). */
  getTimeline(ctx: RequestContext, startTime: string, endTime: string, caseId?: string): Promise<EventObject[]>;
}

/**
 * Process mining service — discovers process models from event logs.
 */
export interface ProcessMiningService {
  /** Discover a process model from event objects. */
  discover(ctx: RequestContext, eventLog: EventObject[]): Promise<ProcessModel>;
  /** Discover process variants (unique activity sequences). */
  discoverVariants(ctx: RequestContext, eventLog: EventObject[], limit?: number): Promise<ProcessVariant[]>;
  /** Check conformance of events against a defined process. */
  checkConformance(ctx: RequestContext, eventLog: EventObject[], expectedProcess: string[]): Promise<ConformanceResult>;
  /** Get process statistics for a specific case. */
  getCaseStatistics(ctx: RequestContext, caseId: string, eventLog: EventObject[]): Promise<{
    caseId: string;
    eventCount: number;
    totalDurationMs: number;
    activities: string[];
    startTime: string;
    endTime: string;
  }>;
}
