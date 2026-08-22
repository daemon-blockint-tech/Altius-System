/**
 * Runs the AgentThreadStore conformance category against every provider, and
 * checks the Postgres one survives losing the process.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set
 * and, under REQUIRE_PG, fails the job rather than skipping when it is not — a
 * contract suite that quietly drops one of its two providers proves nothing,
 * since agreement is the whole point.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { AgentThreadStore, OntologySchema, RequestContext } from '@altius/spi';
import { InMemoryAgentThreadStore } from '@altius/engine';
import { PostgresStorageProvider, PostgresAgentThreadStore } from '@altius/storage-postgres';
import { registerAgentThreadTests } from './categories/agent-threads.js';
import { pgTestUrl } from './pg-gate.js';

// ── Memory ────────────────────────────────────────────────────────────────
const memory = new InMemoryAgentThreadStore();
registerAgentThreadTests('InMemoryAgentThreadStore', (): AgentThreadStore => memory);

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

const AGENT_TABLES = ['messages', 'threads'];

if (PG_TEST_URL) {
  const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL));

  const SCHEMA_VERSION = 969696;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'ThrConfDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
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
      await provider.applySchema({ tenantId: 't_thr_bootstrap', actorId: 'conformance' }, ontology);
    })();
    return ready;
  };

  registerAgentThreadTests('PostgresAgentThreadStore', async (): Promise<AgentThreadStore> => {
    await ensureSchema();
    return new PostgresAgentThreadStore(provider.pool);
  });

  afterAll(async () => {
    for (const table of AGENT_TABLES) {
      await provider.pool
        .query(`DELETE FROM "agent_threads"."${table}" WHERE "tenant_id" LIKE 't_thr_%'`)
        .catch(() => {});
    }
    await provider.close();
  });
}

// ── Storage invariants the shared contract cannot express ─────────────────
// `getMessages` short-circuits on a missing thread, so the contract-level
// "deletes a thread and its messages" case cannot tell a deleted transcript
// from an orphaned one. Orphans would accumulate silently and forever, so the
// claim is checked against the table directly.
if (PG_TEST_URL) describe('PostgresAgentThreadStore storage invariants', () => {
  it('leaves no orphaned messages behind when a thread is deleted', async () => {
    const TENANT = 't_thr_orphan';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'u1' };
    const provider = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const store = new PostgresAgentThreadStore(provider.pool);
      const thread = await store.createThread(ctx, { name: 'to be deleted' });
      await store.addMessage(ctx, thread.id, { role: 'user', content: 'one' });
      await store.addMessage(ctx, thread.id, { role: 'assistant', content: 'two' });

      const before = await provider.pool.query(
        `SELECT COUNT(*)::int AS n FROM "agent_threads"."messages" WHERE "tenant_id"=$1 AND "thread_id"=$2`,
        [TENANT, thread.id],
      );
      expect(before.rows[0].n).toBe(2);

      await store.deleteThread(ctx, thread.id);

      const after = await provider.pool.query(
        `SELECT COUNT(*)::int AS n FROM "agent_threads"."messages" WHERE "tenant_id"=$1 AND "thread_id"=$2`,
        [TENANT, thread.id],
      );
      expect(after.rows[0].n).toBe(0);
    } finally {
      for (const table of AGENT_TABLES) {
        await provider.pool
          .query(`DELETE FROM "agent_threads"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await provider.close();
    }
  });
});

// ── Durability ────────────────────────────────────────────────────────────
// The SPI docstring for this interface says it "replaces the in-process
// MemorySaver with a storage-backed implementation that survives process
// restarts". Until this store existed that described an intention; this case is
// what turns it into a checked claim.
//
// What is being protected is somebody's conversation with an agent. Losing it
// is not an error — the agent simply has no memory and starts again, which from
// the user's side is indistinguishable from never having spoken to it.
if (PG_TEST_URL) describe('PostgresAgentThreadStore durability', () => {
  it('survives a restart: the thread, its transcript and its order are all still there', async () => {
    const TENANT = 't_thr_restart';
    const ctx: RequestContext = { tenantId: TENANT, actorId: 'clinician-3' };

    const first = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    let threadId: string;
    let otherId: string;
    let messageIds: string[] = [];
    try {
      await first.pool.query('DELETE FROM _schema_migrations WHERE version = $1', [979899]).catch(() => {});
      await first.applySchema(ctx, {
        version: 979899,
        objectTypes: [{ name: 'ThrRestartDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
        linkTypes: [],
      });
      const store = new PostgresAgentThreadStore(first.pool);

      const other = await store.createThread(ctx, { name: 'earlier conversation' });
      otherId = other.id;

      const thread = await store.createThread(ctx, { name: 'Ward capacity', model: 'claude-sonnet' });
      threadId = thread.id;

      messageIds = [
        (await store.addMessage(ctx, threadId, { role: 'user', content: 'how many beds are free on ward A?' })).id,
        (await store.addMessage(ctx, threadId, { role: 'assistant', content: 'checking now' })).id,
        (await store.addMessage(ctx, threadId, {
          role: 'tool',
          toolCalls: [{ id: 'call_1', name: 'countBeds', args: { ward: 'A' } }],
          toolResult: { free: 3, closed: 1 },
        })).id,
        (await store.addMessage(ctx, threadId, { role: 'assistant', content: 'three free, one closed', model: 'claude-sonnet' })).id,
      ];
    } finally {
      await first.close();
    }

    // A brand-new provider and pool — what a second replica is.
    const second = new PostgresStorageProvider(pgConfig(PG_TEST_URL!));
    try {
      const store = new PostgresAgentThreadStore(second.pool);

      const thread = await store.getThread(ctx, threadId!);
      expect(thread).not.toBeNull();
      expect(thread!.name).toBe('Ward capacity');
      expect(thread!.model).toBe('claude-sonnet');
      expect(thread!.userId).toBe('clinician-3');

      // The transcript, in the order it was written — four messages sent back
      // to back, so nothing but a real sequence keeps them straight.
      const messages = await store.getMessages(ctx, threadId!);
      expect(messages.map(m => m.id)).toEqual(messageIds);
      expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
      // Including the tool payloads, which are the part a TEXT column mangles.
      expect(messages[2]!.toolCalls).toEqual([{ id: 'call_1', name: 'countBeds', args: { ward: 'A' } }]);
      expect(messages[2]!.toolResult).toEqual({ free: 3, closed: 1 });

      // The window on the end of the conversation still ends where it did.
      expect((await store.getMessages(ctx, threadId!, 2)).map(m => m.content))
        .toEqual([undefined, 'three free, one closed']);

      // And the list order, which the messages changed before the restart: the
      // thread that was talked to sorts above the one that was not.
      expect((await store.listThreads(ctx)).map(t => t.id)).toEqual([threadId!, otherId!]);

      // Still writable through the new pool, and still isolated.
      const added = await store.addMessage(ctx, threadId!, { role: 'user', content: 'and ward B?' });
      expect((await store.getMessages(ctx, threadId!))).toHaveLength(5);
      expect(added.threadId).toBe(threadId!);
      expect(await store.getThread({ tenantId: 'someone-else', actorId: 'x' }, threadId!)).toBeNull();
    } finally {
      for (const table of AGENT_TABLES) {
        await second.pool
          .query(`DELETE FROM "agent_threads"."${table}" WHERE "tenant_id" = $1`, [TENANT])
          .catch(() => {});
      }
      await second.close();
    }
  });
});
