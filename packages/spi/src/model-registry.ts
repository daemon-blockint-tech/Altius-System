/**
 * ML model registry, lifecycle, and inference.
 *
 * Provides:
 *   - Model asset registry with version history, adapters, and permissioning
 *   - Model lifecycle (draft → review → released → deprecated → archived)
 *   - Modeling Objectives review/release workflow
 *   - Model inference execution (live deployments, batch inference, history)
 *   - Chained model orchestration (auto-propagate outputs as next model's inputs)
 */

import type { RequestContext } from './ontology.js';

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

/** The source of a model artifact. */
export type ModelSource =
  | 'in-platform-training'  // trained within Altius
  | 'uploaded-file'         // uploaded model file
  | 'container'             // container image
  | 'external-host';        // hosted externally (REST endpoint)

/** The lifecycle state of a model. */
export type ModelLifecycleState =
  | 'draft'
  | 'in_review'
  | 'released'
  | 'deprecated'
  | 'archived';

/** A model adapter — defines how to invoke a model. */
export interface ModelAdapter {
  /** Adapter type (e.g. 'rest', 'container', 'onnx', 'tensorflow'). */
  type: string;
  /** Endpoint URL (for REST/external). */
  endpoint?: string;
  /** Container image (for container-based). */
  containerImage?: string;
  /** Input schema (JSON Schema). */
  inputSchema: Record<string, unknown>;
  /** Output schema (JSON Schema). */
  outputSchema: Record<string, unknown>;
  /** Adapter-specific configuration. */
  config?: Record<string, unknown>;
}

/** A model artifact in the registry. */
export interface ModelArtifact {
  /** Model ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** Model name. */
  name: string;
  /** Display name. */
  displayName: string;
  /** Description. */
  description: string;
  /** Model source. */
  source: ModelSource;
  /** Model adapter. */
  adapter: ModelAdapter;
  /** Current lifecycle state. */
  state: ModelLifecycleState;
  /** Version number (incremented on each release). */
  version: number;
  /** Tags for categorization. */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the model. */
  createdBy: string;
  /** Who released the model (if released). */
  releasedBy?: string;
  /** ISO 8601 release timestamp. */
  releasedAt?: string;
  /** Lineage — IDs of models whose outputs were inputs to this model. */
  upstreamModelIds: string[];
  /** Modeling Objective ID (if linked). */
  modelingObjectiveId?: string;
}

