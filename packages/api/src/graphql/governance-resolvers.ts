/**
 * Resolvers for platform governance GraphQL types (scoped sessions, agent holds).
 *
 * Authorization: role-gated, tenant-scoped from the caller's token.
 * Fail closed: empty roles = nobody.
 */
import type { ApiDependencies, ResolverContext } from './types.js';
import type { ScopedSession } from '@altius/spi';

/** Check the caller holds one of the required roles. Returns null if allowed, error message if not. */
function gateRoles(roles: readonly string[] | undefined, defaults: readonly string[], ctx: ResolverContext): string | null {
  const required = roles ?? defaults;
  if (required.length === 0) return 'Access denied: no roles configured for this operation.';
  const held = ctx.user.roles;
  if (!required.some((r) => held.includes(r))) {
    return `Access denied: requires one of: ${required.join(', ')}`;
  }
  return null;
}

function sessionToGraphql(s: ScopedSession) {
  return {
    id: s.id,
    userId: s.userId,
    allowedMarkings: s.allowedMarkings,
    excludedMarkings: s.excludedMarkings,
    label: s.label,
    revoked: s.revoked,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  };
}

function holdToGraphql(h: {
  id: string;
  actionName: string;
  riskLevel: string;
  status: string;
  agentContext: { agentId: string; tenantId?: string };
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}) {
  return {
    id: h.id,
    actionName: h.actionName,
    riskLevel: h.riskLevel,
    status: h.status,
    agentId: h.agentContext.agentId,
    tenantId: h.agentContext.tenantId,
    createdAt: h.createdAt,
    expiresAt: h.expiresAt,
    decidedAt: h.decidedAt,
    decidedBy: h.decidedBy,
    reason: h.reason,
  };
}

interface GovernanceResolvers {
  Query: Record<string, unknown>;
  Mutation: Record<string, unknown>;
}

export function generateGovernanceResolvers(deps: ApiDependencies): GovernanceResolvers {
  const resolvers: GovernanceResolvers = { Query: {}, Mutation: {} };

  // ── ScopedSession ──────────────────────────────────────────────────────

  resolvers.Query['myScopedSessions'] = async (_: unknown, __: Record<string, unknown>, ctx: ResolverContext) => {
    if (!deps.scopedSessionStore) return [];
    const session = await deps.scopedSessionStore.getActiveForUser(
      ctx.requestContext.tenantId,
      ctx.user.id,
    );
    return session ? [sessionToGraphql(session)] : [];
  };

  resolvers.Mutation['createScopedSession'] = async (
    _: unknown,
    args: { userId: string; allowedMarkings: string[]; excludedMarkings?: string[]; label?: string; durationSeconds: number },
    ctx: ResolverContext,
  ) => {
    if (!deps.scopedSessionStore) throw new Error('Scoped sessions are not configured.');
    const denied = gateRoles(deps.scopedSessionAdminRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    const session = await deps.scopedSessionStore.create(
      ctx.requestContext.tenantId,
      ctx.user.id,
      {
        userId: args.userId,
        allowedMarkings: args.allowedMarkings,
        excludedMarkings: args.excludedMarkings ?? [],
        label: args.label ?? '',
        durationSeconds: args.durationSeconds,
      },
    );
    return sessionToGraphql(session);
  };

  resolvers.Mutation['revokeScopedSession'] = async (
    _: unknown,
    args: { id: string },
    ctx: ResolverContext,
  ) => {
    if (!deps.scopedSessionStore) throw new Error('Scoped sessions are not configured.');
    const denied = gateRoles(deps.scopedSessionAdminRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    await deps.scopedSessionStore.revoke(
      ctx.requestContext.tenantId,
      args.id,
    );
    // Return a minimal shape — the store's revoke is void, so we return
    // the ID and a revoked=true flag. The client can re-query if it needs
    // the full record.
    return {
      id: args.id,
      userId: '',
      allowedMarkings: [],
      excludedMarkings: [],
      label: '',
      revoked: true,
      createdAt: '',
      expiresAt: '',
    };
  };

  // ── AgentHold ──────────────────────────────────────────────────────────

  resolvers.Query['agentHolds'] = async (
    _: unknown,
    args: { status?: string },
    ctx: ResolverContext,
  ) => {
    if (!deps.agentHoldGuard) return [];
    const denied = gateRoles(deps.agentHoldApproverRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    const holds = await deps.agentHoldGuard.listHolds(args.status as never);
    return holds
      .filter((h) => h.agentContext.tenantId === ctx.requestContext.tenantId)
      .map(holdToGraphql);
  };

  resolvers.Query['agentHold'] = async (
    _: unknown,
    args: { id: string },
    ctx: ResolverContext,
  ) => {
    if (!deps.agentHoldGuard) return null;
    const denied = gateRoles(deps.agentHoldApproverRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    const hold = await deps.agentHoldGuard.getHold(args.id);
    if (!hold) return null;
    if (hold.agentContext.tenantId !== ctx.requestContext.tenantId) return null;
    return holdToGraphql(hold);
  };

  resolvers.Mutation['approveAgentHold'] = async (
    _: unknown,
    args: { id: string },
    ctx: ResolverContext,
  ) => {
    if (!deps.agentHoldGuard) throw new Error('Agent holds are not configured.');
    const denied = gateRoles(deps.agentHoldApproverRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    const hold = await deps.agentHoldGuard.getHold(args.id);
    if (!hold || hold.agentContext.tenantId !== ctx.requestContext.tenantId) {
      throw new Error('Agent hold not found.');
    }
    const approved = await deps.agentHoldGuard.approve(args.id, ctx.user.id);
    return holdToGraphql(approved);
  };

  resolvers.Mutation['rejectAgentHold'] = async (
    _: unknown,
    args: { id: string; reason?: string },
    ctx: ResolverContext,
  ) => {
    if (!deps.agentHoldGuard) throw new Error('Agent holds are not configured.');
    const denied = gateRoles(deps.agentHoldApproverRoles, ['admin'], ctx);
    if (denied) throw new Error(denied);
    const hold = await deps.agentHoldGuard.getHold(args.id);
    if (!hold || hold.agentContext.tenantId !== ctx.requestContext.tenantId) {
      throw new Error('Agent hold not found.');
    }
    const rejected = await deps.agentHoldGuard.reject(args.id, ctx.user.id, args.reason);
    return holdToGraphql(rejected);
  };

  return resolvers;
}
