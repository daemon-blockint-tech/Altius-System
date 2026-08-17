import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionRegistry } from '../functions/function-registry.js';

describe('FunctionRegistry', () => {
  let registry: FunctionRegistry;

  beforeEach(() => {
    registry = new FunctionRegistry();
  });

  it('creates a draft revision', () => {
    const draft = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      source: 'export default async (x) => x * 2',
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });
    expect(draft.status).toBe('draft');
    expect(draft.revision).toBe(1);
    expect(draft.functionName).toBe('Doubler');
  });

  it('publishes a draft and makes it active', () => {
    const draft = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });
    const published = registry.publish(draft.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeDefined();

    const active = registry.getActiveRevision('Doubler');
    expect(active).not.toBeNull();
    expect(active!.id).toBe(draft.id);
  });

  it('deprecates the previous revision when publishing a new one', () => {
    const v1 = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });
    registry.publish(v1.id);

    const v2 = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      source: 'export default async (x) => x * 3',
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });
    registry.publish(v2.id);

    expect(v2.revision).toBe(2);
    const v1After = registry.getRevision(v1.id);
    expect(v1After!.status).toBe('deprecated');
    const active = registry.getActiveRevision('Doubler');
    expect(active!.id).toBe(v2.id);
  });

  it('lists all revisions of a function', () => {
    const v1 = registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: 't', createdBy: 'u',
    });
    registry.publish(v1.id);
    const v2 = registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: 't', createdBy: 'u',
    });
    registry.publish(v2.id);

    const revisions = registry.listRevisions('Doubler');
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.revision).toBe(1);
    expect(revisions[1]!.revision).toBe(2);
  });

  it('rejects publishing a non-draft revision', () => {
    const draft = registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: 't', createdBy: 'u',
    });
    registry.publish(draft.id);
    expect(() => registry.publish(draft.id)).toThrow(/not a draft/);
  });

  it('runs tests against a revision and compares outputs', async () => {
    const draft = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      testInputs: [{ x: 2 }, { x: 5 }, { x: 0 }],
      expectedOutputs: [4, 10, 0],
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });

    const result = await registry.runTests(draft.id, async (input) => (input['x'] as number) * 2);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]!.output).toBe(4);
    expect(result.results[0]!.passed).toBe(true);
  });

  it('detects test failures', async () => {
    const draft = registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      testInputs: [{ x: 2 }, { x: 5 }],
      expectedOutputs: [4, 999], // second one is wrong
      tenantId: 'tenant-1',
      createdBy: 'user-1',
    });

    const result = await registry.runTests(draft.id, async (input) => (input['x'] as number) * 2);
    expect(result.passed).toBe(false);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[1]!.passed).toBe(false);
  });

  it('rolls back to a previous revision', () => {
    const v1 = registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'e', source: 'v1',
      tenantId: 't', createdBy: 'u',
    });
    registry.publish(v1.id);
    const v2 = registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'e', source: 'v2',
      tenantId: 't', createdBy: 'u',
    });
    registry.publish(v2.id);

    // Roll back to v1
    const v3 = registry.rollback('Doubler', v1.id);
    expect(v3.revision).toBe(3);
    expect(v3.source).toBe('v1'); // restored source
    expect(v3.status).toBe('published');

    const active = registry.getActiveRevision('Doubler');
    expect(active!.id).toBe(v3.id);
    expect(active!.source).toBe('v1');
  });

  it('handles test execution errors', async () => {
    const draft = registry.createDraft({
      functionName: 'Crasher',
      runtime: 'node',
      entry: 'e',
      testInputs: [{ x: 1 }],
      expectedOutputs: [2],
      tenantId: 't', createdBy: 'u',
    });

    const result = await registry.runTests(draft.id, async () => {
      throw new Error('boom');
    });
    expect(result.passed).toBe(false);
    expect(result.results[0]!.error).toBe('boom');
  });
});
