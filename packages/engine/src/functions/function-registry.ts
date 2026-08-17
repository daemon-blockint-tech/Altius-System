/**
 * FunctionRegistry — manages the lifecycle of user-authored functions.
 *
 * A FunctionRevision is a versioned snapshot of a function's code. The
 * registry tracks:
 *   - Draft → Published status transitions
 *   - Test execution (run against test inputs without deploying)
 *   - Version history (each publish creates a new revision)
 *
 * This sits above the FunctionExecutor, which handles the actual code
 * execution. The registry manages WHICH code runs, not HOW.
 */
import { randomUUID } from 'node:crypto';

/** Status of a function revision. */
export type FunctionRevisionStatus = 'draft' | 'published' | 'deprecated';

/** A versioned snapshot of a function's code. */
export interface FunctionRevision {
  id: string;
  /** Function name (matches the ODL FunctionType name). */
  functionName: string;
  /** Revision number (1-based, increments on each publish). */
  revision: number;
  /** Status of this revision. */
  status: FunctionRevisionStatus;
  /** Runtime name (e.g. 'node', 'node-isolated', 'cel'). */
  runtime: string;
  /** Entry path relative to the pack directory. */
  entry: string;
  /** Source code (for node runtimes, the JS/TS source). */
  source?: string;
  /** Test inputs for validation. */
  testInputs?: Record<string, unknown>[];
  /** Expected test outputs (for regression checks). */
  expectedOutputs?: unknown[];
  /** Tenant this function belongs to. */
  tenantId: string;
  /** User who created this revision. */
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
}

/** Input for creating a new function revision. */
export interface CreateFunctionRevisionInput {
  functionName: string;
  runtime: string;
  entry: string;
  source?: string;
  testInputs?: Record<string, unknown>[];
  expectedOutputs?: unknown[];
  tenantId: string;
  createdBy: string;
}

/** Result of a test run. */
export interface TestRunResult {
  passed: boolean;
  results: Array<{
    input: Record<string, unknown>;
    output: unknown;
    expected?: unknown;
    durationMs: number;
    passed: boolean;
    error?: string;
  }>;
}

/**
 * In-memory function registry. A production implementation would use
 * a database-backed store.
 */
export class FunctionRegistry {
  private readonly revisions = new Map<string, FunctionRevision>();
  private readonly byFunction = new Map<string, FunctionRevision[]>();
  private readonly activeRevision = new Map<string, string>(); // functionName → revisionId

  /**
   * Create a new draft revision of a function.
   */
  createDraft(input: CreateFunctionRevisionInput): FunctionRevision {
    const id = randomUUID();
    const existing = this.byFunction.get(input.functionName) ?? [];
    const revision = existing.length > 0 ? Math.max(...existing.map((r) => r.revision)) + 1 : 1;
    const draft: FunctionRevision = {
      id,
      functionName: input.functionName,
      revision,
      status: 'draft',
      runtime: input.runtime,
      entry: input.entry,
      source: input.source,
      testInputs: input.testInputs,
      expectedOutputs: input.expectedOutputs,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.revisions.set(id, draft);
    this.byFunction.set(input.functionName, [...existing, draft]);
    return { ...draft };
  }

  /**
   * Get a specific revision.
   */
  getRevision(id: string): FunctionRevision | null {
    const r = this.revisions.get(id);
    return r ? { ...r } : null;
  }

  /**
   * List all revisions of a function.
   */
  listRevisions(functionName: string): FunctionRevision[] {
    return (this.byFunction.get(functionName) ?? []).map((r) => ({ ...r }));
  }

  /**
   * Get the currently active (published) revision of a function.
   */
  getActiveRevision(functionName: string): FunctionRevision | null {
    const id = this.activeRevision.get(functionName);
    if (!id) return null;
    return this.getRevision(id);
  }

  /**
   * Publish a draft revision, making it the active version.
   * Any previously published revision is marked deprecated.
   */
  publish(revisionId: string): FunctionRevision {
    const draft = this.revisions.get(revisionId);
    if (!draft) throw new Error(`Revision ${revisionId} not found`);
    if (draft.status !== 'draft') throw new Error(`Revision ${revisionId} is not a draft (status: ${draft.status})`);

    // Deprecate the previous active revision
    const prevActiveId = this.activeRevision.get(draft.functionName);
    if (prevActiveId) {
      const prev = this.revisions.get(prevActiveId);
      if (prev) {
        prev.status = 'deprecated';
        this.revisions.set(prevActiveId, prev);
      }
    }

    draft.status = 'published';
    draft.publishedAt = new Date().toISOString();
    this.revisions.set(revisionId, draft);
    this.activeRevision.set(draft.functionName, revisionId);

    // Update in the byFunction index
    const all = this.byFunction.get(draft.functionName) ?? [];
    const idx = all.findIndex((r) => r.id === revisionId);
    if (idx >= 0) all[idx] = { ...draft };
    this.byFunction.set(draft.functionName, all);

    return { ...draft };
  }

  /**
   * Roll back to a previous revision by publishing it again as a new revision.
   */
  rollback(functionName: string, toRevisionId: string): FunctionRevision {
    const target = this.revisions.get(toRevisionId);
    if (!target) throw new Error(`Revision ${toRevisionId} not found`);
    if (target.functionName !== functionName) {
      throw new Error(`Revision ${toRevisionId} does not belong to ${functionName}`);
    }
    // Create a new draft from the target, then publish it
    const draft = this.createDraft({
      functionName: target.functionName,
      runtime: target.runtime,
      entry: target.entry,
      source: target.source,
      testInputs: target.testInputs,
      expectedOutputs: target.expectedOutputs,
      tenantId: target.tenantId,
      createdBy: target.createdBy,
    });
    return this.publish(draft.id);
  }

  /**
   * Run test inputs against a revision and compare with expected outputs.
   * The executor is provided by the caller — the registry does not own
   * code execution.
   */
  async runTests(
    revisionId: string,
    executor: (input: Record<string, unknown>) => Promise<unknown>,
  ): Promise<TestRunResult> {
    const revision = this.revisions.get(revisionId);
    if (!revision) throw new Error(`Revision ${revisionId} not found`);
    if (!revision.testInputs || revision.testInputs.length === 0) {
      return { passed: true, results: [] };
    }

    const results: TestRunResult['results'] = [];
    let allPassed = true;

    for (let i = 0; i < revision.testInputs.length; i++) {
      const input = revision.testInputs[i]!;
      const expected = revision.expectedOutputs?.[i];
      const start = Date.now();
      try {
        const output = await executor(input);
        const durationMs = Date.now() - start;
        const passed = expected !== undefined ? JSON.stringify(output) === JSON.stringify(expected) : true;
        if (!passed) allPassed = false;
        results.push({ input, output, expected, durationMs, passed });
      } catch (err) {
        allPassed = false;
        results.push({
          input,
          output: null,
          expected,
          durationMs: Date.now() - start,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { passed: allPassed, results };
  }
}
