/**
 * In-memory AI FDE agentic platform assistant service.
 */

import { randomUUID } from 'node:crypto';
import type {
  PlatformAssistantService,
  AgentMode,
  AgentPlan,
  PlanStep,
  PlanStepResult,
  PlanExecutionResult,
  AgentSession,
  AgentMessage,
  AgentTool,
  ClarificationQuestion,
  StartSessionInput,
  SendMessageInput,
  RequestContext,
} from '@altius/spi';

export class InMemoryPlatformAssistantService implements PlatformAssistantService {
  private readonly sessions = new Map<string, Map<string, AgentSession>>();
  private readonly plans = new Map<string, Map<string, AgentPlan>>();
  private readonly executionResults = new Map<string, Map<string, PlanExecutionResult>>();
  private readonly tools = new Map<string, Map<string, AgentTool>>();

  async startSession(ctx: RequestContext, input: StartSessionInput): Promise<AgentSession> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const session: AgentSession = {
      id, tenantId: ctx.tenantId,
      mode: input.mode,
      messages: [],
      createdAt: now, lastActivityAt: now,
      userId: ctx.actorId ?? 'system',
    };
    this.getSessionMap(ctx.tenantId).set(id, session);
    if (input.initialRequest) {
      await this.sendMessage(ctx, { sessionId: id, message: input.initialRequest });
    }
    return session;
  }

  async getSession(ctx: RequestContext, sessionId: string): Promise<AgentSession | null> {
    return this.sessions.get(ctx.tenantId)?.get(sessionId) ?? null;
  }

  async listSessions(ctx: RequestContext, userId?: string): Promise<AgentSession[]> {
    const m = this.sessions.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (userId) list = list.filter(s => s.userId === userId);
    return list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }

  async deleteSession(ctx: RequestContext, sessionId: string): Promise<void> {
    this.sessions.get(ctx.tenantId)?.delete(sessionId);
  }

  async sendMessage(ctx: RequestContext, input: SendMessageInput): Promise<AgentMessage> {
    const session = this.sessions.get(ctx.tenantId)?.get(input.sessionId);
    if (!session) throw new Error(`Session not found: ${input.sessionId}`);
    const now = new Date().toISOString();
    // Add user message
    const userMsg: AgentMessage = {
      id: randomUUID(), role: 'user', content: input.message, timestamp: now,
    };
    session.messages.push(userMsg);
    // Generate assistant response
    const plan = await this.generatePlan(ctx, session.mode, input.message);
    // If clarification answers provided, apply them
    if (input.clarificationAnswers && plan.needsClarification) {
      await this.answerClarifications(ctx, plan.id, input.clarificationAnswers);
    }
    const assistantContent = plan.needsClarification
      ? `I need clarification before proceeding. I have ${plan.clarifications.length} question(s).`
      : `I've generated a plan with ${plan.steps.length} step(s) for your request in ${session.mode} mode.`;
    const assistantMsg: AgentMessage = {
      id: randomUUID(), role: 'assistant', content: assistantContent, timestamp: new Date().toISOString(),
    };
    session.messages.push(assistantMsg);
    session.activePlanId = plan.id;
    session.lastActivityAt = new Date().toISOString();
    this.getSessionMap(ctx.tenantId).set(input.sessionId, session);
    return assistantMsg;
  }

  async generatePlan(ctx: RequestContext, mode: AgentMode, request: string): Promise<AgentPlan> {
    const id = randomUUID();
    const now = new Date().toISOString();
    // Generate steps based on mode and request keywords
    const steps = this.generateStepsForMode(mode, request);
    const clarifications = this.generateClarifications(mode, request);
    const plan: AgentPlan = {
      id, tenantId: ctx.tenantId,
      request, mode, steps,
      approved: false, executing: false, completed: false,
      createdAt: now,
      requestedBy: ctx.actorId ?? 'system',
      clarifications,
      needsClarification: clarifications.length > 0,
    };
    this.getPlanMap(ctx.tenantId).set(id, plan);
    return plan;
  }

  async getPlan(ctx: RequestContext, planId: string): Promise<AgentPlan | null> {
    return this.plans.get(ctx.tenantId)?.get(planId) ?? null;
  }

  async listPlans(ctx: RequestContext, mode?: AgentMode): Promise<AgentPlan[]> {
    const m = this.plans.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (mode) list = list.filter(p => p.mode === mode);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async approvePlan(ctx: RequestContext, planId: string): Promise<AgentPlan> {
    const plan = this.plans.get(ctx.tenantId)?.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.needsClarification) throw new Error('Plan needs clarification before approval');
    const updated = { ...plan, approved: true };
    this.getPlanMap(ctx.tenantId).set(planId, updated);
    return updated;
  }

  async rejectPlan(ctx: RequestContext, planId: string): Promise<void> {
    this.plans.get(ctx.tenantId)?.delete(planId);
  }

  async answerClarifications(ctx: RequestContext, planId: string, answers: Record<string, string>): Promise<AgentPlan> {
    const plan = this.plans.get(ctx.tenantId)?.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const updatedClarifications = plan.clarifications.map(q => ({
      ...q,
      answer: answers[q.id] ?? q.answer,
    }));
    const allAnswered = updatedClarifications.every(q => q.answer !== undefined);
    const updated: AgentPlan = {
      ...plan,
      clarifications: updatedClarifications,
      needsClarification: !allAnswered,
    };
    this.getPlanMap(ctx.tenantId).set(planId, updated);
    return updated;
  }

  async executePlan(ctx: RequestContext, planId: string): Promise<PlanExecutionResult> {
    const plan = this.plans.get(ctx.tenantId)?.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (!plan.approved) throw new Error('Plan must be approved before execution');
    const startTime = Date.now();
    const stepResults: PlanStepResult[] = [];
    for (const step of plan.steps) {
      const stepStart = Date.now();
      let success = true;
      let output: unknown = null;
      let error: string | undefined;
      try {
        // Find a registered tool for this action
        const tool = this.tools.get(ctx.tenantId)?.get(step.action);
        if (tool) {
          output = await tool.execute(step.params, ctx);
        } else {
          // No tool registered — simulate success
          output = { simulated: true, action: step.action };
        }
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : 'Execution failed';
      }
      stepResults.push({
        stepId: step.id,
        success,
        output,
        error,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - stepStart,
      });
      if (!success && step.riskLevel === 'high') break;
    }
    const result: PlanExecutionResult = {
      planId,
      success: stepResults.every(r => r.success),
      stepResults,
      completedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startTime,
    };
    this.getResultMap(ctx.tenantId).set(planId, result);
    // Mark plan as completed
    const updated = { ...plan, executing: false, completed: true };
    this.getPlanMap(ctx.tenantId).set(planId, updated);
    return result;
  }

  async getExecutionResult(ctx: RequestContext, planId: string): Promise<PlanExecutionResult | null> {
    return this.executionResults.get(ctx.tenantId)?.get(planId) ?? null;
  }

  async registerTool(ctx: RequestContext, tool: AgentTool): Promise<void> {
    this.getToolMap(ctx.tenantId).set(tool.name, tool);
  }

  async listTools(ctx: RequestContext, mode: AgentMode): Promise<Array<Omit<AgentTool, 'execute'>>> {
    const m = this.tools.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(t => t.modes.includes(mode) || t.modes.includes('general')).map(t => {
      const { execute, ...rest } = t;
      void execute;
      return rest;
    });
  }

  private generateStepsForMode(mode: AgentMode, request: string): PlanStep[] {
    const steps: PlanStep[] = [];
    const lowerRequest = request.toLowerCase();
    switch (mode) {
      case 'data_integration':
        steps.push({ id: randomUUID(), description: 'Analyze source system', action: 'analyze_source', params: { request }, dependsOn: [], expectedOutcome: 'Source system identified', reversible: true, riskLevel: 'low' });
        if (lowerRequest.includes('connector') || lowerRequest.includes('connect')) {
          steps.push({ id: randomUUID(), description: 'Configure connector', action: 'configure_connector', params: { request }, dependsOn: [steps[0]!.id], expectedOutcome: 'Connector configured', reversible: true, riskLevel: 'medium' });
        }
        if (lowerRequest.includes('mapping') || lowerRequest.includes('map')) {
          steps.push({ id: randomUUID(), description: 'Create field mapping', action: 'create_mapping', params: { request }, dependsOn: steps.length > 1 ? [steps[1]!.id] : [steps[0]!.id], expectedOutcome: 'Mapping created', reversible: true, riskLevel: 'low' });
        }
        steps.push({ id: randomUUID(), description: 'Start sync pipeline', action: 'start_sync', params: {}, dependsOn: [steps.at(-1)!.id], expectedOutcome: 'Sync running', reversible: true, riskLevel: 'medium' });
        break;
      case 'ontology_editing':
        steps.push({ id: randomUUID(), description: 'Review current schema', action: 'review_schema', params: {}, dependsOn: [], expectedOutcome: 'Schema reviewed', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Propose schema changes', action: 'propose_schema_changes', params: { request }, dependsOn: [steps[0]!.id], expectedOutcome: 'Changes proposed', reversible: true, riskLevel: 'medium' });
        steps.push({ id: randomUUID(), description: 'Apply schema changes', action: 'apply_schema_changes', params: {}, dependsOn: [steps[1]!.id], expectedOutcome: 'Schema updated', reversible: false, riskLevel: 'high' });
        break;
      case 'governance_audit':
        steps.push({ id: randomUUID(), description: 'Collect permission data', action: 'collect_permissions', params: {}, dependsOn: [], expectedOutcome: 'Permissions collected', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Analyze access patterns', action: 'analyze_access', params: {}, dependsOn: [steps[0]!.id], expectedOutcome: 'Analysis complete', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Generate audit report', action: 'generate_audit_report', params: {}, dependsOn: [steps[1]!.id], expectedOutcome: 'Report generated', reversible: true, riskLevel: 'low' });
        break;
      case 'ml':
        steps.push({ id: randomUUID(), description: 'Select model', action: 'select_model', params: { request }, dependsOn: [], expectedOutcome: 'Model selected', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Configure training', action: 'configure_training', params: {}, dependsOn: [steps[0]!.id], expectedOutcome: 'Training configured', reversible: true, riskLevel: 'medium' });
        steps.push({ id: randomUUID(), description: 'Run training', action: 'run_training', params: {}, dependsOn: [steps[1]!.id], expectedOutcome: 'Model trained', reversible: false, riskLevel: 'high' });
        break;
      case 'functions':
        steps.push({ id: randomUUID(), description: 'Draft function code', action: 'draft_function', params: { request }, dependsOn: [], expectedOutcome: 'Code drafted', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Deploy function', action: 'deploy_function', params: {}, dependsOn: [steps[0]!.id], expectedOutcome: 'Function deployed', reversible: true, riskLevel: 'medium' });
        break;
      case 'osdk_react':
        steps.push({ id: randomUUID(), description: 'Generate SDK types', action: 'generate_sdk', params: {}, dependsOn: [], expectedOutcome: 'SDK generated', reversible: true, riskLevel: 'low' });
        steps.push({ id: randomUUID(), description: 'Generate React components', action: 'generate_react', params: { request }, dependsOn: [steps[0]!.id], expectedOutcome: 'Components generated', reversible: true, riskLevel: 'low' });
        break;
      default:
        steps.push({ id: randomUUID(), description: 'Analyze request', action: 'analyze_request', params: { request }, dependsOn: [], expectedOutcome: 'Request analyzed', reversible: true, riskLevel: 'low' });
    }
    return steps;
  }

  private generateClarifications(mode: AgentMode, request: string): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    const lower = request.toLowerCase();
    // Vague requests need clarification
    if (mode === 'data_integration' && !lower.includes('connector') && !lower.includes('source') && !lower.includes('system')) {
      questions.push({ id: randomUUID(), question: 'Which source system do you want to connect to?', suggestions: ['Dynamics 365', 'Salesforce', 'Workday', 'Snowflake', 'SAP'], required: true });
    }
    if (mode === 'ontology_editing' && !lower.includes('type') && !lower.includes('property') && !lower.includes('link')) {
      questions.push({ id: randomUUID(), question: 'What schema changes do you want to make?', suggestions: ['Add object type', 'Add property', 'Add link type', 'Modify existing type'], required: true });
    }
    if (mode === 'ml' && !lower.includes('model') && !lower.includes('train')) {
      questions.push({ id: randomUUID(), question: 'What ML task do you want to perform?', suggestions: ['Train new model', 'Evaluate existing model', 'Deploy model', 'Run inference'], required: true });
    }
    return questions;
  }

  private getSessionMap(tenantId: string): Map<string, AgentSession> {
    let m = this.sessions.get(tenantId);
    if (!m) { m = new Map(); this.sessions.set(tenantId, m); }
    return m;
  }
  private getPlanMap(tenantId: string): Map<string, AgentPlan> {
    let m = this.plans.get(tenantId);
    if (!m) { m = new Map(); this.plans.set(tenantId, m); }
    return m;
  }
  private getResultMap(tenantId: string): Map<string, PlanExecutionResult> {
    let m = this.executionResults.get(tenantId);
    if (!m) { m = new Map(); this.executionResults.set(tenantId, m); }
    return m;
  }
  private getToolMap(tenantId: string): Map<string, AgentTool> {
    let m = this.tools.get(tenantId);
    if (!m) { m = new Map(); this.tools.set(tenantId, m); }
    return m;
  }
}
