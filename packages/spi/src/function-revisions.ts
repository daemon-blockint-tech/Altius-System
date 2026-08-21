/**
 * Function revision store — durable persistence for the function authoring
 * lifecycle (draft → published → deprecated), moved to the SPI so a Postgres
 * provider (which cannot depend on @altius/engine) can back it.
 *
 * FunctionRegistry (in @altius/engine) holds the transition logic; this contract
 * is only the persistence. Every method is tenant-scoped: a revision belongs to
 * one tenant, and two tenants may author functions of the same name without
 * colliding (the in-memory registry keyed by name alone did not, a latent
 * cross-tenant collision this store closes).
 */

export type FunctionRevisionStatus = 'draft' | 'published' | 'deprecated';

/** A versioned snapshot of a function's code and its lifecycle status. */
export interface FunctionRevision {
  id: string;
  /** Function name (matches the ODL FunctionType name). */
  functionName: string;
  /** Revision number (1-based, increments on each draft within a function). */
  revision: number;
  status: FunctionRevisionStatus;
  /** Runtime name (e.g. 'node', 'cel'). */
  runtime: string;
  /** Entry path relative to the pack directory (or CEL expression). */
  entry: string;
  /** Source code, for node runtimes. */
  source?: string;
  testInputs?: Record<string, unknown>[];
  expectedOutputs?: unknown[];
  tenantId: string;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
}

export interface CreateFunctionRevisionInput {
  functionName: string;
  runtime: string;
  entry: string;
  source?: string;
  testInputs?: Record<string, unknown>[];
  expectedOutputs?: unknown[];
  tenantId: string;
  createdBy: string;
}

/**
 * Persistence for function revisions. The active (live) revision of a function
 * is the single one whose status is 'published' — publish deprecates the prior
 * one — so there is no separate active pointer to keep consistent.
 */
export interface FunctionRevisionStore {
  /** Persist a new revision. */
  create(revision: FunctionRevision): Promise<void>;
  /** Fetch one revision by id, tenant-scoped (null if absent or another tenant's). */
  get(tenantId: string, id: string): Promise<FunctionRevision | null>;
  /** All revisions of a function, oldest first. */
  listByFunction(tenantId: string, functionName: string): Promise<FunctionRevision[]>;
  /** The currently published revision of a function, if any. */
  getActive(tenantId: string, functionName: string): Promise<FunctionRevision | null>;
  /** Overwrite a revision (status / publishedAt transitions). */
  update(revision: FunctionRevision): Promise<void>;
}
