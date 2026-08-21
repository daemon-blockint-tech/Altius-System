/**
 * Runs the ChangeProposalStore conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { ChangeProposalStore, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryChangeProposalStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresChangeProposalStore } from '@altius/storage-postgres';
import { registerChangeProposalTests } from './categories/change-proposals.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryChangeProposalStore();
registerChangeProposalTests('InMemoryChangeProposalStore', (): ChangeProposalStore => memory);

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

  const SCHEMA_VERSION = 818181;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'ProposalConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_prop_bootstrap', actorId: 'conformance' };

  // applySchema emits the platform DDL the governance table lives in. Awaited
  // lazily so nothing runs when the category is filtered out.
  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology);
    })();
    return ready;
  };

  registerChangeProposalTests('PostgresChangeProposalStore', async (): Promise<ChangeProposalStore> => {
    await ensureSchema();
    return new PostgresChangeProposalStore(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."change_proposals" WHERE "tenant_id" LIKE 't_prop_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the state machine is right, not that it is
// written down anywhere: an implementation keeping proposals on the instance
// would pass every case. This is the half that separates the two.
// Gated the same way as the category above: this file's pg-gate raises at
// import time when REQUIRE_PG is set without a URL, so a skip here only ever
// means "no database configured", never "silently dropped in CI".
if (PG_TEST_URL) describe('PostgresChangeProposalStore durability', () => {
  it('survives a restart: an approval is still there after the process is gone', async () => {
    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    const TENANT = 't_prop_restart';
    let id: string;
    try {
      await first.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [919191])
        .catch(() => {});
      await first.applySchema(
        { tenantId: TENANT, actorId: 'restart' },
        {
          version: 919191,
          objectTypes: [{ name: 'ProposalRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
          linkTypes: [],
        },
      );
      const store = new PostgresChangeProposalStore(first.pool);
      const p = await store.create(TENANT, 'agent-1', {
        title: 'Grant read on Patient to analysts',
        description: 'proposed by the agent',
        type: 'permission_change',
        changes: [{ op: 'update', resourceType: 'Role', resourceId: 'analyst', description: 'grant read' }],
        submittedByAI: true,
        riskLevel: 'high',
        tags: ['permissions', 'high-risk'],
      });
      id = p.id;
      await store.submit(TENANT, id);
      await store.approve(TENANT, id, 'reviewer-1', 'approved after review');
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const fresh = new PostgresChangeProposalStore(second.pool);
      const found = await fresh.get(TENANT, id!);
      expect(found).not.toBeNull();
      expect(found!.state).toBe('approved');
      expect(found!.reviewerId).toBe('reviewer-1');
      expect(found!.reviewerComments).toBe('approved after review');
      expect(found!.reviewedAt).toBeDefined();
      expect(found!.submittedAt).toBeDefined();
      expect(found!.riskLevel).toBe('high');
      expect(found!.tags).toEqual(['permissions', 'high-risk']);
      expect(found!.changes[0]!.resourceId).toBe('analyst');

      // The state machine still applies to what was read back, so the
      // restored row is a live proposal rather than a detached snapshot.
      const applied = await fresh.markApplied(TENANT, id!);
      expect(applied.state).toBe('applied');
      await expect(fresh.withdraw(TENANT, id!)).rejects.toThrow(/Cannot withdraw proposal in state: applied/);
    } finally {
      await second.pool
        .query(`DELETE FROM "governance"."change_proposals" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
