/**
 * In-memory approval workflows, cross-app commands, and kiosk mode.
 */

import { randomUUID } from 'node:crypto';
import type {
  ApprovalWorkflowService,
  CommandService,
  KioskService,
  ApprovalWorkflow,
  SubmissionCriterion,
  AttributeCondition,
  ApprovalSubmission,
  AppCommand,
  CommandChain,
  CommandChainResult,
  KioskSession,
  CreateKioskInput,
  RequestContext,
} from '@altius/spi';

// ===========================================================================
// Approval workflows with ABAC
// ===========================================================================

export class InMemoryApprovalWorkflowService implements ApprovalWorkflowService {
  private readonly workflows = new Map<string, Map<string, ApprovalWorkflow>>();
  private readonly submissions = new Map<string, Map<string, ApprovalSubmission>>();

  async createWorkflow(ctx: RequestContext, input: Omit<ApprovalWorkflow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ApprovalWorkflow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const wf: ApprovalWorkflow = {
      ...input, id, tenantId: ctx.tenantId,
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getWfMap(ctx.tenantId).set(id, wf);
    return wf;
  }

  async getWorkflow(ctx: RequestContext, workflowId: string): Promise<ApprovalWorkflow | null> {
    return this.workflows.get(ctx.tenantId)?.get(workflowId) ?? null;
  }

  async listWorkflows(ctx: RequestContext, actionType?: string): Promise<ApprovalWorkflow[]> {
    const tenantWfs = this.workflows.get(ctx.tenantId);
    if (!tenantWfs) return [];
    let results = Array.from(tenantWfs.values());
    if (actionType) results = results.filter(w => w.actionType === actionType);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateWorkflow(ctx: RequestContext, workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow> {
    const wf = this.workflows.get(ctx.tenantId)?.get(workflowId);
    if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
    const updated: ApprovalWorkflow = { ...wf, ...updates, id: wf.id, tenantId: wf.tenantId, updatedAt: new Date().toISOString() };
    this.getWfMap(ctx.tenantId).set(workflowId, updated);
    return updated;
  }

  async deleteWorkflow(ctx: RequestContext, workflowId: string): Promise<void> {
    this.workflows.get(ctx.tenantId)?.delete(workflowId);
  }

  async submit(ctx: RequestContext, workflowId: string, params: {
    parameters: Record<string, unknown>;
    submitterAttributes: Record<string, unknown>;
    resourceAttributes: Record<string, unknown>;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<ApprovalSubmission> {
    const wf = this.workflows.get(ctx.tenantId)?.get(workflowId);
    if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
    if (!wf.enabled) throw new Error('Workflow is not enabled');

    const criteriaDetails = wf.criteria.map(c => {
      const passed = this.evaluateCriterion(c, params.submitterAttributes, params.resourceAttributes, params.riskLevel);
      return { criterionName: c.name, passed, reason: passed ? 'All conditions met' : 'Conditions not met' };
    });
    const criteriaPassed = wf.criteria.length === 0 || criteriaDetails.every(d => d.passed);

    const submission: ApprovalSubmission = {
      id: randomUUID(), tenantId: ctx.tenantId, workflowId,
      actionType: wf.actionType,
      parameters: params.parameters,
      submitterAttributes: params.submitterAttributes,
      resourceAttributes: params.resourceAttributes,
      riskLevel: params.riskLevel,
      state: 'pending',
      submittedAt: new Date().toISOString(),
      submittedBy: ctx.actorId ?? 'system',
      criteriaPassed,
      criteriaDetails,
    };
    this.getSubMap(ctx.tenantId).set(submission.id, submission);
    return submission;
  }

  async approve(ctx: RequestContext, submissionId: string, notes?: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'approved', notes);
  }

  async reject(ctx: RequestContext, submissionId: string, notes: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'rejected', notes);
  }

  async withdraw(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission> {
    return this.decide(ctx, submissionId, 'withdrawn');
  }

  async listSubmissions(ctx: RequestContext, state?: ApprovalSubmission['state']): Promise<ApprovalSubmission[]> {
    const tenantSubs = this.submissions.get(ctx.tenantId);
    if (!tenantSubs) return [];
    let results = Array.from(tenantSubs.values());
    if (state) results = results.filter(s => s.state === state);
    return results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async getSubmission(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission | null> {
    return this.submissions.get(ctx.tenantId)?.get(submissionId) ?? null;
  }

  private async decide(ctx: RequestContext, submissionId: string, state: ApprovalSubmission['state'], notes?: string): Promise<ApprovalSubmission> {
    const sub = this.submissions.get(ctx.tenantId)?.get(submissionId);
    if (!sub) throw new Error(`Submission not found: ${submissionId}`);
    if (sub.state !== 'pending') throw new Error(`Cannot ${state} a ${sub.state} submission`);
    const updated: ApprovalSubmission = {
      ...sub, state, decidedAt: new Date().toISOString(),
      decidedBy: ctx.actorId ?? 'system', decisionNotes: notes,
    };
    this.getSubMap(ctx.tenantId).set(submissionId, updated);
    return updated;
  }

  private evaluateCriterion(criterion: SubmissionCriterion, userAttrs: Record<string, unknown>, resourceAttrs: Record<string, unknown>, riskLevel: string): boolean {
    if (criterion.minRiskLevel && this.riskLevelValue(riskLevel) < this.riskLevelValue(criterion.minRiskLevel)) {
      return true; // Criterion doesn't apply to this risk level
    }
    const userResults = criterion.userAttributes.map(c => this.evaluateCondition(c, userAttrs));
    const resourceResults = criterion.resourceAttributes.map(c => this.evaluateCondition(c, resourceAttrs));
    const allResults = [...userResults, ...resourceResults];
    if (allResults.length === 0) return true;
    return criterion.matchMode === 'all' ? allResults.every(r => r) : allResults.some(r => r);
  }

  private evaluateCondition(cond: AttributeCondition, attrs: Record<string, unknown>): boolean {
    const val = attrs[cond.attribute];
    switch (cond.operator) {
      case 'eq': return val === cond.value;
      case 'ne': return val !== cond.value;
      case 'in': return Array.isArray(cond.values) && cond.values.includes(val);
      case 'not_in': return Array.isArray(cond.values) && !cond.values.includes(val);
      case 'gt': return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
      case 'lt': return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
      case 'gte': return typeof val === 'number' && typeof cond.value === 'number' && val >= cond.value;
      case 'lte': return typeof val === 'number' && typeof cond.value === 'number' && val <= cond.value;
      case 'exists': return val !== undefined && val !== null;
      default: return false;
    }
  }

  private riskLevelValue(level: string): number {
    return { low: 1, medium: 2, high: 3, critical: 4 }[level] ?? 0;
  }

  private getWfMap(tenantId: string): Map<string, ApprovalWorkflow> {
    let m = this.workflows.get(tenantId);
    if (!m) { m = new Map(); this.workflows.set(tenantId, m); }
    return m;
  }

  private getSubMap(tenantId: string): Map<string, ApprovalSubmission> {
    let m = this.submissions.get(tenantId);
    if (!m) { m = new Map(); this.submissions.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Cross-application commands
// ===========================================================================

export class InMemoryCommandService implements CommandService {
  private readonly commands = new Map<string, Map<string, AppCommand>>();
  private readonly chains = new Map<string, Map<string, CommandChain>>();

  async registerCommand(ctx: RequestContext, input: Omit<AppCommand, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<AppCommand> {
    const id = randomUUID();
    const cmd: AppCommand = {
      ...input, id, tenantId: ctx.tenantId,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getCmdMap(ctx.tenantId).set(id, cmd);
    return cmd;
  }

  async getCommand(ctx: RequestContext, commandId: string): Promise<AppCommand | null> {
    return this.commands.get(ctx.tenantId)?.get(commandId) ?? null;
  }

  async listCommands(ctx: RequestContext, sourceApp?: string): Promise<AppCommand[]> {
    const tenantCmds = this.commands.get(ctx.tenantId);
    if (!tenantCmds) return [];
    let results = Array.from(tenantCmds.values());
    if (sourceApp) results = results.filter(c => c.sourceApp === sourceApp);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteCommand(ctx: RequestContext, commandId: string): Promise<void> {
    this.commands.get(ctx.tenantId)?.delete(commandId);
  }

  async createChain(ctx: RequestContext, input: Omit<CommandChain, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<CommandChain> {
    const id = randomUUID();
    const chain: CommandChain = {
      ...input, id, tenantId: ctx.tenantId,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getChainMap(ctx.tenantId).set(id, chain);
    return chain;
  }

  async getChain(ctx: RequestContext, chainId: string): Promise<CommandChain | null> {
    return this.chains.get(ctx.tenantId)?.get(chainId) ?? null;
  }

  async listChains(ctx: RequestContext): Promise<CommandChain[]> {
    const tenantChains = this.chains.get(ctx.tenantId);
    if (!tenantChains) return [];
    return Array.from(tenantChains.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async executeChain(ctx: RequestContext, chainId: string, initialInputs: Record<string, unknown>, executor: (commandId: string, inputs: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<CommandChainResult> {
    const chain = this.chains.get(ctx.tenantId)?.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);
    if (!chain.enabled) throw new Error('Chain is not enabled');

    const start = Date.now();
    const stepResults: CommandChainResult['stepResults'] = [];
    let currentOutputs: Record<string, unknown> = initialInputs;

    for (const step of chain.steps) {
      try {
        const stepInputs: Record<string, unknown> = { ...step.staticInputs };
        for (const [inputKey, sourceKey] of Object.entries(step.inputMapping)) {
          stepInputs[inputKey] = currentOutputs[sourceKey] ?? initialInputs[sourceKey];
        }
        const output = await executor(step.commandId, stepInputs);
        currentOutputs = { ...currentOutputs, ...output };
        stepResults.push({ commandId: step.commandId, success: true, output });
      } catch (err) {
        stepResults.push({
          commandId: step.commandId, success: false,
          errorMessage: err instanceof Error ? err.message : 'Failed',
        });
        break;
      }
    }

    return {
      chainId, success: stepResults.every(r => r.success),
      stepResults,
      finalOutput: stepResults.every(r => r.success) ? currentOutputs : undefined,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  async deleteChain(ctx: RequestContext, chainId: string): Promise<void> {
    this.chains.get(ctx.tenantId)?.delete(chainId);
  }

  private getCmdMap(tenantId: string): Map<string, AppCommand> {
    let m = this.commands.get(tenantId);
    if (!m) { m = new Map(); this.commands.set(tenantId, m); }
    return m;
  }

  private getChainMap(tenantId: string): Map<string, CommandChain> {
    let m = this.chains.get(tenantId);
    if (!m) { m = new Map(); this.chains.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Kiosk mode
// ===========================================================================

export class InMemoryKioskService implements KioskService {
  private readonly sessions = new Map<string, Map<string, KioskSession>>();

  async createSession(ctx: RequestContext, input: CreateKioskInput): Promise<KioskSession> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.durationSeconds * 1000);
    const session: KioskSession = {
      id, tenantId: ctx.tenantId,
      name: input.name, location: input.location,
      kioskUserId: input.kioskUserId,
      permissions: input.permissions,
      state: 'active',
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: now.toISOString(),
      adminAllowlisted: true,
      launchHistory: [{ timestamp: now.toISOString(), action: 'started' }],
      allowedOrigins: input.allowedOrigins,
    };
    this.getMap(ctx.tenantId).set(id, session);
    return session;
  }

  async getSession(ctx: RequestContext, sessionId: string): Promise<KioskSession | null> {
    const session = this.sessions.get(ctx.tenantId)?.get(sessionId);
    if (!session) return null;
    // Auto-expire if past expiry time
    if (session.state === 'active' && new Date(session.expiresAt) < new Date()) {
      const expired: KioskSession = {
        ...session, state: 'expired',
        lastActivityAt: new Date().toISOString(),
        launchHistory: [...session.launchHistory, { timestamp: new Date().toISOString(), action: 'expired' }],
      };
      this.getMap(ctx.tenantId).set(sessionId, expired);
      return expired;
    }
    return session;
  }

  async listSessions(ctx: RequestContext, state?: KioskSession['state']): Promise<KioskSession[]> {
    const tenantSessions = this.sessions.get(ctx.tenantId);
    if (!tenantSessions) return [];
    let results = Array.from(tenantSessions.values());
    if (state) results = results.filter(s => s.state === state);
    return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async revokeSession(ctx: RequestContext, sessionId: string): Promise<void> {
    const session = this.sessions.get(ctx.tenantId)?.get(sessionId);
    if (session) {
      this.getMap(ctx.tenantId).set(sessionId, {
        ...session, state: 'revoked',
        lastActivityAt: new Date().toISOString(),
        launchHistory: [...session.launchHistory, { timestamp: new Date().toISOString(), action: 'revoked' }],
      });
    }
  }

  async refreshSession(ctx: RequestContext, sessionId: string): Promise<KioskSession> {
    const session = this.sessions.get(ctx.tenantId)?.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.state !== 'active') throw new Error(`Cannot refresh ${session.state} session`);
    const refreshed: KioskSession = {
      ...session,
      lastActivityAt: new Date().toISOString(),
      launchHistory: [...session.launchHistory, { timestamp: new Date().toISOString(), action: 'refreshed' }],
    };
    this.getMap(ctx.tenantId).set(sessionId, refreshed);
    return refreshed;
  }

  async canAccess(ctx: RequestContext, sessionId: string, objectType: string): Promise<boolean> {
    const session = await this.getSession(ctx, sessionId);
    if (!session || session.state !== 'active') return false;
    return session.permissions.objectTypes.includes(objectType);
  }

  async expireStale(ctx: RequestContext): Promise<number> {
    const tenantSessions = this.sessions.get(ctx.tenantId);
    if (!tenantSessions) return 0;
    let count = 0;
    const now = new Date();
    for (const [id, session] of tenantSessions) {
      if (session.state === 'active' && new Date(session.expiresAt) < now) {
        tenantSessions.set(id, {
          ...session, state: 'expired',
          lastActivityAt: now.toISOString(),
          launchHistory: [...session.launchHistory, { timestamp: now.toISOString(), action: 'expired' }],
        });
        count++;
      }
    }
    return count;
  }

  private getMap(tenantId: string): Map<string, KioskSession> {
    let m = this.sessions.get(tenantId);
    if (!m) { m = new Map(); this.sessions.set(tenantId, m); }
    return m;
  }
}
