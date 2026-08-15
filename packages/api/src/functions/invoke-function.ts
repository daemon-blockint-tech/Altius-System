/**
 * The one place a FunctionType is invoked.
 *
 * Authorization and audit used to live inside generateFunctionResolver, which
 * made them properties of the GraphQL transport rather than of the function.
 * Adding a REST route by copying that block is how the two drift: a control
 * tightened on one path silently stays loose on the other. Both transports
 * call this instead — the checks are the function's, not the protocol's.
 */

import type { FunctionType } from '@altius/odl';

import type { FunctionOntologyAccess } from '@altius/engine';
import type { ActionActor, ActionContext } from '@altius/actions';
import type { DataPurpose, FilterExpression } from '@altius/spi';

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import {
  DEFAULT_CONSENT_PURPOSE,
  DEFAULT_CONSENT_SUBJECT_TYPES,
  isConsentSubjectType,
} from '../graphql/types.js';
import {
  objectToGraphQL,
  resolveAllowedIds,
  buildAuthFilter,
  extractFilterFields,
  validateQueryFields,
} from '../graphql/resolver-generator.js';
import { createAltiusError } from '../graphql/errors.js';
import { toSnakeCase } from '../utils.js';
import { logger } from '../logger.js';

/** Cap on rows a single function query may pull back. */
const FUNCTION_QUERY_LIMIT = 1000;

export interface FunctionInvocationResult {
  result: unknown;
  logs: unknown[] | null;
  durationMs: number;
}

/**
 * Best-effort, matching the action pipeline: a failed audit write is logged
 * but never changes the caller's outcome (action-executor.ts does the same
 * post-commit). Losing the record is bad; turning an audit outage into a
 * platform outage is worse.
 */
async function audit(
  fn: FunctionType,
  deps: ApiDependencies,
  ctx: ResolverContext,
  result: 'success' | 'denied' | 'error',
  denialReason?: string,
): Promise<void> {
  if (!deps.auditWriter) return;
  try {
    // id and timestamp are populated by AuditWriter; traceId is passed
    // explicitly so the record correlates with the request, not the span.
    await deps.auditWriter.write({
      traceId: ctx.requestContext.traceId,
      tenantId: ctx.requestContext.tenantId,
      actor: { type: 'user', id: ctx.user.id, roles: ctx.user.roles },
      operation: { type: 'function', functionName: fn.name },
      detail: { result, ...(denialReason ? { denialReason } : {}) },
    });
  } catch (err) {
    logger.warn({ err, function: fn.name }, 'Failed to write function audit record');
  }
}

type ReadOutcome =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'denied'; reason: string };

/**
 * One authorized object read: ReBAC check, then field redaction, then consent.
 *
 * Shared so a direct read and a traversal cannot drift apart — they differ
 * only in what they do with a refusal, which is the caller's decision, not the
 * control's.
 */
async function readOne(
  deps: ApiDependencies,
  ctx: ResolverContext,
  objectType: string,
  id: string,
): Promise<ReadOutcome> {
  const obj = deps.schema.objectTypes.find(o => o.name === objectType);
  if (!obj) {
    throw new Error(`Unknown object type "${objectType}"`);
  }

  const allowed = await deps.authorizationService.check(
    `user:${ctx.user.id}`,
    'viewer',
    `${toSnakeCase(objectType)}:${id}`,
    ctx.user.tenantId,
  );
  if (!allowed) {
    return { status: 'denied', reason: `Access denied to ${objectType} ${id}` };
  }

  const found = await deps.objectManager.get(objectType, id, ctx.requestContext);
  if (!found) return { status: 'missing' };

  const redacted = deps.authorizationService.redactFields(
    ctx.user.id,
    ctx.user.roles,
    objectType,
    objectToGraphQL(found, obj),
  );
  const data = redacted.data as Record<string, unknown>;
  // objectToGraphQL presets _redactedFields to null, so leaving it unset does
  // not merely omit the information — it asserts nothing was withheld.
  // Redaction nulls a value rather than deleting it, so without this a function
  // cannot tell "no diagnosis recorded" from "you may not see it", and the two
  // give different answers.
  data['_redactedFields'] = redacted._redactedFields.length > 0 ? redacted._redactedFields : null;

  if (deps.consentService && isConsentSubjectType(objectType, deps.consentSubjectTypes)) {
    const decision = await deps.consentService.checkSingleObject(
      data,
      id,
      DEFAULT_CONSENT_PURPOSE as DataPurpose,
      ctx.user.id,
      ctx.requestContext.tenantId,
    );
    if (decision._consentRestricted) {
      return { status: 'denied', reason: `Consent denied for ${objectType} ${id}` };
    }
  }

  return { status: 'ok', data };
}

