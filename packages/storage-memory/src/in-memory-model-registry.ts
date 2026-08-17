/**
 * In-memory ML model registry, inference, chain orchestration, and modeling objectives.
 */

import { randomUUID } from 'node:crypto';
import type {
  ModelRegistryService,
  ModelInferenceService,
  ModelChainService,
  ModelingObjectiveService,
  ModelArtifact,
  ModelAdapter,
  ModelLifecycleState,
  ModelQuery,
  CreateModelInput,
  ModelDeployment,
  InferenceInput,
  InferenceResult,
  InferenceHistoryRecord,
  ModelChain,
  ModelChainResult,
  ModelingObjective,
  RequestContext,
} from '@altius/spi';

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

export class InMemoryModelRegistryService implements ModelRegistryService {
  private readonly models = new Map<string, Map<string, ModelArtifact>>();
  private readonly versionHistory = new Map<string, ModelArtifact[]>();

  async create(ctx: RequestContext, input: CreateModelInput): Promise<ModelArtifact> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const model: ModelArtifact = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      source: input.source,
      adapter: input.adapter,
      state: 'draft',
      version: 1,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      upstreamModelIds: input.upstreamModelIds ?? [],
      modelingObjectiveId: input.modelingObjectiveId,
    };
    this.getOrCreateMap(ctx.tenantId).set(id, model);
    this.versionHistory.set(`${ctx.tenantId}:${id}`, [model]);
    return model;
  }

  async get(ctx: RequestContext, modelId: string): Promise<ModelArtifact | null> {
    return this.models.get(ctx.tenantId)?.get(modelId) ?? null;
  }

  async list(ctx: RequestContext, query?: ModelQuery): Promise<{ models: ModelArtifact[]; totalCount: number }> {
    const tenantModels = this.models.get(ctx.tenantId);
    if (!tenantModels) return { models: [], totalCount: 0 };
    let results = Array.from(tenantModels.values());
    if (query?.state) results = results.filter(m => m.state === query.state);
    if (query?.source) results = results.filter(m => m.source === query.source);
    if (query?.name) results = results.filter(m => m.name.includes(query.name!));
    if (query?.tags?.length) results = results.filter(m => query.tags!.some(t => m.tags.includes(t)));
    const totalCount = results.length;
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);
    return { models: results, totalCount };
  }

  async update(ctx: RequestContext, modelId: string, updates: Partial<CreateModelInput>): Promise<ModelArtifact> {
    const model = this.models.get(ctx.tenantId)?.get(modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);
    if (model.state === 'archived') throw new Error('Cannot update archived model');
    const updated: ModelArtifact = {
      ...model,
      name: updates.name ?? model.name,
      displayName: updates.displayName ?? model.displayName,
      description: updates.description ?? model.description,
      adapter: updates.adapter ?? model.adapter,
      tags: updates.tags ?? model.tags,
      upstreamModelIds: updates.upstreamModelIds ?? model.upstreamModelIds,
      modelingObjectiveId: updates.modelingObjectiveId ?? model.modelingObjectiveId,
      updatedAt: new Date().toISOString(),
    };
    this.models.get(ctx.tenantId)!.set(modelId, updated);
    return updated;
  }

  async submitForReview(ctx: RequestContext, modelId: string): Promise<ModelArtifact> {
    return this.transitionState(ctx, modelId, 'draft', 'in_review');
  }

  async release(ctx: RequestContext, modelId: string): Promise<ModelArtifact> {
    const model = await this.transitionState(ctx, modelId, 'in_review', 'released');
    const released: ModelArtifact = {
      ...model,
      releasedBy: ctx.actorId ?? 'system',
      releasedAt: new Date().toISOString(),
    };
    this.models.get(ctx.tenantId)!.set(modelId, released);
    return released;
  }

  async deprecate(ctx: RequestContext, modelId: string): Promise<ModelArtifact> {
    return this.transitionState(ctx, modelId, 'released', 'deprecated');
  }

  async archive(ctx: RequestContext, modelId: string): Promise<ModelArtifact> {
    const model = this.models.get(ctx.tenantId)?.get(modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);
    return this.transitionState(ctx, modelId, model.state, 'archived');
  }

  async getVersionHistory(ctx: RequestContext, modelId: string): Promise<ModelArtifact[]> {
    return this.versionHistory.get(`${ctx.tenantId}:${modelId}`) ?? [];
  }

  async getLineage(ctx: RequestContext, modelId: string): Promise<{ upstream: ModelArtifact[]; downstream: ModelArtifact[] }> {
    const model = this.models.get(ctx.tenantId)?.get(modelId);
    if (!model) return { upstream: [], downstream: [] };
    const tenantModels = Array.from(this.models.get(ctx.tenantId)!.values());
    const upstream = tenantModels.filter(m => model.upstreamModelIds.includes(m.id));
    const downstream = tenantModels.filter(m => m.upstreamModelIds.includes(modelId));
    return { upstream, downstream };
  }

  private async transitionState(ctx: RequestContext, modelId: string, expectedState: ModelLifecycleState, newState: ModelLifecycleState): Promise<ModelArtifact> {
    const model = this.models.get(ctx.tenantId)?.get(modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);
    if (model.state !== expectedState) throw new Error(`Cannot transition from ${model.state} to ${newState}`);
    const updated: ModelArtifact = { ...model, state: newState, updatedAt: new Date().toISOString() };
    this.models.get(ctx.tenantId)!.set(modelId, updated);
    const history = this.versionHistory.get(`${ctx.tenantId}:${modelId}`) ?? [];
    history.push(updated);
    this.versionHistory.set(`${ctx.tenantId}:${modelId}`, history);
    return updated;
  }

  private getOrCreateMap(tenantId: string): Map<string, ModelArtifact> {
    let m = this.models.get(tenantId);
    if (!m) { m = new Map(); this.models.set(tenantId, m); }
    return m;
  }
}

