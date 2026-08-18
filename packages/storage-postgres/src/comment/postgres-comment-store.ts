/**
 * PostgreSQL CommentStore — threads and @-mentions on ontology objects.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  CommentStore,
  Comment,
  CommentQuery,
  CommentListResult,
  CommentNotification,
} from '@altius/spi';
import { parseMentions } from '@altius/spi';

export class PostgresCommentStore implements CommentStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createComment(
    comment: Omit<Comment, 'id' | 'createdAt' | 'edited' | 'resolved' | 'mentions'> & { mentions?: string[] },
  ): Promise<Comment> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const mentions = comment.mentions ?? parseMentions(comment.body);
    await this.pool.query(
      `INSERT INTO "comment"."comments"
        ("id", "tenant_id", "object_type", "object_id", "parent_comment_id", "body", "author_id", "author_name", "created_at", "edited", "resolved", "mentions")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE, $10)`,
      [
        id, comment.tenantId, comment.objectType, comment.objectId,
        comment.parentCommentId, comment.body, comment.authorId, comment.authorName ?? null,
        now, JSON.stringify(mentions),
      ],
    );
    return {
      id,
      tenantId: comment.tenantId,
      objectType: comment.objectType,
      objectId: comment.objectId,
      parentCommentId: comment.parentCommentId,
      body: comment.body,
      authorId: comment.authorId,
      authorName: comment.authorName,
      createdAt: now,
      edited: false,
      resolved: false,
      mentions,
    };
  }

  async getComment(tenantId: string, commentId: string): Promise<Comment | null> {
    const result = await this.pool.query(
      `SELECT * FROM "comment"."comments" WHERE "id" = $1 AND "tenant_id" = $2`,
      [commentId, tenantId],
    );
    if (result.rows.length === 0) return null;
    return mapComment(result.rows[0]!);
  }

  async listComments(tenantId: string, objectType: string, objectId: string, query?: CommentQuery): Promise<CommentListResult> {
    const conditions = [`"tenant_id" = $1`, `"object_type" = $2`, `"object_id" = $3`];
    const params: unknown[] = [tenantId, objectType, objectId];
    let idx = 4;

    if (query?.threadsOnly) {
      conditions.push(`"parent_comment_id" IS NULL`);
    }
    if (query?.resolved !== undefined) {
      conditions.push(`"resolved" = $${idx++}`);
      params.push(query.resolved);
    }
    if (query?.authorId) {
      conditions.push(`"author_id" = $${idx++}`);
      params.push(query.authorId);
    }

    const limit = query?.limit ?? 100;
    const offset = query?.offset ?? 0;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM "comment"."comments" WHERE ${conditions.join(' AND ')}`,
      params,
    );
    const totalCount = countResult.rows[0]!.count;

    const result = await this.pool.query(
      `SELECT * FROM "comment"."comments" WHERE ${conditions.join(' AND ')}
       ORDER BY "created_at" ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { comments: result.rows.map(r => mapComment(r)), totalCount };
  }

  async updateComment(tenantId: string, commentId: string, body: string): Promise<Comment> {
    const mentions = parseMentions(body);
    await this.pool.query(
      `UPDATE "comment"."comments" SET "body" = $3, "edited" = TRUE, "updated_at" = NOW(), "mentions" = $4
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [commentId, tenantId, body, JSON.stringify(mentions)],
    );
    const updated = await this.getComment(tenantId, commentId);
    return updated!;
  }

  async deleteComment(tenantId: string, commentId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "comment"."comments" WHERE "id" = $1 AND "tenant_id" = $2`,
      [commentId, tenantId],
    );
  }

  async setResolved(tenantId: string, commentId: string, resolved: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE "comment"."comments" SET "resolved" = $3, "updated_at" = NOW()
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [commentId, tenantId, resolved],
    );
  }

  async getNotifications(tenantId: string, userId: string, unreadOnly?: boolean): Promise<CommentNotification[]> {
    const conditions = [`"tenant_id" = $1`, `"user_id" = $2`];
    const params: unknown[] = [tenantId, userId];
    if (unreadOnly) {
      conditions.push(`"read" = FALSE`);
    }
    const result = await this.pool.query(
      `SELECT * FROM "comment"."comment_notifications" WHERE ${conditions.join(' AND ')}
       ORDER BY "created_at" DESC`,
      params,
    );
    return result.rows.map((r) => ({
      id: r['id'],
      tenantId: r['tenant_id'],
      userId: r['user_id'],
      commentId: r['comment_id'],
      objectType: r['object_type'],
      objectId: r['object_id'],
      type: r['type'],
      createdAt: r['created_at'],
      read: r['read'],
    }));
  }

  async markNotificationRead(tenantId: string, notificationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "comment"."comment_notifications" SET "read" = TRUE
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [notificationId, tenantId],
    );
  }
}

function mapComment(r: Record<string, unknown>): Comment {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    objectType: r['object_type'] as string,
    objectId: r['object_id'] as string,
    parentCommentId: r['parent_comment_id'] as string | null,
    body: r['body'] as string,
    authorId: r['author_id'] as string,
    authorName: r['author_name'] as string | undefined,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string | undefined,
    edited: r['edited'] as boolean,
    resolved: r['resolved'] as boolean,
    mentions: r['mentions'] as string[] ?? [],
  };
}
