/**
 * PostgreSQL agent thread store — multi-turn conversations and their messages.
 *
 * The SPI's own docstring for this interface says it "replaces the in-process
 * MemorySaver with a storage-backed implementation that survives process
 * restarts". Until this store existed the only implementation was a `Map`, so
 * that sentence described an intention rather than a fact, and #14's gate
 * withheld the service under Postgres — its routes answered 404.
 *
 * ── What losing a thread looks like ──
 *
 * Not an error. The agent does not report that it has forgotten; it simply has
 * no memory of the conversation and starts again from nothing. From the user's
 * side that is indistinguishable from having never spoken to it. Quiet, in the
 * way that matters most to the person using it.
 *
 * ── Ordering ──
 *
 * A conversation is an ordered transcript, so messages carry a sequence rather
 * than relying on their timestamps: several messages in one turn routinely
 * share a millisecond, and a transcript that reordered itself between reads
 * would be worse than one that was slow. Threads are listed
 * most-recently-updated first, with the sequence breaking ties — and ties are
 * the common case, because a fresh thread's `createdAt` and `updatedAt` are the
 * same reading of the clock.
 *
 * ── Timestamps are TEXT ──
 *
 * `createdAt` and `updatedAt` are `DateTime`, which is a string on the wire,
 * and the in-memory service compares them lexicographically when it sorts. They
 * are stored as the strings they arrive as, so the two providers order a list
 * identically rather than by a re-parsed instant.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  AgentThread,
  AgentThreadStore,
  MessageRole,
  RequestContext,
  ThreadMessage,
} from '@altius/spi';

function mapThread(r: Record<string, unknown>): AgentThread {
  return {
    id: String(r['id']),
    name: String(r['name']),
    userId: String(r['user_id']),
    tenantId: String(r['tenant_id']),
    // Omitted rather than set to undefined, so a thread round-trips to the
    // same shape the in-memory service returns.
    ...(r['model'] === null || r['model'] === undefined ? {} : { model: String(r['model']) }),
    createdAt: String(r['created_at']),
    updatedAt: String(r['updated_at']),
  };
}

function mapMessage(r: Record<string, unknown>): ThreadMessage {
  const toolCalls = r['tool_calls'];
  const toolResult = r['tool_result'];
  return {
    id: String(r['id']),
    threadId: String(r['thread_id']),
    role: r['role'] as MessageRole,
    ...(r['content'] === null || r['content'] === undefined ? {} : { content: String(r['content']) }),
    ...(toolCalls === null || toolCalls === undefined ? {} : { toolCalls }),
    ...(toolResult === null || toolResult === undefined ? {} : { toolResult }),
    ...(r['model'] === null || r['model'] === undefined ? {} : { model: String(r['model']) }),
    createdAt: String(r['created_at']),
  };
}

export class PostgresAgentThreadStore implements AgentThreadStore {
  constructor(private readonly pool: Pool) {}

  // ── Threads ───────────────────────────────────────────────────────────────

  async createThread(ctx: RequestContext, input: { name: string; model?: string }): Promise<AgentThread> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "agent"."threads"
         ("id","tenant_id","name","user_id","model","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING *`,
      // 'unknown' rather than a null owner, matching the in-memory service: a
      // thread always has an owner string, even when the request had no actor.
      [randomUUID(), ctx.tenantId, input.name, ctx.actorId ?? 'unknown', input.model ?? null, now],
    );
    return mapThread(r.rows[0]!);
  }

  async getThread(ctx: RequestContext, threadId: string): Promise<AgentThread | null> {
    const r = await this.pool.query(
      `SELECT * FROM "agent"."threads" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, threadId],
    );
    return r.rows[0] ? mapThread(r.rows[0]) : null;
  }

  async listThreads(ctx: RequestContext, userId?: string): Promise<AgentThread[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "agent"."threads" WHERE "tenant_id"=$1`;
    if (userId) { params.push(userId); sql += ` AND "user_id"=$${params.length}`; }
    // Most recently touched first — which is what a conversation list is for —
    // with `seq` DESC breaking ties, so the newest-created thread wins a tie.
    // Ascending would order ties oldest-first and contradict the promise; the
    // in-memory provider had exactly that bug, and it is the common case rather
    // than the edge one (see the header).
    sql += ` ORDER BY "updated_at" DESC, "seq" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapThread);
  }

  async updateThread(ctx: RequestContext, threadId: string, updates: { name?: string }): Promise<AgentThread> {
    const current = await this.getThread(ctx, threadId);
    // The message names the id but not the tenant, matching the in-memory
    // service: a thread in another tenant is reported as absent rather than as
    // forbidden, which is the right answer to give a caller who should not know
    // it exists.
    if (!current) throw new Error(`Thread ${threadId} not found`);
    const r = await this.pool.query(
      `UPDATE "agent"."threads" SET "name"=$3, "updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, threadId, updates.name ?? current.name, new Date().toISOString()],
    );
    return mapThread(r.rows[0]!);
  }

  async deleteThread(ctx: RequestContext, threadId: string): Promise<void> {
    // Messages go with the thread, and silently: deleting a thread that is not
    // there, or belongs to someone else, is not an error in either provider.
    await this.pool.query(
      `DELETE FROM "agent"."messages" WHERE "tenant_id"=$1 AND "thread_id"=$2`,
      [ctx.tenantId, threadId],
    );
    await this.pool.query(
      `DELETE FROM "agent"."threads" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, threadId],
    );
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async addMessage(
    ctx: RequestContext,
    threadId: string,
    input: Omit<ThreadMessage, 'id' | 'threadId' | 'createdAt'>,
  ): Promise<ThreadMessage> {
    const thread = await this.getThread(ctx, threadId);
    if (!thread) throw new Error(`Thread ${threadId} not found`);
    const createdAt = new Date().toISOString();

    const r = await this.pool.query(
      `INSERT INTO "agent"."messages"
         ("id","tenant_id","thread_id","role","content","tool_calls","tool_result","model","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, threadId, input.role,
        input.content ?? null,
        input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
        input.toolResult === undefined ? null : JSON.stringify(input.toolResult),
        input.model ?? null, createdAt,
      ],
    );

    // Adding a message touches the thread, so a conversation that is being used
    // floats to the top of the list. The in-memory service does this by mutating
    // the stored thread; here it is a second statement, and it uses the
    // message's own timestamp rather than a fresh one so the two agree exactly.
    await this.pool.query(
      `UPDATE "agent"."threads" SET "updated_at"=$3 WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, threadId, createdAt],
    );
    return mapMessage(r.rows[0]!);
  }

  async getMessages(ctx: RequestContext, threadId: string, limit?: number): Promise<ThreadMessage[]> {
    // A thread that is not there returns nothing rather than throwing — unlike
    // addMessage, which throws. That asymmetry is the in-memory service's and
    // is reproduced rather than smoothed.
    const thread = await this.getThread(ctx, threadId);
    if (!thread) return [];

    if (limit === undefined) {
      const r = await this.pool.query(
        `SELECT * FROM "agent"."messages"
          WHERE "tenant_id"=$1 AND "thread_id"=$2 ORDER BY "seq"`,
        [ctx.tenantId, threadId],
      );
      return r.rows.map(mapMessage);
    }

    // `limit` takes the LAST n messages, not the first — the in-memory service
    // does `slice(-limit)`, because the useful window of a conversation is its
    // most recent turns. They still come back oldest-first, so the transcript
    // reads forwards; hence the inner ORDER BY ... DESC and the outer reversal.
    const r = await this.pool.query(
      `SELECT * FROM (
         SELECT * FROM "agent"."messages"
          WHERE "tenant_id"=$1 AND "thread_id"=$2
          ORDER BY "seq" DESC LIMIT $3
       ) recent ORDER BY "seq"`,
      [ctx.tenantId, threadId, limit],
    );
    return r.rows.map(mapMessage);
  }
}
