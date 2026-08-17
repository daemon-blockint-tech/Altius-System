/**
 * In-memory change proposal store.
 */

import { randomUUID } from 'node:crypto';
import type {
  ChangeProposalStore,
  ChangeProposal,
  CreateProposalInput,
  UpdateProposalInput,
  ProposalQuery,
} from '@altius/spi';

export class InMemoryChangeProposalStore implements ChangeProposalStore {
  private readonly proposals = new Map<string, Map<string, ChangeProposal>>();

  async create(tenantId: string, submittedBy: string, input: CreateProposalInput): Promise<ChangeProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const proposal: ChangeProposal = {
      id,
      tenantId,
      title: input.title,
      description: input.description,
      type: input.type,
      changes: input.changes,
      state: 'draft',
      submittedBy,
      submittedByAI: input.submittedByAI ?? false,
      createdAt: now,
      updatedAt: now,
      riskLevel: input.riskLevel,
      holdId: input.holdId,
      tags: input.tags,
    };
    this.getOrCreateMap(tenantId).set(id, proposal);
    return proposal;
  }

  async get(tenantId: string, proposalId: string): Promise<ChangeProposal | null> {
    return this.proposals.get(tenantId)?.get(proposalId) ?? null;
  }

  async list(tenantId: string, query?: ProposalQuery): Promise<{ proposals: ChangeProposal[]; totalCount: number }> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) return { proposals: [], totalCount: 0 };
    let results = Array.from(tenantProposals.values());
    if (query?.state) results = results.filter(p => p.state === query.state);
    if (query?.type) results = results.filter(p => p.type === query.type);
    if (query?.submittedBy) results = results.filter(p => p.submittedBy === query.submittedBy);
    if (query?.reviewerId) results = results.filter(p => p.reviewerId === query.reviewerId);
    if (query?.submittedByAI !== undefined) results = results.filter(p => p.submittedByAI === query.submittedByAI);
    if (query?.startTime) results = results.filter(p => p.createdAt >= query.startTime!);
    if (query?.endTime) results = results.filter(p => p.createdAt <= query.endTime!);

    const totalCount = results.length;
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);

    return { proposals: results, totalCount };
  }

  async update(tenantId: string, proposalId: string, input: UpdateProposalInput): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'draft' && proposal.state !== 'changes_requested') {
      throw new Error(`Cannot update proposal in state: ${proposal.state}`);
    }
    const updated: ChangeProposal = {
      ...proposal,
      title: input.title ?? proposal.title,
      description: input.description ?? proposal.description,
      changes: input.changes ?? proposal.changes,
      tags: input.tags ?? proposal.tags,
      updatedAt: new Date().toISOString(),
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async submit(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'draft' && proposal.state !== 'changes_requested') {
      throw new Error(`Cannot submit proposal in state: ${proposal.state}`);
    }
    const now = new Date().toISOString();
    const updated: ChangeProposal = {
      ...proposal,
      state: 'submitted',
      submittedAt: proposal.submittedAt ?? now,
      updatedAt: now,
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async claimForReview(tenantId: string, proposalId: string, reviewerId: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'submitted') {
      throw new Error(`Cannot claim proposal in state: ${proposal.state}`);
    }
    const updated: ChangeProposal = {
      ...proposal,
      state: 'under_review',
      reviewerId,
      updatedAt: new Date().toISOString(),
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async approve(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'submitted' && proposal.state !== 'under_review') {
      throw new Error(`Cannot approve proposal in state: ${proposal.state}`);
    }
    const now = new Date().toISOString();
    const updated: ChangeProposal = {
      ...proposal,
      state: 'approved',
      reviewerId,
      reviewerComments: comments,
      reviewedAt: now,
      updatedAt: now,
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async reject(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'submitted' && proposal.state !== 'under_review') {
      throw new Error(`Cannot reject proposal in state: ${proposal.state}`);
    }
    const now = new Date().toISOString();
    const updated: ChangeProposal = {
      ...proposal,
      state: 'rejected',
      reviewerId,
      reviewerComments: comments,
      reviewedAt: now,
      updatedAt: now,
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async requestChanges(tenantId: string, proposalId: string, reviewerId: string, comments: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'submitted' && proposal.state !== 'under_review') {
      throw new Error(`Cannot request changes for proposal in state: ${proposal.state}`);
    }
    const now = new Date().toISOString();
    const updated: ChangeProposal = {
      ...proposal,
      state: 'changes_requested',
      reviewerId,
      reviewerComments: comments,
      reviewedAt: now,
      updatedAt: now,
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async markApplied(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state !== 'approved') {
      throw new Error(`Cannot apply proposal in state: ${proposal.state}`);
    }
    const now = new Date().toISOString();
    const updated: ChangeProposal = {
      ...proposal,
      state: 'applied',
      appliedAt: now,
      updatedAt: now,
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async withdraw(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const proposal = this.proposals.get(tenantId)?.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.state === 'applied' || proposal.state === 'rejected') {
      throw new Error(`Cannot withdraw proposal in state: ${proposal.state}`);
    }
    const updated: ChangeProposal = {
      ...proposal,
      state: 'withdrawn',
      updatedAt: new Date().toISOString(),
    };
    this.proposals.get(tenantId)!.set(proposalId, updated);
    return updated;
  }

  async getPendingReview(tenantId: string, reviewerId: string): Promise<ChangeProposal[]> {
    const tenantProposals = this.proposals.get(tenantId);
    if (!tenantProposals) return [];
    return Array.from(tenantProposals.values())
      .filter(p => p.state === 'submitted' || (p.state === 'under_review' && p.reviewerId === reviewerId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private getOrCreateMap(tenantId: string): Map<string, ChangeProposal> {
    let m = this.proposals.get(tenantId);
    if (!m) {
      m = new Map();
      this.proposals.set(tenantId, m);
    }
    return m;
  }
}
