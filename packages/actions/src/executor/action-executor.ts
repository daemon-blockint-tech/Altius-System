/**
 * Action execution pipeline (Section 5.3).
 *
 * Pipeline order:
 *   Validate -> Authorise -> Consent -> Preconditions -> Execute -> Side-effects -> Audit -> Emit
 *
 * Effects execute in manifest order within a single SPI transaction.
 * CEL expressions are evaluated against a context captured before the first
 * effect. Created objects are injected back into this context so subsequent
 * effects can reference them (e.g. createObject → createLink).
 * If any effect fails, the transaction is rolled back.
 */

import type {
  OntologyObject,
  OntologyLink,
  Transaction,
  RequestContext,
  DateTime,
  DataPurpose,
} from '@altius/spi';
import type { ParsedSchema, ActionType, FieldDefinition } from '@altius/odl';
import { createLogger } from '@altius/observability';
import type {
  ActionManifest,
  ActionEffect,
  UpdateObjectEffect,
  CreateLinkEffect,
  UpdateLinkEffect,
  DeleteLinkEffect,
  CreateObjectEffect,
  DeleteObjectEffect,
  RecordConsentEffect,
} from '../parser/types.js';
import type {
  ActionActor,
  ActionContext,
  ActionResult,
  ActionError,
  AffectedObject,
  ActionExecutorConfig,
} from './types.js';
import { auditableDefaults } from './auditable.js';

const logger = createLogger('action-executor');

/**
 * The actor recorded in `@readonly` audit fields. The executor puts
 * `{ id, roles, type }` on the effect context as `actor`; 'system' covers a
 * pipeline invoked without one (seeds, internal callers).
 */
function actorId(context: Record<string, unknown>): string {
  const actor = context['actor'];
  if (actor && typeof actor === 'object' && typeof (actor as { id?: unknown }).id === 'string') {
    return (actor as { id: string }).id;
  }
  return 'system';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _actionCounter = 0;

function generateActionId(): string {
  return `act_${Date.now().toString(36)}_${(++_actionCounter).toString(36)}`;
}

function now(): DateTime {
  return new Date().toISOString() as DateTime;
}

function failResult(actionId: string, errors: ActionError[]): ActionResult {
  return { success: false, actionId, errors, affectedObjects: [] };
}

/**
 * Built-in scalar checks for action params. Deliberately a local copy of the
 * engine's SCALAR_TYPE_CHECKS (packages/engine/src/objects/validation.ts): it
 * is not exported, and @altius/engine is not a dependency of this package —
 * the action pipeline sits above storage, not on top of the engine.
 */
const PARAM_TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  ID: (v) => typeof v === 'string',
  String: (v) => typeof v === 'string',
  Int: (v) => typeof v === 'number' && Number.isInteger(v),
  Float: (v) => typeof v === 'number',
  Boolean: (v) => typeof v === 'boolean',
  Date: (v) => typeof v === 'string',
  DateTime: (v) => typeof v === 'string',
  Duration: (v) => typeof v === 'string',
  GeoPoint: (v) => typeof v === 'object' && v !== null,
  JSON: (_v) => true,
  URI: (v) => typeof v === 'string',
};

/**
 * Returns an error message if `value` does not match the param's declared ODL
 * type, or undefined if it does (including for types this cannot check —
 * object/link types, custom scalars).
 */
function checkParamType(
  field: FieldDefinition,
  value: unknown,
  schema: ParsedSchema,
): string | undefined {
  const typeName = field.type.name;

  if (field.type.isList) {
    if (!Array.isArray(value)) {
      return `Parameter "${field.name}" must be a list of ${typeName}`;
    }
    for (const item of value) {
      const itemError = checkParamType(
        { ...field, type: { ...field.type, isList: false } },
        item,
        schema,
      );
      if (itemError) return itemError;
    }
    return undefined;
  }

  const enumDef = schema.enums.find((e) => e.name === typeName);
  if (enumDef) {
    const values = enumDef.values.map((v) => v.name);
    if (typeof value !== 'string' || !values.includes(value)) {
      return `Parameter "${field.name}" has invalid value ${JSON.stringify(value)} for enum ${typeName}. Valid values: ${values.join(', ')}`;
    }
    return undefined;
  }

  // An object-typed param is a REFERENCE, so it must arrive as an id string.
  // Step 4 only loads from storage when the value is a string; anything else
  // used to fall through to scalar pass-through, which let a caller substitute
  // a fabricated object for the stored one — preconditions would then be
  // evaluated against caller-controlled data rather than the record. The REST
  // action route and MCP both forward the caller's body untyped, so this is
  // the only place that catches it for every surface.
  if (schema.objectTypes.some((ot) => ot.name === typeName)) {
    if (typeof value !== 'string') {
      return `Parameter "${field.name}" must be the id of a ${typeName}, got ${Array.isArray(value) ? 'array' : typeof value}`;
    }
    return undefined;
  }

  const check = PARAM_TYPE_CHECKS[typeName];
  if (check && !check(value)) {
    return `Parameter "${field.name}" has invalid type. Expected ${typeName}, got ${typeof value}`;
  }

  return undefined;
}

/**
 * Compare the caller's asserted version against the action's target object.
 *
 * The target is the first @param field that resolved to an object — the same
 * rule the OpenFGA codegen uses to pick an action's target type, so the object
 * whose permission gates the action is the object whose version guards it.
 *
 * Returns an ActionError on mismatch, undefined when it matches or when there
 * is no object param to compare against (a creation action like RegisterPatient
 * has nothing to be stale about).
 */
function checkExpectedVersion(
  actionTypeDef: ActionType | undefined,
  resolvedVariables: Record<string, unknown>,
  expectedVersion: number,
): ActionError | undefined {
  if (!actionTypeDef) return undefined;

  for (const field of actionTypeDef.fields) {
    if (!field.directives.some((d) => d.kind === 'param')) continue;
    const value = resolvedVariables[field.name];
    if (!value || typeof value !== 'object') continue;
    const actual = (value as Record<string, unknown>)['_version'];
    if (typeof actual !== 'number') continue;

    if (actual !== expectedVersion) {
      return {
        code: 'VERSION_CONFLICT',
        message:
          `${field.type.name} was modified since you loaded it ` +
          `(you have v${expectedVersion}, it is now v${actual}). Reload and reapply your change.`,
        details: { expected: expectedVersion, actual, param: field.name },
      };
    }
    return undefined;
  }

  return undefined;
}

