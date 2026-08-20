/**
 * ChangeProposalStore conformance — the same assertions against every provider.
 *
 * This store is the audit trail for AI-driven change: who approved what, and
 * when. Its state machine is the part that matters. If one provider lets an
 * `applied` proposal be withdrawn and the other refuses, then which deployment
 * you happen to be running decides whether a change was approved — and no audit
 * trail survives that.
 *
 * So the transitions are pinned here, once, for all providers. The category
 * takes a store factory rather than a StorageProvider, as ChangeProposalStore
 * is not part of that interface.
 */

import { describe, it, expect } from 'vitest';
import type { ChangeProposalStore, CreateProposalInput } from '@altius/spi';

export type ChangeProposalStoreFactory = () => ChangeProposalStore | Promise<ChangeProposalStore>;

const INPUT: CreateProposalInput = {
  title: 'Add triage_priority to Patient',
  description: 'Agent proposes a new field',
  type: 'ontology_schema',
  changes: [
    { op: 'update', resourceType: 'ObjectType', resourceId: 'Patient', description: 'add field', value: { field: 'triage_priority' } },
  ],
  submittedByAI: true,
  riskLevel: 'medium',
  tags: ['ontology', 'ai-proposed'],
};

export function registerChangeProposalTests(providerName: string, factory: ChangeProposalStoreFactory): void {
  describe(`[${providerName}] SPI Conformance: ChangeProposalStore`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const tenantFor = (label: string) => `t_prop_${label}_${counter++}`;

    describe('create and read', () => {
      it('creates in draft and reads back every field', async () => {
        const store = await factory();
        const t = tenantFor('create');
        const created = await store.create(t, 'agent-1', INPUT);
        expect(created.state).toBe('draft');
        expect(created.submittedByAI).toBe(true);
        expect(created.submittedBy).toBe('agent-1');
        expect(created.riskLevel).toBe('medium');
        expect(created.changes).toHaveLength(1);
        expect(created.changes[0]!.resourceId).toBe('Patient');

        const fetched = await store.get(t, created.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.title).toBe(INPUT.title);
        // tags is a TEXT[] on Postgres — the #19 defect made every write with
        // one fail. Asserting the round trip, not just the absence of a throw:
        // a wrongly-serialised array can still insert as a single element.
        expect(fetched!.tags).toEqual(['ontology', 'ai-proposed']);
      });

      it('returns null for an unknown id', async () => {
        const store = await factory();
        expect(await store.get(tenantFor('missing'), 'no-such-id')).toBeNull();
      });

      it('creates without optional fields', async () => {
        const store = await factory();
        const t = tenantFor('minimal');
        const created = await store.create(t, 'u1', {
          title: 'Minimal', description: '', type: 'configuration', changes: [],
        });
        const fetched = await store.get(t, created.id);
        expect(fetched!.state).toBe('draft');
        expect(fetched!.submittedByAI).toBe(false);
        expect(fetched!.changes).toEqual([]);
      });

      it('keeps proposals in separate tenants apart', async () => {
        const store = await factory();
        const a = tenantFor('iso_a');
        const b = tenantFor('iso_b');
        const created = await store.create(a, 'u1', INPUT);
        expect(await store.get(b, created.id)).toBeNull();
        expect((await store.list(b)).totalCount).toBe(0);
      });
    });

    describe('the review lifecycle', () => {
      it('runs draft → submitted → under_review → approved → applied', async () => {
        const store = await factory();
        const t = tenantFor('happy');
        const p = await store.create(t, 'agent-1', INPUT);

        const submitted = await store.submit(t, p.id);
        expect(submitted.state).toBe('submitted');
        expect(submitted.submittedAt).toBeDefined();

        const claimed = await store.claimForReview(t, p.id, 'reviewer-1');
        expect(claimed.state).toBe('under_review');
        expect(claimed.reviewerId).toBe('reviewer-1');

        const approved = await store.approve(t, p.id, 'reviewer-1', 'looks right');
        expect(approved.state).toBe('approved');
        expect(approved.reviewerComments).toBe('looks right');
        expect(approved.reviewedAt).toBeDefined();

        const applied = await store.markApplied(t, p.id);
        expect(applied.state).toBe('applied');
        expect(applied.appliedAt).toBeDefined();
      });

      it('rejects with the reviewer recorded', async () => {
        const store = await factory();
        const t = tenantFor('reject');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        const rejected = await store.reject(t, p.id, 'reviewer-2', 'unsafe');
        expect(rejected.state).toBe('rejected');
        expect(rejected.reviewerId).toBe('reviewer-2');
        expect(rejected.reviewerComments).toBe('unsafe');
      });

      it('allows a changes_requested proposal to be revised and resubmitted', async () => {
        const store = await factory();
        const t = tenantFor('revise');
        const p = await store.create(t, 'agent-1', INPUT);
        const first = await store.submit(t, p.id);
        await store.requestChanges(t, p.id, 'reviewer-1', 'narrow the scope');

        const revised = await store.update(t, p.id, { title: 'Revised title' });
        expect(revised.title).toBe('Revised title');

        const resubmitted = await store.submit(t, p.id);
        expect(resubmitted.state).toBe('submitted');
        // The first submission time is kept across the round trip — it is when
        // the proposal first entered review, which is the auditable fact.
        expect(resubmitted.submittedAt).toBe(first.submittedAt);
      });

      it('withdraws a proposal that has not been decided', async () => {
        const store = await factory();
        const t = tenantFor('withdraw');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        expect((await store.withdraw(t, p.id)).state).toBe('withdrawn');
      });
    });

    describe('illegal transitions are refused', () => {
      // The guards are the point of the store. Each of these is a way an
      // approval could be manufactured or erased if a provider disagreed.
      it('refuses to approve a draft that was never submitted', async () => {
        const store = await factory();
        const t = tenantFor('approve_draft');
        const p = await store.create(t, 'agent-1', INPUT);
        await expect(store.approve(t, p.id, 'reviewer-1')).rejects.toThrow(/Cannot approve proposal in state: draft/);
      });

      it('refuses to apply a proposal that was not approved', async () => {
        const store = await factory();
        const t = tenantFor('apply_unapproved');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        await expect(store.markApplied(t, p.id)).rejects.toThrow(/Cannot apply proposal in state: submitted/);
      });

      it('refuses to withdraw an applied proposal', async () => {
        const store = await factory();
        const t = tenantFor('withdraw_applied');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        await store.approve(t, p.id, 'reviewer-1');
        await store.markApplied(t, p.id);
        await expect(store.withdraw(t, p.id)).rejects.toThrow(/Cannot withdraw proposal in state: applied/);
      });

      it('refuses to withdraw a rejected proposal', async () => {
        const store = await factory();
        const t = tenantFor('withdraw_rejected');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        await store.reject(t, p.id, 'reviewer-1', 'no');
        await expect(store.withdraw(t, p.id)).rejects.toThrow(/Cannot withdraw proposal in state: rejected/);
      });

      it('refuses to edit a proposal already under review', async () => {
        const store = await factory();
        const t = tenantFor('edit_locked');
        const p = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, p.id);
        await store.claimForReview(t, p.id, 'reviewer-1');
        await expect(store.update(t, p.id, { title: 'sneaky' })).rejects.toThrow(/Cannot update proposal in state: under_review/);
      });

      it('refuses to claim a proposal that is not awaiting review', async () => {
        const store = await factory();
        const t = tenantFor('claim_draft');
        const p = await store.create(t, 'agent-1', INPUT);
        await expect(store.claimForReview(t, p.id, 'reviewer-1')).rejects.toThrow(/Cannot claim proposal in state: draft/);
      });

      it('reports a missing proposal rather than silently doing nothing', async () => {
        const store = await factory();
        await expect(store.submit(tenantFor('gone'), 'no-such-id')).rejects.toThrow(/Proposal not found/);
      });
    });

    describe('listing and review queues', () => {
      it('filters by state and type, and counts before paging', async () => {
        const store = await factory();
        const t = tenantFor('list');
        const a = await store.create(t, 'agent-1', INPUT);
        const b = await store.create(t, 'agent-1', INPUT);
        await store.create(t, 'human-1', { ...INPUT, type: 'configuration', submittedByAI: false });
        await store.submit(t, a.id);
        await store.submit(t, b.id);

        expect((await store.list(t)).totalCount).toBe(3);
        expect((await store.list(t, { state: 'submitted' })).totalCount).toBe(2);
        expect((await store.list(t, { state: 'draft' })).totalCount).toBe(1);
        expect((await store.list(t, { type: 'configuration' })).totalCount).toBe(1);
        expect((await store.list(t, { submittedByAI: false })).totalCount).toBe(1);
        expect((await store.list(t, { submittedBy: 'agent-1' })).totalCount).toBe(2);

        // totalCount is the size of the filtered set, not of the page — a
        // caller has to be able to tell "2 of 3" from "2 of 2".
        const page = await store.list(t, { limit: 2 });
        expect(page.proposals).toHaveLength(2);
        expect(page.totalCount).toBe(3);
      });

      it('offsets into the list without repeating a row', async () => {
        const store = await factory();
        const t = tenantFor('page');
        for (let i = 0; i < 3; i++) await store.create(t, 'agent-1', { ...INPUT, title: `P${i}` });
        const first = await store.list(t, { limit: 2 });
        const second = await store.list(t, { limit: 2, offset: 2 });
        expect(first.proposals).toHaveLength(2);
        expect(second.proposals).toHaveLength(1);
        const ids = [...first.proposals, ...second.proposals].map(p => p.id);
        expect(new Set(ids).size).toBe(3);
      });

      it('shows a reviewer unclaimed work plus their own claims', async () => {
        const store = await factory();
        const t = tenantFor('queue');
        const mine = await store.create(t, 'agent-1', INPUT);
        const theirs = await store.create(t, 'agent-1', INPUT);
        const untouched = await store.create(t, 'agent-1', INPUT);
        await store.submit(t, mine.id);
        await store.submit(t, theirs.id);
        await store.claimForReview(t, mine.id, 'reviewer-1');
        await store.claimForReview(t, theirs.id, 'reviewer-2');

        const queue = await store.getPendingReview(t, 'reviewer-1');
        const ids = queue.map(p => p.id);
        expect(ids).toContain(mine.id);
        // Another reviewer's in-flight review is not this reviewer's work.
        expect(ids).not.toContain(theirs.id);
        // Still a draft, so not awaiting anyone.
        expect(ids).not.toContain(untouched.id);
      });
    });
  });
}
