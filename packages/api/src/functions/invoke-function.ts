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

import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import { createAltiusError } from '../graphql/errors.js';
import { logger } from '../logger.js';

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
    result = await deps.functionExecutor.execute(fn.name, input);
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
