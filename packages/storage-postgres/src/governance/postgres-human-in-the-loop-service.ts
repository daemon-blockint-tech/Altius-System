/**
 * PostgreSQL human-in-the-loop service — human approval of AI-driven change.
 *
 * There is no table here, and that is the point. `HumanInTheLoopService` is a
 * rename of `ChangeProposalStore` with `RequestContext` unpacked, so it stores
 * nothing of its own; the adapter lives once in @altius/spi and both providers
 * extend it. What this class supplies is the durable store underneath —
 * `governance.change_proposals`, the same table the change-proposal surface
 * writes.
 *
 * ── The bug this closes ──
 *
 * The in-memory service used to construct a private `InMemoryChangeProposalStore`,
 * so on a Postgres deployment two REST surfaces addressed the same conceptual
 * record through different stores:
 *
 *   POST /api/v1/change-proposals      → PostgresChangeProposalStore  (a table)
 *   POST /api/v1/ai-proposals/:id/approve → a Map, dead on restart
 *
 * Neither surface erred. Each answered correctly about a record the other had
 * never heard of, and the approval half was the one that evaporated. For the
 * record of who signed off on an AI-proposed change, a missing approval and an
 * approval you cannot see are the same thing to the caller — which is why this
 * ranked above the remaining stores despite being a smaller diff than any of
 * them.
 *
 * Passing a pool rather than a store keeps the constructor shaped like every
 * other Postgres service; the API passes the shared store instead, so both
 * surfaces read one record.
 */

import type { Pool } from 'pg';
import { ChangeProposalHumanInTheLoop } from '@altius/spi';
import { PostgresChangeProposalStore } from './postgres-change-proposal-store.js';

export class PostgresHumanInTheLoopService extends ChangeProposalHumanInTheLoop {
  constructor(pool: Pool) {
    super(new PostgresChangeProposalStore(pool));
  }
}