/**
 * Add an alias for `_id` on an OntologyObject so CEL expressions can
 * reference the object by its declared ODL @primary field name (e.g.
 * `object.externalId`) as well as `object._id`. When the declared primary
 * field name is `id` (the historical default) this preserves the legacy
 * `object.id` alias.
 */
function addIdAlias(obj: OntologyObject, primaryName?: string): OntologyObject {
  const alias = primaryName ?? 'id';
  if (!(alias in obj)) {
    (obj as Record<string, unknown>)[alias] = obj._id;
  }
  // Always preserve the legacy `id` alias for CEL expressions that still
  // reference `object.id` regardless of the declared primary field name.
  if (alias !== 'id' && !('id' in obj)) {
    (obj as Record<string, unknown>)['id'] = obj._id;
  }
  return obj;
}

/** Look up the declared @primary field name for an object type. */
function primaryFieldName(schema: ParsedSchema | undefined, typeName: string): string | undefined {
  if (!schema) return undefined;
  const ot = schema.objectTypes.find((o) => o.name === typeName);
  if (!ot) return undefined;
  const primary = ot.fields.find((f) => f.directives.some((d) => d.kind === 'primary'));
  return primary?.name;
}

/** System field prefixes that storage manages internally. */
const SYSTEM_FIELD_PREFIXES = new Set([
  '_id', '_tenantId', '_version', '_createdAt', '_updatedAt', '_deletedAt',
  '_type', '_fromId', '_toId', '_fromType', '_toType',
]);

/**
 * Strip system fields from an object snapshot before using it in compensation.
 * Storage providers manage these fields internally; including them in an
 * updateObject() call can cause column-mapping errors.
 */
function stripSystemFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!SYSTEM_FIELD_PREFIXES.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ActionExecutor
// ---------------------------------------------------------------------------

export class ActionExecutor {
  private readonly config: ActionExecutorConfig;

  constructor(config: ActionExecutorConfig) {
    this.config = config;
  }

