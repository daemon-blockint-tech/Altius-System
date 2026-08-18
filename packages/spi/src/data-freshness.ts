/**
 * Data freshness service — queryable per-type and per-datasource
 * last-synced timestamps for the Data Freshness widget.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Freshness records
// ===========================================================================

/** Freshness record for a single object type or datasource. */
export interface FreshnessRecord {
  id: string;
  tenantId: string;
  /** Object type (if this is a per-type record). */
  objectType?: string;
  /** Datasource name (if this is a per-datasource record). */
  datasource?: string;
  /** ISO 8601 timestamp of the last successful sync. */
  lastSyncedAt: string;
  /** ISO 8601 timestamp of the last sync attempt (success or failure). */
  lastAttemptedAt: string;
  /** Number of records processed in the last sync. */
  lastRecordCount: number;
  /** Whether the last sync succeeded. */
  lastSyncSucceeded: boolean;
  /** Error message from the last failed sync (if any). */
  lastError?: string;
  /** Sync interval in milliseconds. */
  intervalMs?: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Freshness query filter. */
export interface FreshnessQuery {
  objectType?: string;
  datasource?: string;
  /** Only return records fresher than this age (in seconds). */
  maxAgeSeconds?: number;
  /** Only return records older than this age (in seconds). */
  minAgeSeconds?: number;
}

/** Freshness summary for a tenant. */
export interface FreshnessSummary {
  totalTypes: number;
  totalDatasources: number;
  freshCount: number;
  staleCount: number;
  errorCount: number;
  oldestSync?: FreshnessRecord;
  newestSync?: FreshnessRecord;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Data freshness service — tracks and queries per-type and per-datasource
 * last-synced timestamps.
 */
export interface DataFreshnessService {
  /** Record a sync completion for an object type or datasource. */
  recordSync(ctx: RequestContext, input: {
    objectType?: string;
    datasource?: string;
    recordCount: number;
    succeeded: boolean;
    error?: string;
    intervalMs?: number;
  }): Promise<FreshnessRecord>;

  /** Get freshness for a specific object type. */
  getFreshnessForType(ctx: RequestContext, objectType: string): Promise<FreshnessRecord | null>;

  /** Get freshness for a specific datasource. */
  getFreshnessForDatasource(ctx: RequestContext, datasource: string): Promise<FreshnessRecord | null>;

  /** Query freshness records. */
  queryFreshness(ctx: RequestContext, query?: FreshnessQuery): Promise<FreshnessRecord[]>;

  /** Get a freshness summary for the tenant. */
  getSummary(ctx: RequestContext, maxAgeSeconds?: number): Promise<FreshnessSummary>;

  /** Delete a freshness record. */
  deleteFreshness(ctx: RequestContext, objectType?: string, datasource?: string): Promise<void>;
}