/** A modeling objective — defines the goal and review process for a model. */
export interface ModelingObjective {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  /** Target metric (e.g. 'accuracy', 'f1', 'rmse'). */
  targetMetric: string;
  /** Target value. */
  targetValue: number;
  /** Current best value. */
  currentValue?: number;
  state: 'draft' | 'in_review' | 'approved' | 'rejected' | 'completed';
  linkedModelIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewerId?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

/** Input for creating a model. */
export interface CreateModelInput {
  name: string;
  displayName: string;
  description: string;
  source: ModelSource;
  adapter: ModelAdapter;
  tags?: string[];
  upstreamModelIds?: string[];
  modelingObjectiveId?: string;
}

/** Query for models. */
export interface ModelQuery {
  state?: ModelLifecycleState;
  source?: ModelSource;
  tags?: string[];
  name?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Model inference
// ---------------------------------------------------------------------------

/** A model deployment — a released model available for inference. */
export interface ModelDeployment {
  id: string;
  tenantId: string;
  modelId: string;
  modelVersion: number;
  /** Deployment name. */
  name: string;
  /** Deployment state. */
  state: 'pending' | 'active' | 'stopped' | 'failed';
  /** Whether this is a batch deployment. */
  batchMode: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  createdBy: string;
  /** Endpoint URL (if active). */
  endpointUrl?: string;
  /** Error message (if failed). */
  errorMessage?: string;
}

/** An inference request input. */
export interface InferenceInput {
  /** Model ID or deployment name. */
  modelIdentifier: string;
  /** Input data matching the model's input schema. */
  inputs: Record<string, unknown> | Record<string, unknown>[];
}

/** An inference result. */
export interface InferenceResult {
  modelId: string;
  modelVersion: number;
  deploymentId?: string;
  /** Output data matching the model's output schema. */
  outputs: Record<string, unknown> | Record<string, unknown>[];
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Whether inference succeeded. */
  success: boolean;
  errorMessage?: string;
}

/** An inference history record. */
export interface InferenceHistoryRecord {
  id: string;
  tenantId: string;
  modelId: string;
  modelVersion: number;
  deploymentId?: string;
  userId: string;
  inputs: Record<string, unknown> | Record<string, unknown>[];
  outputs: Record<string, unknown> | Record<string, unknown>[];
  success: boolean;
  durationMs: number;
  timestamp: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Chained model orchestration
// ---------------------------------------------------------------------------

/** A step in a model chain. */
export interface ModelChainStep {
  /** Step name. */
  name: string;
  /** Model ID to execute. */
  modelId: string;
  /** Input mapping — how to map previous step outputs to this step's inputs. */
  inputMapping: Record<string, string>;
  /** Whether to stop if this step fails. */
  stopOnFailure: boolean;
}

/** A model chain — orchestrates multiple models in sequence. */
export interface ModelChain {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  steps: ModelChainStep[];
  state: 'draft' | 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Result of a model chain execution. */
export interface ModelChainResult {
  chainId: string;
  success: boolean;
  /** Per-step results. */
  stepResults: Array<{
    stepName: string;
    modelId: string;
    success: boolean;
    outputs?: Record<string, unknown> | Record<string, unknown>[];
    errorMessage?: string;
    durationMs: number;
  }>;
  /** Final outputs (from the last successful step). */
  finalOutputs?: Record<string, unknown> | Record<string, unknown>[];
  totalDurationMs: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Service interfaces
// ---------------------------------------------------------------------------

/**
 * Model registry service — manages model artifacts and their lifecycle.
 */
export interface ModelRegistryService {
  create(ctx: RequestContext, input: CreateModelInput): Promise<ModelArtifact>;
  get(ctx: RequestContext, modelId: string): Promise<ModelArtifact | null>;
  list(ctx: RequestContext, query?: ModelQuery): Promise<{ models: ModelArtifact[]; totalCount: number }>;
  update(ctx: RequestContext, modelId: string, updates: Partial<CreateModelInput>): Promise<ModelArtifact>;
  submitForReview(ctx: RequestContext, modelId: string): Promise<ModelArtifact>;
  release(ctx: RequestContext, modelId: string): Promise<ModelArtifact>;
  deprecate(ctx: RequestContext, modelId: string): Promise<ModelArtifact>;
  archive(ctx: RequestContext, modelId: string): Promise<ModelArtifact>;
  getVersionHistory(ctx: RequestContext, modelId: string): Promise<ModelArtifact[]>;
  getLineage(ctx: RequestContext, modelId: string): Promise<{ upstream: ModelArtifact[]; downstream: ModelArtifact[] }>;
}

/**
 * Model inference service — executes model inference and manages deployments.
 */
export interface ModelInferenceService {
  deploy(ctx: RequestContext, modelId: string, name: string, batchMode?: boolean): Promise<ModelDeployment>;
  getDeployment(ctx: RequestContext, deploymentId: string): Promise<ModelDeployment | null>;
  listDeployments(ctx: RequestContext, modelId?: string): Promise<ModelDeployment[]>;
  stopDeployment(ctx: RequestContext, deploymentId: string): Promise<void>;
  infer(ctx: RequestContext, input: InferenceInput): Promise<InferenceResult>;
  batchInfer(ctx: RequestContext, modelId: string, inputs: Record<string, unknown>[]): Promise<InferenceResult[]>;
  getInferenceHistory(ctx: RequestContext, modelId: string, limit?: number): Promise<InferenceHistoryRecord[]>;
}

/**
 * Model chain orchestration service.
 */
export interface ModelChainService {
  createChain(ctx: RequestContext, input: Omit<ModelChain, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ModelChain>;
  getChain(ctx: RequestContext, chainId: string): Promise<ModelChain | null>;
  listChains(ctx: RequestContext): Promise<ModelChain[]>;
  executeChain(ctx: RequestContext, chainId: string, initialInputs: Record<string, unknown>): Promise<ModelChainResult>;
  deleteChain(ctx: RequestContext, chainId: string): Promise<void>;
}

/**
 * Modeling objective service — manages the review/release workflow for model goals.
 */
export interface ModelingObjectiveService {
  create(ctx: RequestContext, input: Omit<ModelingObjective, 'id' | 'tenantId' | 'state' | 'linkedModelIds' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ModelingObjective>;
  get(ctx: RequestContext, objectiveId: string): Promise<ModelingObjective | null>;
  list(ctx: RequestContext): Promise<ModelingObjective[]>;
  submitForReview(ctx: RequestContext, objectiveId: string): Promise<ModelingObjective>;
  approve(ctx: RequestContext, objectiveId: string, reviewerId: string, comments?: string): Promise<ModelingObjective>;
  reject(ctx: RequestContext, objectiveId: string, reviewerId: string, comments: string): Promise<ModelingObjective>;
  complete(ctx: RequestContext, objectiveId: string, currentValue: number): Promise<ModelingObjective>;
  linkModel(ctx: RequestContext, objectiveId: string, modelId: string): Promise<void>;
}
