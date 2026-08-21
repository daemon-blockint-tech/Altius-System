import { describe, it, expect, beforeEach } from 'vitest';
import { HoldApprovePolicyGuard } from '../hold-approve-policy-guard.js';
import type { AgentContext } from '../types.js';

const agentCtx: AgentContext = { agentId: 'agent-1', dryRun: false };

describe('HoldApprovePolicyGuard', () => {
  let guard: HoldApprovePolicyGuard;

  beforeEach(() => {
    guard = new HoldApprovePolicyGuard();
  });

  it('allows low-risk actions without a hold', async () => {
    const result = await guard.evaluate('ReadPatient', 'low', agentCtx);
    expect(result.allowed).toBe(true);
    expect(result.holdId).toBeUndefined();
  });

  it('holds high-risk actions for approval', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    expect(result.allowed).toBe(false);
    expect(result.holdId).toBeDefined();
    expect(result.reason).toContain('DeletePatient');
    expect(result.reason).toContain('human approval');
  });

  it('holds medium-risk actions by default', async () => {
    const result = await guard.evaluate('UpdatePatient', 'medium', agentCtx);
    expect(result.allowed).toBe(false);
    expect(result.holdId).toBeDefined();
  });

  it('auto-approves medium-risk actions when configured', async () => {
    const g = new HoldApprovePolicyGuard({ autoApproveMedium: true });
    const result = await g.evaluate('UpdatePatient', 'medium', agentCtx);
    expect(result.allowed).toBe(true);
    expect(result.holdId).toBeUndefined();
  });

  it('approves a hold and allows re-execution', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    const holdId = result.holdId!;

    expect(await guard.isApproved(holdId)).toBe(false);

    const approved = await guard.approve(holdId, 'reviewer-1');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('reviewer-1');

    expect(await guard.isApproved(holdId)).toBe(true);
  });

  it('rejects a hold', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    const holdId = result.holdId!;

    const rejected = await guard.reject(holdId, 'reviewer-1', 'Too risky');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reason).toBe('Too risky');
    expect(await guard.isApproved(holdId)).toBe(false);
  });

  it('throws when approving a non-pending hold', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    const holdId = result.holdId!;
    await guard.approve(holdId, 'reviewer-1');
    await expect(guard.approve(holdId, 'reviewer-2')).rejects.toThrow(/not pending/);
  });

  it('throws when approving a non-existent hold', async () => {
    await expect(guard.approve('nonexistent', 'reviewer-1')).rejects.toThrow(/not found/);
  });

  it('lists holds by status', async () => {
    await guard.evaluate('Action1', 'high', agentCtx);
    await guard.evaluate('Action2', 'high', agentCtx);
    const result3 = await guard.evaluate('Action3', 'high', agentCtx);
    await guard.approve(result3.holdId!, 'reviewer-1');

    const pending = await guard.listHolds('pending');
    const approved = await guard.listHolds('approved');
    expect(pending).toHaveLength(2);
    expect(approved).toHaveLength(1);
    expect(approved[0]!.actionName).toBe('Action3');
  });

  it('expires holds after the TTL', async () => {
    const g = new HoldApprovePolicyGuard({ holdTtlMs: 50 });
    const result = await g.evaluate('DeletePatient', 'high', agentCtx);
    const holdId = result.holdId!;

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 60));

    await expect(g.approve(holdId, 'reviewer-1')).rejects.toThrow(/expired/);
    expect(await g.isApproved(holdId)).toBe(false);
  });

  it('cleans up expired holds', async () => {
    const g = new HoldApprovePolicyGuard({ holdTtlMs: 50 });
    await g.evaluate('Action1', 'high', agentCtx);
    await g.evaluate('Action2', 'high', agentCtx);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const cleaned = await g.cleanupExpired();
    expect(cleaned).toBe(2);

    const expired = await g.listHolds('expired');
    expect(expired).toHaveLength(2);
  });

  it('getHold returns the hold record', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    const hold = await guard.getHold(result.holdId!);
    expect(hold).not.toBeNull();
    expect(hold!.actionName).toBe('DeletePatient');
    expect(hold!.riskLevel).toBe('high');
    expect(hold!.status).toBe('pending');
  });

  it('consume is one-shot: an approved hold authorizes exactly one execution', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    await guard.approve(result.holdId!, 'reviewer-1');
    expect(await guard.isApproved(result.holdId!)).toBe(true);

    await guard.consume(result.holdId!);
    expect(await guard.isApproved(result.holdId!)).toBe(false);
    expect((await guard.getHold(result.holdId!))!.status).toBe('consumed');
  });

  it('consume on a non-approved hold is a no-op', async () => {
    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);
    await guard.consume(result.holdId!);
    expect((await guard.getHold(result.holdId!))!.status).toBe('pending');
  });

  it('integrates with ToolRegistry executeForAgent', async () => {
    // This is verified by the existing tool-registry.test.ts policy guard
    // tests. Here we just verify the guard satisfies the PolicyGuard interface.
    const result = await guard.evaluate('AdmitPatient', 'high', agentCtx);
    expect(result.allowed).toBe(false);
    expect(result.holdId).toBeDefined();
  });
});
