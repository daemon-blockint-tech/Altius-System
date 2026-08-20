/**
 * In-memory data expectations, conflict resolution, and pipeline build orchestration.
 */

import { randomUUID } from 'node:crypto';
import { evaluateDataExpectation } from '@altius/spi';
import type {
  DataExpectationsService,
  DataExpectation,
  ExpectationResult,
  CreateExpectationInput,
  ConflictResolutionService,
  DataConflict,
  ConflictStrategy,
  PipelineBuildService,
  PipelineBuild,
  BuildTrigger,
  PipelineSchedule,
  CreateScheduleInput,
  RequestContext,
} from '@altius/spi';

// ===========================================================================
// Data expectations
// ===========================================================================

export class InMemoryDataExpectationsService implements DataExpectationsService {
  private readonly expectations = new Map<string, Map<string, DataExpectation>>();

  async create(ctx: RequestContext, input: CreateExpectationInput): Promise<DataExpectation> {
    const id = randomUUID();
    const exp: DataExpectation = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description,
      targetType: input.targetType, field: input.field,
      type: input.type, params: input.params,
      blocking: input.blocking ?? true,
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, exp);
    return exp;
  }

  async get(ctx: RequestContext, id: string): Promise<DataExpectation | null> {
    return this.expectations.get(ctx.tenantId)?.get(id) ?? null;
  }

  async list(ctx: RequestContext, targetType?: string): Promise<DataExpectation[]> {
    const tenantExps = this.expectations.get(ctx.tenantId);
    if (!tenantExps) return [];
    let results = Array.from(tenantExps.values());
    if (targetType) results = results.filter(e => e.targetType === targetType);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateExpectationInput>): Promise<DataExpectation> {
    const exp = this.expectations.get(ctx.tenantId)?.get(id);
    if (!exp) throw new Error(`Expectation not found: ${id}`);
    const updated: DataExpectation = {
      ...exp,
      name: updates.name ?? exp.name,
      description: updates.description ?? exp.description,
      field: updates.field ?? exp.field,
      type: updates.type ?? exp.type,
      params: updates.params ?? exp.params,
      blocking: updates.blocking ?? exp.blocking,
      enabled: updates.enabled ?? exp.enabled,
    };
    this.getMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    this.expectations.get(ctx.tenantId)?.delete(id);
  }

  async evaluate(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<ExpectationResult[]> {
    const exps = await this.list(ctx, targetType);
    const enabledExps = exps.filter(e => e.enabled);
    const results: ExpectationResult[] = [];

    for (const exp of enabledExps) {
      const result = evaluateDataExpectation(exp, data);
      results.push(result);
    }
    return results;
  }

  async gateBuild(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<{ passed: boolean; results: ExpectationResult[]; blockingFailures: ExpectationResult[] }> {
    const allExps = await this.list(ctx, targetType);
    const results = await this.evaluate(ctx, targetType, data);
    const blockingFailures = results.filter(r => {
      if (r.passed) return false;
      const exp = allExps.find(e => e.id === r.expectationId);
      return exp?.blocking ?? false;
    });
    const passed = blockingFailures.length === 0;
    return { passed, results, blockingFailures };
  }

  private getMap(tenantId: string): Map<string, DataExpectation> {
    let m = this.expectations.get(tenantId);
    if (!m) { m = new Map(); this.expectations.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Conflict resolution
// ===========================================================================

export class InMemoryConflictResolutionService implements ConflictResolutionService {
  private readonly conflicts = new Map<string, Map<string, DataConflict>>();
  private readonly defaultStrategies = new Map<string, ConflictStrategy>();

  async detect(ctx: RequestContext, conflict: Omit<DataConflict, 'id' | 'tenantId' | 'resolved' | 'detectedAt'>): Promise<DataConflict> {
    const id = randomUUID();
    const record: DataConflict = {
      ...conflict,
      id, tenantId: ctx.tenantId,
      resolved: false,
      detectedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, record);
    return record;
  }

  async get(ctx: RequestContext, conflictId: string): Promise<DataConflict | null> {
    return this.conflicts.get(ctx.tenantId)?.get(conflictId) ?? null;
  }

  async listUnresolved(ctx: RequestContext, objectType?: string): Promise<DataConflict[]> {
    const tenantConflicts = this.conflicts.get(ctx.tenantId);
    if (!tenantConflicts) return [];
    let results = Array.from(tenantConflicts.values()).filter(c => !c.resolved);
    if (objectType) results = results.filter(c => c.objectType === objectType);
    return results.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  }

  async resolve(ctx: RequestContext, conflictId: string, strategy: ConflictStrategy, manualValue?: unknown): Promise<DataConflict> {
    const conflict = this.conflicts.get(ctx.tenantId)?.get(conflictId);
    if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);
    if (conflict.resolved) throw new Error('Conflict already resolved');

    let resolvedValue: unknown;
    switch (strategy) {
      case 'user_edits_win':
        resolvedValue = conflict.userValue;
        break;
      case 'latest_value_wins':
        resolvedValue = conflict.userTimestamp > conflict.datasourceTimestamp ? conflict.userValue : conflict.datasourceValue;
        break;
      case 'merge':
        if (typeof conflict.userValue === 'object' && typeof conflict.datasourceValue === 'object' && conflict.userValue && conflict.datasourceValue) {
          resolvedValue = { ...(conflict.datasourceValue as Record<string, unknown>), ...(conflict.userValue as Record<string, unknown>) };
        } else {
          resolvedValue = conflict.userValue;
        }
        break;
      case 'manual':
        resolvedValue = manualValue;
        break;
    }

    const updated: DataConflict = {
      ...conflict,
      resolvedValue,
      resolvedBy: strategy,
      resolved: true,
      resolvedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(conflictId, updated);
    return updated;
  }

  async autoResolve(ctx: RequestContext, strategy: ConflictStrategy): Promise<{ resolved: number; conflicts: DataConflict[] }> {
    const unresolved = await this.listUnresolved(ctx);
    const resolved: DataConflict[] = [];
    for (const c of unresolved) {
      const r = await this.resolve(ctx, c.id, strategy);
      resolved.push(r);
    }
    return { resolved: resolved.length, conflicts: resolved };
  }

  async setDefaultStrategy(ctx: RequestContext, strategy: ConflictStrategy): Promise<void> {
    this.defaultStrategies.set(ctx.tenantId, strategy);
  }

  async getDefaultStrategy(ctx: RequestContext): Promise<ConflictStrategy> {
    return this.defaultStrategies.get(ctx.tenantId) ?? 'user_edits_win';
  }

  private getMap(tenantId: string): Map<string, DataConflict> {
    let m = this.conflicts.get(tenantId);
    if (!m) { m = new Map(); this.conflicts.set(tenantId, m); }
    return m;
  }
}

// ===========================================================================
// Pipeline build orchestration
// ===========================================================================

export class InMemoryPipelineBuildService implements PipelineBuildService {
  private readonly builds = new Map<string, Map<string, PipelineBuild>>();
  private readonly schedules = new Map<string, Map<string, PipelineSchedule>>();
  private readonly actionTriggers = new Map<string, Map<string, Set<string>>>();

  async startBuild(ctx: RequestContext, pipelineName: string, trigger: BuildTrigger): Promise<PipelineBuild> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const build: PipelineBuild = {
      id, tenantId: ctx.tenantId,
      pipelineName, state: 'running', trigger,
      startedAt: now, triggeredBy: ctx.actorId ?? 'system',
      retryCount: 0, maxRetries: 3,
      steps: [{ name: 'init', state: 'running' }],
      expectationGated: false,
    };
    this.getMap(ctx.tenantId).set(id, build);
    // Simulate completion
    const completed: PipelineBuild = {
      ...build,
      state: 'succeeded',
      endedAt: new Date().toISOString(),
      durationMs: 100,
      steps: [{ name: 'init', state: 'succeeded', durationMs: 50 }],
    };
    this.getMap(ctx.tenantId).set(id, completed);
    return completed;
  }

  async getBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild | null> {
    return this.builds.get(ctx.tenantId)?.get(buildId) ?? null;
  }

  async listBuilds(ctx: RequestContext, pipelineName?: string, limit = 100): Promise<PipelineBuild[]> {
    const tenantBuilds = this.builds.get(ctx.tenantId);
    if (!tenantBuilds) return [];
    let results = Array.from(tenantBuilds.values());
    if (pipelineName) results = results.filter(b => b.pipelineName === pipelineName);
    // Newest first, with insertion order breaking ties. `startedAt` alone is
    // not a total order: two builds started in the same millisecond compare
    // equal, the sort becomes a no-op for them, and the pair comes back
    // oldest-first — the opposite of what this method promises. The Postgres
    // provider orders by a sequence, so without this the two disagree.
    return results
      .map((b, i) => ({ b, i }))
      .sort((x, y) => y.b.startedAt.localeCompare(x.b.startedAt) || y.i - x.i)
      .map(e => e.b)
      .slice(0, limit);
  }

  async abortBuild(ctx: RequestContext, buildId: string): Promise<void> {
    const build = this.builds.get(ctx.tenantId)?.get(buildId);
    if (build) {
      this.getMap(ctx.tenantId).set(buildId, {
        ...build, state: 'aborted', endedAt: new Date().toISOString(),
      });
    }
  }

  async retryBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild> {
    const build = this.builds.get(ctx.tenantId)?.get(buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    if (build.retryCount >= build.maxRetries) throw new Error('Max retries exceeded');
    const retried: PipelineBuild = {
      ...build,
      retryCount: build.retryCount + 1,
      state: 'running',
      startedAt: new Date().toISOString(),
      endedAt: undefined,
      errorMessage: undefined,
    };
    this.getMap(ctx.tenantId).set(buildId, retried);
    // Simulate success
    const completed: PipelineBuild = {
      ...retried, state: 'succeeded', endedAt: new Date().toISOString(), durationMs: 100,
    };
    this.getMap(ctx.tenantId).set(buildId, completed);
    return completed;
  }

  async createSchedule(ctx: RequestContext, input: CreateScheduleInput): Promise<PipelineSchedule> {
    const id = randomUUID();
    const schedule: PipelineSchedule = {
      id, tenantId: ctx.tenantId,
      pipelineName: input.pipelineName,
      cronExpression: input.cronExpression,
      enabled: input.enabled ?? true,
      maxRetries: input.maxRetries ?? 3,
      abortOnFailure: input.abortOnFailure ?? false,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getSchedMap(ctx.tenantId).set(id, schedule);
    return schedule;
  }

  async listSchedules(ctx: RequestContext): Promise<PipelineSchedule[]> {
    const tenantSchedules = this.schedules.get(ctx.tenantId);
    if (!tenantSchedules) return [];
    // Same tie-break as listBuilds, for the same reason: `createdAt` is a
    // millisecond timestamp, and two schedules created in the same one would
    // otherwise come back oldest-first while Postgres returns them newest-first.
    return Array.from(tenantSchedules.values())
      .map((s, i) => ({ s, i }))
      .sort((x, y) => y.s.createdAt.localeCompare(x.s.createdAt) || y.i - x.i)
      .map(e => e.s);
  }

  async updateSchedule(ctx: RequestContext, scheduleId: string, updates: Partial<CreateScheduleInput>): Promise<PipelineSchedule> {
    const schedule = this.schedules.get(ctx.tenantId)?.get(scheduleId);
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`);
    const updated: PipelineSchedule = {
      ...schedule,
      pipelineName: updates.pipelineName ?? schedule.pipelineName,
      cronExpression: updates.cronExpression ?? schedule.cronExpression,
      enabled: updates.enabled ?? schedule.enabled,
      maxRetries: updates.maxRetries ?? schedule.maxRetries,
      abortOnFailure: updates.abortOnFailure ?? schedule.abortOnFailure,
    };
    this.getSchedMap(ctx.tenantId).set(scheduleId, updated);
    return updated;
  }

  async deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void> {
    this.schedules.get(ctx.tenantId)?.delete(scheduleId);
  }

  async registerActionTrigger(ctx: RequestContext, actionName: string, pipelineName: string): Promise<void> {
    let m = this.actionTriggers.get(ctx.tenantId);
    if (!m) { m = new Map(); this.actionTriggers.set(ctx.tenantId, m); }
    let set = m.get(actionName);
    if (!set) { set = new Set(); m.set(actionName, set); }
    set.add(pipelineName);
  }

  async getActionTriggers(ctx: RequestContext, actionName: string): Promise<string[]> {
    const set = this.actionTriggers.get(ctx.tenantId)?.get(actionName);
    return set ? Array.from(set) : [];
  }

  async triggerForAction(ctx: RequestContext, actionName: string): Promise<PipelineBuild[]> {
    const pipelines = await this.getActionTriggers(ctx, actionName);
    const builds: PipelineBuild[] = [];
    for (const pipelineName of pipelines) {
      const build = await this.startBuild(ctx, pipelineName, 'action');
      builds.push(build);
    }
    return builds;
  }

  private getMap(tenantId: string): Map<string, PipelineBuild> {
    let m = this.builds.get(tenantId);
    if (!m) { m = new Map(); this.builds.set(tenantId, m); }
    return m;
  }

  private getSchedMap(tenantId: string): Map<string, PipelineSchedule> {
    let m = this.schedules.get(tenantId);
    if (!m) { m = new Map(); this.schedules.set(tenantId, m); }
    return m;
  }
}
