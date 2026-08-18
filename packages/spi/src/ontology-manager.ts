/**
 * Visual ontology management — Ontology Manager backend service.
 *
 * Provides:
 *   1. Ontology discovery — browse types, properties, links, actions, functions
 *   2. Ontology editing — propose, validate, and apply schema changes
 *   3. Observability tabs — usage stats per type/action/function
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Ontology discovery
// ===========================================================================

/** Summary of an object type in the ontology. */
export interface OntologyTypeSummary {
  name: string;
  displayName: string;
  description: string;
  /** Property count. */
  propertyCount: number;
  /** Link count. */
  linkCount: number;
  /** Action count targeting this type. */
  actionCount: number;
  /** Function count referencing this type. */
  functionCount: number;
  /** Whether the type is abstract. */
  isAbstract: boolean;
  /** Parent type (if any). */
  parentType?: string;
  /** Tags. */
  tags: string[];
  /** Schema version when this type was introduced. */
  introducedInVersion: number;
  /** ISO 8601 last modified. */
  lastModified: string;
}

/** Detail of a property in a type. */
export interface OntologyPropertyDetail {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  sensitive: boolean;
  description: string;
  defaultValue?: unknown;
  enumValues?: string[];
}

/** Detail of a link in a type. */
export interface OntologyLinkDetail {
  name: string;
  displayName: string;
  sourceType: string;
  targetType: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  required: boolean;
  description: string;
}

/** Detail of an action. */
export interface OntologyActionDetail {
  name: string;
  displayName: string;
  description: string;
  /** Parameter count. */
  parameterCount: number;
  /** Target object type (if any). */
  targetType?: string;
  /** Whether the action is enabled. */
  enabled: boolean;
  /** Usage count (last 30 days). */
  usageCount30d: number;
  /** Error rate. */
  errorRate: number;
}

/** Detail of a function. */
export interface OntologyFunctionDetail {
  name: string;
  displayName: string;
  description: string;
  /** Input parameter count. */
  inputCount: number;
  /** Output type. */
  outputType: string;
  /** Whether the function is enabled. */
  enabled: boolean;
  /** Usage count (last 30 days). */
  usageCount30d: number;
  /** Average execution time in ms. */
  avgDurationMs: number;
}

/** Full type detail — properties, links, and related actions. */
export interface OntologyTypeDetail extends OntologyTypeSummary {
  properties: OntologyPropertyDetail[];
  links: OntologyLinkDetail[];
  actions: OntologyActionDetail[];
  functions: OntologyFunctionDetail[];
}

// ===========================================================================
// Ontology editing
// ===========================================================================

/** A proposed ontology change. */
export interface OntologyChangeProposal {
  id: string;
  tenantId: string;
  /** Proposal name. */
  name: string;
  description: string;
  /** Change kind. */
  kind: 'add_type' | 'modify_type' | 'remove_type' | 'add_property' | 'modify_property' | 'remove_property' | 'add_link' | 'modify_link' | 'remove_link' | 'add_action' | 'modify_action' | 'remove_action';
  /** Target type (if applicable). */
  targetType?: string;
  /** Change definition (ODL fragment or structured change). */
  change: Record<string, unknown>;
  /** Validation status. */
  validationStatus: 'pending' | 'valid' | 'invalid';
  /** Validation errors. */
  validationErrors: string[];
  /** Whether the change is breaking. */
  isBreaking: boolean;
  /** Migration plan (if breaking). */
  migrationPlan?: string;
  /** Review status. */
  reviewStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied';
  /** Reviewer user ID. */
  reviewerId?: string;
  /** Review comments. */
  reviewComments?: string;
  /** Schema version after applying (if applied). */
  appliedVersion?: number;
  /** Owner user ID. */
  ownerId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Input for creating a change proposal. */
export interface CreateChangeProposalInput {
  name: string;
  description?: string;
  kind: OntologyChangeProposal['kind'];
  targetType?: string;
  change: Record<string, unknown>;
  migrationPlan?: string;
}

// ===========================================================================
// Observability
// ===========================================================================

/** Observability stats for a type. */
export interface TypeObservability {
  typeName: string;
  /** Read count (last 30 days). */
  reads30d: number;
  /** Write count (last 30 days). */
  writes30d: number;
  /** Search count (last 30 days). */
  searches30d: number;
  /** Active users (last 30 days). */
  activeUsers30d: number;
  /** Average query duration in ms. */
  avgDurationMs: number;
  /** Error count (last 30 days). */
  errors30d: number;
}

/** Observability stats for an action. */
export interface ActionObservability {
  actionName: string;
  /** Execution count (last 30 days). */
  executions30d: number;
  /** Error count (last 30 days). */
  errors30d: number;
  /** Average duration in ms. */
  avgDurationMs: number;
  /** Active users (last 30 days). */
  activeUsers30d: number;
  /** Last execution timestamp. */
  lastExecutedAt?: string;
}

/** Observability stats for a function. */
export interface FunctionObservability {
  functionName: string;
  /** Execution count (last 30 days). */
  executions30d: number;
  /** Error count (last 30 days). */
  errors30d: number;
  /** Average duration in ms. */
  avgDurationMs: number;
  /** Last execution timestamp. */
  lastExecutedAt?: string;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Visual ontology management service — discovery, editing, and observability
 * for the Ontology Manager application.
 */
export interface OntologyManagerService {
  // ── Discovery ──
  listTypes(ctx: RequestContext): Promise<OntologyTypeSummary[]>;
  getTypeDetail(ctx: RequestContext, typeName: string): Promise<OntologyTypeDetail | null>;
  searchTypes(ctx: RequestContext, query: string): Promise<OntologyTypeSummary[]>;
  listActions(ctx: RequestContext): Promise<OntologyActionDetail[]>;
  listFunctions(ctx: RequestContext): Promise<OntologyFunctionDetail[]>;

  // ── Editing ──
  createProposal(ctx: RequestContext, input: CreateChangeProposalInput): Promise<OntologyChangeProposal>;
  getProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal | null>;
  listProposals(ctx: RequestContext, status?: OntologyChangeProposal['reviewStatus']): Promise<OntologyChangeProposal[]>;
  validateProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal>;
  submitProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal>;
  reviewProposal(ctx: RequestContext, id: string, decision: 'approved' | 'rejected', comments?: string): Promise<OntologyChangeProposal>;
  applyProposal(ctx: RequestContext, id: string): Promise<OntologyChangeProposal>;
  deleteProposal(ctx: RequestContext, id: string): Promise<void>;

  // ── Observability ──
  getTypeObservability(ctx: RequestContext, typeName: string): Promise<TypeObservability>;
  getActionObservability(ctx: RequestContext, actionName: string): Promise<ActionObservability>;
  getFunctionObservability(ctx: RequestContext, functionName: string): Promise<FunctionObservability>;
  getAllObservability(ctx: RequestContext): Promise<{ types: TypeObservability[]; actions: ActionObservability[]; functions: FunctionObservability[] }>;
}