  /**
   * Execute an action against the storage provider.
   *
   * @param manifest  - Parsed action manifest
   * @param params    - Action parameters (param name -> value or object ID)
   * @param actor     - The actor executing the action
   * @param ctx       - Execution context (tenant, consent, etc.)
   * @param schema    - Parsed ODL schema for param resolution
   * @param options   - Optional execution flags (e.g. dryRun)
   */
  async execute(
    manifest: ActionManifest,
    params: Record<string, unknown>,
    actor: ActionActor,
    ctx: ActionContext,
    schema: ParsedSchema,
    options?: { dryRun?: boolean },
  ): Promise<ActionResult> {
    const actionId = generateActionId();
    const actionType = manifest.action;
    const reqCtx = ctx.requestContext;

    // Find the action type definition in the schema
    const actionTypeDef = schema.actionTypes.find(
      (at) => at.name === actionType,
    );

    // ------------------------------------------------------------------
    // Step 1: VALIDATE — schema validation of params
    // ------------------------------------------------------------------
    const validationErrors = this.validateParams(actionTypeDef, params, schema);
    if (validationErrors.length > 0) {
      return failResult(actionId, validationErrors);
    }

    // ------------------------------------------------------------------
    // Step 2: AUTHORISE — call SecurityLayer.checkPermission
    // ------------------------------------------------------------------
    const permResult = await this.config.security.checkPermission(
      actor,
      actionType,
      params,
      reqCtx,
    );
    if (!permResult.allowed) {
      const reason = permResult.reason ?? `Actor ${actor.id} is not authorized to execute ${actionType}`;
      await this.auditDenied(actionId, actor, actionType, reqCtx, reason);
      return failResult(actionId, [
        {
          code: 'AUTHORIZATION_DENIED',
          message: reason,
        },
      ]);
    }

    // ------------------------------------------------------------------
    // Step 3: CONSENT — call ConsentManager.checkConsent (if active)
    // ------------------------------------------------------------------
    if (this.config.consentManager && ctx.consentPurpose && ctx.consentSubjectId) {
      const consentDecision = await this.config.consentManager.checkConsent(
        ctx.consentSubjectId,
        ctx.consentPurpose,
        actor.id,
        reqCtx.tenantId,
      );
      if (!consentDecision.allowed) {
        const reason = `Consent denied for purpose ${ctx.consentPurpose}`;
        await this.auditDenied(actionId, actor, actionType, reqCtx, reason, {
          consentDenied: true,
          subjectId: ctx.consentSubjectId,
        });
        return failResult(actionId, [
          {
            code: 'CONSENT_DENIED',
            message: reason,
          },
        ]);
      }
    }

    // ------------------------------------------------------------------
    // Step 4: PRECONDITIONS — resolve @param objects, evaluate CEL
    // ------------------------------------------------------------------
    // Resolve object params from SPI before CEL evaluation
    const resolvedVariables = await this.resolveParamObjects(
      actionTypeDef,
      params,
      schema,
      reqCtx,
    );

    // Optimistic concurrency against the CALLER's assumption. Checked here,
    // before CEL and before the transaction opens, so a stale caller costs
    // nothing and leaves no partial work to compensate. The storage-level
    // expectedVersion guard (see applyUpdateObject) is a different thing: it
    // closes the read-modify-write window within this request.
    if (ctx.expectedVersion !== undefined) {
      const conflict = checkExpectedVersion(
        actionTypeDef,
        resolvedVariables,
        ctx.expectedVersion,
      );
      if (conflict) return failResult(actionId, [conflict]);
    }

    // Add standard variables
    resolvedVariables['actor'] = { id: actor.id, roles: actor.roles, type: actor.type };
    resolvedVariables['now'] = now();
    resolvedVariables['params'] = params;

    // Pre-resolve @link field paths referenced by the manifest.
    // This populates link targets in the resolved objects so that
    // preconditions, effects, and side-effects can traverse them
    // (e.g. "patient.currentWard", "patient.currentBed").
    await this.preResolveLinkPaths(manifest, resolvedVariables, schema, reqCtx);

    for (const precondition of manifest.preconditions) {
      const result = await this.config.cel.evaluate(
        precondition.expr,
        resolvedVariables,
      );
      if (result.error) {
        return failResult(actionId, [
          {
            code: 'PRECONDITION_EVAL_ERROR',
            message: `Failed to evaluate precondition: ${result.error}`,
          },
        ]);
      }
      if (result.value !== true) {
        return failResult(actionId, [
          {
            code: 'PRECONDITION_FAILED',
            message: precondition.error,
          },
        ]);
      }
    }

    // ------------------------------------------------------------------
    // Dry-run: validation, authorization, consent, and preconditions all
    // passed. Stop here — no transaction, no effects, no side-effects.
    // The caller gets a success result with no affectedObjects so a Stepper
    // can confirm "this would work" without committing.
    // ------------------------------------------------------------------
    if (options?.dryRun) {
      return {
        success: true,
        actionId: `dryrun_${actionId}`,
        errors: [],
        affectedObjects: [],
        warnings: [
          'Dry-run: validation, authorization, consent, and preconditions passed. No effects were applied.',
        ],
      };
    }

    // ------------------------------------------------------------------
    // Step 5: EXECUTE — apply effects in manifest order, single txn
    // ------------------------------------------------------------------
    // Capture effect context from resolved variables (spec Section 5.3).
    // Created objects are injected back into this context so subsequent
    // effects (e.g. createLink) can reference them by camelCase type name.
    const effectContext: Record<string, unknown> = { ...resolvedVariables };
    const affectedObjects: AffectedObject[] = [];
    const beforeStates: Map<string, Record<string, unknown>> = new Map();
    const afterStates: Map<string, Record<string, unknown>> = new Map();
    /**
     * Post-commit delivery failures under a non-rollback policy. The action
     * still succeeded — the transaction is committed and cannot be undone by a
     * webhook that did not land — but the caller has to be told, or a dropped
     * notification is invisible until someone downstream asks why it never
     * arrived.
     */
    const sideEffectWarnings: string[] = [];

    // Pre-flight: verify the storage provider supports transactions before
    // calling beginTransaction. A read-only or non-transactional provider
    // would otherwise throw a provider-specific exception mid-pipeline.
    // Failing fast with a typed error lets the caller surface a clean
    // READ_ONLY / NOT_SUPPORTED message instead of a stack trace.
    const caps = this.config.storage.capabilities();
    if (!caps.supportsTransactions) {
      return failResult(actionId, [
        {
          code: caps.supportsWrites ? 'NOT_SUPPORTED' : 'READ_ONLY',
          message: `Storage provider does not support transactions; action "${manifest.action}" cannot execute.`,
        },
      ]);
    }

    const txn = await this.config.storage.beginTransaction(reqCtx);

    try {
      for (const effect of manifest.effects) {
        await this.executeEffect(
          effect,
          effectContext,
          txn,
          reqCtx,
          schema,
          affectedObjects,
          beforeStates,
          afterStates,
        );
      }
      await txn.commit();
    } catch (err) {
      await txn.rollback();
      // Keep a code the storage layer already assigned (e.g. VERSION_CONFLICT
      // from the expectedVersion guard) instead of flattening everything to
      // EFFECT_EXECUTION_ERROR — rest/errors.ts and graphql/errors.ts map those
      // codes to real statuses, and a client can only retry-on-conflict if the
      // code survives the transaction boundary. Same extraction the API error
      // translators use; unrecognised codes are mapped to `system` there.
      return failResult(actionId, [
        {
          code: err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'EFFECT_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      ]);
    }

    // ------------------------------------------------------------------
    // Step 6: SIDE-EFFECTS — execute inline with retry
    // ------------------------------------------------------------------
    if (this.config.sideEffectHandler && manifest.sideEffects.length > 0) {
      for (const se of manifest.sideEffects) {
        // Interpolate event `data` values against the action context so
        // payloads carry resolved IDs/values (e.g. "bed.id" → the bed's id),
        // not the literal expression strings. Link paths (e.g. "bed.ward.id")
        // were pre-resolved into the context by preResolveLinkPaths.
        const seConfig = this.resolveSideEffectConfig(se.type, se.config, effectContext);
        const seResult = await this.config.sideEffectHandler.execute(
          se.name,
          se.type,
          seConfig,
          effectContext,
          se.retries,
        );

        if (!seResult.success) {
          const policy = manifest.rollback?.onSideEffectFailure ?? 'LOG_AND_CONTINUE';
          if (policy === 'ROLLBACK_ALL') {
            // CQ-24: Attempt compensating transaction to undo committed effects.
            // Reverses both object and link effects using beforeStates snapshots.
            try {
              const compensatingTxn = await this.config.storage.beginTransaction(reqCtx);
              try {
                for (const affected of affectedObjects) {
                  // Discriminate links from objects via the schema, not the
                  // beforeStates key: a `link:<type>:<id>` snapshot is only
                  // written for DELETED links (executeDeleteLink), so keying on
                  // it would mis-route a CREATED link's compensation through the
                  // object branch (deleteObject) instead of deleteLink.
                  const isLink = schema.linkTypes.some((lt) => lt.name === affected.type);

                  if (isLink) {
                    if (affected.changeType === 'created') {
                      // Undo link creation by deleting the link
                      await compensatingTxn.deleteLink(affected.type, affected.id);
                    } else if (affected.changeType === 'deleted') {
                      // Undo link deletion by recreating from beforeStates snapshot
                      const before = beforeStates.get(`link:${affected.type}:${affected.id}`);
                      if (before && before['_fromId'] && before['_toId']) {
                        const { _fromId, _toId, _type, _id, _tenantId, _version, _createdAt, _updatedAt, _deletedAt, _fromType, _toType, ...props } = before;
                        await compensatingTxn.createLink(
                          affected.type,
                          _fromId as string,
                          _toId as string,
                          props,
                        );
                      }
                    }
                  } else {
                    const before = beforeStates.get(`${affected.type}:${affected.id}`);
                    if (affected.changeType === 'created') {
                      // Undo object create by soft-deleting
                      await compensatingTxn.deleteObject(affected.type, affected.id, 'soft');
                    } else if (affected.changeType === 'updated' && before) {
                      // Undo object update by restoring prior state.
                      // Strip system fields — storage manages these internally
                      // and they would cause column-mapping errors in Postgres.
                      const userProps = stripSystemFields(before);
                      await compensatingTxn.updateObject(affected.type, affected.id, userProps);
                    }
                    // 'deleted' object rollbacks are best-effort; restoring a
                    // soft-deleted row needs a dedicated SPI restore op (the
                    // update path filters _deleted_at IS NULL). The before-state
                    // is captured so a future restore op can use it.
                  }
                }
                await compensatingTxn.commit();
              } catch (innerErr) {
                logger.error({ err: innerErr, actionId }, 'Compensating transaction rollback failed');
                await compensatingTxn.rollback();
              }
            } catch (outerErr) {
              logger.error({ err: outerErr, actionId }, 'Failed to begin compensating transaction');
            }
            return failResult(actionId, [
              {
                code: 'SIDE_EFFECT_FAILURE',
                message: `Side-effect "${se.name}" failed: ${seResult.error ?? 'unknown error'}. Compensating transaction attempted.`,
              },
            ]);
          }
          // LOG_AND_CONTINUE / RETRY_INDEFINITELY: the committed effects stand,
          // but the failure is reported rather than dropped.
          const detail = `Side-effect "${se.name}" (${se.type}) failed: ${seResult.error ?? 'unknown error'}`;
          sideEffectWarnings.push(detail);
          logger.warn({ actionId, actionType, sideEffect: se.name, type: se.type, err: seResult.error, policy }, detail);
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 7: AUDIT — write AuditRecord with before/after, actor, traceId
    // Step 8: EMIT — publish CloudEvents for affected objects/links
    // ------------------------------------------------------------------
    // These run AFTER the transaction has committed. Failures here must not
    // cause the action to appear failed — the data is already persisted.
    try {
      if (this.config.auditWriter) {
        await this.config.auditWriter.write({
          id: `audit_${actionId}`,
          timestamp: now(),
          traceId: reqCtx.traceId ?? actionId,
          tenantId: reqCtx.tenantId,
          actor: {
            type: actor.type,
            id: actor.id,
            roles: actor.roles,
            ip: actor.ip,
          },
          operation: {
            type: 'action',
            actionType,
            actionId,
          },
          detail: {
            before: Object.fromEntries(beforeStates),
            after: Object.fromEntries(afterStates),
            result: 'success',
          },
        });
      }

      if (this.config.eventPublisher) {
        const cause = { actionType, actionId, actor: actor.id };
        for (const affected of affectedObjects) {
          const linkKey = `link:${affected.type}:${affected.id}`;
          const isLink = beforeStates.has(linkKey) || afterStates.has(linkKey);

          if (isLink) {
            // Use publishLinkChange for link effects with fromId/toId
            const linkState = (afterStates.get(linkKey) ?? beforeStates.get(linkKey)) as Record<string, unknown> | undefined;
            const fromId = (linkState?.['_fromId'] as string) ?? '';
            const toId = (linkState?.['_toId'] as string) ?? '';
            await this.config.eventPublisher.publishLinkChange(
              affected.changeType as 'created' | 'deleted',
              affected.type,
              affected.id,
              fromId,
              toId,
              cause,
              reqCtx,
            );
            // Mint/remove the graph-derived ReBAC tuple for this link, so
            // `... from <link>` rules resolve without out-of-band provisioning.
            await this.syncLinkTuple(affected.type, affected.changeType, fromId, toId, reqCtx.tenantId);
          } else {
            // Use publishObjectChange for object effects
            await this.config.eventPublisher.publishObjectChange(
              affected.changeType,
              affected.type,
              affected.id,
              beforeStates.get(`${affected.type}:${affected.id}`) as Record<string, unknown> | undefined,
              afterStates.get(`${affected.type}:${affected.id}`) as Record<string, unknown> | undefined,
              cause,
              reqCtx,
            );
          }
        }
      }
    } catch (postCommitErr) {
      logger.error({ err: postCommitErr, actionId }, 'Post-commit audit/event publishing failed');
      // Do not return failure — the transaction already committed successfully.
    }

    return {
      success: true,
      actionId,
      errors: [],
      affectedObjects,
      ...(sideEffectWarnings.length > 0 ? { warnings: sideEffectWarnings } : {}),
    };
  }

  // ─── Step 1: Param validation ───

  private validateParams(
    actionTypeDef: ActionType | undefined,
    params: Record<string, unknown>,
    schema: ParsedSchema,
  ): ActionError[] {
    if (!actionTypeDef) {
      // If no schema definition, skip validation (structural-only mode)
      return [];
    }

    const errors: ActionError[] = [];
    for (const field of actionTypeDef.fields) {
      const isParam = field.directives.some((d) => d.kind === 'param');
      if (!isParam) continue;

      const value = params[field.name];

      if (field.type.nonNull && (value === undefined || value === null)) {
        errors.push({
          code: 'MISSING_REQUIRED_PARAM',
          message: `Required parameter "${field.name}" is missing`,
          path: `params.${field.name}`,
        });
        continue;
      }

      if (value === undefined || value === null) continue;

      // Type-check the value against the declared ODL type. Without this a
      // String param accepts a number and an enum param accepts any string;
      // the mismatch only surfaces later as a storage or CEL error naming
      // neither the param nor the expected type. Object-typed params are
      // checked to be id STRINGS here; step 4 then resolves them from storage.
      // Existence is not asserted here — a missing id resolves to null and
      // fails at the effect that needs it.
      const typeError = checkParamType(field, value, schema);
      if (typeError) {
        errors.push({
          code: 'INVALID_PARAM_TYPE',
          message: typeError,
          path: `params.${field.name}`,
        });
      }
    }
    return errors;
  }

  // ─── Step 4: Resolve param objects from SPI ───

  private async resolveParamObjects(
    actionTypeDef: ActionType | undefined,
    params: Record<string, unknown>,
    schema: ParsedSchema,
    reqCtx: RequestContext,
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};

    if (!actionTypeDef) {
      // No schema; pass params through as-is
      Object.assign(resolved, params);
      return resolved;
    }

    for (const field of actionTypeDef.fields) {
      const isParam = field.directives.some((d) => d.kind === 'param');
      if (!isParam) continue;

      const paramValue = params[field.name];
      if (paramValue === undefined || paramValue === null) {
        resolved[field.name] = null;
        continue;
      }

      // Check if this param type is an object type in the schema
      const isObjectType = schema.objectTypes.some(
        (ot) => ot.name === field.type.name,
      );

      if (isObjectType && typeof paramValue === 'string') {
        // Resolve the object from storage by ID
        const obj = await this.config.storage.getObject(
          reqCtx,
          field.type.name,
          paramValue,
        );
        resolved[field.name] = obj ? addIdAlias(obj, primaryFieldName(schema, field.type.name)) : null;
      } else {
        // Scalar param — pass through
        resolved[field.name] = paramValue;
      }
    }

    return resolved;
  }

  // ─── Step 4b: Pre-resolve link paths ───

  /**
   * Scan the manifest for dotted paths that traverse @link fields and
   * eagerly resolve them into the context. This allows sync resolveExpression
   * and precondition CEL evaluation to access linked objects without
   * needing async resolution at each call site.
   *
   * For example, "patient.currentBed" in a transfer-ward manifest triggers:
   *   1. Find Patient type in schema
   *   2. Find "currentBed" field with @link(type: "OccupiesBed", direction: OUTBOUND)
   *   3. Query getLinks(patientId, "OccupiesBed", "outbound")
   *   4. Fetch the target Bed object
   *   5. Cache it as patient.currentBed in the context
   */
  private async preResolveLinkPaths(
    manifest: ActionManifest,
    context: Record<string, unknown>,
    schema: ParsedSchema,
    reqCtx: RequestContext,
  ): Promise<void> {
    // Collect all dotted paths from the manifest
    const paths = new Set<string>();

    for (const pre of manifest.preconditions) {
      // Extract variable references from CEL: simple heuristic for dot paths
      for (const match of pre.expr.matchAll(/([a-zA-Z_]\w*(?:\.\w+)+)/g)) {
        paths.add(match[1]!);
      }
    }

    for (const effect of manifest.effects) {
      if (effect.type === 'updateObject' && effect.target.includes('.')) {
        paths.add(effect.target);
      }
      if (effect.type === 'updateObject') {
        for (const expr of Object.values(effect.set)) {
          if (typeof expr === 'string' && expr.includes('.') && !expr.startsWith("'")) {
            paths.add(expr);
          }
        }
      }
      if (effect.type === 'createObject') {
        for (const expr of Object.values(effect.properties)) {
          if (typeof expr === 'string' && expr.includes('.') && !expr.startsWith("'")) {
            paths.add(expr);
          }
        }
      }
      if (effect.type === 'createLink' && effect.properties) {
        for (const expr of Object.values(effect.properties)) {
          if (typeof expr === 'string' && expr.includes('.') && !expr.startsWith("'")) {
            paths.add(expr);
          }
        }
      }
    }

    // Side-effect event `data` values may reference link paths (e.g.
    // "bed.ward.id"); scan them so the link prefix is pre-resolved and the
    // interpolation at emit time can read it from context.
    for (const se of manifest.sideEffects ?? []) {
      const cfg = se.config as Record<string, unknown> | undefined;
      const data = cfg?.['data'];
      if (data && typeof data === 'object') {
        for (const expr of Object.values(data as Record<string, unknown>)) {
          if (typeof expr === 'string' && expr.includes('.') && !expr.startsWith("'")) {
            paths.add(expr);
          }
        }
      }
    }

    // For each unique dotted path, resolve it via resolveTarget (which handles
    // link traversal and caches results in context).
    const resolved = new Set<string>();
    for (const path of paths) {
      // Extract the link path prefix (e.g. "patient.currentWard" from "patient.currentWard.name")
      const segments = path.split('.');
      // Try progressively longer prefixes to resolve nested links
      for (let i = 2; i <= segments.length; i++) {
        const prefix = segments.slice(0, i).join('.');
        if (resolved.has(prefix)) continue;
        await this.resolveTarget(prefix, context, schema, reqCtx);
        resolved.add(prefix);
      }
    }
  }

  // ─── Step 5: Effect execution ───

  private async executeEffect(
    effect: ActionEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    schema: ParsedSchema,
    affectedObjects: AffectedObject[],
    beforeStates: Map<string, Record<string, unknown>>,
    afterStates: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    switch (effect.type) {
      case 'updateObject':
        await this.executeUpdateObject(effect, context, txn, reqCtx, affectedObjects, beforeStates, afterStates, schema);
        break;
      case 'createLink':
        await this.executeCreateLink(effect, context, txn, reqCtx, schema, affectedObjects, afterStates);
        break;
      case 'updateLink':
        await this.executeUpdateLink(effect, context, txn, reqCtx, schema, affectedObjects, beforeStates, afterStates);
        break;
      case 'deleteLink':
        await this.executeDeleteLink(effect, context, txn, reqCtx, affectedObjects, beforeStates, schema);
        break;
      case 'createObject':
        await this.executeCreateObject(effect, context, txn, affectedObjects, afterStates, schema);
        break;
      case 'deleteObject':
        await this.executeDeleteObject(effect, context, txn, reqCtx, affectedObjects, beforeStates, schema);
        break;
      case 'recordConsent':
        await this.executeRecordConsent(effect, context, reqCtx);
        break;
    }
  }

  /**
   * Record a consent decision via the ConsentManager. Resolves `subject` from
   * context (e.g. a just-created patient), honours an optional CEL `condition`
   * (opt-out), and defaults purpose=DIRECT_CARE, decision=GRANT. No-op if no
   * consent manager is wired. NOTE: consent is recorded outside the SPI
   * transaction, so this should be the terminal effect (it is not rolled back).
   */
  private async executeRecordConsent(
    effect: RecordConsentEffect,
    context: Record<string, unknown>,
    reqCtx: RequestContext,
  ): Promise<void> {
    if (!this.config.consentManager) return;
    if (effect.condition) {
      const cond = await this.config.cel.evaluate(effect.condition, context);
      if (cond.value !== true) return;
    }
    const subjectId = String(this.resolveExpression(effect.subject, context) ?? '');
    if (!subjectId) {
      throw new Error(`recordConsent: subject "${effect.subject}" did not resolve to an id`);
    }
    const purpose = (effect.purpose ?? 'DIRECT_CARE') as DataPurpose;
    const decision = (effect.decision ?? 'GRANT') === 'DENY' ? 'DENY' : 'GRANT';
    await this.config.consentManager.recordConsent(
      subjectId,
      purpose,
      decision,
      effect.evidence,
      reqCtx.tenantId,
    );
  }

  private async executeUpdateObject(
    effect: UpdateObjectEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    affectedObjects: AffectedObject[],
    beforeStates: Map<string, Record<string, unknown>>,
    afterStates: Map<string, Record<string, unknown>>,
    schema?: ParsedSchema,
  ): Promise<void> {
    // Evaluate condition if present
    if (effect.condition) {
      const condResult = await this.config.cel.evaluate(effect.condition, context);
      if (condResult.value !== true) return;
    }

    // Resolve target to an object (supports dotted paths like "patient.currentBed")
    const target = await this.resolveTarget(effect.target, context, schema, reqCtx);
    if (!target) {
      throw new Error(`Target "${effect.target}" not found in context`);
    }

    // Resolve property values from CEL context
    const properties: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(effect.set)) {
      properties[key] = this.resolveExpression(expr, context);
    }

    // Same contract as createObject: updatedAt/updatedBy are @readonly, so the
    // platform maintains them on every governed write.
    if (schema) {
      Object.assign(
        properties,
        auditableDefaults(schema, target._type, properties, actorId(context), now(), 'update'),
      );
    }

    // Capture before state
    const beforeKey = `${target._type}:${target._id}`;
    if (!beforeStates.has(beforeKey)) {
      beforeStates.set(beforeKey, { ...target });
    }

    // Optimistic concurrency: guard the read-modify-write window with the version
    // the target carried when it was read into the action context (resolveTarget
    // walks the context, which is loaded before the transaction opens). Without
    // this, two concurrent actions on one object both read v1, both write, and
    // the loser's changes vanish with no error. Storage raises VERSION_CONFLICT,
    // which rest/errors.ts and graphql/errors.ts already map to `conflict`.
    //
    // A second effect touching the same object must expect the version the first
    // one produced, not the stale context version.
    const priorVersion = afterStates.get(beforeKey)?.['_version'];
    const expectedVersion = typeof priorVersion === 'number'
      ? priorVersion
      : typeof target._version === 'number' ? target._version : undefined;

    const updated = await txn.updateObject(target._type, target._id, properties, expectedVersion);

    afterStates.set(beforeKey, { ...updated });
    affectedObjects.push({
      type: target._type,
      id: target._id,
      changeType: 'updated',
    });
  }

  private async executeCreateLink(
    effect: CreateLinkEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    schema: ParsedSchema,
    affectedObjects: AffectedObject[],
    afterStates: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    // Evaluate condition if present
    if (effect.condition) {
      const condResult = await this.config.cel.evaluate(effect.condition, context);
      if (condResult.value !== true) return;
    }

    const fromObj = await this.resolveTarget(effect.from, context, schema, reqCtx);
    const toObj = await this.resolveTarget(effect.to, context, schema, reqCtx);
    if (!fromObj) throw new Error(`createLink "from" param "${effect.from}" not found in context`);
    if (!toObj) throw new Error(`createLink "to" param "${effect.to}" not found in context`);

    // Resolve link properties
    const properties: Record<string, unknown> = {};
    if (effect.properties) {
      for (const [key, expr] of Object.entries(effect.properties)) {
        properties[key] = this.resolveExpression(expr, context);
      }
    }

    const link = await txn.createLink(effect.linkType, fromObj._id, toObj._id, properties);

    const linkKey = `link:${effect.linkType}:${link._id}`;
    afterStates.set(linkKey, { ...link });
    affectedObjects.push({
      type: effect.linkType,
      id: link._id,
      changeType: 'created',
    });
  }

  private async executeUpdateLink(
    effect: UpdateLinkEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    schema: ParsedSchema,
    affectedObjects: AffectedObject[],
    beforeStates: Map<string, Record<string, unknown>>,
    afterStates: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    // Evaluate condition if present
    if (effect.condition) {
      const condResult = await this.config.cel.evaluate(effect.condition, context);
      if (condResult.value !== true) return;
    }

    // Resolve filter to matching links (same logic as deleteLink)
    const matchingLinks = await this.resolveUpdateLinkFilter(effect, context, reqCtx, schema);

    const expect = effect.expect ?? 'ONE';
    if (expect === 'ONE') {
      if (matchingLinks.length !== 1) {
        throw new Error(
          `updateLink ${effect.linkType}: expected exactly ONE matching link, found ${matchingLinks.length}`,
        );
      }
    }

    // Resolve set expressions
    const properties: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(effect.set)) {
      properties[key] = this.resolveExpression(expr, context);
    }

    for (const link of matchingLinks) {
      const linkKey = `link:${effect.linkType}:${link._id}`;
      beforeStates.set(linkKey, { ...link });

      const updated = await txn.updateLink(effect.linkType, link._id, properties);

      afterStates.set(linkKey, { ...updated });
      affectedObjects.push({
        type: effect.linkType,
        id: link._id,
        changeType: 'updated',
      });
    }
  }

  private async executeDeleteLink(
    effect: DeleteLinkEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    affectedObjects: AffectedObject[],
    beforeStates: Map<string, Record<string, unknown>>,
    schema?: ParsedSchema,
  ): Promise<void> {
    // Resolve filter to concrete link IDs (Section 5.3 deleteLink resolution)
    const matchingLinks = await this.resolveDeleteLinkFilter(
      effect,
      context,
      reqCtx,
      schema,
    );

    const expect = effect.expect ?? 'ONE';

    if (expect === 'ONE') {
      if (matchingLinks.length !== 1) {
        throw new Error(
          `deleteLink ${effect.linkType}: expected exactly ONE matching link, found ${matchingLinks.length}`,
        );
      }
    }
    // expect === 'ALL': delete all matches (0 is valid for ALL)

    for (const link of matchingLinks) {
      const linkKey = `link:${effect.linkType}:${link._id}`;
      beforeStates.set(linkKey, { ...link });

      await txn.deleteLink(effect.linkType, link._id);

      affectedObjects.push({
        type: effect.linkType,
        id: link._id,
        changeType: 'deleted',
      });
    }
  }

  private async executeCreateObject(
    effect: CreateObjectEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    affectedObjects: AffectedObject[],
    afterStates: Map<string, Record<string, unknown>>,
    schema?: ParsedSchema,
  ): Promise<void> {
    // Resolve property values
    const properties: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(effect.properties)) {
      properties[key] = this.resolveExpression(expr, context);
    }

    // Fill the platform-managed @readonly Auditable fields. They are non-null
    // in the DDL and forbidden to callers, so without this an Auditable type
    // cannot be created at all on a provider that enforces NOT NULL.
    if (schema) {
      Object.assign(
        properties,
        auditableDefaults(
          schema,
          effect.objectType,
          properties,
          actorId(context),
          now(),
          'create',
        ),
      );
    }

    const created = await txn.createObject(effect.objectType, properties);
    addIdAlias(created, primaryFieldName(schema, effect.objectType));

    // Inject created object into context so subsequent effects (e.g. createLink)
    // can reference it. Key is the camelCase form of the objectType name:
    //   "CorpusEntry" → "corpusEntry", "Instance" → "instance"
    const contextKey = effect.objectType[0]!.toLowerCase() + effect.objectType.slice(1);
    if (!(contextKey in context)) {
      context[contextKey] = created;
    }

    const objKey = `${effect.objectType}:${created._id}`;
    afterStates.set(objKey, { ...created });
    affectedObjects.push({
      type: effect.objectType,
      id: created._id,
      changeType: 'created',
    });
  }

  /**
   * Delete an object via the governed action pipeline. Resolves `target` the
   * same way updateObject does (supports dotted paths), captures before-state
   * for compensation, and delegates to `txn.deleteObject`. Default mode is
   * 'soft' (preserve audit trail + history); 'hard' is explicit-only.
   */
  private async executeDeleteObject(
    effect: DeleteObjectEffect,
    context: Record<string, unknown>,
    txn: Transaction,
    reqCtx: RequestContext,
    affectedObjects: AffectedObject[],
    beforeStates: Map<string, Record<string, unknown>>,
    schema?: ParsedSchema,
  ): Promise<void> {
    if (effect.condition) {
      const condResult = await this.config.cel.evaluate(effect.condition, context);
      if (condResult.value !== true) return;
    }

    const target = await this.resolveTarget(effect.target, context, schema, reqCtx);
    if (!target) {
      throw new Error(`Target "${effect.target}" not found in context`);
    }

    const beforeKey = `${target._type}:${target._id}`;
    if (!beforeStates.has(beforeKey)) {
      beforeStates.set(beforeKey, { ...target });
    }

    await txn.deleteObject(target._type, target._id, effect.mode ?? 'soft');

    affectedObjects.push({
      type: target._type,
      id: target._id,
      changeType: 'deleted',
    });
  }

  // ─── deleteLink filter resolution (Section 5.3) ───

  private async resolveDeleteLinkFilter(
    effect: DeleteLinkEffect,
    context: Record<string, unknown>,
    reqCtx: RequestContext,
    schema?: ParsedSchema,
  ): Promise<OntologyLink[]> {
    // Resolve "from" and "to" filter references to object IDs
    let fromId: string | undefined;
    let toId: string | undefined;

    if (effect.filter.from) {
      const fromObj = await this.resolveTarget(effect.filter.from, context, schema, reqCtx);
      if (fromObj) {
        fromId = fromObj._id;
      }
    }

    if (effect.filter.to) {
      const toObj = await this.resolveTarget(effect.filter.to, context, schema, reqCtx);
      if (toObj) {
        toId = toObj._id;
      }
    }

    // Query links from SPI
    const results: OntologyLink[] = [];

    if (fromId) {
      const page = await this.config.storage.getLinks(
        reqCtx,
        fromId,
        effect.linkType,
        'outbound',
      );
      for (const link of page.items) {
        if (toId && link._toId !== toId) continue;
        if (effect.filter.active !== undefined && effect.filter.active && link._deletedAt) continue;
        results.push(link);
      }
    } else if (toId) {
      const page = await this.config.storage.getLinks(
        reqCtx,
        toId,
        effect.linkType,
        'inbound',
      );
      for (const link of page.items) {
        if (effect.filter.active !== undefined && effect.filter.active && link._deletedAt) continue;
        results.push(link);
      }
    }

    return results;
  }

  /**
   * Resolve an updateLink filter to concrete link IDs — same logic as
   * resolveDeleteLinkFilter but typed for UpdateLinkEffect.
   */
  private async resolveUpdateLinkFilter(
    effect: UpdateLinkEffect,
    context: Record<string, unknown>,
    reqCtx: RequestContext,
    schema?: ParsedSchema,
  ): Promise<OntologyLink[]> {
    let fromId: string | undefined;
    let toId: string | undefined;

    if (effect.filter.from) {
      const fromObj = await this.resolveTarget(effect.filter.from, context, schema, reqCtx);
      if (fromObj) fromId = fromObj._id;
    }
    if (effect.filter.to) {
      const toObj = await this.resolveTarget(effect.filter.to, context, schema, reqCtx);
      if (toObj) toId = toObj._id;
    }

    const results: OntologyLink[] = [];
    if (fromId) {
      const page = await this.config.storage.getLinks(reqCtx, fromId, effect.linkType, 'outbound');
      for (const link of page.items) {
        if (toId && link._toId !== toId) continue;
        if (effect.filter.active !== undefined && effect.filter.active && link._deletedAt) continue;
        results.push(link);
      }
    } else if (toId) {
      const page = await this.config.storage.getLinks(reqCtx, toId, effect.linkType, 'inbound');
      for (const link of page.items) {
        if (effect.filter.active !== undefined && effect.filter.active && link._deletedAt) continue;
        results.push(link);
      }
    }
    return results;
  }

  // ─── Expression resolution ───

  /**
   * Resolve a simple expression from the immutable action context.
   *
   * Resolution order:
   * 1. "'literal'" -> string literal (single-quoted within double-quoted YAML)
   * 2. "now" -> current timestamp
   * 3. Dot-path resolution: "params.field", "patient.status", etc.
   *    - If the root key exists in context, resolve the path
   *    - If an OntologyObject is reached, return its _id
   * 4. Fallback: if the root key is NOT in context, treat as literal string
   *    (e.g. "ACTIVE", "DISCHARGED", "OCCUPIED")
   */
  /**
   * For event side-effects, resolve each `data` value as a context expression
   * (string values only) so the emitted CloudEvent carries resolved values
   * rather than literal expression strings. Non-event configs are returned
   * unchanged. Returns a shallow copy; the original manifest config is not
   * mutated.
   */
  private resolveSideEffectConfig(
    type: string,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    if (type === 'webhook') return this.resolveWebhookConfig(config, context);
    if (type !== 'event') return config;
    const data = config['data'];
    if (!data || typeof data !== 'object') return config;
    const resolvedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      resolvedData[key] = typeof value === 'string' ? this.resolveExpression(value, context) : value;
    }
    return { ...config, data: resolvedData };
  }

  /**
   * Resolve a webhook side-effect config the same way event `data` is resolved:
   * each string in `body` becomes its resolved context value rather than the
   * literal expression text. Without this a manifest declaring
   * `body: { reason: "params.reason" }` POSTed the string "params.reason".
   *
   * Runs post-commit, so it never throws: an unsupported `method` is rejected by
   * the manifest parser instead, before any effect is written. `url` is passed
   * through untouched — `${VAR}` placeholders are not expanded here.
   */
  private resolveWebhookConfig(
    config: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const body = config['body'];
    if (!body || typeof body !== 'object' || Array.isArray(body)) return config;

    const resolvedBody: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      resolvedBody[key] = typeof value === 'string' ? this.resolveExpression(value, context) : value;
    }
    return { ...config, body: resolvedBody };
  }