// ---------------------------------------------------------------------------
// Model inference
// ---------------------------------------------------------------------------

export class InMemoryModelInferenceService implements ModelInferenceService {
  private readonly deployments = new Map<string, Map<string, ModelDeployment>>();
  private readonly history: InferenceHistoryRecord[] = [];
  private readonly registry: InMemoryModelRegistryService;

  constructor(registry: InMemoryModelRegistryService) {
    this.registry = registry;
  }

  async deploy(ctx: RequestContext, modelId: string, name: string, batchMode = false): Promise<ModelDeployment> {
    const model = await this.registry.get(ctx, modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);
    if (model.state !== 'released') throw new Error('Cannot deploy non-released model');
    const id = randomUUID();
    const now = new Date().toISOString();
    const deployment: ModelDeployment = {
      id, tenantId: ctx.tenantId, modelId, modelVersion: model.version,
      name, state: 'active', batchMode, createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      endpointUrl: `in-memory://deployment/${id}`,
    };
    this.getOrCreateDeployMap(ctx.tenantId).set(id, deployment);
    return deployment;
  }

  async getDeployment(ctx: RequestContext, deploymentId: string): Promise<ModelDeployment | null> {
    return this.deployments.get(ctx.tenantId)?.get(deploymentId) ?? null;
  }

  async listDeployments(ctx: RequestContext, modelId?: string): Promise<ModelDeployment[]> {
    const tenantDeployments = this.deployments.get(ctx.tenantId);
    if (!tenantDeployments) return [];
    let results = Array.from(tenantDeployments.values());
    if (modelId) results = results.filter(d => d.modelId === modelId);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async stopDeployment(ctx: RequestContext, deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(ctx.tenantId)?.get(deploymentId);
    if (deployment) {
      this.deployments.get(ctx.tenantId)!.set(deploymentId, { ...deployment, state: 'stopped', updatedAt: new Date().toISOString() });
    }
  }

  async infer(ctx: RequestContext, input: InferenceInput): Promise<InferenceResult> {
    const start = Date.now();
    let model = await this.registry.get(ctx, input.modelIdentifier);
    let deploymentId: string | undefined;

    if (!model) {
      const deployments = await this.listDeployments(ctx);
      const dep = deployments.find(d => d.name === input.modelIdentifier && d.state === 'active');
      if (dep) {
        model = await this.registry.get(ctx, dep.modelId);
        deploymentId = dep.id;
      }
    }

    if (!model) throw new Error(`Model not found: ${input.modelIdentifier}`);
    if (model.state !== 'released') throw new Error('Model is not released');

    const outputs = this.executeAdapter(model.adapter, input.inputs);
    const durationMs = Date.now() - start;
    const timestamp = new Date().toISOString();

    const historyRecord: InferenceHistoryRecord = {
      id: randomUUID(), tenantId: ctx.tenantId, modelId: model.id, modelVersion: model.version,
      deploymentId, userId: ctx.actorId ?? 'anonymous', inputs: input.inputs, outputs,
      success: true, durationMs, timestamp,
    };
    this.history.push(historyRecord);

    return { modelId: model.id, modelVersion: model.version, deploymentId, outputs, timestamp, durationMs, success: true };
  }

  async batchInfer(ctx: RequestContext, modelId: string, inputs: Record<string, unknown>[]): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    for (const inp of inputs) {
      try {
        const result = await this.infer(ctx, { modelIdentifier: modelId, inputs: inp });
        results.push(result);
      } catch (err) {
        results.push({
          modelId, modelVersion: 0, outputs: {},
          timestamp: new Date().toISOString(), durationMs: 0, success: false,
          errorMessage: err instanceof Error ? err.message : 'Failed',
        });
      }
    }
    return results;
  }

