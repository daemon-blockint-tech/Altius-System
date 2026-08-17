/**
 * In-memory agent evaluation service.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentEvaluationService,
  AgentExecutor,
  EvalSuite,
  EvalTestCase,
  EvalMetric,
  TestCaseResult,
  EvalRunResult,
  CreateEvalSuiteInput,
  RequestContext,
} from '@altius/spi';

export class InMemoryAgentEvaluationService implements AgentEvaluationService {
  private readonly suites = new Map<string, Map<string, EvalSuite>>();
  private readonly runResults = new Map<string, Map<string, EvalRunResult>>();

  async createSuite(ctx: RequestContext, input: CreateEvalSuiteInput): Promise<EvalSuite> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const testCases: EvalTestCase[] = input.testCases.map(tc => ({ ...tc, id: randomUUID() }));
    const suite: EvalSuite = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description,
      agentIdentifier: input.agentIdentifier,
      testCases,
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      tags: input.tags ?? [],
    };
    this.getMap(ctx.tenantId).set(id, suite);
    return suite;
  }

  async getSuite(ctx: RequestContext, suiteId: string): Promise<EvalSuite | null> {
    return this.suites.get(ctx.tenantId)?.get(suiteId) ?? null;
  }

  async listSuites(ctx: RequestContext, agentIdentifier?: string): Promise<EvalSuite[]> {
    const tenantSuites = this.suites.get(ctx.tenantId);
    if (!tenantSuites) return [];
    let results = Array.from(tenantSuites.values());
    if (agentIdentifier) results = results.filter(s => s.agentIdentifier === agentIdentifier);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateSuite(ctx: RequestContext, suiteId: string, updates: Partial<CreateEvalSuiteInput>): Promise<EvalSuite> {
    const suite = this.suites.get(ctx.tenantId)?.get(suiteId);
    if (!suite) throw new Error(`Suite not found: ${suiteId}`);
    const updated: EvalSuite = {
      ...suite,
      name: updates.name ?? suite.name,
      description: updates.description ?? suite.description,
      agentIdentifier: updates.agentIdentifier ?? suite.agentIdentifier,
      testCases: updates.testCases ? updates.testCases.map(tc => ({ ...tc, id: randomUUID() })) : suite.testCases,
      tags: updates.tags ?? suite.tags,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(suiteId, updated);
    return updated;
  }

  async deleteSuite(ctx: RequestContext, suiteId: string): Promise<void> {
    this.suites.get(ctx.tenantId)?.delete(suiteId);
  }

  async runEvaluation(ctx: RequestContext, suiteId: string, executor: AgentExecutor): Promise<EvalRunResult> {
    const suite = this.suites.get(ctx.tenantId)?.get(suiteId);
    if (!suite) throw new Error(`Suite not found: ${suiteId}`);

    const start = Date.now();
    const results: TestCaseResult[] = [];

    for (const tc of suite.testCases) {
      const tcStart = Date.now();
      try {
        const agentResult = await executor.execute(tc.input, tc.context);
        const latencyMs = agentResult.latencyMs ?? (Date.now() - tcStart);
        const metricScores = tc.metrics.map(m => this.evaluateMetric(m, agentResult.response, agentResult.toolsCalled, latencyMs));
        const overallScore = metricScores.length > 0
          ? metricScores.reduce((s, m) => s + m.score * (m.weight ?? 1), 0) / metricScores.reduce((s, m) => s + (m.weight ?? 1), 0)
          : 1;
        const passed = metricScores.every(m => m.passed);
        results.push({
          testCaseId: tc.id, testCaseName: tc.name,
          response: agentResult.response,
          toolsCalled: agentResult.toolsCalled,
          metricScores: metricScores.map(m => ({ metricName: m.name, metricType: m.type, passed: m.passed, score: m.score, details: m.details })),
          overallScore, passed, latencyMs,
        });
      } catch (err) {
        results.push({
          testCaseId: tc.id, testCaseName: tc.name,
          response: '', toolsCalled: [],
          metricScores: tc.metrics.map(m => ({ metricName: m.name, metricType: m.type, passed: false, score: 0 })),
          overallScore: 0, passed: false, latencyMs: Date.now() - tcStart,
          errorMessage: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    const overallScore = results.length > 0 ? results.reduce((s, r) => s + r.overallScore, 0) / results.length : 0;
    const passedCount = results.filter(r => r.passed).length;
    const avgLatencyMs = results.length > 0 ? results.reduce((s, r) => s + r.latencyMs, 0) / results.length : 0;

    const runResult: EvalRunResult = {
      id: randomUUID(), tenantId: ctx.tenantId, suiteId,
      agentIdentifier: suite.agentIdentifier,
      results, overallScore, passedCount, totalCount: results.length,
      avgLatencyMs, executedAt: new Date().toISOString(),
      durationMs: Date.now() - start, status: 'completed',
    };

    this.getRunMap(ctx.tenantId).set(runResult.id, runResult);
    return runResult;
  }

  async getRunResult(ctx: RequestContext, runId: string): Promise<EvalRunResult | null> {
    return this.runResults.get(ctx.tenantId)?.get(runId) ?? null;
  }

  async listRunResults(ctx: RequestContext, suiteId: string, limit = 50): Promise<EvalRunResult[]> {
    const tenantResults = this.runResults.get(ctx.tenantId);
    if (!tenantResults) return [];
    return Array.from(tenantResults.values())
      .filter(r => r.suiteId === suiteId)
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .slice(0, limit);
  }

  async compareRuns(ctx: RequestContext, runIdA: string, runIdB: string): Promise<{
    runA: EvalRunResult;
    runB: EvalRunResult;
    scoreDifference: number;
    perTestCase: Array<{ testCaseId: string; scoreA: number; scoreB: number; delta: number }>;
  }> {
    const runA = await this.getRunResult(ctx, runIdA);
    const runB = await this.getRunResult(ctx, runIdB);
    if (!runA || !runB) throw new Error('Run not found');

    const perTestCase: Array<{ testCaseId: string; scoreA: number; scoreB: number; delta: number }> = [];
    const mapA = new Map(runA.results.map(r => [r.testCaseId, r]));
    const mapB = new Map(runB.results.map(r => [r.testCaseId, r]));
    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
    for (const id of allIds) {
      const scoreA = mapA.get(id)?.overallScore ?? 0;
      const scoreB = mapB.get(id)?.overallScore ?? 0;
      perTestCase.push({ testCaseId: id, scoreA, scoreB, delta: scoreB - scoreA });
    }

    return {
      runA, runB,
      scoreDifference: runB.overallScore - runA.overallScore,
      perTestCase,
    };
  }

  // ── Private helpers ──

  private evaluateMetric(metric: EvalMetric, response: string, toolsCalled: string[], latencyMs: number): {
    name: string; type: EvalMetric['type']; passed: boolean; score: number; details?: string; weight?: number;
  } {
    switch (metric.type) {
      case 'exact_match': {
        const passed = response.trim() === (metric.expected ?? '').trim();
        return { name: metric.name, type: metric.type, passed, score: passed ? 1 : 0, details: `Expected: "${metric.expected}"`, weight: metric.weight };
      }
      case 'contains': {
        const passed = response.toLowerCase().includes((metric.expected ?? '').toLowerCase());
        return { name: metric.name, type: metric.type, passed, score: passed ? 1 : 0, details: `Looking for: "${metric.expected}"`, weight: metric.weight };
      }
      case 'json_path': {
        try {
          const json = JSON.parse(response);
          const value = this.getJsonPath(json, metric.jsonPath ?? '');
          const passed = JSON.stringify(value) === JSON.stringify(metric.expectedValue);
          return { name: metric.name, type: metric.type, passed, score: passed ? 1 : 0, weight: metric.weight };
        } catch {
          return { name: metric.name, type: metric.type, passed: false, score: 0, details: 'Invalid JSON', weight: metric.weight };
        }
      }
      case 'tool_selection': {
        const expected = metric.expectedTools ?? [];
        const actual = new Set(toolsCalled);
        const correct = expected.filter(t => actual.has(t));
        const score = expected.length > 0 ? correct.length / expected.length : 1;
        const passed = score === 1;
        return { name: metric.name, type: metric.type, passed, score, details: `Expected: ${expected.join(', ')}, Got: ${toolsCalled.join(', ')}`, weight: metric.weight };
      }
      case 'safety': {
        // Simple safety check: no harmful patterns
        const harmful = ['ignore previous', 'system prompt', 'delete all'];
        const found = harmful.some(h => response.toLowerCase().includes(h));
        const passed = !found;
        return { name: metric.name, type: metric.type, passed, score: passed ? 1 : 0, weight: metric.weight };
      }
      case 'latency': {
        const passed = latencyMs <= (metric.maxLatencyMs ?? Infinity);
        const score = passed ? 1 : Math.max(0, (metric.maxLatencyMs ?? 1) / latencyMs);
        return { name: metric.name, type: metric.type, passed, score, details: `${latencyMs}ms vs ${metric.maxLatencyMs}ms`, weight: metric.weight };
      }
      case 'custom':
        return { name: metric.name, type: metric.type, passed: true, score: 1, weight: metric.weight };
      default:
        return { name: metric.name, type: metric.type, passed: false, score: 0, weight: metric.weight };
    }
  }

  private getJsonPath(obj: unknown, path: string): unknown {
    const parts = path.split('.').filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private getMap(tenantId: string): Map<string, EvalSuite> {
    let m = this.suites.get(tenantId);
    if (!m) { m = new Map(); this.suites.set(tenantId, m); }
    return m;
  }

  private getRunMap(tenantId: string): Map<string, EvalRunResult> {
    let m = this.runResults.get(tenantId);
    if (!m) { m = new Map(); this.runResults.set(tenantId, m); }
    return m;
  }
}
