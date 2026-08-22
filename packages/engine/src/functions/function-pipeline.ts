/**
 * FunctionPipeline — automated CI/CD-style workflow for function deployment.
 *
 * Orchestrates the full function lifecycle:
 *   1. Pull source from a Git repository
 *   2. Create a draft revision in the FunctionRegistry
 *   3. Run tests against the draft
 *   4. If tests pass → publish the revision
 *   5. If tests fail → leave as draft, report failure
 *
 * This is the programmatic equivalent of a CI/CD pipeline: it codifies
 * the "test before publish" contract that a human operator would otherwise
 * enforce manually. A deployment can trigger it on a Git webhook, on a
 * schedule, or on demand via the REST/GraphQL API.
 *
 * The pipeline is deliberately synchronous and single-threaded: each
 * stage runs to completion before the next begins. Concurrent pipelines
 * for the same function are the caller's responsibility to prevent
 * (e.g. via a lock or queue).
 */
import type { FunctionRegistry, TestRunResult } from './function-registry.js';
import type { FunctionExecutor } from './function-executor.js';
import type { GitFunctionSource, GitRepoConfig } from './git-function-source.js';
import type { FunctionType } from '@altius/odl';

/** Stages of the pipeline. */
export type PipelineStage =
  | 'source'
  | 'draft'
  | 'test'
  | 'publish'
  | 'done'
  | 'failed';

/** Result of a pipeline run. */
export interface PipelineResult {
  functionName: string;
  stage: PipelineStage;
  success: boolean;
  revisionId?: string;
  commit?: string;
  testResult?: TestRunResult;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

/** Configuration for a pipeline run. */
export interface PipelineConfig {
  /** Function name (must match a FunctionType in the schema). */
  functionName: string;
  /** Runtime name (e.g. 'node', 'python', 'cel'). */
  runtime: string;
  /** Entry path within the repo. */
  entry: string;
  /** Git repository configuration. */
  repo: GitRepoConfig;
  /** Path to the test inputs file within the repo (JSON array). */
  testInputsPath?: string;
  /** Path to the expected outputs file within the repo (JSON array). */
  expectedOutputsPath?: string;
  /** Whether to publish if tests pass. Default: true. */
  publishOnSuccess?: boolean;
}

/**
 * Function deployment pipeline.
 *
 * Requires:
 *   - A GitFunctionSource for pulling source code
 *   - A FunctionRegistry for revision management
 *   - A FunctionExecutor for running tests
 *   - The schema's FunctionType definitions (to find the function)
 */
export class FunctionPipeline {
  constructor(
    private readonly gitSource: GitFunctionSource,
    private readonly registry: FunctionRegistry,
    private readonly executor: FunctionExecutor,
    private readonly schema: { functionTypes: FunctionType[] },
  ) {}

  /**
   * Run the full pipeline for a function.
   *
   * Steps:
   *   1. Pull source from Git
   *   2. Read test inputs/expected outputs from the repo
   *   3. Create a draft revision
   *   4. Run tests
   *   5. Publish if tests pass and publishOnSuccess is true
   */
  async run(config: PipelineConfig): Promise<PipelineResult> {
    const startedAt = new Date();
    const startMs = Date.now();
    const repoId = `pipeline-${config.functionName}`;

    let stage: PipelineStage = 'source';
    let commit: string | undefined;
    let revisionId: string | undefined;
    let testResult: TestRunResult | undefined;

    try {
      // Stage 1: Pull source from Git
      stage = 'source';
      let pullResult;
      try {
        pullResult = await this.gitSource.pull(repoId, config.repo);
      } catch {
        // Not cloned yet — clone first
        pullResult = await this.gitSource.clone(repoId, config.repo);
      }
      commit = pullResult.commit;

      // Stage 2: Read test inputs and expected outputs
      stage = 'draft';
      let testInputs: Record<string, unknown>[] | undefined;
      let expectedOutputs: unknown[] | undefined;
      if (config.testInputsPath) {
        const raw = await this.gitSource.readFile(repoId, config.testInputsPath);
        testInputs = JSON.parse(raw) as Record<string, unknown>[];
      }
      if (config.expectedOutputsPath) {
        const raw = await this.gitSource.readFile(repoId, config.expectedOutputsPath);
        expectedOutputs = JSON.parse(raw) as unknown[];
      }

      // Read the function source
      const source = await this.gitSource.readFile(repoId, config.entry);

      // Create a draft revision
      const rev = await this.registry.createDraft({
        functionName: config.functionName,
        runtime: config.runtime,
        entry: config.entry,
        source,
        testInputs,
        expectedOutputs,
        tenantId: 'pipeline', // pipeline runs under a system tenant
        createdBy: 'function-pipeline',
      });
      revisionId = rev.id;

      // Stage 3: Run tests
      stage = 'test';
      const fnType = this.schema.functionTypes.find((f) => f.name === config.functionName);
      if (!fnType) {
        throw new Error(`FunctionType ${config.functionName} not found in schema`);
      }

      testResult = await this.registry.runTests('pipeline', rev.id, async (input) => {
        const execResult = await this.executor.execute(config.functionName, input);
        return execResult.result;
      });

      if (!testResult.passed) {
        return {
          functionName: config.functionName,
          stage: 'test',
          success: false,
          revisionId,
          commit,
          testResult,
          error: 'Tests failed — revision left as draft',
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
        };
      }

      // Stage 4: Publish
      if (config.publishOnSuccess !== false) {
        stage = 'publish';
        const published = await this.registry.publish('pipeline', rev.id);
        revisionId = published.id;
      }

      stage = 'done';
      return {
        functionName: config.functionName,
        stage,
        success: true,
        revisionId,
        commit,
        testResult,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        functionName: config.functionName,
        stage: stage as PipelineStage,
        success: false,
        revisionId,
        commit,
        testResult,
        error: err instanceof Error ? err.message : String(err),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };
    }
  }
}
