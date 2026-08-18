/**
 * Multi-ontology governance — org-scoped and cross-org shared ontologies.
 *
 * Maps 1:1 to spaces (org-scoped ontology containers) and markings
 * (sensitivity/classification labels that gate cross-ontology access).
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Ontology spaces
// ===========================================================================

/** An ontology space — an org-scoped container for one or more ontologies. */
export interface OntologySpace {
  id: string;
  tenantId: string;
  /** Space name (unique within tenant). */
  name: string;
  description: string;
  /** Org scope — which org owns this space. */
  orgScope: string;
  /** Whether this space is shared across orgs. */
  shared: boolean;
  /** Orgs this space is shared with (if shared). */
  sharedWithOrgs?: string[];
  /** Ontology IDs contained in this space. */
  ontologyIds: string[];
  /** Default markings applied to all ontologies in this space. */
  defaultMarkings: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the space. */
  createdBy: string;
}

/** Input for creating an ontology space. */
export interface CreateSpaceInput {
  name: string;
  description?: string;
  orgScope: string;
  shared?: boolean;
  sharedWithOrgs?: string[];
  defaultMarkings?: string[];
}

// ===========================================================================
// Ontology identity
// ===========================================================================

/** A first-class ontology entity — a named, versioned, space-scoped ontology. */
export interface OntologyEntity {
  id: string;
  tenantId: string;
  /** Ontology name (unique within space). */
  name: string;
  /** Display name. */
  displayName: string;
  /** Space ID this ontology belongs to. */
  spaceId: string;
  /** Schema version. */
  schemaVersion: number;
  /** Markings (sensitivity/classification labels). */
  markings: string[];
  /** Whether this ontology is read-only (governed). */
  readOnly: boolean;
  /** Org scope (inherited from space). */
  orgScope: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the ontology. */
  createdBy: string;
}

/** Input for creating an ontology entity. */
export interface CreateOntologyInput {
  name: string;
  displayName?: string;
  spaceId: string;
  schemaVersion?: number;
  markings?: string[];
  readOnly?: boolean;
}

// ===========================================================================
// Markings
// ===========================================================================

/** A marking definition — a sensitivity/classification label. */
export interface MarkingDefinition {
  id: string;
  tenantId: string;
  /** Marking name (e.g. 'CONFIDENTIAL', 'RESTRICTED', 'PHI'). */
  name: string;
  /** Display label. */
  label: string;
  /** Description. */
  description: string;
  /** Marking category (e.g. 'sensitivity', 'classification', 'compliance'). */
  category: string;
  /** Required clearance level to read objects with this marking. */
  requiredClearance: string;
  /** Whether this marking propagates to linked objects. */
  propagates: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Input for creating a marking. */
export interface CreateMarkingInput {
  name: string;
  label: string;
  description?: string;
  category: string;
  requiredClearance: string;
  propagates?: boolean;
}

// ===========================================================================
// Cross-ontology sharing
// ===========================================================================

/** A cross-org sharing rule — allows one org to access another's ontology. */
export interface SharingRule {
  id: string;
  tenantId: string;
  /** Source space ID (the shared ontology's space). */
  sourceSpaceId: string;
  /** Target org scope (the org receiving access). */
  targetOrgScope: string;
  /** Ontology IDs shared (empty = all ontologies in the space). */
  ontologyIds: string[];
  /** Markings that are allowed to be shared. */
  allowedMarkings: string[];
  /** Whether the sharing rule is bidirectional. */
  bidirectional: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the rule. */
  createdBy: string;
  /** Whether the rule is enabled. */
  enabled: boolean;
}

/** Input for creating a sharing rule. */
export interface CreateSharingRuleInput {
  sourceSpaceId: string;
  targetOrgScope: string;
  ontologyIds?: string[];
  allowedMarkings?: string[];
  bidirectional?: boolean;
  enabled?: boolean;
}

// ===========================================================================
// Access check
// ===========================================================================

/** Result of checking cross-ontology access. */
export interface OntologyAccessResult {
  allowed: boolean;
  /** The space the ontology lives in. */
  spaceId: string;
  /** The org scope of the caller. */
  callerOrgScope: string;
  /** The org scope of the ontology. */
  ontologyOrgScope: string;
  /** Whether access is via a sharing rule. */
  viaSharingRule: boolean;
  /** Denial reasons (if not allowed). */
  denialReasons: string[];
  /** Matched sharing rule ID (if via sharing). */
  sharingRuleId?: string;
}

// ===========================================================================
// Multi-ontology governance service
// ===========================================================================

/**
 * Multi-ontology governance service — manages ontology spaces, ontology
 * entities, markings, and cross-org sharing rules.
 */
export interface MultiOntologyGovernanceService {
  // ── Spaces ──
  createSpace(ctx: RequestContext, input: CreateSpaceInput): Promise<OntologySpace>;
  getSpace(ctx: RequestContext, id: string): Promise<OntologySpace | null>;
  getSpaceByName(ctx: RequestContext, name: string): Promise<OntologySpace | null>;
  listSpaces(ctx: RequestContext, orgScope?: string): Promise<OntologySpace[]>;
  updateSpace(ctx: RequestContext, id: string, updates: Partial<CreateSpaceInput>): Promise<OntologySpace>;
  deleteSpace(ctx: RequestContext, id: string): Promise<void>;

  // ── Ontology entities ──
  createOntology(ctx: RequestContext, input: CreateOntologyInput): Promise<OntologyEntity>;
  getOntology(ctx: RequestContext, id: string): Promise<OntologyEntity | null>;
  getOntologyByName(ctx: RequestContext, spaceId: string, name: string): Promise<OntologyEntity | null>;
  listOntologies(ctx: RequestContext, spaceId?: string): Promise<OntologyEntity[]>;
  updateOntology(ctx: RequestContext, id: string, updates: Partial<CreateOntologyInput>): Promise<OntologyEntity>;
  deleteOntology(ctx: RequestContext, id: string): Promise<void>;

  // ── Markings ──
  createMarking(ctx: RequestContext, input: CreateMarkingInput): Promise<MarkingDefinition>;
  getMarking(ctx: RequestContext, name: string): Promise<MarkingDefinition | null>;
  listMarkings(ctx: RequestContext, category?: string): Promise<MarkingDefinition[]>;
  deleteMarking(ctx: RequestContext, name: string): Promise<void>;

  // ── Sharing rules ──
  createSharingRule(ctx: RequestContext, input: CreateSharingRuleInput): Promise<SharingRule>;
  getSharingRule(ctx: RequestContext, id: string): Promise<SharingRule | null>;
  listSharingRules(ctx: RequestContext, sourceSpaceId?: string): Promise<SharingRule[]>;
  updateSharingRule(ctx: RequestContext, id: string, updates: Partial<CreateSharingRuleInput>): Promise<SharingRule>;
  deleteSharingRule(ctx: RequestContext, id: string): Promise<void>;

  // ── Access checks ──
  /** Check whether a caller from a given org scope can access an ontology. */
  checkAccess(ctx: RequestContext, ontologyId: string, callerOrgScope: string): Promise<OntologyAccessResult>;
  /** Resolve which ontologies a caller from a given org scope can see. */
  resolveAccessibleOntologies(ctx: RequestContext, callerOrgScope: string): Promise<OntologyEntity[]>;
}
