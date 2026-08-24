/**
 * Two-sided proof that onHoldCreated fires when a hold is created.
 *
 * The gap: reviewers had to poll GET /api/v1/agent-holds or query GraphQL
 * `agentHolds` to discover pending holds. The fix: HoldApprovePolicyGuard
 * now accepts an onHoldCreated callback, fired after the hold is persisted
 * but before evaluate() returns. The server wires this to write an audit
 * record and publish a CloudEvent.
 *
 * This test proves the callback fires for high-risk (held) actions and
 * does NOT fire for low-risk (allowed) or auto-approved medium actions.
 */
import { describe, it, expect } from 'vitest';
import { HoldApprovePolicyGuard } from '../hold-approve-policy-guard.js';
import type { AgentContext } from '../types.js';

const agentCtx: AgentContext = { agentId: 'agent-1', dryRun: false };

describe('HoldApprovePolicyGuard — onHoldCreated callback', () => {
  it('fires onHoldCreated when a high-risk action is held', async () => {
    const calls: { actionName: string; riskLevel: string; holdId: string }[] = [];
    const guard = new HoldApprovePolicyGuard({
      onHoldCreated: async (hold) => {
        calls.push({ actionName: hold.actionName, riskLevel: hold.riskLevel, holdId: hold.id });
      },
    });

    const result = await guard.evaluate('DeletePatient', 'high', agentCtx);

    expect(result.allowed).toBe(false);
    expect(result.holdId).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.actionName).toBe('DeletePatient');
    expect(calls[0]!.riskLevel).toBe('high');
    expect(calls[0]!.holdId).toBe(result.holdId);
  });

  it('fires onHoldCreated for medium-risk actions when autoApprove is off', async () => {
    const calls: string[] = [];
    const guard = new HoldApprovePolicyGuard({
      onHoldCreated: async (hold) => { calls.push(hold.id); },
    });

    await guard.evaluate('UpdatePatient', 'medium', agentCtx);

    expect(calls).toHaveLength(1);
  });

  it('does NOT fire onHoldCreated for low-risk actions', async () => {
    const calls: string[] = [];
    const guard = new HoldApprovePolicyGuard({
      onHoldCreated: async (hold) => { calls.push(hold.id); },
    });

    const result = await guard.evaluate('ReadPatient', 'low', agentCtx);

    expect(result.allowed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('does NOT fire onHoldCreated when medium is auto-approved', async () => {
    const calls: string[] = [];
    const guard = new HoldApprovePolicyGuard({
      autoApproveMedium: true,
      onHoldCreated: async (hold) => { calls.push(hold.id); },
    });

    const result = await guard.evaluate('UpdatePatient', 'medium', agentCtx);

    expect(result.allowed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('awaits an async onHoldCreated before returning', async () => {
    let resolved = false;
    const guard = new HoldApprovePolicyGuard({
      onHoldCreated: async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
      },
    });

    await guard.evaluate('DeletePatient', 'high', agentCtx);

    // If evaluate did not await, resolved would still be false here.
    expect(resolved).toBe(true);
  });

  it('passes the hold record with correct fields to the callback', async () => {
    let captured: { actionName: string; status: string; expiresAt: string } | null = null;
    const guard = new HoldApprovePolicyGuard({
      onHoldCreated: async (hold) => {
        captured = { actionName: hold.actionName, status: hold.status, expiresAt: hold.expiresAt };
      },
    });

    await guard.evaluate('DeletePatient', 'high', agentCtx);

    expect(captured).not.toBeNull();
    expect(captured!.actionName).toBe('DeletePatient');
    expect(captured!.status).toBe('pending');
    expect(captured!.expiresAt).toBeDefined();
  });
});
