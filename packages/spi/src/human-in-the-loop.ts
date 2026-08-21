/**
 * HumanInTheLoopService over a ChangeProposalStore — one implementation, both
 * providers.
 *
 * `HumanInTheLoopService` is not a store. Every one of its five methods is a
 * rename of a `ChangeProposalStore` method with `RequestContext` unpacked into
 * the `(tenantId, actorId)` pair the store takes:
 *
 *   listProposals  → list(tenantId, query)
 *   getProposal    → get(tenantId, id)
 *   createProposal → create(tenantId, actorId, input)
 *   approve        → approve(tenantId, id, actorId, comments)
 *   reject         → reject(tenantId, id, actorId, comments)
 *
 * So it holds no state of its own, and the store it is handed decides both
 * whether the record survives a restart and *which* record it is.
 *
 * ── Why this exists as a class rather than as a second store ──
 *
 * The in-memory service used to construct its own private
 * `InMemoryChangeProposalStore`. Two REST surfaces then read and wrote the same
 * conceptual record through two different stores:
 *
 *   POST /api/v1/change-proposals  → deps.changeProposalStore  (Postgres)
 *   POST /api/v1/ai-proposals      → deps.humanInTheLoopService (private Map)
 *
 * A proposal approved on one was invisible on the other, and nothing errored:
 * each surface answered correctly about a record the other had never heard of.
 * For an approval record — who signed off on an AI-driven change, and when —
 * that is the worst available failure mode, because a missing approval and an
 * approval you cannot see are indistinguishable to the caller.
 *
 * Taking the store as a constructor argument is what lets the API hand both
 * surfaces the same instance. Keeping the adapter here rather than in each
 * provider is what stops the two from drifting on the unpacking above.
 */

import type { RequestContext } from './ontology.js';
import type {
  ChangeProposal,
  ChangeProposalStore,
  CreateProposalInput,
  ProposalQuery,
} from './change-proposals.js';
import type { HumanInTheLoopService } from './aip-llm.js';

/**
 * Adapts any `ChangeProposalStore` to `HumanInTheLoopService`.
 *
 * Note what is deliberately *not* adapted: the store's `submit`, `claim`,
 * `requestChanges`, `withdraw` and `markApplied` transitions have no
 * human-in-the-loop equivalent, because the interface does not declare one.
 * `approve` and `reject` refuse a proposal in `draft` — in both providers — so
 * on the HITL surface alone a created proposal cannot be approved at all. It
 * has to be submitted first, through the change-proposal surface. That was
 * true before this class existed and is unchanged by it; it is only *reachable*
 * now, because both surfaces finally address the same record. Widening
 * `HumanInTheLoopService` to carry its own submit is a contract change and is
 * not made here.
 */
export class ChangeProposalHumanInTheLoop implements HumanInTheLoopService {
  constructor(protected readonly store: ChangeProposalStore) {}

  async listProposals(
    ctx: RequestContext,
    query?: ProposalQuery,
  ): Promise<{ proposals: ChangeProposal[]; totalCount: number }> {
    return this.store.list(ctx.tenantId, query);
  }

  async getProposal(ctx: RequestContext, id: string): Promise<ChangeProposal | null> {
    return this.store.get(ctx.tenantId, id);
  }

  async createProposal(ctx: RequestContext, input: CreateProposalInput): Promise<ChangeProposal> {
    return this.store.create(ctx.tenantId, ctx.actorId ?? 'system', input);
  }

  async approve(ctx: RequestContext, id: string, comments?: string): Promise<ChangeProposal> {
    return this.store.approve(ctx.tenantId, id, ctx.actorId ?? 'system', comments);
  }

  async reject(ctx: RequestContext, id: string, comments?: string): Promise<ChangeProposal> {
    return this.store.reject(ctx.tenantId, id, ctx.actorId ?? 'system', comments);
  }
}
