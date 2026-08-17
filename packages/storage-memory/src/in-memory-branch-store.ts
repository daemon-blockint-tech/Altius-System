/**
 * In-memory branch store for development and testing.
 *
 * Manages branch metadata and merge proposals. The actual branch-aware
 * data isolation is handled by the storage provider (which reads
 * `ctx.branch`). This store tracks the lifecycle.
 */

import { randomUUID } from 'node:crypto';
import type { BranchStore, Branch, MergeProposal, MergeResult } from '@altius/spi';

export class InMemoryBranchStore implements BranchStore {
  private readonly branches = new Map<string, Map<string, Branch>>();
  private readonly proposals = new Map<string, Map<string, MergeProposal>>();

  async createBranch(branch: Omit<Branch, 'createdAt' | 'status'> & { status?: Branch['status'] }): Promise<Branch> {
    const tenantBranches = this.getOrCreate(this.branches, branch.tenantId);
    if (tenantBranches.has(branch.name)) {
      throw new Error(`Branch "${branch.name}" already exists in tenant "${branch.tenantId}"`);
    }
    // Verify parent exists (unless creating 'main')
    if (branch.name !== 'main' && branch.parent !== 'main') {
      const parent = tenantBranches.get(branch.parent);
      if (!parent) {
        throw new Error(`Parent branch "${branch.parent}" does not exist`);
      }
    }
    const created: Branch = {
      ...branch,
      status: branch.status ?? 'open',
      createdAt: new Date().toISOString(),
    };
    tenantBranches.set(branch.name, created);
    return created;
  }

  async getBranch(tenantId: string, name: string): Promise<Branch | null> {
    return this.branches.get(tenantId)?.get(name) ?? null;
  }

  async listBranches(tenantId: string): Promise<Branch[]> {
    const tenantBranches = this.branches.get(tenantId);
    if (!tenantBranches) return [];
    return Array.from(tenantBranches.values());
  }

  async abandonBranch(tenantId: string, name: string): Promise<void> {
    const tenantBranches = this.branches.get(tenantId);
    if (!tenantBranches) return;
    const branch = tenantBranches.get(name);
    if (branch) {
      tenantBranches.set(name, { ...branch, status: 'abandoned' });
    }
  }

  async mergeBranch(tenantId: string, branchName: string, _actorId?: string): Promise<MergeResult> {
    const tenantBranches = this.branches.get(tenantId);
    if (!tenantBranches) {
      return { objectsMerged: 0, linksMerged: 0, success: false, error: 'Tenant not found' };
    }
    const branch = tenantBranches.get(branchName);
    if (!branch) {
      return { objectsMerged: 0, linksMerged: 0, success: false, error: 'Branch not found' };
    }
    if (branch.status !== 'open') {
      return { objectsMerged: 0, linksMerged: 0, success: false, error: `Branch status is ${branch.status}` };
    }
    // Mark as merged — the actual data merge is handled by the storage provider
    tenantBranches.set(branchName, {
      ...branch,
      status: 'merged',
      mergedAt: new Date().toISOString(),
    });
    // In a real implementation, this would copy branch-local writes to the parent.
    // The in-memory store just marks the branch as merged.
    return { objectsMerged: 0, linksMerged: 0, success: true };
  }

  async createProposal(
    proposal: Omit<MergeProposal, 'id' | 'createdAt' | 'status'> & { status?: MergeProposal['status'] },
  ): Promise<MergeProposal> {
    const id = randomUUID();
    const created: MergeProposal = {
      ...proposal,
      id,
      status: proposal.status ?? 'draft',
      createdAt: new Date().toISOString(),
    };
    const tenantProposals = this.getOrCreate(this.proposals, proposal.tenantId);
    tenantProposals.set(id, created);
    return created;
  }

  async getProposal(tenantId: string, proposalId: string): Promise<MergeProposal | null> {
    return this.proposals.get(tenantId)?.get(proposalId) ?? null;
  }

  async listProposals(tenantId: string, branchName?: string): Promise<MergeProposal[]> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) return [];
    const all = Array.from(tenantProposals.values());
    if (branchName) {
      return all.filter(p => p.branchName === branchName);
    }
    return all;
  }

  async submitProposal(tenantId: string, proposalId: string): Promise<void> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) throw new Error('Proposal not found');
    const proposal = tenantProposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'draft') throw new Error(`Proposal status is ${proposal.status}`);
    tenantProposals.set(proposalId, { ...proposal, status: 'submitted' });
  }

  async approveProposal(
    tenantId: string,
    proposalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<MergeResult> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) throw new Error('Proposal not found');
    const proposal = tenantProposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'submitted') throw new Error(`Proposal status is ${proposal.status}`);

    const result = await this.mergeBranch(tenantId, proposal.branchName, reviewerId);

    tenantProposals.set(proposalId, {
      ...proposal,
      status: result.success ? 'merged' : 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewComment: comment,
    });

    return result;
  }

  async rejectProposal(
    tenantId: string,
    proposalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<void> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) throw new Error('Proposal not found');
    const proposal = tenantProposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'submitted') throw new Error(`Proposal status is ${proposal.status}`);
    tenantProposals.set(proposalId, {
      ...proposal,
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewComment: comment,
    });
  }

  private getOrCreate<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
    }
    return m;
  }
}
