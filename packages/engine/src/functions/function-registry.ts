/**
 * FunctionRegistry — manages the lifecycle of user-authored functions.
 *
 * A FunctionRevision is a versioned snapshot of a function's code. The registry
 * owns the transition logic (draft → published → deprecated, revision numbering,
 * rollback, test execution); persistence is delegated to a FunctionRevisionStore
 * (durable when Postgres-backed) so revisions survive restart and are shared
 * across replicas. It sits above the FunctionExecutor, which runs the code —
 * the registry manages WHICH code is live, not HOW it runs.
 */
import { randomUUID } from 'node:crypto';
import type {
  FunctionRevision,
  FunctionRevisionStatus,
  CreateFunctionRevisionInput,
  FunctionRevisionStore,
} from '@altius/spi';

// Re-exported for back-compat: consumers imported these from @altius/engine.
export type { FunctionRevision, FunctionRevisionStatus, CreateFunctionRevisionInput, FunctionRevisionStore };

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
 * In-memory FunctionRevisionStore. Tenant-scoped, the default when no durable
 * store is wired. Kept here (not in storage-memory) so the engine has a working
 * default without a storage dependency.
 */
export class InMemoryFunctionRevisionStore implements FunctionRevisionStore {
  // key: `${tenantId}:${id}`
  private readonly revisions = new Map<string, FunctionRevision>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  async create(revision: FunctionRevision): Promise<void> {
    this.revisions.set(this.key(revision.tenantId, revision.id), { ...revision });
  }

  async get(tenantId: string, id: string): Promise<FunctionRevision | null> {
    const r = this.revisions.get(this.key(tenantId, id));
    return r ? { ...r } : null;
  }

  async listByFunction(tenantId: string, functionName: string): Promise<FunctionRevision[]> {
    return Array.from(this.revisions.values())
      .filter(r => r.tenantId === tenantId && r.functionName === functionName)
      .sort((a, b) => a.revision - b.revision)
      .map(r => ({ ...r }));
  }

  async getActive(tenantId: string, functionName: string): Promise<FunctionRevision | null> {
    const published = (await this.listByFunction(tenantId, functionName)).filter(r => r.status === 'published');
    return published.length > 0 ? published[published.length - 1]! : null;
  }

  async update(revision: FunctionRevision): Promise<void> {
    this.revisions.set(this.key(revision.tenantId, revision.id), { ...revision });
  }
}

export class FunctionRegistry {
  private readonly store: FunctionRevisionStore;

  constructor(store: FunctionRevisionStore = new InMemoryFunctionRevisionStore()) {
    this.store = store;
  }

  /** Create a new draft revision of a function. */
  async createDraft(input: CreateFunctionRevisionInput): Promise<FunctionRevision> {
    const existing = await this.store.listByFunction(input.tenantId, input.functionName);
    const revision = existing.length > 0 ? Math.max(...existing.map(r => r.revision)) + 1 : 1;
    const draft: FunctionRevision = {
      id: randomUUID(),
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
    await this.store.create(draft);
    return { ...draft };
  }

  /** Get a specific revision. */
  async getRevision(tenantId: string, id: string): Promise<FunctionRevision | null> {
    return this.store.get(tenantId, id);
  }

  /** List all revisions of a function. */
  async listRevisions(tenantId: string, functionName: string): Promise<FunctionRevision[]> {
    return this.store.listByFunction(tenantId, functionName);
  }

  /** Get the currently active (published) revision of a function. */
  async getActiveRevision(tenantId: string, functionName: string): Promise<FunctionRevision | null> {
    return this.store.getActive(tenantId, functionName);
  }

  /**
   * Publish a draft revision, making it the active version. Any previously
   * published revision is marked deprecated.
   */
  async publish(tenantId: string, revisionId: string): Promise<FunctionRevision> {
    const draft = await this.store.get(tenantId, revisionId);
    if (!draft) throw new Error(`Revision ${revisionId} not found`);
    if (draft.status !== 'draft') throw new Error(`Revision ${revisionId} is not a draft (status: ${draft.status})`);

    const prev = await this.store.getActive(tenantId, draft.functionName);
    if (prev && prev.id !== revisionId) {
      await this.store.update({ ...prev, status: 'deprecated' });
    }

    const published: FunctionRevision = { ...draft, status: 'published', publishedAt: new Date().toISOString() };
    await this.store.update(published);
    return { ...published };
  }

  /** Roll back to a previous revision by publishing it again as a new revision. */
  async rollback(tenantId: string, functionName: string, toRevisionId: string): Promise<FunctionRevision> {
    const target = await this.store.get(tenantId, toRevisionId);
    if (!target) throw new Error(`Revision ${toRevisionId} not found`);
    if (target.functionName !== functionName) {
      throw new Error(`Revision ${toRevisionId} does not belong to ${functionName}`);
    }
    const draft = await this.createDraft({
      functionName: target.functionName,
      runtime: target.runtime,
      entry: target.entry,
      source: target.source,
      testInputs: target.testInputs,
      expectedOutputs: target.expectedOutputs,
      tenantId: target.tenantId,
      createdBy: target.createdBy,
    });
    return this.publish(tenantId, draft.id);
  }

  /**
   * Run test inputs against a revision and compare with expected outputs. The
   * executor is provided by the caller — the registry does not own execution.
   */
  async runTests(
    tenantId: string,
    revisionId: string,
    executor: (input: Record<string, unknown>) => Promise<unknown>,
  ): Promise<TestRunResult> {
    const revision = await this.store.get(tenantId, revisionId);
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
        results.push({ input, output: null, expected, durationMs: Date.now() - start, passed: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { passed: allPassed, results };
  }
}