/**
 * Ontology reads offered to the function, bound to the invoking user.
 *
 * The isolated runtime forks pack code with a scrubbed env so it holds no
 * database or OpenFGA credentials; the read is performed here instead and runs
 * the same three controls the object routes run — ReBAC scoping, field
 * redaction, then consent. A function therefore cannot read anything its
 * caller could not read directly.
 *
 * A consent-restricted subject is refused rather than returned with its fields
 * nulled, which is where this deliberately departs from the object resolver: a
 * function computing over silently-nulled fields yields a wrong answer that
 * looks like a right one.
 */
function ontologyReaderFor(deps: ApiDependencies, ctx: ResolverContext): FunctionOntologyAccess {
  return {
    async getObject(objectType: string, id: string): Promise<Record<string, unknown> | null> {
      const outcome = await readOne(deps, ctx, objectType, id);
      if (outcome.status === 'missing') return null;
      if (outcome.status === 'denied') throw new Error(outcome.reason);
      return outcome.data;
    },

    async getLinkedObjects(
      objectType: string,
      id: string,
      linkType: string,
      direction: 'outbound' | 'inbound' = 'outbound',
    ): Promise<Record<string, unknown>[]> {
      const link = deps.schema.linkTypes.find(l => l.name === linkType);
      if (!link) {
        throw new Error(`Unknown link type "${linkType}"`);
      }
      // The declared endpoint the traversal starts from. Checking it turns a
      // mistyped traversal into an error instead of an empty result that reads
      // like "no neighbours".
      const sourceType = direction === 'outbound' ? link.from : link.to;
      if (sourceType !== objectType) {
        throw new Error(
          `Link "${linkType}" does not run ${direction} from ${objectType} (it starts at ${sourceType})`,
        );
      }
      const targetType = direction === 'outbound' ? link.to : link.from;

      // Traversal must not become a way around a direct read: the link
      // resolver checks every target individually for exactly this reason, so
      // ward.patients cannot surface a patient the caller could not fetch.
      const page = await deps.linkManager.getLinks(
        id,
        linkType,
        direction,
        { limit: FUNCTION_QUERY_LIMIT, offset: 0 },
        ctx.requestContext,
      );

      const out: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const l of page.items) {
        const targetId = direction === 'outbound' ? l._toId : l._fromId;
        if (!targetId || seen.has(targetId)) continue;
        seen.add(targetId);
        const outcome = await readOne(deps, ctx, targetType, targetId);
        // A neighbour the caller may not see is omitted, not surfaced and not
        // fatal — one restricted neighbour must not fail the whole traversal.
        if (outcome.status === 'ok') out.push(outcome.data);
      }
      return out;
    },

    async queryObjects(
      objectType: string,
      filter?: unknown,
      limit?: number,
    ): Promise<Record<string, unknown>[]> {
      const obj = deps.schema.objectTypes.find(o => o.name === objectType);
      if (!obj) {
        throw new Error(`Unknown object type "${objectType}"`);
      }

      // Same scoping the list route applies: ask OpenFGA which ids this caller
      // may see and fold that into the filter, rather than filtering after the
      // fact. resolveAllowedIds returns the ['*'] sentinel for the dev stub,
      // which buildAuthFilter turns into a pass-through — reimplementing either
      // is how a subtle authorization hole gets written.
      const allowedIds = await resolveAllowedIds(
        deps,
        ctx.user.id,
        toSnakeCase(objectType),
        ctx.user.tenantId,
      );
      // Predicate leakage: a caller who cannot see a field must not be able to
      // filter on it either, or the rows that come back reveal which objects
      // carry the value without the field ever being returned. The list route
      // refuses this (SEC-14); a function query that did not would be the way
      // around it.
      const violations = validateQueryFields(
        extractFilterFields(filter as FilterExpression | undefined),
        [],
        deps.authorizationService.getVisibleFields(ctx.user.id, ctx.user.roles, objectType),
      );
      if (violations.length > 0) {
        throw new Error(`Cannot filter on redacted field(s): ${violations.join(', ')}`);
      }

      if (allowedIds.length === 0) return [];

      const page = await deps.objectManager.query(
        objectType,
        buildAuthFilter(allowedIds, filter as FilterExpression | undefined),
        { limit: Math.min(limit ?? FUNCTION_QUERY_LIMIT, FUNCTION_QUERY_LIMIT) },
        ctx.requestContext,
      );

      const rows = page.items.map(o => objectToGraphQL(o, obj));
      const redacted = deps.authorizationService.redactFieldsBatch(
        ctx.user.id,
        ctx.user.roles,
        objectType,
        rows,
      );
      const visible = redacted.map(r => {
        const row = r.data as Record<string, unknown>;
        row['_redactedFields'] = r._redactedFields.length > 0 ? r._redactedFields : null;
        return row;
      });

      if (!deps.consentService || !isConsentSubjectType(objectType, deps.consentSubjectTypes)) {
        return visible;
      }
      // Consent-restricted rows are dropped rather than blanked, for the same
      // reason getObject refuses them: a function counting or averaging over
      // blanked rows produces a confidently wrong number.
      const kept: Record<string, unknown>[] = [];
      for (const row of visible) {
        const decision = await deps.consentService.checkSingleObject(
          row,
          String(row['_id'] ?? ''),
          DEFAULT_CONSENT_PURPOSE as DataPurpose,
          ctx.user.id,
          ctx.requestContext.tenantId,
        );
        if (!decision._consentRestricted) kept.push(row);
      }
      return kept;
    },

    async applyAction(actionName: string, params: Record<string, unknown>): Promise<unknown> {
      if (!deps.actionExecutor || !deps.manifestRegistry) {
        throw new Error('This deployment has no action pipeline configured, so functions cannot change the ontology');
      }
      const manifest = deps.manifestRegistry.get(actionName);
      if (!manifest) {
        throw new Error(`Unknown action "${actionName}"`);
      }

      const actor: ActionActor = { id: ctx.user.id, type: 'user', roles: ctx.user.roles };

      // Same consent-subject derivation the REST action route performs: an
      // @param typed as a consent-subject type becomes the subject. Omitting it
      // here would make invoking an action from a function a way to skip the
      // consent stage that invoking it over HTTP applies.
      const action = deps.schema.actionTypes.find(a => a.name === actionName);
      const subjectTypes = deps.consentSubjectTypes ?? DEFAULT_CONSENT_SUBJECT_TYPES;
      const subjectParam = action?.fields.find(
        f => f.directives.some(d => d.kind === 'param') && subjectTypes.includes(f.type.name),
      );
      const consentSubjectId = subjectParam ? String(params[subjectParam.name] ?? '') : undefined;

      const actionCtx: ActionContext = {
        requestContext: ctx.requestContext,
        ...(consentSubjectId
          ? { consentPurpose: DEFAULT_CONSENT_PURPOSE as DataPurpose, consentSubjectId }
          : {}),
      };

      const result = await deps.actionExecutor.execute(manifest, params, actor, actionCtx, deps.schema);
      if (!result.success) {
        // Surfaced as a throw so pack code cannot mistake a refused action for
        // an applied one by forgetting to inspect the result.
        const reason = result.errors.map(e => e.message).join('; ') || 'action was refused';
        throw new Error(`Action "${actionName}" failed: ${reason}`);
      }
      return {
        success: result.success,
        actionId: result.actionId,
        affectedObjects: result.affectedObjects,
      };
    },
  };
}