  /**
   * Write an audit record for a denied action (authorize/consent stage).
   * Denials return before the post-commit audit step, so without this the
   * immutable trail would record only successes — IG/security review needs
   * evidence of refused access too. Best-effort: audit failure never changes
   * the action's response.
   */
  private async auditDenied(
    actionId: string,
    actor: ActionActor,
    actionType: string,
    reqCtx: RequestContext,
    denialReason: string,
    opts?: { consentDenied?: boolean; subjectId?: string },
  ): Promise<void> {
    if (!this.config.auditWriter) return;
    try {
      await this.config.auditWriter.write({
        id: `audit_${actionId}`,
        timestamp: now(),
        traceId: reqCtx.traceId ?? actionId,
        tenantId: reqCtx.tenantId,
        actor: { type: actor.type, id: actor.id, roles: actor.roles, ip: actor.ip },
        operation: {
          type: 'action',
          actionType,
          actionId,
          ...(opts?.subjectId ? { objectId: opts.subjectId } : {}),
        },
        detail: {
          result: 'denied',
          denialReason,
          ...(opts?.consentDenied ? { consentDecision: 'denied' as const } : {}),
        },
      });
    } catch (err) {
      logger.warn({ err, actionId }, 'Failed to write denial audit record');
    }
  }

  /**
   * Mint or remove the OpenFGA relationship tuple for a created/deleted link,
   * per the configured linkTupleMap. Tuple is `(toType:toId, relation,
   * fromType:fromId)` — the `fromType` object holds the relation referencing
   * the `toType` object (e.g. patient `admitted_to` ward). Best-effort:
   * post-commit, so a tuple failure never fails the already-committed action.
   */
  private async syncLinkTuple(
    linkType: string,
    changeType: 'created' | 'updated' | 'deleted',
    fromId: string,
    toId: string,
    tenantId: string,
  ): Promise<void> {
    const writer = this.config.relationshipWriter;
    const mapping = this.config.linkTupleMap?.get(linkType);
    if (!writer || !mapping || !fromId || !toId) return;
    if (changeType !== 'created' && changeType !== 'deleted') return;

    const user = `${mapping.toType}:${toId}`;
    const resource = `${mapping.fromType}:${fromId}`;
    try {
      if (changeType === 'created') {
        await writer.writeRelationship(user, mapping.relation, resource, tenantId);
      } else {
        await writer.deleteRelationship(user, mapping.relation, resource, tenantId);
      }
    } catch (err) {
      logger.warn({ err, linkType, relation: mapping.relation }, 'Failed to sync ReBAC tuple for link');
    }
  }

