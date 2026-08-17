/**
 * In-memory agent thread store — for development and testing.
 */
import { randomUUID } from 'node:crypto';
import type {
  RequestContext,
  AgentThread,
  ThreadMessage,
  AgentThreadStore,
} from '@altius/spi';

export class InMemoryAgentThreadStore implements AgentThreadStore {
  private readonly threads = new Map<string, AgentThread>();
  private readonly messages = new Map<string, ThreadMessage[]>();

  async createThread(
    ctx: RequestContext,
    input: { name: string; model?: string },
  ): Promise<AgentThread> {
    const now = new Date().toISOString() as string;
    const thread: AgentThread = {
      id: randomUUID(),
      name: input.name,
      userId: ctx.actorId ?? 'unknown',
      tenantId: ctx.tenantId,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    return { ...thread };
  }

  async getThread(ctx: RequestContext, threadId: string): Promise<AgentThread | null> {
    const t = this.threads.get(threadId);
    if (!t || t.tenantId !== ctx.tenantId) return null;
    return { ...t };
  }

  async listThreads(ctx: RequestContext, userId?: string): Promise<AgentThread[]> {
    return [...this.threads.values()]
      .filter((t) => t.tenantId === ctx.tenantId)
      .filter((t) => !userId || t.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ ...t }));
  }

  async updateThread(
    ctx: RequestContext,
    threadId: string,
    updates: { name?: string },
  ): Promise<AgentThread> {
    const existing = this.threads.get(threadId);
    if (!existing || existing.tenantId !== ctx.tenantId) {
      throw new Error(`Thread ${threadId} not found`);
    }
    const updated: AgentThread = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString() as string,
    };
    this.threads.set(threadId, updated);
    return { ...updated };
  }

  async deleteThread(ctx: RequestContext, threadId: string): Promise<void> {
    const t = this.threads.get(threadId);
    if (!t || t.tenantId !== ctx.tenantId) return;
    this.threads.delete(threadId);
    this.messages.delete(threadId);
  }

  async addMessage(
    ctx: RequestContext,
    threadId: string,
    input: Omit<ThreadMessage, 'id' | 'threadId' | 'createdAt'>,
  ): Promise<ThreadMessage> {
    const thread = this.threads.get(threadId);
    if (!thread || thread.tenantId !== ctx.tenantId) {
      throw new Error(`Thread ${threadId} not found`);
    }
    const msg: ThreadMessage = {
      id: randomUUID(),
      threadId,
      ...input,
      createdAt: new Date().toISOString() as string,
    };
    const msgs = this.messages.get(threadId) ?? [];
    msgs.push(msg);
    this.messages.set(threadId, msgs);
    thread.updatedAt = msg.createdAt;
    return { ...msg };
  }

  async getMessages(
    ctx: RequestContext,
    threadId: string,
    limit?: number,
  ): Promise<ThreadMessage[]> {
    const thread = this.threads.get(threadId);
    if (!thread || thread.tenantId !== ctx.tenantId) return [];
    const msgs = this.messages.get(threadId) ?? [];
    const result = limit ? msgs.slice(-limit) : [...msgs];
    return result.map((m) => ({ ...m }));
  }
}
