/**
 * HumanInTheLoopService conformance — the same assertions against every provider.
 *
 * This service records who approved an AI-proposed change, and when. It is the
 * governance half of "an agent proposes rather than executes", so the questions
 * worth pinning are not really about storage:
 *
 *   1. Do the HITL surface and the change-proposal surface address the SAME
 *      record? They did not. Each answered correctly about a record the other
 *      had never heard of, and neither erred — the worst shape available for an
 *      approval, because a missing one and an invisible one look identical.
 *
 *   2. Do both providers refuse to approve a `draft` in the same way? A
 *      provider that let a draft through would be recording sign-off on a
 *      proposal nobody submitted for review.
 *
 * The factory therefore hands back both halves: the service, and the store it
 * is supposed to be sharing. A provider that quietly builds its own store
 * passes every single-surface assertion and fails the cross-surface ones.
 */

import { describe, it, expect } from 'vitest';
import type {
  ChangeProposalStore,
  CreateProposalInput,
  HumanInTheLoopService,
  RequestContext,
} from '@altius/spi';

export interface HumanInTheLoopPair {
  hitl: HumanInTheLoopService;
  store: ChangeProposalStore;
}

export type HumanInTheLoopFactory = () => HumanInTheLoopPair | Promise<HumanInTheLoopPair>;

function proposal(overrides: Partial<CreateProposalInput> = {}): CreateProposalInput {
  return {
    title: 'Add nhsNumber to Patient',
    description: 'The agent found every source record carries one',
    type: 'ontology_schema',
    changes: [
      {
        op: 'create',
        resourceType: 'ObjectType',
        resourceId: 'Patient.nhsNumber',
        description: 'add the nhsNumber property',
      },
    ],
    submittedByAI: true,
    ...overrides,
  };
}

