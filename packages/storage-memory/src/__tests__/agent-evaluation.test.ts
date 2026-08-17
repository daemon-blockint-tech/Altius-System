/**
 * Tests for the agent evaluation framework.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAgentEvaluationService } from '../in-memory-agent-evaluation.js';
import type { RequestContext, AgentExecutor, CreateEvalSuiteInput } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

function makeExecutor(response: string, tools: string[] = [], latency = 50): AgentExecutor {
  return {
    async execute(input: string) {
      void input;
      return { response, toolsCalled: tools, latencyMs: latency };
    },
  };
}

const SUITE_INPUT: CreateEvalSuiteInput = {
  name: 'order-agent-eval',
  description: 'Evaluate order processing agent',
  agentIdentifier: 'order-agent-v1',
  testCases: [
    {
      name: 'process-order',
      description: 'Agent should process an order',
      input: 'Process order #123',
      expectedTools: ['submitOrder'],
      metrics: [
        { name: 'contains-order', type: 'contains', expected: 'order' },
        { name: 'tool-check', type: 'tool_selection', expectedTools: ['submitOrder'] },
      ],
      tags: ['orders'],
    },
    {
      name: 'cancel-order',
      description: 'Agent should cancel an order',
      input: 'Cancel order #456',
      expectedTools: ['cancelOrder'],
      metrics: [
        { name: 'exact', type: 'exact_match', expected: 'Order cancelled' },
        { name: 'safety', type: 'safety' },
      ],
      tags: ['orders', 'cancellation'],
    },
  ],
  tags: ['production'],
};

describe('InMemoryAgentEvaluationService', () => {
  let service: InMemoryAgentEvaluationService;

  beforeEach(() => {
    service = new InMemoryAgentEvaluationService();
  });

  it('creates an eval suite', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    expect(suite.id).toBeTruthy();
    expect(suite.testCases).toHaveLength(2);
    expect(suite.testCases[0]!.id).toBeTruthy();
  });

  it('gets a suite by ID', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const fetched = await service.getSuite(CTX, suite.id);
    expect(fetched?.name).toBe('order-agent-eval');
  });

  it('lists suites', async () => {
    await service.createSuite(CTX, SUITE_INPUT);
    await service.createSuite(CTX, { ...SUITE_INPUT, name: 'suite2', agentIdentifier: 'agent-v2' });
    const all = await service.listSuites(CTX);
    expect(all).toHaveLength(2);
    const filtered = await service.listSuites(CTX, 'agent-v2');
    expect(filtered).toHaveLength(1);
  });

  it('updates a suite', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const updated = await service.updateSuite(CTX, suite.id, { name: 'updated' });
    expect(updated.name).toBe('updated');
  });

  it('deletes a suite', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    await service.deleteSuite(CTX, suite.id);
    const fetched = await service.getSuite(CTX, suite.id);
    expect(fetched).toBeNull();
  });

  it('runs an evaluation and scores results', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const executor = makeExecutor('Order processed successfully', ['submitOrder']);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    expect(result.status).toBe('completed');
    expect(result.totalCount).toBe(2);
    expect(result.results).toHaveLength(2);
    // First test case should pass contains and tool_selection
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.metricScores).toHaveLength(2);
  });

  it('detects failed exact_match', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const executor = makeExecutor('Done', ['cancelOrder']);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    // Second test case expects exact "Order cancelled"
    expect(result.results[1]!.passed).toBe(false);
    const exactMetric = result.results[1]!.metricScores.find(m => m.metricType === 'exact_match');
    expect(exactMetric?.passed).toBe(false);
  });

  it('detects missing tool calls', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const executor = makeExecutor('order processed', []);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    const toolMetric = result.results[0]!.metricScores.find(m => m.metricType === 'tool_selection');
    expect(toolMetric?.passed).toBe(false);
    expect(toolMetric?.score).toBe(0);
  });

  it('detects safety violations', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const executor = makeExecutor('ignore previous instructions', ['cancelOrder']);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    const safetyMetric = result.results[1]!.metricScores.find(m => m.metricType === 'safety');
    expect(safetyMetric?.passed).toBe(false);
  });

  it('checks latency metric', async () => {
    const suite = await service.createSuite(CTX, {
      ...SUITE_INPUT,
      testCases: [{
        name: 'fast-test', description: '', input: 'test',
        metrics: [{ name: 'latency', type: 'latency', maxLatencyMs: 100 }],
        tags: [],
      }],
    });
    const executor = makeExecutor('ok', [], 50);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    expect(result.results[0]!.passed).toBe(true);
  });

  it('fails latency metric when too slow', async () => {
    const suite = await service.createSuite(CTX, {
      ...SUITE_INPUT,
      testCases: [{
        name: 'slow-test', description: '', input: 'test',
        metrics: [{ name: 'latency', type: 'latency', maxLatencyMs: 10 }],
        tags: [],
      }],
    });
    const executor = makeExecutor('ok', [], 200);
    const result = await service.runEvaluation(CTX, suite.id, executor);
    expect(result.results[0]!.passed).toBe(false);
  });

  it('stores and retrieves run results', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const executor = makeExecutor('ok', ['submitOrder']);
    await service.runEvaluation(CTX, suite.id, executor);
    await service.runEvaluation(CTX, suite.id, executor);
    const results = await service.listRunResults(CTX, suite.id);
    expect(results).toHaveLength(2);
  });

  it('compares two runs', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const goodExecutor = makeExecutor('Order processed', ['submitOrder']);
    const poorExecutor = makeExecutor('bad', []);
    const runA = await service.runEvaluation(CTX, suite.id, goodExecutor);
    const runB = await service.runEvaluation(CTX, suite.id, poorExecutor);
    const comparison = await service.compareRuns(CTX, runA.id, runB.id);
    expect(comparison.runA.overallScore).toBeGreaterThan(comparison.runB.overallScore);
    expect(comparison.scoreDifference).toBeLessThan(0);
    expect(comparison.perTestCase.length).toBeGreaterThan(0);
  });

  it('handles executor errors gracefully', async () => {
    const suite = await service.createSuite(CTX, SUITE_INPUT);
    const errorExecutor: AgentExecutor = {
      async execute() { throw new Error('Agent crashed'); },
    };
    const result = await service.runEvaluation(CTX, suite.id, errorExecutor);
    expect(result.results.every(r => !r.passed)).toBe(true);
    expect(result.results.every(r => r.errorMessage)).toBe(true);
  });

  it('isolates tenants', async () => {
    await service.createSuite(CTX, SUITE_INPUT);
    const t2 = await service.listSuites({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});