  private resolveExpression(expr: unknown, context: Record<string, unknown>): unknown {
    // Only strings are CEL expressions. A manifest value YAML parsed as a
    // number, boolean or null is the value itself and passes through with its
    // type intact — stringifying it writes "5" into an Int column.
    if (typeof expr !== 'string') return expr;

    // String literal: 'VALUE'
    if (expr.startsWith("'") && expr.endsWith("'")) {
      return expr.slice(1, -1);
    }

    // "now" -> timestamp
    if (expr === 'now') {
      return context['now'] ?? now();
    }

    // Dot-path resolution: "params.destination", "patient.currentWard", etc.
    const parts = expr.split('.');
    const rootKey = parts[0]!;

    // If the root key doesn't exist in context, treat the whole expression
    // as a literal string value (e.g. "ACTIVE", "DISCHARGED", "HOME")
    if (!(rootKey in context)) {
      return expr;
    }

    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }

    // If the resolved value is an OntologyObject, return its _id
    // (used when setting properties like "patient" on a DischargeRecord)
    if (
      current !== null &&
      current !== undefined &&
      typeof current === 'object' &&
      '_id' in (current as Record<string, unknown>) &&
      '_type' in (current as Record<string, unknown>)
    ) {
      return (current as OntologyObject)._id;
    }

