/**
 * AgentHoldStore conformance — the same assertions against every provider.
 *
 * Agent holds are a SECURITY store: a high-risk agent action is denied
 * pending human approval, and an approved hold is consumed one-shot on
 * re-execution. Two providers that disagree here disagree about whether
 * an agent may execute a high-risk action. The semantics pinned:
 *  - create stores a pending hold; get returns it (tenant-scoped);
 *  - approve transitions pending→approved; throws on non-pending/expired;
 *  - reject transitions pending→rejected; throws on non-pending;
 *  - consume transitions approved→consumed (one-shot); no-op otherwise;
 *  - cross-tenant queries return nothing (fail closed);
 *  - cleanupExpired marks expired pending holds.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AgentHoldStore, AgentHoldRecord } from '@altius/spi';
import { InMemoryAgentHoldStore } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresAgentHoldStore } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';

function makeHold(tenantId: string, actionName = 'DeletePatient'): AgentHoldRecord {
  const now = new Date();
  return {
    id: randomUUID(),
    actionName,
    riskLevel: 'high',
    agentContext: { agentId: 'agent-1', dryRun: false, tenantId },
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

function runTests(name: string, factory: () => Promise<AgentHoldStore>): void {
  describe(`[${name}] SPI Conformance: AgentHoldStore`, () => {
    // Postgres keeps rows between runs where a fresh Map does not, so the
    // listing cases used to count every hold any previous run had left for
    // 't-1' — 48 where the case expected 2. Each case gets tenants no other run
    // can have used.
    let counter = 0;
    const tenantId = (suffix = 'a') => `t_hold_${suffix}_${Date.now().toString(36)}_${counter++}`;

    it('create stores a pending hold; get returns it (tenant-scoped)', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      const created = await store.create(hold);
      expect(created.id).toBe(hold.id);
      expect(created.status).toBe('pending');

      const got = await store.get(t1, hold.id);
      expect(got).not.toBeNull();
      expect(got!.actionName).toBe('DeletePatient');
      expect(got!.status).toBe('pending');
    });

    it('approve transitions pending→approved', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);

      const approved = await store.approve(t1, hold.id, 'reviewer-1');
      expect(approved.status).toBe('approved');
      expect(approved.decidedBy).toBe('reviewer-1');
      expect(approved.decidedAt).toBeDefined();
    });

    it('reject transitions pending→rejected with reason', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);

      const rejected = await store.reject(t1, hold.id, 'reviewer-1', 'Too risky');
      expect(rejected.status).toBe('rejected');
      expect(rejected.reason).toBe('Too risky');
    });

    it('consume transitions approved→consumed (one-shot)', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);
      await store.approve(t1, hold.id, 'reviewer-1');

      const consumed = await store.consume(t1, hold.id);
      expect(consumed).toBe(true);

      // Second consume is a no-op
      const again = await store.consume(t1, hold.id);
      expect(again).toBe(false);

      const got = await store.get(t1, hold.id);
      expect(got!.status).toBe('consumed');
    });

    it('consume on a non-approved hold is a no-op', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);

      const consumed = await store.consume(t1, hold.id);
      expect(consumed).toBe(false);
    });

    it('approve throws on non-pending hold', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);
      await store.approve(t1, hold.id, 'reviewer-1');

      await expect(store.approve(t1, hold.id, 'reviewer-2')).rejects.toThrow(/not pending/);
    });

    it('approve throws on non-existent hold', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      await expect(store.approve(t1, 'nonexistent', 'reviewer-1')).rejects.toThrow(/not found/);
    });

    it('cross-tenant queries return nothing (fail closed)', async () => {
      const t1 = tenantId('1');
      const t2 = tenantId('2');
      const store = await factory();
      const hold = makeHold(t1);
      await store.create(hold);

      // get from wrong tenant → null
      const cross = await store.get(t2, hold.id);
      expect(cross).toBeNull();

      // approve from wrong tenant → throws not found
      await expect(store.approve(t2, hold.id, 'reviewer-2')).rejects.toThrow(/not found/);

      // list from wrong tenant → empty
      const crossList = await store.list(t2);
      expect(crossList).toEqual([]);

      // consume from wrong tenant → false
      await store.approve(t1, hold.id, 'reviewer-1');
      const crossConsume = await store.consume(t2, hold.id);
      expect(crossConsume).toBe(false);

      // original tenant still sees the hold
      const stillThere = await store.get(t1, hold.id);
      expect(stillThere).not.toBeNull();
      expect(stillThere!.status).toBe('approved');
    });

    it('list returns holds for the tenant, sorted by createdAt desc', async () => {
      const t1 = tenantId('1');
      const t2 = tenantId('2');
      const store = await factory();
      const h1 = makeHold(t1, 'Action1');
      h1.createdAt = '2024-01-01T00:00:00.000Z';
      const h2 = makeHold(t1, 'Action2');
      h2.createdAt = '2024-01-02T00:00:00.000Z';
      await store.create(h1);
      await store.create(h2);
      // Different tenant
      await store.create(makeHold(t2, 'Action3'));

      const all = await store.list(t1);
      expect(all).toHaveLength(2);
      expect(all[0]!.actionName).toBe('Action2'); // newest first
      expect(all[1]!.actionName).toBe('Action1');
    });

    it('list filters by status', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const h1 = makeHold(t1);
      const h2 = makeHold(t1);
      await store.create(h1);
      await store.create(h2);
      await store.approve(t1, h1.id, 'reviewer-1');

      const pending = await store.list(t1, 'pending');
      const approved = await store.list(t1, 'approved');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe(h2.id);
      expect(approved).toHaveLength(1);
      expect(approved[0]!.id).toBe(h1.id);
    });

    it('cleanupExpired marks expired pending holds', async () => {
      const t1 = tenantId('1');
      const store = await factory();
      const now = new Date();
      const expired: AgentHoldRecord = {
        id: randomUUID(),
        actionName: 'DeletePatient',
        riskLevel: 'high',
        agentContext: { agentId: 'agent-1', dryRun: false, tenantId: t1 },
        status: 'pending',
        createdAt: new Date(now.getTime() - 120 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 60 * 1000).toISOString(), // expired
      };
      const active = makeHold(t1);
      await store.create(expired);
      await store.create(active);

      const cleaned = await store.cleanupExpired();
      expect(cleaned).toBe(1);

      const got = await store.get(t1, expired.id);
      expect(got!.status).toBe('expired');

      const stillPending = await store.get(t1, active.id);
      expect(stillPending!.status).toBe('pending');
    });
  });
}

runTests('Memory', async () => new InMemoryAgentHoldStore());

const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => {
    if (provider) await provider.close();
  });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    return new PostgresAgentHoldStore(provider.pool);
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: AgentHoldStore', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
