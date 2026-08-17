/**
 * Agent evaluation framework (AIP Evals).
 *
 * Provides:
 *   - Evaluation suites (collections of test cases for an agent)
 *   - Test cases with expected outcomes
 *   - Automated evaluation against agent responses
 *   - Scoring with multiple metrics (accuracy, tool selection, safety, latency)
 *   - Evaluation runs and history
 *   - Model evaluations (compare models/agents on the same suite)
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Evaluation types
// ===========================================================================

/** The type of evaluation metric. */
export type MetricType =
  | 'exact_match'      // response exactly matches expected
  | 'contains'         // response contains expected substring
  | 'json_path'        // response JSON path matches expected value
  | 'tool_selection'   // correct tools were selected
  | 'safety'           // response passes safety checks
  | 'latency'          // response time within threshold
  | 'custom';          // custom scoring function

/** A scoring metric. */
export interface EvalMetric {
  name: string;
  type: MetricType;
  /** Expected value (for exact_match, contains). */
  expected?: string;
  /** JSON path (for json_path). */
  jsonPath?: string;
  /** Expected JSON path value. */
  expectedValue?: unknown;
  /** Expected tools (for tool_selection). */
  expectedTools?: string[];
  /** Max latency in ms (for latency). */
  maxLatencyMs?: number;
  /** Weight (for weighted scoring). */
  weight?: number;
}

/** A test case in an evaluation suite. */
export interface EvalTestCase {
  id: string;
  name: string;
  description: string;
  /** The input prompt or task. */
  input: string;
  /** Context/conversation history (optional). */
  context?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Expected tools to be called. */
  expectedTools?: string[];
  /** Metrics to evaluate against. */
  metrics: EvalMetric[];
  /** Tags for categorization. */
  tags: string[];
}

/** An evaluation suite — a collection of test cases. */
export interface EvalSuite {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** The agent/model being evaluated. */
  agentIdentifier: string;
  /** Test cases. */
  testCases: EvalTestCase[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  createdBy: string;
  /** Tags. */
  tags: string[];
}

/** The result of evaluating a single test case. */
export interface TestCaseResult {
  testCaseId: string;
  testCaseName: string;
  /** The agent's response. */
  response: string;
  /** Tools called by the agent. */
  toolsCalled: string[];
  /** Per-metric scores. */
  metricScores: Array<{
    metricName: string;
    metricType: MetricType;
    passed: boolean;
    score: number;
    details?: string;
  }>;
  /** Overall score (0-1). */
  overallScore: number;
  /** Whether all metrics passed. */
  passed: boolean;
  /** Latency in ms. */
  latencyMs: number;
  /** Error message (if the test case errored). */
  errorMessage?: string;
}

/** The result of an evaluation run. */
export interface EvalRunResult {
  id: string;
  tenantId: string;
  suiteId: string;
  /** Agent/model identifier. */
  agentIdentifier: string;
  /** Per-test-case results. */
  results: TestCaseResult[];
  /** Overall score (average of test case scores). */
  overallScore: number;
  /** Number of test cases passed. */
  passedCount: number;
  /** Total test cases. */
  totalCount: number;
  /** Average latency in ms. */
  avgLatencyMs: number;
  /** ISO 8601 execution timestamp. */
  executedAt: string;
  /** Duration in ms. */
  durationMs: number;
  /** Run status. */
  status: 'running' | 'completed' | 'failed';
}

/** Input for creating an evaluation suite. */
export interface CreateEvalSuiteInput {
  name: string;
  description: string;
  agentIdentifier: string;
  testCases: Array<Omit<EvalTestCase, 'id'>>;
  tags?: string[];
}

/** A function that executes an agent and returns its response. */
export interface AgentExecutor {
  /** Execute the agent with the given input and return its response. */
  execute(input: string, context?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<{
    response: string;
    toolsCalled: string[];
    latencyMs: number;
  }>;
}

// ===========================================================================
// Service interface
// ===========================================================================

/**
 * Agent evaluation service — manages eval suites and runs evaluations.
 */
export interface AgentEvaluationService {
  // ── Suites ──
  createSuite(ctx: RequestContext, input: CreateEvalSuiteInput): Promise<EvalSuite>;
  getSuite(ctx: RequestContext, suiteId: string): Promise<EvalSuite | null>;
  listSuites(ctx: RequestContext, agentIdentifier?: string): Promise<EvalSuite[]>;
  updateSuite(ctx: RequestContext, suiteId: string, updates: Partial<CreateEvalSuiteInput>): Promise<EvalSuite>;
  deleteSuite(ctx: RequestContext, suiteId: string): Promise<void>;

  // ── Runs ──
  /** Run an evaluation suite against an agent executor. */
  runEvaluation(ctx: RequestContext, suiteId: string, executor: AgentExecutor): Promise<EvalRunResult>;
  /** Get a run result by ID. */
  getRunResult(ctx: RequestContext, runId: string): Promise<EvalRunResult | null>;
  /** List run results for a suite. */
  listRunResults(ctx: RequestContext, suiteId: string, limit?: number): Promise<EvalRunResult[]>;
  /** Compare run results between two agents. */
  compareRuns(ctx: RequestContext, runIdA: string, runIdB: string): Promise<{
    runA: EvalRunResult;
    runB: EvalRunResult;
    scoreDifference: number;
    perTestCase: Array<{ testCaseId: string; scoreA: number; scoreB: number; delta: number }>;
  }>;
}
