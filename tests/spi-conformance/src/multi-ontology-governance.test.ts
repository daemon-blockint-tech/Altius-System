/**
 * Runs the MultiOntologyGovernanceService conformance category against every
 * provider, and checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point, and here agreement is about who may reach
 * whose data.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { MultiOntologyGovernanceService, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryMultiOntologyGovernanceService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresMultiOntologyGovernanceService } from '@altius/storage-postgres';
import { registerMultiOntologyTests } from './categories/multi-ontology-governance.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryMultiOntologyGovernanceService();
registerMultiOntologyTests(
  'InMemoryMultiOntologyGovernanceService',
  (): MultiOntologyGovernanceService => memory,
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

const GOVERNANCE_TABLES = ['sharing_rules', 'ontology_entities', 'ontology_spaces'];

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 888888;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'MogConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_mog_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerMultiOntologyTests('PostgresMultiOntologyGovernanceService', async (): Promise<MultiOntologyGovernanceService> => {
    await ensureSchema();
    return new PostgresMultiOntologyGovernanceService(provider.pool);
  });

  afterAll(async () => {
    for (const table of GOVERNANCE_TABLES) {
      await provider.pool
        .query(`DELETE FROM "governance"."${table}" WHERE "tenant_id" LIKE 't_mog_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Durability ────────────────────────────────────────────────────────────
// Passing the contract above proves the access check reaches the right verdict,
// not that the rule it read from will still be there tomorrow. A service holding
// its rules on the instance would pass every case.
//
// The failure this guards against is loud rather than silent — the check fails
// closed, so a lost rule denies a partner org rather than admitting a stranger.
// That is the right direction to fail in, and still worth a test: a cross-org
// arrangement that evaporates on restart takes the record of who granted it,
// and under which markings, along with it.
if (PG_TEST_URL) describe('PostgresMultiOntologyGovernanceService durability', () => {
  it('survives a restart: the sharing rule still grants, and still names itself', async () => {
    const TENANT = 't_mog_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let spaceId: string;
    let ontologyId: string;
    let ruleId: string;
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [989898]).catch(() => {});
      await first.applySchema(ctx, {
        version: 989898,
        objectTypes: [{ name: 'MogRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const svc = new PostgresMultiOntologyGovernanceService(first.pool);

      const space = await svc.createSpace(ctx, {
        name: 'acute-trust', orgScope: 'org_a',
        description: 'the acute trust ontology space',
        defaultMarkings: ['PII'],
      });
      spaceId = space.id;
      const ont = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id });
      ontologyId = ont.id;
      const rule = await svc.createSharingRule(ctx, {
        sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['PII'],
      });
      ruleId = rule.id;

      expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(true);
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const svc = new PostgresMultiOntologyGovernanceService(second.pool);

      const space = await svc.getSpace(ctx, spaceId!);
      expect(space).not.toBeNull();
      expect(space!.orgScope).toBe('org_a');
      expect(space!.defaultMarkings).toEqual(['PII']);
      // Derived from the ontologies table rather than stored, so this also
      // checks the derivation survives a new pool.
      expect(space!.ontologyIds).toEqual([ontologyId!]);

      const ont = await svc.getOntology(ctx, ontologyId!);
      expect(ont!.markings).toEqual(['PII']);
      expect(ont!.orgScope).toBe('org_a');

      // The grant itself, and which rule is credited with it — the audit answer.
      const granted = await svc.checkAccess(ctx, ontologyId!, 'org_b');
      expect(granted.allowed).toBe(true);
      expect(granted.viaSharingRule).toBe(true);
      expect(granted.sharingRuleId).toBe(ruleId!);

      // And the denial still holds for an org nothing granted, so a restart has
      // not turned the check into a rubber stamp either.
      const denied = await svc.checkAccess(ctx, ontologyId!, 'org_z');
      expect(denied.allowed).toBe(false);
      expect(denied.denialReasons[0]).toMatch(/no sharing rule grants org_z/i);

      expect((await svc.resolveAccessibleOntologies(ctx, 'org_b')).map(o => o.id)).toEqual([ontologyId!]);
    } finally {
      for (const table of GOVERNANCE_TABLES) {
        await second.pool
          .query(`DELETE FROM "governance"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
