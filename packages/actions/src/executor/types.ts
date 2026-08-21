/**
 * Action executor types (Section 5.3 & 5.4).
 *
 * Defines the interfaces for the action execution pipeline including
 * security, consent, CEL evaluation, audit, and result types.
 */

import type { AuditRecord, DataPurpose, StorageProvider, RequestContext } from '@altius/spi';

// ---------------------------------------------------------------------------
// Actor identity
// ---------------------------------------------------------------------------

/** The actor executing an action. Passed through the pipeline for authz/audit. */
export interface ActionActor {
  id: string;
  type: 'user' | 'system' | 'connector' | 'agent';
  roles: string[];
  ip?: string;
  /**
   * Mandatory access-control markings the actor holds.
   *
   * Optional so an actor built by a path that predates markings still
   * compiles; omitting it denies every marked type rather than granting one,
   * so forgetting to populate it fails closed.
   */
  markings?: string[];
}

// ---------------------------------------------------------------------------
// Execution context
// ---------------------------------------------------------------------------

/** Context for a single action execution. */
export interface ActionContext {
  /** SPI request context (tenant, traceId). */
  requestContext: RequestContext;
  /** Purpose for consent checks. If undefined, consent step is skipped. */
  consentPurpose?: DataPurpose;
  /** Subject ID for consent checks (e.g. patient ID). */
  consentSubjectId?: string;
  /**
   * The caller's stated reason for running the action, from the reserved
   * `_justification` input field. Required (non-blank) when the manifest
   * declares `requiresJustification: true`; captured to the
   * JustificationStore before effects run and stamped into the audit record.
   */
  justification?: string;
  /**
   * The `_version` the caller believes the action's target object carries —
   * i.e. the version the data they decided on was read at.
   *
   * Distinct from the storage-level `expectedVersion` guard, which protects the
   * read-modify-write window inside one request (milliseconds). This protects
   * against a stale decision (minutes): a clinician opens a patient at v3,
   * deliberates, and submits while someone else has moved it to v4. Omit to
   * keep the previous behaviour — the intra-request guard still applies.
   */
  expectedVersion?: number;
}

// ---------------------------------------------------------------------------
// Security layer (injected dependency)
// ---------------------------------------------------------------------------

/**
 * Checks whether an actor has permission to execute an action.
 * Maps to spec Section 5.3 "Authorise" step.
 */
