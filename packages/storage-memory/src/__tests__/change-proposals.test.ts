/**
 * Tests for the in-memory change proposal store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryChangeProposalStore } from '../in-memory-change-proposals.js';
import type { CreateProposalInput } from '@altius/spi';

const SAMPLE_INPUT: CreateProposalInput = {
  title: 'Add RiskScore field to Patient',
  description: 'AI proposes adding a computed RiskScore field to the Patient object type.',
  type: 'ontology_schema',
  changes: [
    {
      op: 'create',
      resourceType: 'Field',
      resourceId: 'Patient.riskScore',
      value: { type: 'Float', computed: true },
      description: 'Add riskScore Float field',
    },
  ],
  submittedByAI: true,
  riskLevel: 'medium',
};

describe('InMemoryChangeProposalStore', () => {
  let store: InMemoryChangeProposalStore;

  beforeEach(() => {
    store = new InMemoryChangeProposalStore();
  });

  it('creates a draft proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    expect(proposal.id).toBeTruthy();
    expect(proposal.state).toBe('draft');
    expect(proposal.submittedByAI).toBe(true);
    expect(proposal.riskLevel).toBe('medium');
  });

  it('gets a proposal by ID', async () => {
    const created = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const fetched = await store.get('t1', created.id);
    expect(fetched?.title).toBe(SAMPLE_INPUT.title);
  });

  it('lists proposals with filters', async () => {
    await store.create('t1', 'agent-1', { ...SAMPLE_INPUT, title: 'P1' });
    await store.create('t1', 'agent-2', { ...SAMPLE_INPUT, title: 'P2', submittedByAI: false });
    const all = await store.list('t1');
    expect(all.totalCount).toBe(2);
    const aiOnly = await store.list('t1', { submittedByAI: true });
    expect(aiOnly.totalCount).toBe(1);
  });

  it('updates a draft proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const updated = await store.update('t1', proposal.id, { title: 'Updated title' });
    expect(updated.title).toBe('Updated title');
  });

  it('rejects update for non-draft proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    await expect(store.update('t1', proposal.id, { title: 'X' })).rejects.toThrow('Cannot update');
  });

  it('submits a draft for review', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const submitted = await store.submit('t1', proposal.id);
    expect(submitted.state).toBe('submitted');
    expect(submitted.submittedAt).toBeTruthy();
  });

  it('claims a proposal for review', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    const claimed = await store.claimForReview('t1', proposal.id, 'reviewer-1');
    expect(claimed.state).toBe('under_review');
    expect(claimed.reviewerId).toBe('reviewer-1');
  });

  it('approves a proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    const approved = await store.approve('t1', proposal.id, 'reviewer-1', 'Looks good');
    expect(approved.state).toBe('approved');
    expect(approved.reviewerComments).toBe('Looks good');
    expect(approved.reviewedAt).toBeTruthy();
  });

  it('rejects a proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    const rejected = await store.reject('t1', proposal.id, 'reviewer-1', 'Not needed');
    expect(rejected.state).toBe('rejected');
  });

  it('requests changes', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    const changesRequested = await store.requestChanges('t1', proposal.id, 'reviewer-1', 'Add more fields');
    expect(changesRequested.state).toBe('changes_requested');
    expect(changesRequested.reviewerComments).toBe('Add more fields');
  });

  it('allows resubmitting after changes requested', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    await store.requestChanges('t1', proposal.id, 'reviewer-1', 'Add more fields');
    // Can update and resubmit
    await store.update('t1', proposal.id, { description: 'Updated description' });
    const resubmitted = await store.submit('t1', proposal.id);
    expect(resubmitted.state).toBe('submitted');
  });

  it('marks an approved proposal as applied', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    await store.approve('t1', proposal.id, 'reviewer-1');
    const applied = await store.markApplied('t1', proposal.id);
    expect(applied.state).toBe('applied');
    expect(applied.appliedAt).toBeTruthy();
  });

  it('prevents applying non-approved proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    await expect(store.markApplied('t1', proposal.id)).rejects.toThrow('Cannot apply');
  });

  it('withdraws a proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const withdrawn = await store.withdraw('t1', proposal.id);
    expect(withdrawn.state).toBe('withdrawn');
  });

  it('prevents withdrawing applied proposal', async () => {
    const proposal = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    await store.submit('t1', proposal.id);
    await store.approve('t1', proposal.id, 'reviewer-1');
    await store.markApplied('t1', proposal.id);
    await expect(store.withdraw('t1', proposal.id)).rejects.toThrow('Cannot withdraw');
  });

  it('gets pending review proposals', async () => {
    const p1 = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const p2 = await store.create('t1', 'agent-1', { ...SAMPLE_INPUT, title: 'P2' });
    await store.submit('t1', p1.id);
    await store.submit('t1', p2.id);
    await store.claimForReview('t1', p2.id, 'reviewer-1');

    const pending = await store.getPendingReview('t1', 'reviewer-1');
    expect(pending).toHaveLength(2); // both submitted and claimed by reviewer-1
  });

  it('isolates tenants', async () => {
    await store.create('t1', 'agent-1', SAMPLE_INPUT);
    const t2 = await store.list('t2');
    expect(t2.totalCount).toBe(0);
  });

  it('runs full lifecycle: draft → submitted → approved → applied', async () => {
    const draft = await store.create('t1', 'agent-1', SAMPLE_INPUT);
    expect(draft.state).toBe('draft');

    const submitted = await store.submit('t1', draft.id);
    expect(submitted.state).toBe('submitted');

    const approved = await store.approve('t1', draft.id, 'reviewer-1', 'Approved');
    expect(approved.state).toBe('approved');

    const applied = await store.markApplied('t1', draft.id);
    expect(applied.state).toBe('applied');
  });
});
