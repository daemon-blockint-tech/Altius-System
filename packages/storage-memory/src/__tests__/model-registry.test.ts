/**
 * Tests for ML model registry, inference, chain orchestration, and modeling objectives.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryModelRegistryService,
  InMemoryModelInferenceService,
  InMemoryModelChainService,
  InMemoryModelingObjectiveService,
} from '../in-memory-model-registry.js';
import type { RequestContext, CreateModelInput, ModelAdapter } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

const MOCK_ADAPTER: ModelAdapter = {
  type: 'rest',
  endpoint: 'http://mock',
  inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
  outputSchema: { type: 'object', properties: { y: { type: 'number' } } },
};

const MODEL_INPUT: CreateModelInput = {
  name: 'risk-model',
  displayName: 'Risk Model',
  description: 'Predicts risk score',
  source: 'uploaded-file',
  adapter: MOCK_ADAPTER,
  tags: ['risk', 'finance'],
};

describe('InMemoryModelRegistryService', () => {
  let registry: InMemoryModelRegistryService;

  beforeEach(() => {
    registry = new InMemoryModelRegistryService();
  });

  it('creates a model in draft state', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    expect(model.id).toBeTruthy();
    expect(model.state).toBe('draft');
    expect(model.version).toBe(1);
  });

  it('gets a model by ID', async () => {
    const created = await registry.create(CTX, MODEL_INPUT);
    const fetched = await registry.get(CTX, created.id);
    expect(fetched?.name).toBe('risk-model');
  });

  it('lists models with filters', async () => {
    await registry.create(CTX, { ...MODEL_INPUT, name: 'm1', tags: ['a'] });
    await registry.create(CTX, { ...MODEL_INPUT, name: 'm2', tags: ['b'] });
    const all = await registry.list(CTX);
    expect(all.totalCount).toBe(2);
    const filtered = await registry.list(CTX, { tags: ['a'] });
    expect(filtered.totalCount).toBe(1);
  });

  it('transitions through lifecycle: draft → review → released → deprecated → archived', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    const reviewed = await registry.submitForReview(CTX, model.id);
    expect(reviewed.state).toBe('in_review');
    const released = await registry.release(CTX, model.id);
    expect(released.state).toBe('released');
    expect(released.releasedBy).toBe('u1');
    expect(released.releasedAt).toBeTruthy();
    const deprecated = await registry.deprecate(CTX, model.id);
    expect(deprecated.state).toBe('deprecated');
    const archived = await registry.archive(CTX, model.id);
    expect(archived.state).toBe('archived');
  });

  it('prevents invalid state transitions', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await expect(registry.release(CTX, model.id)).rejects.toThrow('Cannot transition');
  });

  it('tracks version history', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    const history = await registry.getVersionHistory(CTX, model.id);
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  it('computes lineage', async () => {
    const m1 = await registry.create(CTX, { ...MODEL_INPUT, name: 'm1' });
    const m2 = await registry.create(CTX, { ...MODEL_INPUT, name: 'm2', upstreamModelIds: [m1.id] });
    const lineage = await registry.getLineage(CTX, m2.id);
    expect(lineage.upstream).toHaveLength(1);
    expect(lineage.upstream[0]!.id).toBe(m1.id);
    const m1Lineage = await registry.getLineage(CTX, m1.id);
    expect(m1Lineage.downstream).toHaveLength(1);
  });

  it('updates a model', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    const updated = await registry.update(CTX, model.id, { description: 'New description' });
    expect(updated.description).toBe('New description');
  });

  it('isolates tenants', async () => {
    await registry.create(CTX, MODEL_INPUT);
    const t2 = await registry.list({ tenantId: 't2' } as RequestContext);
    expect(t2.totalCount).toBe(0);
  });
});

describe('InMemoryModelInferenceService', () => {
  let registry: InMemoryModelRegistryService;
  let inference: InMemoryModelInferenceService;

  beforeEach(() => {
    registry = new InMemoryModelRegistryService();
    inference = new InMemoryModelInferenceService(registry);
  });

  it('deploys a released model', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    const deployment = await inference.deploy(CTX, model.id, 'prod-deployment');
    expect(deployment.state).toBe('active');
    expect(deployment.endpointUrl).toBeTruthy();
  });

  it('prevents deploying non-released model', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await expect(inference.deploy(CTX, model.id, 'test')).rejects.toThrow('non-released');
  });

  it('runs inference', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    const result = await inference.infer(CTX, { modelIdentifier: model.id, inputs: { x: 42 } });
    expect(result.success).toBe(true);
    expect(result.modelId).toBe(model.id);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs batch inference', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    const results = await inference.batchInfer(CTX, model.id, [{ x: 1 }, { x: 2 }, { x: 3 }]);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('records inference history', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    await inference.infer(CTX, { modelIdentifier: model.id, inputs: { x: 1 } });
    await inference.infer(CTX, { modelIdentifier: model.id, inputs: { x: 2 } });
    const history = await inference.getInferenceHistory(CTX, model.id);
    expect(history).toHaveLength(2);
  });

  it('stops a deployment', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    const dep = await inference.deploy(CTX, model.id, 'test');
    await inference.stopDeployment(CTX, dep.id);
    const fetched = await inference.getDeployment(CTX, dep.id);
    expect(fetched?.state).toBe('stopped');
  });

  it('infers by deployment name', async () => {
    const model = await registry.create(CTX, MODEL_INPUT);
    await registry.submitForReview(CTX, model.id);
    await registry.release(CTX, model.id);
    await inference.deploy(CTX, model.id, 'my-deployment');
    const result = await inference.infer(CTX, { modelIdentifier: 'my-deployment', inputs: { x: 1 } });
    expect(result.success).toBe(true);
    expect(result.deploymentId).toBeTruthy();
  });
});

describe('InMemoryModelChainService', () => {
  let registry: InMemoryModelRegistryService;
  let inference: InMemoryModelInferenceService;
  let chains: InMemoryModelChainService;

  beforeEach(() => {
    registry = new InMemoryModelRegistryService();
    inference = new InMemoryModelInferenceService(registry);
    chains = new InMemoryModelChainService(inference);
  });

  it('creates and executes a model chain', async () => {
    const m1 = await registry.create(CTX, { ...MODEL_INPUT, name: 'step1' });
    const m2 = await registry.create(CTX, { ...MODEL_INPUT, name: 'step2' });
    await registry.submitForReview(CTX, m1.id);
    await registry.release(CTX, m1.id);
    await registry.submitForReview(CTX, m2.id);
    await registry.release(CTX, m2.id);

    const chain = await chains.createChain(CTX, {
      name: 'pipeline-1',
      description: 'Two-step pipeline',
      state: 'active',
      steps: [
        { name: 'step1', modelId: m1.id, inputMapping: { x: 'x' }, stopOnFailure: true },
        { name: 'step2', modelId: m2.id, inputMapping: { x: '_prediction' }, stopOnFailure: true },
      ],
    });

    const result = await chains.executeChain(CTX, chain.id, { x: 42 });
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(2);
    expect(result.finalOutputs).toBeTruthy();
  });

  it('stops on failure when configured', async () => {
    const m1 = await registry.create(CTX, { ...MODEL_INPUT, name: 'step1' });
    await registry.submitForReview(CTX, m1.id);
    await registry.release(CTX, m1.id);

    const chain = await chains.createChain(CTX, {
      name: 'fail-chain',
      description: 'Test',
      state: 'active',
      steps: [
        { name: 'step1', modelId: m1.id, inputMapping: { x: 'x' }, stopOnFailure: true },
        { name: 'step2', modelId: 'nonexistent', inputMapping: {}, stopOnFailure: true },
      ],
    });

    const result = await chains.executeChain(CTX, chain.id, { x: 1 });
    expect(result.success).toBe(false);
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[1]!.success).toBe(false);
  });

  it('lists and deletes chains', async () => {
    const chain = await chains.createChain(CTX, {
      name: 'test', description: 'Test', state: 'active', steps: [],
    });
    const list = await chains.listChains(CTX);
    expect(list).toHaveLength(1);
    await chains.deleteChain(CTX, chain.id);
    const list2 = await chains.listChains(CTX);
    expect(list2).toHaveLength(0);
  });
});

describe('InMemoryModelingObjectiveService', () => {
  let service: InMemoryModelingObjectiveService;

  beforeEach(() => {
    service = new InMemoryModelingObjectiveService();
  });

  it('creates an objective', async () => {
    const obj = await service.create(CTX, {
      title: 'Improve accuracy',
      description: 'Reach 95% accuracy',
      targetMetric: 'accuracy',
      targetValue: 0.95,
    });
    expect(obj.id).toBeTruthy();
    expect(obj.state).toBe('draft');
  });

  it('transitions through review workflow', async () => {
    const obj = await service.create(CTX, {
      title: 'Test', description: 'Test', targetMetric: 'f1', targetValue: 0.9,
    });
    const submitted = await service.submitForReview(CTX, obj.id);
    expect(submitted.state).toBe('in_review');
    const approved = await service.approve(CTX, obj.id, 'reviewer-1', 'Good');
    expect(approved.state).toBe('approved');
    expect(approved.reviewerId).toBe('reviewer-1');
  });

  it('completes an objective', async () => {
    const obj = await service.create(CTX, {
      title: 'Test', description: 'Test', targetMetric: 'rmse', targetValue: 0.1,
    });
    const completed = await service.complete(CTX, obj.id, 0.08);
    expect(completed.state).toBe('completed');
    expect(completed.currentValue).toBe(0.08);
  });

  it('links models', async () => {
    const obj = await service.create(CTX, {
      title: 'Test', description: 'Test', targetMetric: 'accuracy', targetValue: 0.9,
    });
    await service.linkModel(CTX, obj.id, 'model-1');
    await service.linkModel(CTX, obj.id, 'model-2');
    const fetched = await service.get(CTX, obj.id);
    expect(fetched?.linkedModelIds).toEqual(['model-1', 'model-2']);
  });

  it('rejects an objective', async () => {
    const obj = await service.create(CTX, {
      title: 'Test', description: 'Test', targetMetric: 'accuracy', targetValue: 0.9,
    });
    await service.submitForReview(CTX, obj.id);
    const rejected = await service.reject(CTX, obj.id, 'reviewer-1', 'Not feasible');
    expect(rejected.state).toBe('rejected');
    expect(rejected.reviewComments).toBe('Not feasible');
  });
});
