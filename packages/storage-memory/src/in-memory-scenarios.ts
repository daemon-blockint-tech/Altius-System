/**
 * In-memory scenario simulation service.
 */

import { randomUUID } from 'node:crypto';
import type {
  ScenarioService,
  Scenario,
  ScenarioResult,
  CreateScenarioInput,
  ScenarioQuery,
  RequestContext,
  ModelInferenceService,
  ModelChainService,
} from '@altius/spi';

export interface InMemoryScenarioServiceOptions {
  inferenceService: ModelInferenceService;
  chainService: ModelChainService;
}

export class InMemoryScenarioService implements ScenarioService {
  private readonly scenarios = new Map<string, Map<string, Scenario>>();
  private readonly results = new Map<string, ScenarioResult[]>();
  private readonly inferenceService: ModelInferenceService;
  private readonly chainService: ModelChainService;

  constructor(options: InMemoryScenarioServiceOptions) {
    this.inferenceService = options.inferenceService;
    this.chainService = options.chainService;
  }

  async create(ctx: RequestContext, input: CreateScenarioInput): Promise<Scenario> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const scenario: Scenario = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description,
      targetId: input.targetId, targetType: input.targetType,
      inputOverrides: input.inputOverrides,
      isBaseline: input.isBaseline ?? false,
      state: 'draft',
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      tags: input.tags ?? [],
      timeWindow: input.timeWindow,
      smoothing: input.smoothing,
    };
    this.getOrCreateMap(ctx.tenantId).set(id, scenario);
    return scenario;
  }

  async get(ctx: RequestContext, scenarioId: string): Promise<Scenario | null> {
    return this.scenarios.get(ctx.tenantId)?.get(scenarioId) ?? null;
  }

  async list(ctx: RequestContext, query?: ScenarioQuery): Promise<{ scenarios: Scenario[]; totalCount: number }> {
    const tenantScenarios = this.scenarios.get(ctx.tenantId);
    if (!tenantScenarios) return { scenarios: [], totalCount: 0 };
    let results = Array.from(tenantScenarios.values());
    if (query?.targetId) results = results.filter(s => s.targetId === query.targetId);
    if (query?.targetType) results = results.filter(s => s.targetType === query.targetType);
    if (query?.isBaseline !== undefined) results = results.filter(s => s.isBaseline === query.isBaseline);
    if (query?.state) results = results.filter(s => s.state === query.state);
    if (query?.tags?.length) results = results.filter(s => query.tags!.some(t => s.tags.includes(t)));
    const totalCount = results.length;
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);
    return { scenarios: results, totalCount };
  }

  async update(ctx: RequestContext, scenarioId: string, updates: Partial<CreateScenarioInput>): Promise<Scenario> {
    const scenario = this.scenarios.get(ctx.tenantId)?.get(scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    if (scenario.state === 'running') throw new Error('Cannot update running scenario');
    const updated: Scenario = {
      ...scenario,
      name: updates.name ?? scenario.name,
      description: updates.description ?? scenario.description,
      inputOverrides: updates.inputOverrides ?? scenario.inputOverrides,
      tags: updates.tags ?? scenario.tags,
      timeWindow: updates.timeWindow ?? scenario.timeWindow,
      smoothing: updates.smoothing ?? scenario.smoothing,
      updatedAt: new Date().toISOString(),
    };
    this.scenarios.get(ctx.tenantId)!.set(scenarioId, updated);
    return updated;
  }

  async delete(ctx: RequestContext, scenarioId: string): Promise<void> {
    this.scenarios.get(ctx.tenantId)?.delete(scenarioId);
    this.results.delete(`${ctx.tenantId}:${scenarioId}`);
  }

  async run(ctx: RequestContext, scenarioId: string): Promise<ScenarioResult> {
    const scenario = this.scenarios.get(ctx.tenantId)?.get(scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);

    // Mark as running
    this.scenarios.get(ctx.tenantId)!.set(scenarioId, { ...scenario, state: 'running', updatedAt: new Date().toISOString() });

    const start = Date.now();
    try {
      // Run scenario with overrides
      const scenarioOutputs = await this.executeTarget(ctx, scenario.targetId, scenario.targetType, scenario.inputOverrides);

      // Run baseline (no overrides) if this isn't already the baseline
      let baselineOutputs: Record<string, unknown> | undefined;
      let diff: ScenarioResult['diff'] | undefined;

      if (!scenario.isBaseline) {
        baselineOutputs = await this.executeTarget(ctx, scenario.targetId, scenario.targetType, {});
        diff = this.computeDiff(baselineOutputs, scenarioOutputs);
      }

      const result: ScenarioResult = {
        scenarioId,
        success: true,
        outputs: scenarioOutputs,
        baselineOutputs,
        diff,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };

      // Mark as completed
      this.scenarios.get(ctx.tenantId)!.set(scenarioId, { ...scenario, state: 'completed', updatedAt: new Date().toISOString() });

      // Store result
      const key = `${ctx.tenantId}:${scenarioId}`;
      const history = this.results.get(key) ?? [];
      history.push(result);
      this.results.set(key, history);

      return result;
    } catch (err) {
      const result: ScenarioResult = {
        scenarioId,
        success: false,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Failed',
      };
      this.scenarios.get(ctx.tenantId)!.set(scenarioId, { ...scenario, state: 'failed', updatedAt: new Date().toISOString() });
      const key = `${ctx.tenantId}:${scenarioId}`;
      const history = this.results.get(key) ?? [];
      history.push(result);
      this.results.set(key, history);
      return result;
    }
  }

  async compare(ctx: RequestContext, scenarioIdA: string, scenarioIdB: string): Promise<{
    scenarioA: Scenario;
    scenarioB: Scenario;
    outputDiff: Record<string, { a: unknown; b: unknown; delta: number | string }>;
  }> {
    const a = await this.get(ctx, scenarioIdA);
    const b = await this.get(ctx, scenarioIdB);
    if (!a || !b) throw new Error('Scenario not found');

    const resultsA = await this.getResults(ctx, scenarioIdA);
    const resultsB = await this.getResults(ctx, scenarioIdB);
    const lastA = resultsA[resultsA.length - 1];
    const lastB = resultsB[resultsB.length - 1];
    if (!lastA?.outputs || !lastB?.outputs) throw new Error('One or both scenarios have no results');

    const outputDiff: Record<string, { a: unknown; b: unknown; delta: number | string }> = {};
    const allKeys = new Set([...Object.keys(lastA.outputs), ...Object.keys(lastB.outputs)]);
    for (const key of allKeys) {
      const valA = (lastA.outputs as Record<string, unknown>)[key];
      const valB = (lastB.outputs as Record<string, unknown>)[key];
      outputDiff[key] = { a: valA, b: valB, delta: this.computeDelta(valA, valB) };
    }

    return { scenarioA: a, scenarioB: b, outputDiff };
  }

  async getResults(ctx: RequestContext, scenarioId: string): Promise<ScenarioResult[]> {
    return this.results.get(`${ctx.tenantId}:${scenarioId}`) ?? [];
  }

  async duplicate(ctx: RequestContext, scenarioId: string, newName: string): Promise<Scenario> {
    const original = await this.get(ctx, scenarioId);
    if (!original) throw new Error(`Scenario not found: ${scenarioId}`);
    return this.create(ctx, {
      name: newName,
      description: original.description,
      targetId: original.targetId,
      targetType: original.targetType,
      inputOverrides: { ...original.inputOverrides },
      tags: [...original.tags],
      timeWindow: original.timeWindow,
      smoothing: original.smoothing,
    });
  }

  // ── Helpers ──

  private async executeTarget(ctx: RequestContext, targetId: string, targetType: 'model' | 'chain', inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (targetType === 'chain') {
      const result = await this.chainService.executeChain(ctx, targetId, inputs);
      if (!result.success) throw new Error('Chain execution failed');
      return result.finalOutputs as Record<string, unknown> ?? {};
    }
    const result = await this.inferenceService.infer(ctx, { modelIdentifier: targetId, inputs });
    if (!result.success) throw new Error(result.errorMessage ?? 'Inference failed');
    return result.outputs as Record<string, unknown>;
  }

  private computeDiff(baseline: Record<string, unknown>, scenario: Record<string, unknown>): Record<string, { baseline: unknown; scenario: unknown; delta: number | string }> {
    const diff: Record<string, { baseline: unknown; scenario: unknown; delta: number | string }> = {};
    const allKeys = new Set([...Object.keys(baseline), ...Object.keys(scenario)]);
    for (const key of allKeys) {
      const b = baseline[key];
      const s = scenario[key];
      diff[key] = { baseline: b, scenario: s, delta: this.computeDelta(b, s) };
    }
    return diff;
  }

  private computeDelta(a: unknown, b: unknown): number | string {
    if (typeof a === 'number' && typeof b === 'number') return b - a;
    return 'n/a';
  }

  private getOrCreateMap(tenantId: string): Map<string, Scenario> {
    let m = this.scenarios.get(tenantId);
    if (!m) { m = new Map(); this.scenarios.set(tenantId, m); }
    return m;
  }
}
