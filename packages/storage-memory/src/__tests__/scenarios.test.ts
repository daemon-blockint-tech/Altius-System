/**
 * Tests for the in-memory scenario simulation service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryScenarioService } from '../in-memory-scenarios.js';
import { InMemoryModelRegistryService, InMemoryModelInferenceService, InMemoryModelChainService } from '../in-memory-model-registry.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

function setupModel() {
  const registry = new InMemoryModelRegistryService();
  const inference = new InMemoryModelInferenceService(registry);
  const chains = new InMemoryModelChainService(inference);
  return { registry, inference, chains };
}

describe('InMemoryScenarioService', () => {
  let registry: InMemoryModelRegistryService;
  let inference: InMemoryModelInferenceService;
  let chains: InMemoryModelChainService;
  let scenarios: InMemoryScenarioService;

  beforeEach(async () => {
    const setup = setupModel();
    registry = setup.registry;
    inference = setup.inference;
    chains = setup.chains;
    scenarios = new InMemoryScenarioService({ inferenceService: inference, chainService: chains });
  });

  async function createReleasedModel() {
    const model = await registry.create(CTX, {
      name: 'test-model',
      displayName: 'Test Model',
      description: 'Test',
      source: 'uploaded-file',
      adapter: { type: 'rest', inputSchema: {}, outputSchema: {} },
    });
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    return model;
  }

  it('creates a scenario', async () => {
    const model = await createReleasedModel();
    const scenario = await scenarios.create(CTX, {
      name: 'What-if 1',
      description: 'Test scenario',
      targetId: model.id,
      targetType: 'model',
      inputOverrides: { x: 100 },
    });
    expect(scenario.id).toBeTruthy();
    expect(scenario.state).toBe('draft');
    expect(scenario.inputOverrides).toEqual({ x: 100 });
  });

  it('runs a scenario and compares against baseline', async () => {
    const model = await createReleasedModel();
    const scenario = await scenarios.create(CTX, {
      name: 'What-if 1',
      description: 'Test',
      targetId: model.id,
      targetType: 'model',
      inputOverrides: { x: 100 },
    });
    const result = await scenarios.run(CTX, scenario.id);
    expect(result.success).toBe(true);
    expect(result.outputs).toBeTruthy();
    expect(result.baselineOutputs).toBeTruthy();
    expect(result.diff).toBeTruthy();
  });

  it('runs a baseline scenario without diff', async () => {
    const model = await createReleasedModel();
    const baseline = await scenarios.create(CTX, {
      name: 'Baseline',
      description: 'Auto-run baseline',
      targetId: model.id,
      targetType: 'model',
      inputOverrides: {},
      isBaseline: true,
    });
    const result = await scenarios.run(CTX, baseline.id);
    expect(result.success).toBe(true);
    expect(result.baselineOutputs).toBeUndefined();
    expect(result.diff).toBeUndefined();
  });

  it('stores scenario results', async () => {
    const model = await createReleasedModel();
    const scenario = await scenarios.create(CTX, {
      name: 'Test', description: '', targetId: model.id, targetType: 'model', inputOverrides: { x: 1 },
    });
    await scenarios.run(CTX, scenario.id);
    await scenarios.run(CTX, scenario.id);
    const results = await scenarios.getResults(CTX, scenario.id);
    expect(results).toHaveLength(2);
  });

  it('updates a scenario', async () => {
    const model = await createReleasedModel();
    const scenario = await scenarios.create(CTX, {
      name: 'Test', description: '', targetId: model.id, targetType: 'model', inputOverrides: { x: 1 },
    });
    const updated = await scenarios.update(CTX, scenario.id, { inputOverrides: { x: 999 } });
    expect(updated.inputOverrides).toEqual({ x: 999 });
  });

  it('lists scenarios with filters', async () => {
    const model = await createReleasedModel();
    await scenarios.create(CTX, { name: 'S1', description: '', targetId: model.id, targetType: 'model', inputOverrides: {}, tags: ['a'] });
    await scenarios.create(CTX, { name: 'S2', description: '', targetId: model.id, targetType: 'model', inputOverrides: {}, tags: ['b'] });
    const all = await scenarios.list(CTX);
    expect(all.totalCount).toBe(2);
    const filtered = await scenarios.list(CTX, { tags: ['a'] });
    expect(filtered.totalCount).toBe(1);
  });

  it('duplicates a scenario', async () => {
    const model = await createReleasedModel();
    const original = await scenarios.create(CTX, {
      name: 'Original', description: 'Test desc', targetId: model.id, targetType: 'model', inputOverrides: { x: 1 },
    });
    const copy = await scenarios.duplicate(CTX, original.id, 'Copy');
    expect(copy.name).toBe('Copy');
    expect(copy.inputOverrides).toEqual({ x: 1 });
    expect(copy.id).not.toBe(original.id);
  });

  it('compares two scenarios', async () => {
    const model = await createReleasedModel();
    const sA = await scenarios.create(CTX, { name: 'A', description: '', targetId: model.id, targetType: 'model', inputOverrides: { x: 10 } });
    const sB = await scenarios.create(CTX, { name: 'B', description: '', targetId: model.id, targetType: 'model', inputOverrides: { x: 20 } });
    await scenarios.run(CTX, sA.id);
    await scenarios.run(CTX, sB.id);
    const comparison = await scenarios.compare(CTX, sA.id, sB.id);
    expect(comparison.scenarioA.name).toBe('A');
    expect(comparison.scenarioB.name).toBe('B');
    expect(comparison.outputDiff).toBeTruthy();
  });

  it('deletes a scenario', async () => {
    const model = await createReleasedModel();
    const scenario = await scenarios.create(CTX, { name: 'Test', description: '', targetId: model.id, targetType: 'model', inputOverrides: {} });
    await scenarios.delete(CTX, scenario.id);
    const fetched = await scenarios.get(CTX, scenario.id);
    expect(fetched).toBeNull();
  });

  it('isolates tenants', async () => {
    const model = await createReleasedModel();
    await scenarios.create(CTX, { name: 'T1', description: '', targetId: model.id, targetType: 'model', inputOverrides: {} });
    const t2 = await scenarios.list({ tenantId: 't2' } as RequestContext);
    expect(t2.totalCount).toBe(0);
  });
});
