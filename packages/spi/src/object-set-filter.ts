/**
 * Object-set filter-state substrate — saved filter states, filter chips,
 * set algebra, and variable extraction.
 */

import type { RequestContext } from './ontology.js';
import type { FilterExpression, FieldPredicate } from './ontology.js';

// ── Filter state ────────────────────────────────────────────────────────

/** A single filter chip / pill. */
export interface FilterChip {
  id: string;
  field: string;
  /**
   * Comparison operator, restricted to the ones a FieldPredicate accepts.
   *
   * Typed as a plain `string` originally, which made a chip un-assignable to a
   * FilterExpression and — worse — let an operator no provider implements reach
   * storage: the memory provider ignores an unknown operator (matching
   * everything) while Postgres builds no clause for it. Two backends, two
   * different answers, neither an error.
   */
  operator: FieldPredicate['operator'];
  value: unknown;
  /** Optional variable name this chip writes to. */
  variableName?: string;
  /** Optional display label. */
  label?: string;
}

/** A saved filter state for an object set. */
export interface FilterState {
  id: string;
  tenantId: string;
  /** Object set this state belongs to. */
  objectSetId: string;
  /** Optional human-readable name. */
  name: string;
  /** Filter chips. */
  chips: FilterChip[];
  /** Extracted variable values. */
  variables: Record<string, unknown>;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update. */
  updatedAt: string;
}

/** Input for saving a filter state. */
export interface SaveFilterStateInput {
  name?: string;
  chips: FilterChip[];
  variables?: Record<string, unknown>;
}

/** Set algebra operation for combining filter states. */
export type FilterSetOp = 'UNION' | 'INTERSECT' | 'DIFFERENCE';

// ── Service ─────────────────────────────────────────────────────────────

/**
 * ObjectSetFilterStore — persists filter states, extracts filter values
 * into variables, and applies filter chips to an object set.
 */
export interface ObjectSetFilterStore {
  /** Get the current filter state for an object set. */
  getFilterState(ctx: RequestContext, objectSetId: string): Promise<FilterState | null>;
  /** Save a filter state for an object set. */
  saveFilterState(
    ctx: RequestContext,
    objectSetId: string,
    input: SaveFilterStateInput,
  ): Promise<FilterState>;
  /** List all saved filter states (optionally for one object set). */
  listFilterStates(ctx: RequestContext, objectSetId?: string): Promise<FilterState[]>;
  /** Delete a filter state. */
  deleteFilterState(ctx: RequestContext, objectSetId: string, id: string): Promise<void>;

  /** Extract filter values into variables. */
  extractVariables(ctx: RequestContext, objectSetId: string, chips: FilterChip[]): Promise<Record<string, unknown>>;

  /** Apply a filter (chips) to an object set, returning a FilterExpression. */
  applyFilter(
    ctx: RequestContext,
    objectSetId: string,
    chips: FilterChip[],
  ): Promise<{ filter: FilterExpression; variables: Record<string, unknown> }>;

  /** Combine two filter states with set algebra. */
  combine(
    ctx: RequestContext,
    objectSetId: string,
    leftFilterStateId: string,
    rightFilterStateId: string,
    op: FilterSetOp,
    name: string,
  ): Promise<FilterState>;
}
