/**
 * What-if scenario simulation and persistence.
 *
 * Provides:
 *   - Scenario creation with input overrides
 *   - Scenario execution (run model with overrides, compare against baseline)
 *   - Scenario persistence as ontology objects (save/load/share)
 *   - Time series as simulation inputs/outputs (time window selection, smoothing)
 *   - Scenario comparison (what-if vs auto-run baseline)
 */

import type { RequestContext } from './ontology.js';

// ---------------------------------------------------------------------------
// Scenario types
// ---------------------------------------------------------------------------

/** A scenario — a set of input overrides applied to a model or chain. */
export interface Scenario {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** The model or chain ID this scenario applies to. */
  targetId: string;
  /** Whether the target is a model or a chain. */
  targetType: 'model' | 'chain';
  /** Input overrides — values that replace the baseline inputs. */
  inputOverrides: Record<string, unknown>;
  /** Whether this is an auto-run baseline scenario. */
  isBaseline: boolean;
  /** Scenario state. */
  state: 'draft' | 'running' | 'completed' | 'failed';
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the scenario. */
  createdBy: string;
  /** Tags for categorization. */
  tags: string[];
  /** Time window for time-series inputs (optional). */
  timeWindow?: {
    startTime: string;
    endTime: string;
  };
  /** Smoothing configuration for time-series inputs. */
  smoothing?: {
    method: 'none' | 'moving_average' | 'exponential';
    windowSize?: number;
    alpha?: number;
  };
}

/** The result of running a scenario. */
export interface ScenarioResult {
  scenarioId: string;
  /** Whether the run succeeded. */
  success: boolean;
  /** Outputs from the scenario run (with overrides). */
  outputs?: Record<string, unknown>;
  /** Baseline outputs (without overrides). */
  baselineOutputs?: Record<string, unknown>;
  /** Difference between scenario and baseline. */
  diff?: Record<string, { baseline: unknown; scenario: unknown; delta: number | string }>;
  /** ISO 8601 execution timestamp. */
  executedAt: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error message (if failed). */
  errorMessage?: string;
}

/** Input for creating a scenario. */
export interface CreateScenarioInput {
  name: string;
  description: string;
  targetId: string;
  targetType: 'model' | 'chain';
  inputOverrides: Record<string, unknown>;
  isBaseline?: boolean;
  tags?: string[];
  timeWindow?: { startTime: string; endTime: string };
  smoothing?: { method: 'none' | 'moving_average' | 'exponential'; windowSize?: number; alpha?: number };
}

/** Query for scenarios. */
export interface ScenarioQuery {
  targetId?: string;
  targetType?: 'model' | 'chain';
  isBaseline?: boolean;
  state?: Scenario['state'];
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Scenario simulation service — manages what-if scenarios and their execution.
 */
export interface ScenarioService {
  /** Create a new scenario. */
  create(ctx: RequestContext, input: CreateScenarioInput): Promise<Scenario>;

  /** Get a scenario by ID. */
  get(ctx: RequestContext, scenarioId: string): Promise<Scenario | null>;

  /** List scenarios with optional filtering. */
  list(ctx: RequestContext, query?: ScenarioQuery): Promise<{ scenarios: Scenario[]; totalCount: number }>;

  /** Update a scenario's overrides. */
  update(ctx: RequestContext, scenarioId: string, updates: Partial<CreateScenarioInput>): Promise<Scenario>;

  /** Delete a scenario. */
  delete(ctx: RequestContext, scenarioId: string): Promise<void>;

  /** Run a scenario — execute the target with overrides and compare against baseline. */
  run(ctx: RequestContext, scenarioId: string): Promise<ScenarioResult>;

  /** Compare two scenarios. */
  compare(ctx: RequestContext, scenarioIdA: string, scenarioIdB: string): Promise<{
    scenarioA: Scenario;
    scenarioB: Scenario;
    outputDiff: Record<string, { a: unknown; b: unknown; delta: number | string }>;
  }>;

  /** Get results for a scenario. */
  getResults(ctx: RequestContext, scenarioId: string): Promise<ScenarioResult[]>;

  /** Duplicate a scenario (create a copy with a new name). */
  duplicate(ctx: RequestContext, scenarioId: string, newName: string): Promise<Scenario>;
}
