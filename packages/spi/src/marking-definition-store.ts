/**
 * Runtime marking definition store — the admin API half of mandatory access
 * control.
 *
 * Marking definitions are declared in packs (governance-as-code) AND managed
 * at runtime through this store. The store persists runtime-created marking
 * definitions and categories; on boot, the server loads them and merges them
 * into the MarkingPolicy so they are enforceable immediately.
 *
 * Foundry: "Once created, marking categories cannot be deleted." This store
 * follows the same constraint — delete is not supported for categories.
 * Individual marking definitions can be deleted only if no object type
 * requires them and no user holds them (caller validates).
 */

/** A runtime-created marking definition record. */
export interface MarkingDefinitionRecord {
  tenantId: string;
  name: string;
  category?: string;
  rank?: number;
  createdBy: string;
  createdAt: string;
}

/** A runtime-created marking category record. */
export interface MarkingCategoryRecord {
  tenantId: string;
  name: string;
  mode: 'CONJUNCTIVE' | 'DISJUNCTIVE';
  createdBy: string;
  createdAt: string;
}

/** Input for creating a marking definition at runtime. */
export interface CreateMarkingDefinitionInput {
  name: string;
  category?: string;
  rank?: number;
}

/** Input for creating a marking category at runtime. */
export interface CreateMarkingCategoryInput {
  name: string;
  mode: 'CONJUNCTIVE' | 'DISJUNCTIVE';
}

/**
 * Tenant-scoped store for runtime marking definitions and categories.
 *
 * All operations are tenant-scoped from the caller's token, never from the
 * body. An undefined marking is unsatisfiable at read time — creating one
 * is an admin action that must be audited.
 */
export interface MarkingDefinitionStore {
  // ── Marking definitions ──

  /** Create a marking definition. Idempotent on (tenant, name): re-creating updates metadata. */
  createDefinition(tenantId: string, input: CreateMarkingDefinitionInput, createdBy: string): Promise<MarkingDefinitionRecord>;

  /** Delete a marking definition. Returns false if not found. */
  deleteDefinition(tenantId: string, name: string): Promise<boolean>;

  /** List all marking definitions for a tenant. */
  listDefinitions(tenantId: string): Promise<MarkingDefinitionRecord[]>;

  /** Get a specific marking definition by name. */
  getDefinition(tenantId: string, name: string): Promise<MarkingDefinitionRecord | null>;

  // ── Marking categories ──

  /** Create a marking category. Idempotent on (tenant, name): re-creating updates mode. */
  createCategory(tenantId: string, input: CreateMarkingCategoryInput, createdBy: string): Promise<MarkingCategoryRecord>;

  /** List all marking categories for a tenant. */
  listCategories(tenantId: string): Promise<MarkingCategoryRecord[]>;
}
