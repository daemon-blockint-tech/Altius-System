/**
 * AgentThreadStore conformance — the same assertions against every provider.
 *
 * A thread is a multi-turn conversation; its messages are an ordered
 * transcript. Two things get weight here beyond the usual CRUD:
 *
 *   1. **Order.** A transcript that reordered itself between reads would be
 *      worse than one that was slow, and several messages in a single turn
 *      routinely share a millisecond — so the ordering cases use messages
 *      written back to back rather than pretending they are spread out.
 *
 *   2. **Tenant isolation on every path.** The in-memory store keys its map by
 *      thread id alone and carries the tenant on the record, checking it on
 *      each read. That is easy to reproduce and easy to get subtly wrong, and
 *      the thing being protected is somebody's conversation with an agent.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AgentThreadStore, RequestContext } from '@altius/spi';

export type AgentThreadFactory = () => AgentThreadStore | Promise<AgentThreadStore>;

export function registerAgentThreadTests(providerName: string, factory: AgentThreadFactory): void {
  describe(`[${providerName}] SPI Conformance: AgentThreadStore`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string, actorId = 'u1'): RequestContext =>
      ({ tenantId: `t_thr_${label}_${counter++}`, actorId });

    describe('threads', () => {
      it('creates a thread owned by the acting user', async () => {
        const store = await factory();
        const ctx = ctxFor('create');
        const t = await store.createThread(ctx, { name: 'Ward capacity', model: 'claude-sonnet' });
        expect(t.name).toBe('Ward capacity');
        expect(t.model).toBe('claude-sonnet');
        expect(t.userId).toBe('u1');
        expect(t.tenantId).toBe(ctx.tenantId);
        // A fresh thread has never been touched, so both stamps are the same
        // reading of the clock.
        expect(t.createdAt).toBe(t.updatedAt);
      });

      it('falls back to an unknown owner when the request has no actor', async () => {
        const store = await factory();
        const ctx: RequestContext = { tenantId: `t_thr_noactor_${counter++}` };
        expect((await store.createThread(ctx, { name: 'anon' })).userId).toBe('unknown');
      });

      it('omits the model when none was given', async () => {
        const store = await factory();
        const t = await store.createThread(ctxFor('nomodel'), { name: 'no model' });
        expect(t.model).toBeUndefined();
      });

      it('reads a thread back by id', async () => {
        const store = await factory();
        const ctx = ctxFor('get');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        const found = await store.getThread(ctx, t.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(t.id);
        expect(found!.name).toBe('Ward capacity');
      });

      it('returns null for a thread that does not exist', async () => {
        const store = await factory();
        expect(await store.getThread(ctxFor('missing'), 'no-such-thread')).toBeNull();
      });

      it('renames a thread and touches it', async () => {
        const store = await factory();
        const ctx = ctxFor('rename');
        const t = await store.createThread(ctx, { name: 'Untitled' });
        const renamed = await store.updateThread(ctx, t.id, { name: 'Ward capacity' });
        expect(renamed.name).toBe('Ward capacity');
        expect(renamed.id).toBe(t.id);
        expect(renamed.createdAt).toBe(t.createdAt);
        expect(renamed.updatedAt >= t.updatedAt).toBe(true);
      });

      it('keeps the name when an update names nothing', async () => {
        const store = await factory();
        const ctx = ctxFor('rename_empty');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        expect((await store.updateThread(ctx, t.id, {})).name).toBe('Ward capacity');
      });

      it('reports a missing thread on update', async () => {
        const store = await factory();
        await expect(store.updateThread(ctxFor('update_gone'), 'no-such-thread', { name: 'x' }))
          .rejects.toThrow(/not found/i);
      });

      it('deletes a thread and its messages', async () => {
        const store = await factory();
        const ctx = ctxFor('delete');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        await store.addMessage(ctx, t.id, { role: 'user', content: 'how many beds?' });
        await store.deleteThread(ctx, t.id);
        expect(await store.getThread(ctx, t.id)).toBeNull();
        // Reads nothing back — though only weakly: `getMessages` short-circuits
        // on the missing thread, so this cannot tell a deleted transcript from
        // an orphaned one. Whether the rows are actually gone is a storage
        // invariant the shared contract cannot express, and it is asserted
        // against the table itself in the Postgres suite.
        expect(await store.getMessages(ctx, t.id)).toEqual([]);
      });

      it('is silent when deleting a thread that does not exist', async () => {
        const store = await factory();
        await expect(store.deleteThread(ctxFor('delete_gone'), 'no-such-thread')).resolves.toBeUndefined();
      });

      it('lists threads most recently updated first', async () => {
        const store = await factory();
        const ctx = ctxFor('list');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
        let first, second, third;
        try {
          first = await store.createThread(ctx, { name: 'first' });
          vi.setSystemTime(new Date('2026-08-20T09:00:01.000Z'));
          second = await store.createThread(ctx, { name: 'second' });
          vi.setSystemTime(new Date('2026-08-20T09:00:02.000Z'));
          third = await store.createThread(ctx, { name: 'third' });
        } finally {
          vi.useRealTimers();
        }
        expect((await store.listThreads(ctx)).map(t => t.id)).toEqual([third.id, second.id, first.id]);
      });

      it('floats a thread to the top when a message is added to it', async () => {
        // The reason `updatedAt` exists: a conversation list is ordered by
        // recent activity, and activity means messages, not renames.
        //
        // The clock is advanced between the writes rather than left to run,
        // because this ordering is only expressible when time has actually
        // passed. `updatedAt` has millisecond resolution, so a thread touched in
        // the same millisecond it was created is indistinguishable from one that
        // was not — and both providers then fall back to creation order. That is
        // a real limit of the data, not of either implementation, and it is worth
        // knowing rather than papering over with a sub-millisecond race: in
        // Postgres the round-trips happen to spread the writes out, in memory
        // they do not, so the same test would pass there and fail here for
        // reasons that have nothing to do with the contract.
        const store = await factory();
        const ctx = ctxFor('list_touch');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
        try {
          const first = await store.createThread(ctx, { name: 'first' });
          vi.setSystemTime(new Date('2026-08-20T09:00:01.000Z'));
          const second = await store.createThread(ctx, { name: 'second' });
          // A minute later the user comes back to the first conversation.
          vi.setSystemTime(new Date('2026-08-20T09:01:00.000Z'));
          await store.addMessage(ctx, first.id, { role: 'user', content: 'hello' });

          const listed = await store.listThreads(ctx);
          expect(listed.map(t => t.id)).toEqual([first.id, second.id]);
          // And the touch is on the thread, not only in the ordering.
          expect(listed[0]!.updatedAt).toBe('2026-08-20T09:01:00.000Z');
          expect(listed[0]!.createdAt).toBe('2026-08-20T09:00:00.000Z');
        } finally {
          vi.useRealTimers();
        }
      });

      it('falls back to creation order when two threads share an updatedAt', async () => {
        // The other half of the case above, stated rather than left implicit:
        // when the timestamps tie, the newest-created thread sorts first. Both
        // providers agree, and neither can do better at this resolution.
        const store = await factory();
        const ctx = ctxFor('list_tie');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
        try {
          const first = await store.createThread(ctx, { name: 'first' });
          const second = await store.createThread(ctx, { name: 'second' });
          expect(first.updatedAt).toBe(second.updatedAt);
          expect((await store.listThreads(ctx)).map(t => t.id)).toEqual([second.id, first.id]);
        } finally {
          vi.useRealTimers();
        }
      });

      it('filters threads by owner', async () => {
        const store = await factory();
        const label = `owner_${counter++}`;
        const alice: RequestContext = { tenantId: `t_thr_${label}`, actorId: 'alice' };
        const bob: RequestContext = { tenantId: `t_thr_${label}`, actorId: 'bob' };
        const hers = await store.createThread(alice, { name: 'alice thread' });
        await store.createThread(bob, { name: 'bob thread' });
        // Same tenant, two users: the filter is about ownership, not isolation.
        expect((await store.listThreads(alice, 'alice')).map(t => t.id)).toEqual([hers.id]);
        expect(await store.listThreads(alice)).toHaveLength(2);
        expect(await store.listThreads(alice, 'nobody')).toHaveLength(0);
      });
    });

    describe('tenant isolation', () => {
      // Every path, because what is being protected is somebody's conversation.

      it('hides a thread from another tenant on every read path', async () => {
        const store = await factory();
        const mine = ctxFor('iso_a');
        const theirs = ctxFor('iso_b');
        const t = await store.createThread(mine, { name: 'private' });
        await store.addMessage(mine, t.id, { role: 'user', content: 'secret' });

        expect(await store.getThread(theirs, t.id)).toBeNull();
        expect(await store.listThreads(theirs)).toHaveLength(0);
        expect(await store.getMessages(theirs, t.id)).toEqual([]);
      });

      it('refuses to write into another tenant`s thread', async () => {
        const store = await factory();
        const mine = ctxFor('iso_write_a');
        const theirs = ctxFor('iso_write_b');
        const t = await store.createThread(mine, { name: 'private' });

        await expect(store.updateThread(theirs, t.id, { name: 'hijacked' })).rejects.toThrow(/not found/i);
        await expect(store.addMessage(theirs, t.id, { role: 'user', content: 'hi' })).rejects.toThrow(/not found/i);
        // Reported as absent rather than forbidden — the right answer for a
        // caller who should not learn the thread exists.
        expect((await store.getThread(mine, t.id))!.name).toBe('private');
      });

      it('leaves another tenant`s thread alone on delete', async () => {
        const store = await factory();
        const mine = ctxFor('iso_del_a');
        const theirs = ctxFor('iso_del_b');
        const t = await store.createThread(mine, { name: 'private' });
        await store.deleteThread(theirs, t.id);
        // Silent, and it did nothing.
        expect(await store.getThread(mine, t.id)).not.toBeNull();
      });
    });

    describe('the transcript', () => {
      it('records a user message', async () => {
        const store = await factory();
        const ctx = ctxFor('msg');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        const m = await store.addMessage(ctx, t.id, { role: 'user', content: 'how many beds?' });
        expect(m.threadId).toBe(t.id);
        expect(m.role).toBe('user');
        expect(m.content).toBe('how many beds?');
        expect(m.createdAt).toBeTruthy();
        expect(m.toolCalls).toBeUndefined();
        expect(m.toolResult).toBeUndefined();
      });

      it('round-trips tool calls and results of arbitrary shape', async () => {
        // `toolCalls` and `toolResult` are declared `unknown`, so anything
        // JSON-serialisable has to survive — this is the part a TEXT column
        // would quietly mangle.
        const store = await factory();
        const ctx = ctxFor('msg_tools');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        const toolCalls = [{ id: 'call_1', name: 'countBeds', args: { ward: 'A', includeClosed: false } }];
        const toolResult = { rows: [{ ward: 'A', free: 3 }], truncated: false };
        const m = await store.addMessage(ctx, t.id, {
          role: 'tool', toolCalls, toolResult, model: 'claude-sonnet',
        });
        const [stored] = await store.getMessages(ctx, t.id);
        expect(stored!.toolCalls).toEqual(toolCalls);
        expect(stored!.toolResult).toEqual(toolResult);
        expect(stored!.model).toBe('claude-sonnet');
        expect(stored!.id).toBe(m.id);
      });

      it('keeps the transcript in the order it was written', async () => {
        // Back to back on purpose: a real turn writes several messages inside
        // one millisecond, and a timestamp alone cannot order them.
        const store = await factory();
        const ctx = ctxFor('msg_order');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        const a = await store.addMessage(ctx, t.id, { role: 'user', content: 'how many beds?' });
        const b = await store.addMessage(ctx, t.id, { role: 'assistant', content: 'checking' });
        const c = await store.addMessage(ctx, t.id, { role: 'tool', toolResult: { free: 3 } });
        const d = await store.addMessage(ctx, t.id, { role: 'assistant', content: 'three' });
        expect((await store.getMessages(ctx, t.id)).map(m => m.id)).toEqual([a.id, b.id, c.id, d.id]);
      });

      it('takes the most recent messages when limited, still oldest-first', async () => {
        // `limit` is a window on the END of the conversation, not the start —
        // the useful part of a long thread is its last few turns. They still
        // read forwards.
        const store = await factory();
        const ctx = ctxFor('msg_limit');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        const ids: string[] = [];
        for (const content of ['one', 'two', 'three', 'four']) {
          ids.push((await store.addMessage(ctx, t.id, { role: 'user', content })).id);
        }
        const last2 = await store.getMessages(ctx, t.id, 2);
        expect(last2.map(m => m.id)).toEqual([ids[2], ids[3]]);
        expect(last2.map(m => m.content)).toEqual(['three', 'four']);
      });

      it('returns the whole transcript when the limit exceeds it', async () => {
        const store = await factory();
        const ctx = ctxFor('msg_limit_big');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        await store.addMessage(ctx, t.id, { role: 'user', content: 'only one' });
        expect(await store.getMessages(ctx, t.id, 50)).toHaveLength(1);
      });

      it('returns nothing for a thread with no messages', async () => {
        const store = await factory();
        const ctx = ctxFor('msg_none');
        const t = await store.createThread(ctx, { name: 'Ward capacity' });
        expect(await store.getMessages(ctx, t.id)).toEqual([]);
      });

      it('returns nothing rather than throwing for a thread that does not exist', async () => {
        // Note the asymmetry with addMessage, which throws: reading a missing
        // thread is empty, writing to one is an error. Pinned because it is
        // surprising and because both providers have to be surprising alike.
        const store = await factory();
        expect(await store.getMessages(ctxFor('msg_gone'), 'no-such-thread')).toEqual([]);
      });

      it('reports a missing thread on addMessage', async () => {
        const store = await factory();
        await expect(store.addMessage(ctxFor('msg_add_gone'), 'no-such-thread', { role: 'user', content: 'hi' }))
          .rejects.toThrow(/not found/i);
      });

      it('keeps each thread`s transcript to itself', async () => {
        const store = await factory();
        const ctx = ctxFor('msg_isolated');
        const one = await store.createThread(ctx, { name: 'one' });
        const two = await store.createThread(ctx, { name: 'two' });
        await store.addMessage(ctx, one.id, { role: 'user', content: 'in one' });
        await store.addMessage(ctx, two.id, { role: 'user', content: 'in two' });
        expect((await store.getMessages(ctx, one.id)).map(m => m.content)).toEqual(['in one']);
        expect((await store.getMessages(ctx, two.id)).map(m => m.content)).toEqual(['in two']);
      });
    });
  });
}