  async getInferenceHistory(ctx: RequestContext, modelId: string, limit = 100): Promise<InferenceHistoryRecord[]> {
    return this.history
      .filter(h => h.tenantId === ctx.tenantId && h.modelId === modelId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  private executeAdapter(adapter: ModelAdapter, inputs: Record<string, unknown> | Record<string, unknown>[]): Record<string, unknown> | Record<string, unknown>[] {
    // In-memory mock: echo inputs with a prediction key
    if (Array.isArray(inputs)) {
      return inputs.map(i => ({ ...i, _prediction: 'mock', _adapterType: adapter.type }));
    }
    return { ...inputs, _prediction: 'mock', _adapterType: adapter.type };
  }

  private getOrCreateDeployMap(tenantId: string): Map<string, ModelDeployment> {
    let m = this.deployments.get(tenantId);
    if (!m) { m = new Map(); this.deployments.set(tenantId, m); }
    return m;
  }
}

// ---------------------------------------------------------------------------
// Model chain orchestration
// ---------------------------------------------------------------------------

export class InMemoryModelChainService implements ModelChainService {
  private readonly chains = new Map<string, Map<string, ModelChain>>();
  private readonly inferenceService: InMemoryModelInferenceService;

  constructor(inferenceService: InMemoryModelInferenceService) {
    this.inferenceService = inferenceService;
  }

  async createChain(ctx: RequestContext, input: Omit<ModelChain, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ModelChain> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const chain: ModelChain = {
      ...input, id, tenantId: ctx.tenantId,
      createdAt: now, updatedAt: now, createdBy: ctx.actorId ?? 'system',
    };
    this.getOrCreateMap(ctx.tenantId).set(id, chain);
    return chain;
  }

  async getChain(ctx: RequestContext, chainId: string): Promise<ModelChain | null> {
    return this.chains.get(ctx.tenantId)?.get(chainId) ?? null;
  }

  async listChains(ctx: RequestContext): Promise<ModelChain[]> {
    const tenantChains = this.chains.get(ctx.tenantId);
    if (!tenantChains) return [];
    return Array.from(tenantChains.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async executeChain(ctx: RequestContext, chainId: string, initialInputs: Record<string, unknown>): Promise<ModelChainResult> {
    const chain = this.chains.get(ctx.tenantId)?.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);
    if (chain.state !== 'active') throw new Error('Chain is not active');

    const start = Date.now();
    const stepResults: ModelChainResult['stepResults'] = [];
    let currentOutputs: Record<string, unknown> = initialInputs;
    let success = true;

    for (const step of chain.steps) {
      const stepStart = Date.now();
      try {
        const stepInputs: Record<string, unknown> = {};
        for (const [inputKey, sourceKey] of Object.entries(step.inputMapping)) {
          stepInputs[inputKey] = currentOutputs[sourceKey] ?? initialInputs[sourceKey];
        }
        const result = await this.inferenceService.infer(ctx, { modelIdentifier: step.modelId, inputs: stepInputs });
        const outputs = result.outputs as Record<string, unknown>;
        currentOutputs = { ...currentOutputs, ...outputs };
        stepResults.push({
          stepName: step.name, modelId: step.modelId, success: true,
          outputs, durationMs: Date.now() - stepStart,
        });
      } catch (err) {
        success = false;
        stepResults.push({
          stepName: step.name, modelId: step.modelId, success: false,
          errorMessage: err instanceof Error ? err.message : 'Failed',
          durationMs: Date.now() - stepStart,
        });
        if (step.stopOnFailure) break;
      }
    }

    return {
      chainId, success, stepResults,
      finalOutputs: success ? currentOutputs : undefined,
      totalDurationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }

  async deleteChain(ctx: RequestContext, chainId: string): Promise<void> {
    this.chains.get(ctx.tenantId)?.delete(chainId);
  }

  private getOrCreateMap(tenantId: string): Map<string, ModelChain> {
    let m = this.chains.get(tenantId);
    if (!m) { m = new Map(); this.chains.set(tenantId, m); }
    return m;
  }
}

// ---------------------------------------------------------------------------
// Modeling objectives
// ---------------------------------------------------------------------------

export class InMemoryModelingObjectiveService implements ModelingObjectiveService {
  private readonly objectives = new Map<string, Map<string, ModelingObjective>>();

  async create(ctx: RequestContext, input: Omit<ModelingObjective, 'id' | 'tenantId' | 'state' | 'linkedModelIds' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ModelingObjective> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const objective: ModelingObjective = {
      ...input, id, tenantId: ctx.tenantId, state: 'draft',
      linkedModelIds: [], createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getOrCreateMap(ctx.tenantId).set(id, objective);
    return objective;
  }

  async get(ctx: RequestContext, objectiveId: string): Promise<ModelingObjective | null> {
    return this.objectives.get(ctx.tenantId)?.get(objectiveId) ?? null;
  }

  async list(ctx: RequestContext): Promise<ModelingObjective[]> {
    const tenantObjectives = this.objectives.get(ctx.tenantId);
    if (!tenantObjectives) return [];
    return Array.from(tenantObjectives.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async submitForReview(ctx: RequestContext, objectiveId: string): Promise<ModelingObjective> {
    return this.transition(ctx, objectiveId, 'draft', 'in_review');
  }

  async approve(ctx: RequestContext, objectiveId: string, reviewerId: string, comments?: string): Promise<ModelingObjective> {
    const obj = await this.transition(ctx, objectiveId, 'in_review', 'approved');
    const updated = { ...obj, reviewerId, reviewComments: comments, reviewedAt: new Date().toISOString() };
    this.objectives.get(ctx.tenantId)!.set(objectiveId, updated);
    return updated;
  }

  async reject(ctx: RequestContext, objectiveId: string, reviewerId: string, comments: string): Promise<ModelingObjective> {
    const obj = await this.transition(ctx, objectiveId, 'in_review', 'rejected');
    const updated = { ...obj, reviewerId, reviewComments: comments, reviewedAt: new Date().toISOString() };
    this.objectives.get(ctx.tenantId)!.set(objectiveId, updated);
    return updated;
  }

  async complete(ctx: RequestContext, objectiveId: string, currentValue: number): Promise<ModelingObjective> {
    const obj = this.objectives.get(ctx.tenantId)?.get(objectiveId);
    if (!obj) throw new Error(`Objective not found: ${objectiveId}`);
    const updated: ModelingObjective = { ...obj, state: 'completed', currentValue, updatedAt: new Date().toISOString() };
    this.objectives.get(ctx.tenantId)!.set(objectiveId, updated);
    return updated;
  }

  async linkModel(ctx: RequestContext, objectiveId: string, modelId: string): Promise<void> {
    const obj = this.objectives.get(ctx.tenantId)?.get(objectiveId);
    if (!obj) throw new Error(`Objective not found: ${objectiveId}`);
    if (!obj.linkedModelIds.includes(modelId)) {
      obj.linkedModelIds.push(modelId);
      this.objectives.get(ctx.tenantId)!.set(objectiveId, { ...obj, updatedAt: new Date().toISOString() });
    }
  }

  private async transition(ctx: RequestContext, id: string, expected: ModelingObjective['state'], next: ModelingObjective['state']): Promise<ModelingObjective> {
    const obj = this.objectives.get(ctx.tenantId)?.get(id);
    if (!obj) throw new Error(`Objective not found: ${id}`);
    if (obj.state !== expected) throw new Error(`Cannot transition from ${obj.state} to ${next}`);
    const updated: ModelingObjective = { ...obj, state: next, updatedAt: new Date().toISOString() };
    this.objectives.get(ctx.tenantId)!.set(id, updated);
    return updated;
  }

  private getOrCreateMap(tenantId: string): Map<string, ModelingObjective> {
    let m = this.objectives.get(tenantId);
    if (!m) { m = new Map(); this.objectives.set(tenantId, m); }
    return m;
  }
}
