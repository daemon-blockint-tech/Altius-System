import { describe, it, expect, beforeEach } from 'vitest';
import type { RequestContext } from '@altius/spi';
import { InMemoryAgentThreadStore } from '../agent-threads/in-memory-agent-thread-store.js';

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };
const ctx2: RequestContext = { tenantId: 'tenant-2', actorId: 'user-2' };

describe('InMemoryAgentThreadStore', () => {
  let store: InMemoryAgentThreadStore;

  beforeEach(() => {
    store = new InMemoryAgentThreadStore();
  });

  it('creates a thread', async () => {
    const thread = await store.createThread(ctx, { name: 'My Conversation' });
    expect(thread.id).toBeDefined();
    expect(thread.name).toBe('My Conversation');
    expect(thread.userId).toBe('user-1');
    expect(thread.tenantId).toBe('tenant-1');
  });

  it('gets a thread by id', async () => {
    const created = await store.createThread(ctx, { name: 'Test' });
    const fetched = await store.getThread(ctx, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('isolates threads by tenant', async () => {
    const created = await store.createThread(ctx, { name: 'Tenant 1' });
    const fetched = await store.getThread(ctx2, created.id);
    expect(fetched).toBeNull();
  });

  it('lists threads by user', async () => {
    await store.createThread(ctx, { name: 'Thread A' });
    await store.createThread(ctx, { name: 'Thread B' });
    await store.createThread({ ...ctx, actorId: 'user-3' }, { name: 'Thread C' });
    const threads = await store.listThreads(ctx, 'user-1');
    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.name).sort()).toEqual(['Thread A', 'Thread B']);
  });

  it('adds and retrieves messages', async () => {
    const thread = await store.createThread(ctx, { name: 'Test' });
    await store.addMessage(ctx, thread.id, { role: 'user', content: 'Hello' });
    await store.addMessage(ctx, thread.id, { role: 'assistant', content: 'Hi there' });
    const msgs = await store.getMessages(ctx, thread.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[0]!.content).toBe('Hello');
    expect(msgs[1]!.role).toBe('assistant');
    expect(msgs[1]!.content).toBe('Hi there');
  });

  it('limits retrieved messages to the last N', async () => {
    const thread = await store.createThread(ctx, { name: 'Test' });
    for (let i = 0; i < 10; i++) {
      await store.addMessage(ctx, thread.id, { role: 'user', content: `msg-${i}` });
    }
    const msgs = await store.getMessages(ctx, thread.id, 3);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]!.content).toBe('msg-7');
    expect(msgs[2]!.content).toBe('msg-9');
  });

  it('updates thread name', async () => {
    const thread = await store.createThread(ctx, { name: 'Old' });
    const updated = await store.updateThread(ctx, thread.id, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  it('deletes a thread and its messages', async () => {
    const thread = await store.createThread(ctx, { name: 'Test' });
    await store.addMessage(ctx, thread.id, { role: 'user', content: 'Hello' });
    await store.deleteThread(ctx, thread.id);
    const fetched = await store.getThread(ctx, thread.id);
    expect(fetched).toBeNull();
    const msgs = await store.getMessages(ctx, thread.id);
    expect(msgs).toHaveLength(0);
  });

  it('isolates messages by tenant', async () => {
    const thread = await store.createThread(ctx, { name: 'Test' });
    await store.addMessage(ctx, thread.id, { role: 'user', content: 'Hello' });
    const msgs = await store.getMessages(ctx2, thread.id);
    expect(msgs).toHaveLength(0);
  });
});
