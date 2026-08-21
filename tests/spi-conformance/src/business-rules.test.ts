/**
 * BusinessRulesService conformance — the same assertions against every provider.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { BusinessRulesService, BusinessRule, RequestContext } from '@altius/spi';
import { InMemoryBusinessRulesService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresBusinessRulesService } from '@altius/storage-postgres';
import { pgTestUrl } from './pg-gate.js';

const CTX = (tenantId: string, actorId = 'u1'): RequestContext => ({ tenantId, actorId });

const INPUT = {
  name: 'order-discount',
  description: 'Flag expensive orders',
  nodes: [
    { name: 'orders', type: 'source' as const, source: { targetType: 'orders' }, inputs: [] },
    { name: 'expensive', type: 'filter' as const, filter: [{ field: 'price', operator: 'gt' as const, value: 100 }], inputs: [] },
  ],
  isTimeSeriesBoard: false,
};

let counter = 0;
const tenant = (label: string) => `t_br_${label}_${counter++}`;

function runTests(name: string, factory: () => Promise<BusinessRulesService>): void {
  describe(`[${name}] SPI Conformance: BusinessRulesService`, () => {
    it('creates and gets a rule', async () => {
      const svc = await factory();
      const t = tenant('create');
      const rule = await svc.create(CTX(t), INPUT);
      expect(rule.id).toBeTruthy();
      expect(rule.tenantId).toBe(t);
      expect(rule.state).toBe('draft');
      expect(rule.nodes).toHaveLength(2);

      const fetched = await svc.get(CTX(t), rule.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(rule.id);
      expect(fetched!.name).toBe(INPUT.name);
    });

    it('lists rules and filters by state', async () => {
      const svc = await factory();
      const t = tenant('list');
      const r1 = await svc.create(CTX(t), INPUT);
      const r2 = await svc.create(CTX(t), { ...INPUT, name: 'other' });
      await svc.submitForApproval(CTX(t), r2.id);

      const all = await svc.list(CTX(t));
      expect(all).toHaveLength(2);

      const proposed = await svc.list(CTX(t), 'proposed');
      expect(proposed).toHaveLength(1);
      expect(proposed[0]!.id).toBe(r2.id);

      const draft = await svc.list(CTX(t), 'draft');
      expect(draft).toHaveLength(1);
      expect(draft[0]!.id).toBe(r1.id);
    });

    it('updates a rule', async () => {
      const svc = await factory();
      const t = tenant('update');
      const rule = await svc.create(CTX(t), INPUT);
      const updated = await svc.update(CTX(t), rule.id, { name: 'renamed', isTimeSeriesBoard: true });
      expect(updated.name).toBe('renamed');
      expect(updated.isTimeSeriesBoard).toBe(true);
      expect(updated.nodes).toHaveLength(2);

      const fetched = await svc.get(CTX(t), rule.id);
      expect(fetched!.name).toBe('renamed');
    });

    it('deletes a rule', async () => {
      const svc = await factory();
      const t = tenant('delete');
      const rule = await svc.create(CTX(t), INPUT);
      await svc.delete(CTX(t), rule.id);
      expect(await svc.get(CTX(t), rule.id)).toBeNull();
    });

    it('runs the state machine lifecycle', async () => {
      const svc = await factory();
      const t = tenant('lifecycle');
      const rule = await svc.create(CTX(t), INPUT);
      expect(rule.state).toBe('draft');

      const proposed = await svc.submitForApproval(CTX(t), rule.id);
      expect(proposed.state).toBe('proposed');

      const approved = await svc.approve(CTX(t), rule.id, 'admin-1', 'ok');
      expect(approved.state).toBe('approved');
      expect(approved.reviewedBy).toBe('admin-1');
      expect(approved.reviewNotes).toBe('ok');
      expect(approved.reviewedAt).toBeDefined();

      const active = await svc.activate(CTX(t), rule.id);
      expect(active.state).toBe('active');

      const inactive = await svc.deactivate(CTX(t), rule.id);
      expect(inactive.state).toBe('inactive');
    });

    it('rejects a proposed rule', async () => {
      const svc = await factory();
      const t = tenant('reject');
      const rule = await svc.create(CTX(t), INPUT);
      await svc.submitForApproval(CTX(t), rule.id);
      const rejected = await svc.reject(CTX(t), rule.id, 'admin-2', 'nope');
      expect(rejected.state).toBe('rejected');
      expect(rejected.reviewNotes).toBe('nope');
    });

    it('enforces state transition guards', async () => {
      const svc = await factory();
      const t = tenant('guards');
      const rule = await svc.create(CTX(t), INPUT);
      await expect(svc.activate(CTX(t), rule.id)).rejects.toThrow(/Cannot transition from draft to active/);
      await svc.submitForApproval(CTX(t), rule.id);
      await expect(svc.activate(CTX(t), rule.id)).rejects.toThrow(/Cannot transition from proposed to active/);
      await svc.approve(CTX(t), rule.id, 'admin', 'ok');
      await svc.activate(CTX(t), rule.id);
      await expect(svc.approve(CTX(t), rule.id, 'admin', 'again')).rejects.toThrow(/Cannot transition from active to approved/);
    });

    it('isolates tenants', async () => {
      const svc = await factory();
      const t1 = tenant('iso_a');
      const t2 = tenant('iso_b');
      const rule = await svc.create(CTX(t1), INPUT);

      expect(await svc.get(CTX(t2), rule.id)).toBeNull();
      expect(await svc.list(CTX(t2))).toHaveLength(0);
      await expect(svc.submitForApproval(CTX(t2), rule.id)).rejects.toThrow(/Rule not found/);
    });

    it('validates a rule DAG', async () => {
      const svc = await factory();
      const t = tenant('validate');
      const rule = await svc.create(CTX(t), INPUT);
      const source = rule.nodes[0]!;
      const filter = rule.nodes[1]!;

      // Valid: wire filter to source.
      const { id: _sId, ...sourceNoId } = source;
      const { id: _fId, ...filterNoId } = filter;
      await svc.update(CTX(t), rule.id, {
        nodes: [
          { ...sourceNoId, inputs: [] },
          { ...filterNoId, inputs: [source.id] },
        ],
      });
      const valid = await svc.validate(CTX(t), rule.id);
      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);

      // Invalid: reference a missing input.
      await svc.update(CTX(t), rule.id, {
        nodes: [
          { ...sourceNoId, inputs: [] },
          { ...filterNoId, inputs: ['no-such-id'] },
        ],
      });
      const invalid = await svc.validate(CTX(t), rule.id);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.some((e) => e.includes('missing input'))).toBe(true);
    });

    it('executes a simple rule', async () => {
      const svc = await factory();
      const t = tenant('execute');
      const rule = await svc.create(CTX(t), INPUT);
      const source = rule.nodes[0]!;
      const filter = rule.nodes[1]!;
      const { id: _sId, ...sourceNoId } = source;
      const { id: _fId, ...filterNoId } = filter;
      await svc.update(CTX(t), rule.id, {
        nodes: [
          { ...sourceNoId, inputs: [] },
          { ...filterNoId, inputs: [source.id] },
        ],
      });

      const data = new Map<string, Record<string, unknown>[]>();
      data.set('orders', [
        { product: 'a', price: 50 },
        { product: 'b', price: 150 },
        { product: 'c', price: 200 },
      ]);

      const result = await svc.execute(CTX(t), rule.id, data);
      expect(result.success).toBe(true);
      expect(result.rowsOutput).toBe(2);
      expect(result.outputRows).toEqual([
        { product: 'b', price: 150 },
        { product: 'c', price: 200 },
      ]);
      expect(result.nodeStats).toHaveLength(2);
    });
  });
}

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryBusinessRulesService();
runTests('InMemoryBusinessRulesService', () => Promise.resolve(memory));

// ── Postgres ──────────────────────────────────────────────────────────────
const PG_TEST_URL = pgTestUrl;

function pgConfig(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 828281;
  const ontology = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'BusinessRuleConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };
  const bootstrapCtx: RequestContext = { tenantId: 't_br_bootstrap', actorId: 'conformance' };

  let ready: Promise<void> | null = null;
  const ensureSchema = (): Promise<void> => {
    ready ??= (async () => {
      await provider.pool
        .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
        .catch(() => {
          /* table may not exist yet on a fresh database */
        });
      await provider.applySchema(bootstrapCtx, ontology as any);
    })();
    return ready;
  };

  runTests('PostgresBusinessRulesService', async () => {
    await ensureSchema();
    return new PostgresBusinessRulesService(provider.pool);
  });

  afterAll(async () => {
    await provider.pool
      .query(`DELETE FROM "governance"."business_rules" WHERE "tenant_id" LIKE 't_br_%'`)
      .catch(() => {});
    await provider.close();
  });

  describe('PostgresBusinessRulesService durability', () => {
    it('survives a restart: rules and state are still there', async () => {
      const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      const TENANT = 't_br_restart';
      let ruleId: string;
      try {
        await first.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929291,
            objectTypes: [{ name: 'BusinessRuleRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as any,
        );
        const svc = new PostgresBusinessRulesService(first.pool);
        const rule = await svc.create({ tenantId: TENANT, actorId: 'agent' }, INPUT);
        ruleId = rule.id;
        await svc.submitForApproval({ tenantId: TENANT, actorId: 'agent' }, ruleId);
        const approved = await svc.approve({ tenantId: TENANT, actorId: 'admin' }, ruleId, 'ok');
        expect(approved.state).toBe('approved');
      } finally {
        await first.close();
      }

      const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
      try {
        await second.applySchema(
          { tenantId: TENANT, actorId: 'restart' },
          {
            version: 929292,
            objectTypes: [{ name: 'BusinessRuleRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
            linkTypes: [],
          } as any,
        );
        const fresh = new PostgresBusinessRulesService(second.pool);
        const rule = await fresh.get({ tenantId: TENANT, actorId: 'restart' }, ruleId!);
        expect(rule).not.toBeNull();
        expect(rule!.name).toBe(INPUT.name);
        expect(rule!.state).toBe('approved');
        expect(rule!.reviewedBy).toBe('admin');
        expect(rule!.reviewNotes).toBe('ok');
      } finally {
        await second.pool
          .query(`DELETE FROM "governance"."business_rules" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
        await second.close();
      }
    });
  });
}
