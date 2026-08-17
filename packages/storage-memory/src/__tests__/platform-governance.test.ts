/**
 * Tests for approval workflows, cross-app commands, and kiosk mode.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryApprovalWorkflowService,
  InMemoryCommandService,
  InMemoryKioskService,
} from '../in-memory-platform-governance.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Approval workflows
// ===========================================================================

describe('InMemoryApprovalWorkflowService', () => {
  let service: InMemoryApprovalWorkflowService;

  beforeEach(() => {
    service = new InMemoryApprovalWorkflowService();
  });

  it('creates a workflow', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'data-export-approval',
      description: 'Approve data exports',
      actionType: 'exportData',
      criteria: [{
        id: 'c1', name: 'manager-only',
        description: 'Only managers can submit',
        actionType: 'exportData',
        userAttributes: [{ attribute: 'role', operator: 'eq', value: 'manager' }],
        resourceAttributes: [],
        environmentAttributes: [],
        matchMode: 'all',
        requiresSecondReviewer: false,
      }],
      approverAttributes: [{ attribute: 'role', operator: 'eq', value: 'admin' }],
      multiStep: false,
      enabled: true,
    });
    expect(wf.id).toBeTruthy();
    expect(wf.criteria).toHaveLength(1);
  });

  it('lists workflows by action type', async () => {
    await service.createWorkflow(CTX, { name: 'wf1', description: '', actionType: 'A', criteria: [], approverAttributes: [], multiStep: false, enabled: true });
    await service.createWorkflow(CTX, { name: 'wf2', description: '', actionType: 'B', criteria: [], approverAttributes: [], multiStep: false, enabled: true });
    const all = await service.listWorkflows(CTX);
    expect(all).toHaveLength(2);
    const aOnly = await service.listWorkflows(CTX, 'A');
    expect(aOnly).toHaveLength(1);
  });

  it('submits and evaluates ABAC criteria (pass)', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [{
        id: 'c1', name: 'role-check', description: '', actionType: 'A',
        userAttributes: [{ attribute: 'role', operator: 'eq', value: 'manager' }],
        resourceAttributes: [], environmentAttributes: [],
        matchMode: 'all', requiresSecondReviewer: false,
      }],
      approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: { file: 'data.csv' },
      submitterAttributes: { role: 'manager' },
      resourceAttributes: {},
      riskLevel: 'medium',
    });
    expect(sub.state).toBe('pending');
    expect(sub.criteriaPassed).toBe(true);
  });

  it('submits and evaluates ABAC criteria (fail)', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [{
        id: 'c1', name: 'role-check', description: '', actionType: 'A',
        userAttributes: [{ attribute: 'role', operator: 'eq', value: 'manager' }],
        resourceAttributes: [], environmentAttributes: [],
        matchMode: 'all', requiresSecondReviewer: false,
      }],
      approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: {},
      submitterAttributes: { role: 'viewer' },
      resourceAttributes: {},
      riskLevel: 'low',
    });
    expect(sub.criteriaPassed).toBe(false);
  });

  it('approves a submission', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [], approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low',
    });
    const approved = await service.approve(CTX, sub.id, 'Approved');
    expect(approved.state).toBe('approved');
    expect(approved.decidedBy).toBe('u1');
  });

  it('rejects a submission', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [], approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low',
    });
    const rejected = await service.reject(CTX, sub.id, 'Rejected');
    expect(rejected.state).toBe('rejected');
  });

  it('withdraws a submission', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [], approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low',
    });
    const withdrawn = await service.withdraw(CTX, sub.id);
    expect(withdrawn.state).toBe('withdrawn');
  });

  it('prevents deciding a non-pending submission', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [], approverAttributes: [], multiStep: false, enabled: true,
    });
    const sub = await service.submit(CTX, wf.id, {
      parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low',
    });
    await service.approve(CTX, sub.id);
    await expect(service.reject(CTX, sub.id, 'too late')).rejects.toThrow('Cannot reject');
  });

  it('lists submissions by state', async () => {
    const wf = await service.createWorkflow(CTX, {
      name: 'test', description: '', actionType: 'A',
      criteria: [], approverAttributes: [], multiStep: false, enabled: true,
    });
    const s1 = await service.submit(CTX, wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
    await service.submit(CTX, wf.id, { parameters: {}, submitterAttributes: {}, resourceAttributes: {}, riskLevel: 'low' });
    await service.approve(CTX, s1.id);
    const pending = await service.listSubmissions(CTX, 'pending');
    expect(pending).toHaveLength(1);
    const approved = await service.listSubmissions(CTX, 'approved');
    expect(approved).toHaveLength(1);
  });

  it('isolates tenants', async () => {
    await service.createWorkflow(CTX, { name: 't1', description: '', actionType: 'A', criteria: [], approverAttributes: [], multiStep: false, enabled: true });
    const t2 = await service.listWorkflows({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});

// ===========================================================================
// Cross-application commands
// ===========================================================================

describe('InMemoryCommandService', () => {
  let service: InMemoryCommandService;

  beforeEach(() => {
    service = new InMemoryCommandService();
  });

  it('registers a command', async () => {
    const cmd = await service.registerCommand(CTX, {
      name: 'open-patient',
      label: 'Open Patient',
      description: 'Navigate to a patient record',
      sourceApp: 'clinical-workshop',
      inputSchema: { type: 'object', properties: { patientId: { type: 'string' } } },
      outputSchema: { type: 'object' },
      availableAsTool: true,
      chainable: true,
      enabled: true,
    });
    expect(cmd.id).toBeTruthy();
  });

  it('lists commands by source app', async () => {
    await service.registerCommand(CTX, { name: 'c1', label: 'C1', description: '', sourceApp: 'app1', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: false, enabled: true });
    await service.registerCommand(CTX, { name: 'c2', label: 'C2', description: '', sourceApp: 'app2', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: false, enabled: true });
    const all = await service.listCommands(CTX);
    expect(all).toHaveLength(2);
    const app1 = await service.listCommands(CTX, 'app1');
    expect(app1).toHaveLength(1);
  });

  it('creates and executes a command chain', async () => {
    const cmd1 = await service.registerCommand(CTX, { name: 'step1', label: 'S1', description: '', sourceApp: 'app', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: true, enabled: true });
    const cmd2 = await service.registerCommand(CTX, { name: 'step2', label: 'S2', description: '', sourceApp: 'app', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: true, enabled: true });
    const chain = await service.createChain(CTX, {
      name: 'pipeline', description: '', enabled: true,
      steps: [
        { commandId: cmd1.id, inputMapping: {} },
        { commandId: cmd2.id, inputMapping: { input: 'output' } },
      ],
    });
    const executor = async (cmdId: string, inputs: Record<string, unknown>) => {
      void cmdId; void inputs;
      return { output: 'result' };
    };
    const result = await service.executeChain(CTX, chain.id, {}, executor);
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(2);
  });

  it('handles chain execution failure', async () => {
    const cmd1 = await service.registerCommand(CTX, { name: 'step1', label: 'S1', description: '', sourceApp: 'app', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: true, enabled: true });
    const chain = await service.createChain(CTX, {
      name: 'fail-chain', description: '', enabled: true,
      steps: [{ commandId: cmd1.id, inputMapping: {} }],
    });
    const executor = async () => { throw new Error('Command failed'); };
    const result = await service.executeChain(CTX, chain.id, {}, executor);
    expect(result.success).toBe(false);
    expect(result.stepResults[0]!.errorMessage).toBe('Command failed');
  });

  it('deletes a command and chain', async () => {
    const cmd = await service.registerCommand(CTX, { name: 'c', label: 'C', description: '', sourceApp: 'a', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: false, enabled: true });
    await service.deleteCommand(CTX, cmd.id);
    const fetched = await service.getCommand(CTX, cmd.id);
    expect(fetched).toBeNull();
  });

  it('isolates tenants', async () => {
    await service.registerCommand(CTX, { name: 'c', label: 'C', description: '', sourceApp: 'a', inputSchema: {}, outputSchema: {}, availableAsTool: false, chainable: false, enabled: true });
    const t2 = await service.listCommands({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});

// ===========================================================================
// Kiosk mode
// ===========================================================================

describe('InMemoryKioskService', () => {
  let service: InMemoryKioskService;

  beforeEach(() => {
    service = new InMemoryKioskService();
  });

  it('creates a kiosk session', async () => {
    const session = await service.createSession(CTX, {
      name: 'Lobby Display',
      location: 'lobby-1',
      kioskUserId: 'kiosk-user-1',
      permissions: { objectTypes: ['Patient'], readOnly: true },
      durationSeconds: 3600,
    });
    expect(session.id).toBeTruthy();
    expect(session.state).toBe('active');
    expect(session.adminAllowlisted).toBe(true);
    expect(session.launchHistory).toHaveLength(1);
  });

  it('gets a session by ID', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'loc', kioskUserId: 'u',
      permissions: { objectTypes: [], readOnly: true },
      durationSeconds: 3600,
    });
    const fetched = await service.getSession(CTX, session.id);
    expect(fetched?.name).toBe('Test');
  });

  it('lists sessions by state', async () => {
    await service.createSession(CTX, { name: 's1', location: 'l', kioskUserId: 'u', permissions: { objectTypes: [], readOnly: true }, durationSeconds: 3600 });
    await service.createSession(CTX, { name: 's2', location: 'l', kioskUserId: 'u', permissions: { objectTypes: [], readOnly: true }, durationSeconds: 3600 });
    const active = await service.listSessions(CTX, 'active');
    expect(active).toHaveLength(2);
  });

  it('revokes a session', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: [], readOnly: true }, durationSeconds: 3600,
    });
    await service.revokeSession(CTX, session.id);
    const fetched = await service.getSession(CTX, session.id);
    expect(fetched?.state).toBe('revoked');
  });

  it('refreshes a session', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: [], readOnly: true }, durationSeconds: 3600,
    });
    const refreshed = await service.refreshSession(CTX, session.id);
    expect(refreshed.launchHistory).toHaveLength(2);
    expect(refreshed.launchHistory[1]!.action).toBe('refreshed');
  });

  it('checks access permissions', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: ['Patient', 'Order'], readOnly: true },
      durationSeconds: 3600,
    });
    const canAccessPatient = await service.canAccess(CTX, session.id, 'Patient');
    expect(canAccessPatient).toBe(true);
    const canAccessOther = await service.canAccess(CTX, session.id, 'Other');
    expect(canAccessOther).toBe(false);
  });

  it('expires stale sessions', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: [], readOnly: true }, durationSeconds: 1,
    });
    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 1100));
    const expired = await service.expireStale(CTX);
    expect(expired).toBe(1);
    const fetched = await service.getSession(CTX, session.id);
    expect(fetched?.state).toBe('expired');
  });

  it('auto-expires on get', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: [], readOnly: true }, durationSeconds: 1,
    });
    await new Promise(resolve => setTimeout(resolve, 1100));
    const fetched = await service.getSession(CTX, session.id);
    expect(fetched?.state).toBe('expired');
  });

  it('denies access for expired sessions', async () => {
    const session = await service.createSession(CTX, {
      name: 'Test', location: 'l', kioskUserId: 'u',
      permissions: { objectTypes: ['Patient'], readOnly: true }, durationSeconds: 1,
    });
    await new Promise(resolve => setTimeout(resolve, 1100));
    const canAccess = await service.canAccess(CTX, session.id, 'Patient');
    expect(canAccess).toBe(false);
  });

  it('isolates tenants', async () => {
    await service.createSession(CTX, { name: 't1', location: 'l', kioskUserId: 'u', permissions: { objectTypes: [], readOnly: true }, durationSeconds: 3600 });
    const t2 = await service.listSessions({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});