export function registerHumanInTheLoopTests(providerName: string, factory: HumanInTheLoopFactory): void {
  describe(`[${providerName}] SPI Conformance: HumanInTheLoopService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_hitl_${label}_${counter++}`, actorId: 'reviewer_1' });

    describe('proposals', () => {
      it('creates a proposal in draft, attributed to the acting user', async () => {
        const { hitl } = await factory();
        const ctx = ctxFor('create');
        const p = await hitl.createProposal(ctx, proposal());
        expect(p.state).toBe('draft');
        expect(p.submittedBy).toBe('reviewer_1');
        expect(p.submittedByAI).toBe(true);
        expect(p.type).toBe('ontology_schema');
        expect(p.changes).toHaveLength(1);
        expect(p.changes[0]!.resourceId).toBe('Patient.nhsNumber');
      });

      it('reads a proposal back by id', async () => {
        const { hitl } = await factory();
        const ctx = ctxFor('get');
        const p = await hitl.createProposal(ctx, proposal());
        const found = await hitl.getProposal(ctx, p.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(p.id);
        expect(found!.title).toBe('Add nhsNumber to Patient');
        expect(found!.changes).toEqual(p.changes);
      });

      it('returns null for an unknown id', async () => {
        const { hitl } = await factory();
        expect(await hitl.getProposal(ctxFor('missing'), 'no-such-proposal')).toBeNull();
      });

      it('lists proposals with a total count, filterable by state', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('list');
        const a = await hitl.createProposal(ctx, proposal());
        await hitl.createProposal(ctx, proposal({ title: 'second' }));
        await store.submit(ctx.tenantId, a.id);

        const all = await hitl.listProposals(ctx);
        expect(all.totalCount).toBe(2);
        expect(all.proposals).toHaveLength(2);

        const submitted = await hitl.listProposals(ctx, { state: 'submitted' });
        expect(submitted.totalCount).toBe(1);
        expect(submitted.proposals[0]!.id).toBe(a.id);
      });

      it('keeps proposals in separate tenants apart', async () => {
        const { hitl } = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const p = await hitl.createProposal(a, proposal());
        expect(await hitl.getProposal(b, p.id)).toBeNull();
        expect((await hitl.listProposals(b)).totalCount).toBe(0);
      });
    });

    describe('the approval decision', () => {
      it('refuses to approve a proposal still in draft', async () => {
        // Both providers guard the transition, and they have to agree: a
        // provider that let this through would be recording sign-off on
        // something nobody submitted for review.
        const { hitl } = await factory();
        const ctx = ctxFor('draft_approve');
        const p = await hitl.createProposal(ctx, proposal());
        await expect(hitl.approve(ctx, p.id)).rejects.toThrow(/draft/i);
        expect((await hitl.getProposal(ctx, p.id))!.state).toBe('draft');
      });

      it('refuses to reject a proposal still in draft', async () => {
        const { hitl } = await factory();
        const ctx = ctxFor('draft_reject');
        const p = await hitl.createProposal(ctx, proposal());
        await expect(hitl.reject(ctx, p.id)).rejects.toThrow(/draft/i);
      });

      it('approves a submitted proposal, recording the reviewer and comments', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('approve');
        const p = await hitl.createProposal(ctx, proposal());
        // The submit transition is only on the store — HumanInTheLoopService
        // does not declare one. See the note in ChangeProposalHumanInTheLoop.
        await store.submit(ctx.tenantId, p.id);

        const approved = await hitl.approve(ctx, p.id, 'checked against the source system');
        expect(approved.state).toBe('approved');
        expect(approved.reviewerId).toBe('reviewer_1');
        expect(approved.reviewerComments).toBe('checked against the source system');
        expect(approved.reviewedAt).toBeTruthy();
      });

      it('rejects a submitted proposal', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('reject');
        const p = await hitl.createProposal(ctx, proposal());
        await store.submit(ctx.tenantId, p.id);
        const rejected = await hitl.reject(ctx, p.id, 'the source field is not always populated');
        expect(rejected.state).toBe('rejected');
        expect(rejected.reviewerComments).toBe('the source field is not always populated');
      });

      it('reports a missing proposal rather than inventing one', async () => {
        const { hitl } = await factory();
        await expect(hitl.approve(ctxFor('gone'), 'no-such-proposal')).rejects.toThrow(/not found/i);
      });
    });

    describe('one record, two surfaces', () => {
      // The bug this category exists for. Before the store was shared, every
      // assertion above passed while these failed — silently, in production.

      it('shows a HITL-created proposal on the change-proposal surface', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('cross_create');
        const p = await hitl.createProposal(ctx, proposal());
        const viaStore = await store.get(ctx.tenantId, p.id);
        expect(viaStore).not.toBeNull();
        expect(viaStore!.title).toBe('Add nhsNumber to Patient');
      });

      it('shows a store-created proposal on the HITL surface', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('cross_read');
        const p = await store.create(ctx.tenantId, 'agent_7', proposal({ title: 'raised by the agent' }));
        const viaHitl = await hitl.getProposal(ctx, p.id);
        expect(viaHitl).not.toBeNull();
        expect(viaHitl!.title).toBe('raised by the agent');
        expect(viaHitl!.submittedBy).toBe('agent_7');
      });

      it('makes an approval recorded through HITL visible on the store', async () => {
        // The one that matters: sign-off on an AI-driven change, recorded on
        // one surface and read on the other.
        const { hitl, store } = await factory();
        const ctx = ctxFor('cross_approve');
        const p = await store.create(ctx.tenantId, 'agent_7', proposal());
        await store.submit(ctx.tenantId, p.id);
        await hitl.approve(ctx, p.id, 'signed off');

        const viaStore = await store.get(ctx.tenantId, p.id);
        expect(viaStore!.state).toBe('approved');
        expect(viaStore!.reviewerId).toBe('reviewer_1');
        expect(viaStore!.reviewerComments).toBe('signed off');
      });

      it('makes an approval recorded on the store visible through HITL', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('cross_approve_back');
        const p = await hitl.createProposal(ctx, proposal());
        await store.submit(ctx.tenantId, p.id);
        await store.approve(ctx.tenantId, p.id, 'reviewer_2', 'signed off elsewhere');

        const viaHitl = await hitl.getProposal(ctx, p.id);
        expect(viaHitl!.state).toBe('approved');
        expect(viaHitl!.reviewerId).toBe('reviewer_2');
      });

      it('counts one record, not two, when both surfaces list it', async () => {
        const { hitl, store } = await factory();
        const ctx = ctxFor('cross_count');
        await hitl.createProposal(ctx, proposal());
        await store.create(ctx.tenantId, 'agent_7', proposal({ title: 'second' }));
        expect((await hitl.listProposals(ctx)).totalCount).toBe(2);
        expect((await store.list(ctx.tenantId)).totalCount).toBe(2);
      });
    });
  });
}