/**
 * Authorize, execute, and audit one function invocation.
 *
 * Throws AltiusError; each transport maps that to its own wire format.
 */
export async function invokeFunction(
  fn: FunctionType,
  deps: ApiDependencies,
  ctx: ResolverContext,
  input: Record<string, unknown>,
): Promise<FunctionInvocationResult> {
  if (!deps.functionExecutor) {
    throw createAltiusError({
      code: 'FUNCTION_EXECUTOR_NOT_CONFIGURED',
      category: 'system',
      message: `Function "${fn.name}" cannot be executed: no function executor is configured`,
      retryable: false,
      traceId: ctx.requestContext.traceId,
    });
  }

  // Authorize before executing. A function runs pack-authored code inside the
  // platform; until this check existed, any authenticated caller could invoke
  // any declared function, which made every other control on the action
  // pipeline (ReBAC, consent, preconditions) bypassable by shipping the same
  // logic as a function instead.
  //
  // Roles, not a ReBAC relation: the inputs are scalars, so there is no object
  // for OpenFGA to resolve a relation against.
  //
  // A function declaring no roles is denied rather than allowed — the
  // permissive reading is exactly the behaviour being fixed.
  const allowed = fn.requiredRoles.some(role => ctx.user.roles.includes(role));
  if (!allowed) {
    const reason = fn.requiredRoles.length === 0
      ? `Function "${fn.name}" declares no requiredRoles, so it cannot be invoked. Add requiredRoles to its @function directive.`
      : `Function "${fn.name}" requires one of: ${fn.requiredRoles.join(', ')}`;
    // A refused invocation is the record compliance reads — audit before
    // throwing, exactly as the action pipeline audits its denials.
    await audit(fn, deps, ctx, 'denied', reason);
    throw createAltiusError({
      code: 'FORBIDDEN',
      category: 'authorization',
      message: reason,
      retryable: false,
      traceId: ctx.requestContext.traceId,
    });
  }

  let result: Awaited<ReturnType<NonNullable<ApiDependencies['functionExecutor']>['execute']>>;
  try {
    result = await deps.functionExecutor.execute(fn.name, input, {
      ontology: ontologyReaderFor(deps, ctx),
    });
  } catch (err) {
    await audit(fn, deps, ctx, 'error');
    throw err;
  }
  await audit(fn, deps, ctx, 'success');

  return {
    result: result.result,
    logs: result.logs.length > 0 ? result.logs : null,
    durationMs: result.durationMs,
  };
}