export interface SecurityLayer {
  checkPermission(
    actor: ActionActor,
    actionType: string,
    params: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<PermissionResult>;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// CEL evaluator (injected dependency)
// ---------------------------------------------------------------------------

/**
 * Evaluates CEL expressions. In production backed by CelClient gRPC sidecar.
 * In tests backed by a mock that interprets expressions directly.
 */
export interface CelEvaluator {
  evaluate(
    expression: string,
    variables: Record<string, unknown>,
  ): Promise<CelEvalResult>;
}

export interface CelEvalResult {
  value?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Side-effect handler (injected dependency)
// ---------------------------------------------------------------------------

/** Executes side effects (webhooks, events) after effects commit. */
export interface SideEffectHandler {
  execute(
    name: string,
    type: string,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    retries?: number,
  ): Promise<SideEffectResult>;
}

export interface SideEffectResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Audit writer (injected dependency)
// ---------------------------------------------------------------------------

/** Writes audit records for completed actions. */
export interface AuditWriter {
  write(record: AuditRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Event publisher (injected dependency)
// ---------------------------------------------------------------------------

/** Publishes CloudEvents for affected objects/links after action completion. */
export interface ActionEventPublisher {
  publishObjectChange(
    changeType: 'created' | 'updated' | 'deleted',
    objectType: string,
    objectId: string,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
    cause: { actionType: string; actionId: string; actor: string },
    ctx: RequestContext,
  ): Promise<void>;

  publishLinkChange(
    changeType: 'created' | 'deleted',
    linkType: string,
    linkId: string,
    fromId: string,
    toId: string,
    cause: { actionType: string; actionId: string; actor: string },
    ctx: RequestContext,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Action result (Section 5.4)
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  actionId: string;
  errors: ActionError[];
  affectedObjects: AffectedObject[];
  /** Non-blocking warnings (e.g. dry-run partial validation). */
  warnings?: string[];
}

export interface ActionError {
  code: string;
  message: string;
  /** Dot-path to relevant field, if applicable. */
  path?: string;
  /**
   * Machine-readable specifics a caller can act on — e.g. a VERSION_CONFLICT
   * carries `{ expected, actual }` so a client can show what changed under it
   * rather than parsing the message.
   */
  details?: Record<string, unknown>;
}

export type ChangeType = 'created' | 'updated' | 'deleted';

export interface AffectedObject {
  type: string;
  id: string;
  changeType: ChangeType;
}

// ---------------------------------------------------------------------------
// Executor configuration
// ---------------------------------------------------------------------------

/**
 * Writes/deletes OpenFGA relationship tuples. Structurally matches
 * `AuthorizationService` (`writeRelationship`/`deleteRelationship`), so the
 * service instance can be injected directly. Tuple shape: (user, relation,
 * resource, tenantId) — e.g. `("ward:W", "admitted_to", "patient:P", "t1")`.
 *
 * `tenantId` is required: each tenant has its own OpenFGA store, and object ids
 * are unique only per tenant, so a tuple must land in the store of the tenant
 * whose link produced it.
 */
export interface RelationshipWriter {
  writeRelationship(user: string, relation: string, resource: string, tenantId: string): Promise<void>;
  deleteRelationship(user: string, relation: string, resource: string, tenantId: string): Promise<void>;
}

/**
 * Maps an ontology link type to the ReBAC tuple it should mint. Keyed by link
 * type name. `relation` is the OpenFGA relation on the `fromType` object that
 * references the `toType` object; `fromType`/`toType` are FGA type names
 * (snake_case). The executor emits `(toType:toId, relation, fromType:fromId)`
 * on link create and deletes it on link delete. Only mapped link types are
 * synced, so unmapped links (no corresponding FGA relation) are skipped.
 */
export type LinkTupleMap = Map<string, { relation: string; fromType: string; toType: string }>;

/** Dependencies injected into the ActionExecutor. */
export interface ActionExecutorConfig {
  storage: StorageProvider;
  security: SecurityLayer;
  cel: CelEvaluator;
  consentManager?: import('@altius/spi').ConsentManager;
  /**
   * Checkpoint capture for actions declaring `requiresJustification`.
   * Enforced here rather than at each surface for the same reason as
   * markingPolicy below. Absent while a manifest requires justification →
   * the requirement still blocks execution; only the capture is skipped.
   */
  justificationStore?: import('@altius/spi').JustificationStore;
  sideEffectHandler?: SideEffectHandler;
  auditWriter?: AuditWriter;
  eventPublisher?: ActionEventPublisher;
  /** Optional ReBAC tuple writer — mints graph-derived tuples from link effects. */
  relationshipWriter?: RelationshipWriter;
  /** Which link types to sync to ReBAC tuples (and how). */
  linkTupleMap?: LinkTupleMap;
  /**
   * Mandatory marking policy. Absent means no markings are configured.
   *
   * Enforced here rather than at each surface because four call sites already
   * reach `execute` (REST, GraphQL, MCP, functions) and a fifth added later
   * would silently miss the control. A marking that stops reads but permits
   * writes is not a control at all.
   */
  markingPolicy?: ActionMarkingPolicy;
  /**
   * Function executor for `invokeFunction` effects. Structural interface so
   * @altius/actions does not depend on @altius/engine — the API layer wires
   * the real FunctionExecutor. Absent → an invokeFunction effect throws at
   * execution time with a clear message.
   */
  functionExecutor?: ActionFunctionExecutor;
}

/**
 * The function-execution surface the action executor needs. Mirrors the
 * subset of FunctionExecutor.execute that an invokeFunction effect calls.
 */
export interface ActionFunctionExecutor {
  execute(
    name: string,
    inputs: Record<string, unknown>,
    opts?: { ontology?: unknown },
  ): Promise<{ result: unknown }>;
}

/**
 * The marking surface the executor needs — structural, so @altius/actions
 * does not take a dependency on @altius/security.
 */
export interface ActionMarkingPolicy {
  readonly isEmpty: boolean;
  requiredFor(objectType: string): readonly string[];
  check(held: readonly string[], required: readonly string[]): { allowed: boolean; missing: string[] };
}
