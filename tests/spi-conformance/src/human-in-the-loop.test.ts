/**
 * Runs the HumanInTheLoopService conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryHumanInTheLoopService, InMemoryChangeProposalStore } from '@altius/storage-memory';
import {
  PostgresStorageProvider,
  PostgresChangeProposalStore,
  PostgresHumanInTheLoopService,
} from '@altius/storage-postgres';
import { registerHumanInTheLoopTests, type HumanInTheLoopPair } from './categories/human-in-the-loop.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
// Built the way the API builds it: one store, handed to both surfaces.
const memoryStore = new InMemoryChangeProposalStore();
const memoryHitl = new InMemoryHumanInTheLoopService(memoryStore);
registerHumanInTheLoopTests(
  'InMemoryHumanInTheLoopService',
  (): HumanInTheLoopPair => ({ hitl: memoryHitl, store: memoryStore }),
);

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 868686;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'HitlConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema({ tenantId: 't_hitl_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  // Two objects over one pool, so they address one table — which is what
  // "shared" means on a Postgres deployment. Sharing a JS instance is only
  // what the in-memory half needs.
  registerHumanInTheLoopTests('PostgresHumanInTheLoopService', async (): Promise<HumanInTheLoopPair> => {
    await ensureSchema();
    return {
      hitl: new PostgresHumanInTheLoopService(provider.pool),
      store: new PostgresChangeProposalStore(provider.pool),
    };
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."change_proposals" WHERE "tenant_id" LIKE 't_hitl_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the approval is recorded somewhere both
// surfaces can see, not that it is recorded anywhere that outlives the process.
// A private Map shared between two references would pass every case above.
if (PG_TEST_URL) describe('PostgresHumanInTheLoopService durability', () => {
  it('survives a restart: the approval and its reviewer are still on the record', async () => {
    const TENANT = 't_hitl_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'reviewer_1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let id: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [969696]).catch(() => {});
      await first.applySchema(ctx, {
        version: 969696,
        objectTypes: [{ name: 'HitlRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const hitl = new PostgresHumanInTheLoopService(first.pool);
      const store = new PostgresChangeProposalStore(first.pool);

      const p = await hitl.createProposal(ctx, {
        title: 'Grant the ingest agent write access to Patient',
        description: 'raised by the agent after a failed sync',
        type: 'permission_change',
        changes: [{
          op: 'update',
          resourceType: 'Role',
          resourceId: 'ingest_agent',
          description: 'add write on Patient',
        }],
        submittedByAI: true,
        riskLevel: 'high',
      });
      id = p.id;
      await store.submit(ctx.tenantId, id);
      await hitl.approve(ctx, id, 'approved on call with the DPO');
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const hitl = new PostgresHumanInTheLoopService(second.pool);
      const store = new PostgresChangeProposalStore(second.pool);

      const found = await hitl.getProposal(ctx, id!);
      expect(found).not.toBeNull();
      // The whole point of the record: who approved a high-risk permission
      // change, and what they said about it.
      expect(found!.state).toBe('approved');
      expect(found!.reviewerId).toBe('reviewer_1');
      expect(found!.reviewerComments).toBe('approved on call with the DPO');
      expect(found!.riskLevel).toBe('high');
      expect(found!.submittedByAI).toBe(true);
      expect(found!.changes[0]!.resourceId).toBe('ingest_agent');

      // And still one record, not a HITL copy and a store copy.
      expect((await store.list(ctx.tenantId)).totalCount).toBe(1);
      expect((await hitl.listProposals(ctx)).totalCount).toBe(1);
    } finally {
      await second.pool
        .query(`DELETE FROM "governance"."change_proposals" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
