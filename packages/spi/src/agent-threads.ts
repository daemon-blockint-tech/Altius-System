/**
 * Agent thread persistence — durable conversation storage.
 *
 * A thread is a multi-turn conversation between a user and an agent.
 * Each thread contains a sequence of messages (user, assistant, tool calls).
 * Threads are tenant-scoped and owned by a user.
 *
 * This replaces the in-process MemorySaver with a storage-backed
 * implementation that survives process restarts.
 */
import type { DateTime } from './scalars.js';
import type { RequestContext } from './ontology.js';

/** Role of a message in a conversation. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** A single message in a conversation thread. */
export interface ThreadMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  /** Text content for user/assistant messages. */
  content?: string;
  /** Tool call data for tool messages (JSON-serialisable). */
  toolCalls?: unknown;
  /** Tool result data for tool response messages. */
  toolResult?: unknown;
  /** Model that generated this message (for assistant messages). */
  model?: string;
  createdAt: DateTime;
}

/** A conversation thread. */
export interface AgentThread {
  id: string;
  /** Display name (auto-generated or user-set). */
  name: string;
  /** User who owns this thread. */
  userId: string;
  /** Tenant this thread belongs to. */
  tenantId: string;
  /** Agent model used in this thread. */
  model?: string;
  createdAt: DateTime;
  updatedAt: DateTime;
}

/** Storage interface for agent threads and messages. */
export interface AgentThreadStore {
  // Threads
  createThread(ctx: RequestContext, input: { name: string; model?: string }): Promise<AgentThread>;
  getThread(ctx: RequestContext, threadId: string): Promise<AgentThread | null>;
  listThreads(ctx: RequestContext, userId?: string): Promise<AgentThread[]>;
  updateThread(ctx: RequestContext, threadId: string, updates: { name?: string }): Promise<AgentThread>;
  deleteThread(ctx: RequestContext, threadId: string): Promise<void>;

  // Messages
  addMessage(ctx: RequestContext, threadId: string, input: Omit<ThreadMessage, 'id' | 'threadId' | 'createdAt'>): Promise<ThreadMessage>;
  getMessages(ctx: RequestContext, threadId: string, limit?: number): Promise<ThreadMessage[]>;
}
