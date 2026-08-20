/**
 * Runs the BusinessRulesService conformance category against every provider,
 * and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { BusinessRulesService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryBusinessRulesService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresBusinessRulesService } from '@altius/storage-postgres';
import { registerBusinessRulesTests } from './categories/business-rules.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryBusinessRulesService();
registerBusinessRulesTests('InMemoryBusinessRulesService', (): BusinessRulesService => memory);

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

  const SCHEMA_VERSION = 828282;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'RuleConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_rule_bootstrap', actorId: 'conformance' };

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

  registerBusinessRulesTests('PostgresBusinessRulesService', async (): Promise<BusinessRulesService> => {
    await ensureSchema();
    return new PostgresBusinessRulesService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."business_rules" WHERE "tenant_id" LIKE 't_rule_%'`)
      .catch(() => {});
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the state machine is right, not that it is
// written down anywhere: an implementation holding rules on the instance would
// pass every case. This is the half that separates the two.
if (PG_TEST_URL) describe('PostgresBusinessRulesService durability', () => {
  it('survives a restart: an active rule is still active and still runs', async () => {
    const TENANT = 't_rule_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let id: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [929292]).catch(() => {});
      await first.applySchema(ctx, {
        version: 929292,
        objectTypes: [{ name: 'RuleRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresBusinessRulesService(first.pool);
      const rule = await svc.create(ctx, {
        name: 'Escalate urgent',
        description: 'live rule',
        nodes: [
          { name: 'patients', type: 'source', source: { targetType: 'Patient' }, inputs: [] },
          { name: 'urgent', type: 'filter', inputs: [], filter: [{ field: 'triage', operator: 'eq', value: 'urgent' }] },
        ],
      });
      id = rule.id;
      // Wire the filter to the source, now that the source node has an id.
      await svc.update(ctx, id, {
        nodes: [
          { name: 'patients', type: 'source', source: { targetType: 'Patient' }, inputs: [] },
          { name: 'urgent', type: 'filter', inputs: [rule.nodes[0]!.id], filter: [{ field: 'triage', operator: 'eq', value: 'urgent' }] },
        ],
      });
      await svc.submitForApproval(ctx, id);
      await svc.approve(ctx, id, 'reviewer-1', 'approved for production');
      await svc.activate(ctx, id);
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const fresh = new PostgresBusinessRulesService(second.pool);
      const found = await fresh.get(ctx, id!);
      expect(found).not.toBeNull();
      // The whole point: a rule that lost its state would silently revert to
      // draft and simply stop applying, with nothing looking broken.
      expect(found!.state).toBe('active');
      expect(found!.reviewedBy).toBe('reviewer-1');
      expect(found!.reviewNotes).toBe('approved for production');
      expect(found!.nodes).toHaveLength(2);

      // The DAG survived the round trip well enough to still execute.
      const result = await fresh.execute(ctx, id!, new Map([
        ['Patient', [{ id: 1, triage: 'urgent' }, { id: 2, triage: 'routine' }]],
      ]));
      expect(result.success).toBe(true);
      expect(result.rowsOutput).toBe(1);

      // And the state machine still applies to the restored row.
      await expect(fresh.approve(ctx, id!, 'reviewer-2')).rejects.toThrow(/Cannot transition from active to approved/);
    } finally {
      await second.pool
        .query(`DELETE FROM "governance"."business_rules" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
      await second.close();
    }
  });
});
