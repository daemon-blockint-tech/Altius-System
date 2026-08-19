/**
 * Marking policy types — consolidated from three sources:
 *
 *   1. Marking CRUD records (previously in multi-ontology.ts)
 *   2. Marking propagation rules and results (previously in security-governance.ts)
 *   3. Re-exports the MarkingPropagationService interface (still in security-governance.ts,
 *      scheduled for deletion in §5)
 *
 * The security package's MarkingPolicy class (packages/security/src/markings/marking-policy.ts)
 * is the real implementation that evaluates marking checks; the types here are the SPI
 * contracts for CRUD management and propagation metadata.
 */

// ===========================================================================
// 1. Marking CRUD records (from multi-ontology.ts)
// ===========================================================================

/** A marking record — a sensitivity/classification label managed via CRUD. */
export interface MarkingRecord {
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
// 2. Marking propagation (from security-governance.ts)
// ===========================================================================

/** A marking propagation rule. */
export interface MarkingPropagationRule {
  /** Source object type. */
  sourceType: string;
  /** Target object type. */
  targetType: string;
  /** Link/relationship path from source to target. */
  linkPath: string[];
  /** Whether to propagate markings from source to target. */
  propagate: boolean;
  /** Whether to stop propagation at this hop (overrides inherited rules). */
  stopPropagating?: boolean;
}

/** The result of computing propagated markings. */
export interface PropagatedMarkings {
  /** Object type. */
  objectType: string;
  /** Object ID. */
  objectId: string;
  /** Markings inherited from lineage. */
  inheritedMarkings: string[];
  /** Direct markings on the object. */
  directMarkings: string[];
  /** Effective markings (union of direct and inherited). */
  effectiveMarkings: string[];
  /** Lineage paths that contributed markings. */
  lineagePaths: Array<{
    path: string[];
    markings: string[];
  }>;
}
