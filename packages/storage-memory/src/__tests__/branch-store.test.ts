/**
 * Tests for the InMemoryBranchStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBranchStore } from '../in-memory-branch-store.js';

describe('InMemoryBranchStore', () => {
  let store: InMemoryBranchStore;

  beforeEach(() => {
    store = new InMemoryBranchStore();
  });

  it('creates a branch', async () => {
    const branch = await store.createBranch({
      tenantId: 'test',
      name: 'feature-1',
      parent: 'main',
      createdBy: 'user-1',
    });
    expect(branch.name).toBe('feature-1');
    expect(branch.parent).toBe('main');
    expect(branch.status).toBe('open');
    expect(branch.createdAt).toBeTruthy();
  });

  it('rejects duplicate branch names', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    await expect(
      store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' }),
    ).rejects.toThrow('already exists');
  });

  it('rejects branch with non-existent parent', async () => {
    await expect(
      store.createBranch({ tenantId: 'test', name: 'b2', parent: 'nonexistent' }),
    ).rejects.toThrow('Parent branch');
  });

  it('lists branches', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    await store.createBranch({ tenantId: 'test', name: 'b2', parent: 'main' });
    const branches = await store.listBranches('test');
    expect(branches).toHaveLength(2);
  });

  it('gets a branch by name', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    const branch = await store.getBranch('test', 'b1');
    expect(branch).not.toBeNull();
    expect(branch!.name).toBe('b1');
  });

  it('returns null for non-existent branch', async () => {
    const branch = await store.getBranch('test', 'nonexistent');
    expect(branch).toBeNull();
  });

  it('abandons a branch', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    await store.abandonBranch('test', 'b1');
    const branch = await store.getBranch('test', 'b1');
    expect(branch!.status).toBe('abandoned');
  });

  it('merges a branch', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    const result = await store.mergeBranch('test', 'b1', 'user-1');
    expect(result.success).toBe(true);
    const branch = await store.getBranch('test', 'b1');
    expect(branch!.status).toBe('merged');
    expect(branch!.mergedAt).toBeTruthy();
  });

  it('rejects merge of non-open branch', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    await store.mergeBranch('test', 'b1');
    const result = await store.mergeBranch('test', 'b1');
    expect(result.success).toBe(false);
  });

  it('creates and submits a proposal', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    const proposal = await store.createProposal({
      tenantId: 'test',
      branchName: 'b1',
      targetBranch: 'main',
      createdBy: 'user-1',
      summary: 'Add feature X',
    });
    expect(proposal.status).toBe('draft');

    await store.submitProposal('test', proposal.id);
    const updated = await store.getProposal('test', proposal.id);
    expect(updated!.status).toBe('submitted');
  });

  it('approves a proposal and merges', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    const proposal = await store.createProposal({
      tenantId: 'test',
      branchName: 'b1',
      targetBranch: 'main',
      createdBy: 'user-1',
    });
    await store.submitProposal('test', proposal.id);
    const result = await store.approveProposal('test', proposal.id, 'reviewer-1', 'LGTM');
    expect(result.success).toBe(true);
    const updated = await store.getProposal('test', proposal.id);
    expect(updated!.status).toBe('merged');
    expect(updated!.reviewedBy).toBe('reviewer-1');
    expect(updated!.reviewComment).toBe('LGTM');
  });

  it('rejects a proposal', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    const proposal = await store.createProposal({
      tenantId: 'test',
      branchName: 'b1',
      targetBranch: 'main',
      createdBy: 'user-1',
    });
    await store.submitProposal('test', proposal.id);
    await store.rejectProposal('test', proposal.id, 'reviewer-1', 'No');
    const updated = await store.getProposal('test', proposal.id);
    expect(updated!.status).toBe('rejected');
  });

  it('lists proposals filtered by branch', async () => {
    await store.createBranch({ tenantId: 'test', name: 'b1', parent: 'main' });
    await store.createBranch({ tenantId: 'test', name: 'b2', parent: 'main' });
    await store.createProposal({ tenantId: 'test', branchName: 'b1', targetBranch: 'main' });
    await store.createProposal({ tenantId: 'test', branchName: 'b2', targetBranch: 'main' });

    const all = await store.listProposals('test');
    expect(all).toHaveLength(2);

    const b1Only = await store.listProposals('test', 'b1');
    expect(b1Only).toHaveLength(1);
    expect(b1Only[0]!.branchName).toBe('b1');
  });
});
