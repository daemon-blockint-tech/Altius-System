/**
 * Time-aware graph exploration and versioned saved analyses.
 *
 * Provides:
 *   1. Saved graph analyses with version history, sharing, and duplication
 *   2. Timeline view/filter/playback over object history
 *   3. Comparative time selection (diff two points in time)
 *   4. Revert to a previous analysis version
 */

import type { RequestContext } from './ontology.js';
import type { DateTime } from './scalars.js';

// ===========================================================================
// Saved analyses
// ===========================================================================

/** A saved graph analysis — a snapshot of an exploration state. */
export interface SavedAnalysis {
  id: string;
  tenantId: string;
  /** Analysis name. */
  name: string;
  description: string;
  /** The starting object type for the analysis. */
  rootObjectType: string;
  /** The starting object ID. */
  rootObjectId: string;
  /** Traversal steps defining the graph expansion. */
  traversalSteps: AnalysisTraversalStep[];
  /** Filters applied to the analysis. */
  filters: AnalysisFilter[];
  /** Layout configuration. */
  layout?: AnalysisLayout;
  /** Timeline configuration. */
  timeline?: AnalysisTimeline;
  /** Owner user ID. */
  ownerId: string;
  /** Shared with user IDs. */
  sharedWith: string[];
  /** Whether the analysis is public within the tenant. */
  isPublic: boolean;
  /** Tags for categorization. */
  tags: string[];
  /** Current version number. */
  version: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** A traversal step in an analysis. */
export interface AnalysisTraversalStep {
  /** Link type to traverse. */
  linkType: string;
  /** Direction of traversal. */
  direction: 'outgoing' | 'incoming' | 'both';
  /** Max depth from root. */
  maxDepth: number;
  /** Filter applied at this step. */
  filter?: AnalysisFilter;
}

/** A filter in an analysis. */
export interface AnalysisFilter {
  /** Object type to filter. */
  objectType?: string;
  /** Field predicates. */
  predicates?: Array<{ field: string; operator: string; value: unknown }>;
  /** Time filter for temporal queries. */
  timeFilter?: {
    field: string;
    from?: DateTime;
    to?: DateTime;
  };
}

/** Layout configuration for graph visualization. */
export interface AnalysisLayout {
  /** Layout algorithm. */
  algorithm: 'force-directed' | 'hierarchical' | 'radial' | 'grid';
  /** Node size property. */
  nodeSizeProperty?: string;
  /** Color property. */
  colorProperty?: string;
  /** Whether to show edge labels. */
  showEdgeLabels: boolean;
}

/** Timeline configuration for time-aware exploration. */
export interface AnalysisTimeline {
  /** Timestamp field for the timeline. */
  timestampField: string;
  /** Timeline start. */
  start?: DateTime;
  /** Timeline end. */
  end?: DateTime;
  /** Playback speed (ms per step). */
  playbackSpeedMs?: number;
  /** Current playback position. */
  currentPosition?: DateTime;
}

/** Input for creating a saved analysis. */
export interface CreateSavedAnalysisInput {
  name: string;
  description?: string;
  rootObjectType: string;
  rootObjectId: string;
  traversalSteps: AnalysisTraversalStep[];
  filters?: AnalysisFilter[];
  layout?: AnalysisLayout;
  timeline?: AnalysisTimeline;
  isPublic?: boolean;
  tags?: string[];
}

/** Input for updating a saved analysis (creates a new version). */
export interface UpdateSavedAnalysisInput extends Partial<CreateSavedAnalysisInput> {}

// ===========================================================================
// Analysis versions
// ===========================================================================

/** A version of a saved analysis. */
export interface AnalysisVersion {
  id: string;
  tenantId: string;
  /** The analysis ID. */
  analysisId: string;
  /** Version number. */
  version: number;
  /** Snapshot of the analysis at this version. */
  snapshot: SavedAnalysis;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Who created this version. */
  createdBy: string;
  /** Optional commit message. */
  message?: string;
}

// ===========================================================================
// Timeline comparison
// ===========================================================================

/** A point-in-time snapshot of an object for timeline comparison. */
export interface TimelineSnapshot {
  objectId: string;
  objectType: string;
  /** Timestamp of this snapshot. */
  timestamp: DateTime;
  /** Object state at this timestamp. */
  state: Record<string, unknown>;
  /** Version number. */
  version: number;
}

/** Result of comparing two points in time. */
export interface TimelineComparison {
  objectId: string;
  /** Left (earlier) snapshot. */
  left: TimelineSnapshot;
  /** Right (later) snapshot. */
  right: TimelineSnapshot;
  /** Fields that changed. */
  changedFields: Array<{ field: string; leftValue: unknown; rightValue: unknown }>;
  /** Fields added in the right snapshot. */
  addedFields: string[];
  /** Fields removed in the right snapshot. */
  removedFields: string[];
}

// ===========================================================================
// Time-aware graph analysis service
// ===========================================================================

/**
 * Time-aware graph analysis service — saved analyses with version history,
 * timeline playback, and comparative time selection.
 */
export interface GraphAnalysisService {
  // ── Saved analysis CRUD ──
  create(ctx: RequestContext, input: CreateSavedAnalysisInput): Promise<SavedAnalysis>;
  get(ctx: RequestContext, id: string): Promise<SavedAnalysis | null>;
  getByName(ctx: RequestContext, name: string): Promise<SavedAnalysis | null>;
  list(ctx: RequestContext, tags?: string[]): Promise<SavedAnalysis[]>;
  /** Update an analysis (creates a new version). */
  update(ctx: RequestContext, id: string, updates: UpdateSavedAnalysisInput, message?: string): Promise<SavedAnalysis>;
  delete(ctx: RequestContext, id: string): Promise<void>;

  // ── Sharing ──
  share(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAnalysis>;
  unshare(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAnalysis>;
  listShared(ctx: RequestContext, userId: string): Promise<SavedAnalysis[]>;

  // ── Duplication ──
  duplicate(ctx: RequestContext, id: string, newName: string): Promise<SavedAnalysis>;

  // ── Version history ──
  listVersions(ctx: RequestContext, id: string): Promise<AnalysisVersion[]>;
  getVersion(ctx: RequestContext, id: string, version: number): Promise<AnalysisVersion | null>;
  /** Revert an analysis to a previous version (creates a new version with old content). */
  revert(ctx: RequestContext, id: string, version: number, message?: string): Promise<SavedAnalysis>;

  // ── Timeline ──
  /** Get timeline snapshots for an object between two times. */
  getTimeline(ctx: RequestContext, objectId: string, objectType: string, from?: DateTime, to?: DateTime): Promise<TimelineSnapshot[]>;
  /** Compare an object's state at two points in time. */
  compare(ctx: RequestContext, objectId: string, objectType: string, leftTime: DateTime, rightTime: DateTime): Promise<TimelineComparison>;
}
