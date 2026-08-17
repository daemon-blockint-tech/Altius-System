/**
 * FunctionPipeline tests.
 *
 * Uses a pre-populated directory (no real Git clone) by stubbing
 * the GitFunctionSource methods. Verifies the pipeline orchestrates
 * source → draft → test → publish correctly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionPipeline } from '../functions/function-pipeline.js';
import type { GitFunctionSource } from '../functions/git-function-source.js';
import { FunctionRegistry } from '../functions/function-registry.js';
import type { FunctionExecutor, FunctionExecutionResult } from '../functions/function-executor.js';
import type { FunctionType } from '@altius/odl';

const fnType: FunctionType = {
  kind: 'functionType',
  name: 'Doubler',
  fields: [],
  runtime: 'python',
  entry: 'doubler.py',
  requiredRoles: [],
  directives: [{ kind: 'function', runtime: 'python', entry: 'doubler.py' }],
};

const schema = { functionTypes: [fnType] };

// Stub GitFunctionSource
function makeGitSource(files: Map<string, string>): GitFunctionSource {
  return {
    pull: async () => ({ success: true, commit: 'abc123def456', message: 'Pulled' }),
    clone: async () => ({ success: true, commit: 'abc123def456', message: 'Cloned' }),
    readFile: async (_repoId: string, path: string) => files.get(path) ?? '',
    listFiles: async () => [...files.keys()],
    remove: async () => {},
    getCommitHash: async () => 'abc123def456',
  } as unknown as GitFunctionSource;
}

// Stub FunctionExecutor
function makeExecutor(resultFn: (name: string, inputs: Record<string, unknown>) => unknown): FunctionExecutor {
  return {
    execute: async (name: string, inputs: Record<string, unknown>): Promise<FunctionExecutionResult> => {
      const result = resultFn(name, inputs);
      return {
        result,
        logs: [],
        durationMs: 1,
      } as FunctionExecutionResult;
    },
  } as unknown as FunctionExecutor;
}

describe('FunctionPipeline', () => {
  let registry: FunctionRegistry;

  beforeEach(() => {
    registry = new FunctionRegistry();
  });

  it('runs the full pipeline and publishes when tests pass', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print(json.dumps({"doubled": 42}))'],
      ['tests.json', JSON.stringify([{ x: 21 }])],
      ['expected.json', JSON.stringify([{ doubled: 42 }])],
    ]);
    const gitSource = makeGitSource(files);
    const executor = makeExecutor((_name, inputs) => ({ doubled: (inputs['x'] as number) * 2 }));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'Doubler',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
      testInputsPath: 'tests.json',
      expectedOutputsPath: 'expected.json',
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe('done');
    expect(result.revisionId).toBeDefined();
    expect(result.commit).toBe('abc123def456');
    expect(result.testResult?.passed).toBe(true);
  });

  it('leaves revision as draft when tests fail', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print(json.dumps({"doubled": 999}))'],
      ['tests.json', JSON.stringify([{ x: 21 }])],
      ['expected.json', JSON.stringify([{ doubled: 42 }])],
    ]);
    const gitSource = makeGitSource(files);
    // Executor returns wrong result
    const executor = makeExecutor((_name, _inputs) => ({ doubled: 999 }));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'Doubler',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
      testInputsPath: 'tests.json',
      expectedOutputsPath: 'expected.json',
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe('test');
    expect(result.testResult?.passed).toBe(false);
    expect(result.error).toContain('Tests failed');
  });

  it('does not publish when publishOnSuccess is false', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print(json.dumps({"doubled": 42}))'],
      ['tests.json', JSON.stringify([{ x: 21 }])],
      ['expected.json', JSON.stringify([{ doubled: 42 }])],
    ]);
    const gitSource = makeGitSource(files);
    const executor = makeExecutor((_name, inputs) => ({ doubled: (inputs['x'] as number) * 2 }));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'Doubler',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
      testInputsPath: 'tests.json',
      expectedOutputsPath: 'expected.json',
      publishOnSuccess: false,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe('done');
    // Revision should still be a draft (not published)
    const rev = registry.getRevision(result.revisionId!);
    expect(rev?.status).toBe('draft');
  });

  it('fails gracefully when the function is not in the schema', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print("hello")'],
    ]);
    const gitSource = makeGitSource(files);
    const executor = makeExecutor(() => ({}));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'NonExistent',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in schema');
  });

  it('includes timing information', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print("hello")'],
    ]);
    const gitSource = makeGitSource(files);
    const executor = makeExecutor(() => ({}));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'Doubler',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
  });

  it('works without test inputs (no tests to run)', async () => {
    const files = new Map<string, string>([
      ['doubler.py', 'print("hello")'],
    ]);
    const gitSource = makeGitSource(files);
    const executor = makeExecutor(() => ({}));
    const pipeline = new FunctionPipeline(gitSource, registry, executor, schema);

    const result = await pipeline.run({
      functionName: 'Doubler',
      runtime: 'python',
      entry: 'doubler.py',
      repo: { url: 'https://github.com/org/repo.git' },
    });

    // No test inputs → tests pass vacuously → published
    expect(result.success).toBe(true);
    expect(result.stage).toBe('done');
    expect(result.testResult?.passed).toBe(true);
  });
});