    return current ?? null;
  }

  /**
   * Resolve a dotted target path to an OntologyObject.
   *
   * Unlike resolveExpression (which returns _id for objects), this returns
   * the full object so the executor can read _type and _id from it.
   * Supports both flat keys ("patient") and dotted paths ("patient.currentBed").
   *
   * When a path segment refers to a @link field (e.g. "currentBed" on Patient),
   * the link is followed via the storage provider to resolve the target object.
   * Resolved link targets are cached in context to avoid redundant queries.
   */
  private async resolveTarget(
    target: string,
    context: Record<string, unknown>,
    schema?: ParsedSchema,
    reqCtx?: RequestContext,
  ): Promise<OntologyObject | null> {
    const parts = target.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      if (typeof current !== 'object') return null;

      const next = (current as Record<string, unknown>)[part];
      if (next !== undefined) {
        current = next;
        continue;
      }

      // Property not found directly. If current is an OntologyObject,
      // check if 'part' is a @link field and follow the link.
      const obj = current as Record<string, unknown>;
      if (schema && reqCtx && obj['_type'] && obj['_id']) {
        const objTypeDef = schema.objectTypes.find((ot) => ot.name === obj['_type']);
        if (objTypeDef) {
          const linkField = objTypeDef.fields.find((f) => f.name === part);
          const linkDir = linkField?.directives.find((d) => d.kind === 'link') as
            | { kind: 'link'; type: string; direction: string }
            | undefined;

          if (linkDir) {
            const direction = linkDir.direction.toLowerCase() as 'outbound' | 'inbound';
            const page = await this.config.storage.getLinks(
              reqCtx,
              obj['_id'] as string,
              linkDir.type,
              direction,
            );
            const link = page.items[0];
            if (link) {
              const targetId = direction === 'outbound' ? link._toId : link._fromId;
              const targetType = direction === 'outbound' ? link._toType : link._fromType;
              const resolved = await this.config.storage.getObject(reqCtx, targetType, targetId);
              if (resolved) {
                addIdAlias(resolved, primaryFieldName(schema, targetType));
                // Cache in context so subsequent references don't re-query
                (current as Record<string, unknown>)[part] = resolved;
                current = resolved;
                continue;
              }
            }
            // Link doesn't exist (e.g. patient has no current bed)
            return null;
          }
        }
      }

      // Truly not found
      return null;
    }

    if (
      current !== null &&
      current !== undefined &&
      typeof current === 'object' &&
      '_id' in (current as Record<string, unknown>) &&
      '_type' in (current as Record<string, unknown>)
    ) {
      return current as OntologyObject;
    }

    return null;
  }
}
