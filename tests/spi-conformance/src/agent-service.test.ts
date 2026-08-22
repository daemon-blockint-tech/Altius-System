/**
 * AgentService conformance — the same assertions against every provider.
 *
 * Agent definitions (name, system prompt, tools, model) are authoritative
 * user-created config; two providers that disagree store a different agent from
 * the same input. Pinned semantics: CRUD is tenant-scoped, chat appends turns to
 * a persisted thread, and (with no LLM client) run/chat produce the deterministic
 * synthetic reply identically on both providers.
 *
 * Memory always runs; Postgres runs when PG_TEST_URL is set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { AgentService, RequestContext } from '@altius/spi';
import { InMemoryAgentService } from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresAgentService, generatePlatformDDL } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';

// Tenants are unique per run: Postgres keeps rows between runs where a fresh
// Map does not, so a fixed name made the listing and isolation cases count
// every row every previous run had left behind.
const RUN = `agent_${Date.now().toString(36)}_${Math.trunc(process.hrtime()[1] / 1000)}`;
const T = (label: string): string => `${RUN}_${label}`;


const ctx = (tenantId: string): RequestContext => ({ tenantId, actorId: 'user-1' });

function runTests(name: string, factory: () => Promise<AgentService>): void {
  describe(`[${name}] SPI Conformance: AgentService`, () => {
    it('create/get/list/update/delete, tenant-scoped', async () => {
      const svc = await factory();
      const tool = { name: 'search', description: 'Search the ontology' };
      const a = await svc.create(ctx(T('t_1')), { name: 'Helper', systemPrompt: 'Be helpful', tools: [tool] });
      expect(a.name).toBe('Helper');
      expect(a.tools).toEqual([tool]);

      const got = await svc.get(ctx(T('t_1')), a.id);
      expect(got!.systemPrompt).toBe('Be helpful');
      // Another tenant sees nothing.
      expect(await svc.get(ctx(T('t_2')), a.id)).toBeNull();
      expect(await svc.list(ctx(T('t_2')))).toEqual([]);

      const upd = await svc.update(ctx(T('t_1')), a.id, { name: 'Helper2', enabled: false });
      expect(upd.name).toBe('Helper2');
      expect(upd.enabled).toBe(false);
      // Unchanged fields preserved.
      expect(upd.systemPrompt).toBe('Be helpful');

      await svc.delete(ctx(T('t_1')), a.id);
      expect(await svc.get(ctx(T('t_1')), a.id)).toBeNull();
    });

    it('run produces the deterministic reply without an LLM client', async () => {
      const svc = await factory();
      const a = await svc.create(ctx(T('t_run')), { name: 'Echo', systemPrompt: 'sys' });
      const res = await svc.run(ctx(T('t_run')), a.id, { prompt: 'hi' });
      expect(res.response).toBe('Echo says: I received "hi". sys');
      expect(res.model).toBe('local');
    });

    it('chat appends turns to a persisted thread', async () => {
      const svc = await factory();
      const a = await svc.create(ctx(T('t_chat')), { name: 'Echo', systemPrompt: 'sys' });
      const t1 = await svc.chat(ctx(T('t_chat')), a.id, { message: 'one' });
      expect(t1.messages).toHaveLength(2); // user + assistant
      const t2 = await svc.chat(ctx(T('t_chat')), a.id, { threadId: t1.id, message: 'two' });
      expect(t2.id).toBe(t1.id);
      expect(t2.messages).toHaveLength(4); // continued thread persisted
      expect(t2.messages[2]!.content).toBe('two');
    });

    it('isolates agents across tenants', async () => {
      const svc = await factory();
      await svc.create(ctx(T('ten_a')), { name: 'A' });
      await svc.create(ctx(T('ten_b')), { name: 'B' });
      const a = await svc.list(ctx(T('ten_a')));
      expect(a).toHaveLength(1);
      expect(a[0]!.name).toBe('A');
    });
  });
}

runTests('Memory', async () => new InMemoryAgentService());

const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => {
    if (provider) await provider.close();
  });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    for (const stmt of generatePlatformDDL()) await provider.pool.query(stmt);
    return new PostgresAgentService(provider.pool);
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: AgentService', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
