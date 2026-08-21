import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionRegistry } from '../functions/function-registry.js';

const T = 'tenant-1';

describe('FunctionRegistry', () => {
  let registry: FunctionRegistry;

  beforeEach(() => {
    registry = new FunctionRegistry();
  });

  it('creates a draft revision', async () => {
    const draft = await registry.createDraft({
      functionName: 'Doubler',
      runtime: 'node',
      entry: 'functions/double.mjs',
      source: 'export default async (x) => x * 2',
      tenantId: T,
      createdBy: 'user-1',
    });
    expect(draft.status).toBe('draft');
    expect(draft.revision).toBe(1);
    expect(draft.functionName).toBe('Doubler');
  });

  it('publishes a draft and makes it active', async () => {
    const draft = await registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'functions/double.mjs', tenantId: T, createdBy: 'user-1',
    });
    const published = await registry.publish(T, draft.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeDefined();

    const active = await registry.getActiveRevision(T, 'Doubler');
    expect(active).not.toBeNull();
    expect(active!.id).toBe(draft.id);
  });

  it('deprecates the previous revision when publishing a new one', async () => {
    const v1 = await registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'functions/double.mjs', tenantId: T, createdBy: 'user-1',
    });
    await registry.publish(T, v1.id);

    const v2 = await registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'functions/double.mjs', source: 'export default async (x) => x * 3', tenantId: T, createdBy: 'user-1',
    });
    await registry.publish(T, v2.id);

    expect(v2.revision).toBe(2);
    const v1After = await registry.getRevision(T, v1.id);
    expect(v1After!.status).toBe('deprecated');
    const active = await registry.getActiveRevision(T, 'Doubler');
    expect(active!.id).toBe(v2.id);
  });

  it('lists all revisions of a function', async () => {
    const v1 = await registry.createDraft({ functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: T, createdBy: 'u' });
    await registry.publish(T, v1.id);
    const v2 = await registry.createDraft({ functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: T, createdBy: 'u' });
    await registry.publish(T, v2.id);

    const revisions = await registry.listRevisions(T, 'Doubler');
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.revision).toBe(1);
    expect(revisions[1]!.revision).toBe(2);
  });

  it('rejects publishing a non-draft revision', async () => {
    const draft = await registry.createDraft({ functionName: 'Doubler', runtime: 'node', entry: 'e', tenantId: T, createdBy: 'u' });
    await registry.publish(T, draft.id);
    await expect(registry.publish(T, draft.id)).rejects.toThrow(/not a draft/);
  });

  it('runs tests against a revision and compares outputs', async () => {
    const draft = await registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'functions/double.mjs',
      testInputs: [{ x: 2 }, { x: 5 }, { x: 0 }], expectedOutputs: [4, 10, 0], tenantId: T, createdBy: 'user-1',
    });
    const result = await registry.runTests(T, draft.id, async (input) => (input['x'] as number) * 2);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]!.output).toBe(4);
    expect(result.results[0]!.passed).toBe(true);
  });

  it('detects test failures', async () => {
    const draft = await registry.createDraft({
      functionName: 'Doubler', runtime: 'node', entry: 'functions/double.mjs',
      testInputs: [{ x: 2 }, { x: 5 }], expectedOutputs: [4, 999], tenantId: T, createdBy: 'user-1',
    });
    const result = await registry.runTests(T, draft.id, async (input) => (input['x'] as number) * 2);
    expect(result.passed).toBe(false);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[1]!.passed).toBe(false);
  });

  it('rolls back to a previous revision', async () => {
    const v1 = await registry.createDraft({ functionName: 'Doubler', runtime: 'node', entry: 'e', source: 'v1', tenantId: T, createdBy: 'u' });
    await registry.publish(T, v1.id);
    const v2 = await registry.createDraft({ functionName: 'Doubler', runtime: 'node', entry: 'e', source: 'v2', tenantId: T, createdBy: 'u' });
    await registry.publish(T, v2.id);

    const v3 = await registry.rollback(T, 'Doubler', v1.id);
    expect(v3.revision).toBe(3);
    expect(v3.source).toBe('v1'); // restored source
    expect(v3.status).toBe('published');

    const active = await registry.getActiveRevision(T, 'Doubler');
    expect(active!.id).toBe(v3.id);
    expect(active!.source).toBe('v1');
  });

  it('handles test execution errors', async () => {
    const draft = await registry.createDraft({
      functionName: 'Crasher', runtime: 'node', entry: 'e', testInputs: [{ x: 1 }], expectedOutputs: [2], tenantId: T, createdBy: 'u',
    });
    const result = await registry.runTests(T, draft.id, async () => { throw new Error('boom'); });
    expect(result.passed).toBe(false);
    expect(result.results[0]!.error).toBe('boom');
  });

  it('isolates revisions of the same function name across tenants', async () => {
    // Two tenants author a function of the same name — they must not collide
    // (the pre-fix registry keyed by name alone, so tenant B saw tenant A's).
    const a = await registry.createDraft({ functionName: 'Score', runtime: 'cel', entry: '1', tenantId: 'tenant-a', createdBy: 'ua' });
    await registry.publish('tenant-a', a.id);
    const b = await registry.createDraft({ functionName: 'Score', runtime: 'cel', entry: '2', tenantId: 'tenant-b', createdBy: 'ub' });

    // Tenant B's first draft is revision 1, not 2 — its numbering is independent.
    expect(b.revision).toBe(1);
    // Tenant B cannot see tenant A's revision, and vice versa.
    expect(await registry.getRevision('tenant-b', a.id)).toBeNull();
    expect(await registry.getActiveRevision('tenant-b', 'Score')).toBeNull();
    expect((await registry.getActiveRevision('tenant-a', 'Score'))!.id).toBe(a.id);
    expect(await registry.listRevisions('tenant-b', 'Score')).toHaveLength(1);
  });
});
