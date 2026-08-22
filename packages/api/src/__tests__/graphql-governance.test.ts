/**
 * GraphQL governance surface — scoped sessions and agent holds.
 *
 * Verifies the SDL is appended and the resolvers are wired, authorized,
 * and tenant-scoped. Uses the governance resolvers directly (not Apollo)
 * so the test is deterministic and fast.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateGovernanceResolvers } from '../graphql/governance-resolvers.js';
import { GOVERNANCE_SDL } from '../graphql/governance-sdl.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { ScopedSessionStore, ScopedSession, CreateScopedSessionInput } from '@altius/spi';
import { HoldApprovePolicyGuard } from '@altius/actions';

// ── Mocks ──────────────────────────────────────────────────────────────

function mockSessionStore(): ScopedSessionStore {
  const sessions = new Map<string, ScopedSession>();
  return {
    create: vi.fn(async (tenantId: string, createdBy: string, input: CreateScopedSessionInput) => {
      const now = new Date();
      const s: ScopedSession = {
        id: `sess-${sessions.size + 1}`,
        tenantId,
        userId: input.userId,
        allowedMarkings: input.allowedMarkings,
        excludedMarkings: input.excludedMarkings ?? [],
        label: input.label,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + input.durationSeconds * 1000).toISOString(),
        revoked: false,
        createdBy,
      };
      sessions.set(s.id, s);
      return s;
    }),
    getActiveForUser: vi.fn(async (tenantId: string, userId: string) => {
      for (const s of sessions.values()) {
        if (s.tenantId === tenantId && s.userId === userId && !s.revoked && new Date(s.expiresAt) > new Date()) return s;
      }
      return null;
    }),
    revoke: vi.fn(async (tenantId: string, sessionId: string) => {
      const s = sessions.get(sessionId);
      if (s && s.tenantId === tenantId) s.revoked = true;
    }),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
  } as unknown as ScopedSessionStore;
}

function makeCtx(tenantId: string, roles: string[]): ResolverContext {
  return {
    user: { id: 'reviewer-1', tenantId, roles, markings: [] },
    requestContext: { tenantId, actorId: 'reviewer-1' },
  } as unknown as ResolverContext;
}

function makeDeps(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    scopedSessionStore: mockSessionStore(),
    agentHoldGuard: new HoldApprovePolicyGuard(),
    scopedSessionAdminRoles: ['admin'],
    agentHoldApproverRoles: ['admin'],
    ...overrides,
  } as unknown as ApiDependencies;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('GraphQL governance SDL', () => {
  it('includes ScopedSession and AgentHold types', () => {
    expect(GOVERNANCE_SDL).toContain('type ScopedSession');
    expect(GOVERNANCE_SDL).toContain('type AgentHold');
    expect(GOVERNANCE_SDL).toContain('myScopedSessions');
    expect(GOVERNANCE_SDL).toContain('agentHolds');
    expect(GOVERNANCE_SDL).toContain('createScopedSession');
    expect(GOVERNANCE_SDL).toContain('approveAgentHold');
    expect(GOVERNANCE_SDL).toContain('rejectAgentHold');
  });
});

describe('GraphQL governance resolvers — scoped sessions', () => {
  it('myScopedSessions returns the caller active session', async () => {
    const deps = makeDeps();
    const resolvers = generateGovernanceResolvers(deps);
    const adminCtx = makeCtx('t-1', ['admin']);
    const viewerCtx = makeCtx('t-1', ['viewer']);

    // Admin creates a session for the viewer
    const created = await (resolvers.Mutation['createScopedSession'] as Function)(
      {}, { userId: 'reviewer-1', allowedMarkings: ['NHS'], durationSeconds: 3600 }, adminCtx,
    );
    expect(created.userId).toBe('reviewer-1');

    // Viewer queries their own active session
    const sessions = await (resolvers.Query['myScopedSessions'] as Function)({}, {}, viewerCtx);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].allowedMarkings).toEqual(['NHS']);
  });

  it('createScopedSession denies non-admin', async () => {
    const deps = makeDeps();
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['viewer']);

    await expect(
      (resolvers.Mutation['createScopedSession'] as Function)(
        {}, { userId: 'u-1', allowedMarkings: ['NHS'], durationSeconds: 3600 }, ctx,
      ),
    ).rejects.toThrow(/Access denied/);
  });

  it('createScopedSession allows admin', async () => {
    const deps = makeDeps();
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    const session = await (resolvers.Mutation['createScopedSession'] as Function)(
      {}, { userId: 'u-1', allowedMarkings: ['NHS'], durationSeconds: 3600 }, ctx,
    );
    expect(session.userId).toBe('u-1');
    expect(session.allowedMarkings).toEqual(['NHS']);
  });

  it('createScopedSession fails closed when roles empty', async () => {
    const deps = makeDeps({ scopedSessionAdminRoles: [] });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    await expect(
      (resolvers.Mutation['createScopedSession'] as Function)(
        {}, { userId: 'u-1', allowedMarkings: ['NHS'], durationSeconds: 3600 }, ctx,
      ),
    ).rejects.toThrow(/no roles configured/);
  });
});

describe('GraphQL governance resolvers — agent holds', () => {
  it('agentHolds returns holds for the caller tenant only', async () => {
    const guard = new HoldApprovePolicyGuard();
    // Create a hold in tenant-1
    await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 't-1' });
    // Create a hold in tenant-2
    await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-2', dryRun: false, tenantId: 't-2' });

    const deps = makeDeps({ agentHoldGuard: guard });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    const holds = await (resolvers.Query['agentHolds'] as Function)({}, {}, ctx);
    expect(holds).toHaveLength(1);
    expect(holds[0].tenantId).toBe('t-1');
  });

  it('approveAgentHold approves a hold in the caller tenant', async () => {
    const guard = new HoldApprovePolicyGuard();
    const result = await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 't-1' });
    const holdId = result.holdId!;

    const deps = makeDeps({ agentHoldGuard: guard });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    const approved = await (resolvers.Mutation['approveAgentHold'] as Function)({}, { id: holdId }, ctx);
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('reviewer-1');
  });

  it('approveAgentHold hides cross-tenant holds (not found)', async () => {
    const guard = new HoldApprovePolicyGuard();
    const result = await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 't-2' });
    const holdId = result.holdId!;

    const deps = makeDeps({ agentHoldGuard: guard });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    await expect(
      (resolvers.Mutation['approveAgentHold'] as Function)({}, { id: holdId }, ctx),
    ).rejects.toThrow(/not found/);
  });

  it('approveAgentHold denies non-approver', async () => {
    const guard = new HoldApprovePolicyGuard();
    const result = await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 't-1' });
    const holdId = result.holdId!;

    const deps = makeDeps({ agentHoldGuard: guard });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['viewer']);

    await expect(
      (resolvers.Mutation['approveAgentHold'] as Function)({}, { id: holdId }, ctx),
    ).rejects.toThrow(/Access denied/);
  });

  it('rejectAgentHold records the reason', async () => {
    const guard = new HoldApprovePolicyGuard();
    const result = await guard.evaluate('DeletePatient', 'high', { agentId: 'agent-1', dryRun: false, tenantId: 't-1' });
    const holdId = result.holdId!;

    const deps = makeDeps({ agentHoldGuard: guard });
    const resolvers = generateGovernanceResolvers(deps);
    const ctx = makeCtx('t-1', ['admin']);

    const rejected = await (resolvers.Mutation['rejectAgentHold'] as Function)(
      {}, { id: holdId, reason: 'Not justified' }, ctx,
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.reason).toBe('Not justified');
  });
});
