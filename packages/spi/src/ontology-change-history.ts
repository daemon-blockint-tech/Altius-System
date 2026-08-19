/**
 * Ontology change history — read and restore previously recorded schema versions.
 *
 * Backed by the schema registry (which stores an immutable snapshot per
 * applied version). This service surfaces those snapshots through the REST/
 * GraphQL API and supports a restore-of-type operation that rolls an object
 * type's definition back to a prior version while preserving the rest of the
 * ontology.
 */

import type { RequestContext } from './ontology.js';

/** A single schema version / change record. */
export interface OntologyChangeRecord {
  id: string;
  tenantId: string;
  version: number;
  appliedAt: string;
  appliedBy: string;
  migrationClass: string;
  diffSummary: string;
  /** Full snapshot of the schema at this version. */
  snapshot: Record<string, unknown>;
}

/** Filter for listing change records. */
export interface OntologyChangeHistoryQuery {
  objectType?: string;
  fromVersion?: number;
  toVersion?: number;
  migrationClass?: string;
  limit?: number;
  offset?: number;
}

/** Result of a restore operation. */
export interface OntologyRestoreResult {
  restored: boolean;
  changeId: string;
  objectType: string;
  version: number;
  appliedAt: string;
}

/**
 * Read + restore service for ontology change history.
 */
export interface OntologyChangeHistoryService {
  /** List change history records for the tenant. */
  listChanges(ctx: RequestContext, query?: OntologyChangeHistoryQuery): Promise<OntologyChangeRecord[]>;

  /** Get a single change record. */
  getChange(ctx: RequestContext, id: string): Promise<OntologyChangeRecord | null>;

  /** Restore a single object type to the schema captured in a prior change. */
  restore(ctx: RequestContext, id: string, objectType: string): Promise<OntologyRestoreResult>;
}
