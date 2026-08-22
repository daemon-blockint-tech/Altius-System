/**
 * Action manifest types.
 *
 * These types represent the parsed and validated structure of a YAML action
 * manifest per Altius spec Section 5.1.
 */

// ─── Effect types (discriminated union) ───

/**
 * Effect values are CEL expressions when they are strings ("params.reason",
 * "'PRIMARY'", "now"); a non-string YAML scalar (5, 2.5, true) is the value
 * itself and must reach storage with that type — coercing it to a string
 * writes "5" into an Int column.
 */
export type EffectValue = unknown;

export interface UpdateObjectEffect {
  type: 'updateObject';
  target: string;
  set: Record<string, EffectValue>;
  condition?: string;
}

export interface CreateLinkEffect {
  type: 'createLink';
  linkType: string;
  from: string;
  to: string;
  properties?: Record<string, EffectValue>;
  condition?: string;
}

export interface DeleteLinkEffect {
  type: 'deleteLink';
  linkType: string;
  filter: {
    from?: string;
    to?: string;
    active?: boolean;
  };
  expect?: 'ONE' | 'ALL';
}

/**
 * Update link properties on an existing link. `filter` resolves to the
 * target link(s) the same way deleteLink does; `set` is a map of property
 * names to CEL expressions, resolved the same way as updateObject.
 * `expect` defaults to 'ONE' — updating exactly one link is the safe default;
 * 'ALL' updates every matching link.
 */
export interface UpdateLinkEffect {
  type: 'updateLink';
  linkType: string;
  filter: {
    from?: string;
    to?: string;
    active?: boolean;
  };
  set: Record<string, EffectValue>;
  expect?: 'ONE' | 'ALL';
  condition?: string;
}

export interface CreateObjectEffect {
  type: 'createObject';
  objectType: string;
  properties: Record<string, EffectValue>;
}

/**
 * Delete an object via the governed action pipeline. `target` is a context
 * expression resolving to the object to delete (same resolution as
 * updateObject). `mode` defaults to 'soft' (set _deleted_at, preserve history);
 * 'hard' removes the row. Soft delete is the default because it preserves the
 * audit trail and allows rollback via compensation.
 */
export interface DeleteObjectEffect {
  type: 'deleteObject';
  target: string;
  mode?: 'soft' | 'hard';
  condition?: string;
}

/**
 * Record a consent decision for a subject (governed, audited). `subject` is an
 * expression resolving to the consent subject id (e.g. "patient"). `purpose`
 * defaults to DIRECT_CARE, `decision` to GRANT. `condition` (CEL) gates whether
 * the consent is recorded — used for opt-out (e.g. consent-on-register unless
 * `params.consent == false`). Consent is recorded via the ConsentManager, which
 * is outside the SPI transaction — place it as the terminal effect.
 */
export interface RecordConsentEffect {
  type: 'recordConsent';
  subject: string;
  purpose?: string;
  decision?: string;
  evidence?: string;
  condition?: string;
}

export type ActionEffect =
  | UpdateObjectEffect
  | CreateLinkEffect
  | UpdateLinkEffect
  | DeleteLinkEffect
  | CreateObjectEffect
  | DeleteObjectEffect
  | RecordConsentEffect;

// ─── Precondition ───

export interface Precondition {
  expr: string;
  error: string;
}

// ─── Side effects ───

export interface SideEffect {
  name: string;
  type: string;
  config: Record<string, unknown>;
  retries?: number;
  retryDelay?: string;
}

// ─── Rollback policy ───

export type RollbackPolicy = 'LOG_AND_CONTINUE' | 'RETRY_INDEFINITELY' | 'ROLLBACK_ALL';

export interface RollbackConfig {
  onSideEffectFailure: RollbackPolicy;
}

// ─── Undo configuration ───

export interface UndoOverride {
  effect: number;
  undoEffect: Record<string, unknown>;
}

export interface UndoConfig {
  overrides?: UndoOverride[];
  sideEffects?: SideEffect[];
  window?: string;
}

// ─── Action Manifest (top-level) ───

export interface ActionManifest {
  /** Must match an @actionType name in the ODL schema. */
  action: string;
  /** Manifest version (integer). */
  version: number;
  /** Whether this action supports undo. Default: false. */
  reversible: boolean;
  /** CEL expressions that must evaluate to true before execution. */
  preconditions: Precondition[];
  /**
   * Platform roles allowed to execute an action that has no ObjectType @param
   * (nothing for ReBAC to check a relation against). The ReBAC bridge denies
   * such actions unless the caller holds one of these roles — absent or empty
   * means nobody, mirroring FunctionType.requiredRoles. Ignored for actions
   * with an ObjectType @param, which are gated by their FGA relation instead.
   */
  requiredRoles?: string[];
  /**
   * Checkpoint declaration: when true, the executor refuses to run the
   * action unless the caller supplies a non-empty justification via the
   * reserved `_justification` input field; the text is captured to the
   * JustificationStore before effects run and stamped into the audit record.
   */
  requiresJustification?: boolean;
  /** Sequential mutations applied within a single transaction. */
  effects: ActionEffect[];
  /** Async operations triggered after effects commit. */
  sideEffects: SideEffect[];
  /** Rollback policy for side-effect failures. */
  rollback?: RollbackConfig;
  /** Optional undo configuration (only if reversible=true). */
  undo?: UndoConfig;
}

// ─── Validation result ───

export type ManifestIssueSeverity = 'error' | 'warning';

export interface ManifestIssue {
  severity: ManifestIssueSeverity;
  code: string;
  message: string;
  /** Dot-path to the offending field (e.g. "effects[0].target"). */
  path?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  manifest?: ActionManifest;
  errors: ManifestIssue[];
  warnings: ManifestIssue[];
}
