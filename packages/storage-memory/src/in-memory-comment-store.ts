/**
 * In-memory comment store for development and testing.
 */

import { randomUUID } from 'node:crypto';
import type { CommentStore, Comment, CommentQuery, CommentListResult, CommentNotification } from '@altius/spi';
import { parseMentions } from '@altius/spi';

export class InMemoryCommentStore implements CommentStore {
  private readonly comments = new Map<string, Map<string, Comment>>();
  private readonly notifications = new Map<string, Map<string, CommentNotification>>();

  async createComment(comment: Omit<Comment, 'id' | 'createdAt' | 'edited' | 'resolved' | 'mentions'> & { mentions?: string[] }): Promise<Comment> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const mentions = comment.mentions ?? parseMentions(comment.body);
    const created: Comment = {
      ...comment,
      id,
      createdAt: now,
      edited: false,
      resolved: false,
      mentions,
    };
    const tenantComments = this.getOrCreate(this.comments, comment.tenantId);
    tenantComments.set(id, created);

    // Create notifications for mentioned users
    for (const userId of mentions) {
      if (userId === comment.authorId) continue; // Don't notify self
      const notification: CommentNotification = {
        id: randomUUID(),
        tenantId: comment.tenantId,
        userId,
        commentId: id,
        objectType: comment.objectType,
        objectId: comment.objectId,
        type: 'mention',
        createdAt: now,
        read: false,
      };
      const tenantNotifs = this.getOrCreate(this.notifications, comment.tenantId);
      tenantNotifs.set(notification.id, notification);
    }

    // If it's a reply, notify the parent comment's author
    if (comment.parentCommentId) {
      const parent = tenantComments.get(comment.parentCommentId);
      if (parent && parent.authorId !== comment.authorId) {
        const notification: CommentNotification = {
          id: randomUUID(),
          tenantId: comment.tenantId,
          userId: parent.authorId,
          commentId: id,
          objectType: comment.objectType,
          objectId: comment.objectId,
          type: 'reply',
          createdAt: now,
          read: false,
        };
        const tenantNotifs = this.getOrCreate(this.notifications, comment.tenantId);
        tenantNotifs.set(notification.id, notification);
      }
    }

    return created;
  }

  async getComment(tenantId: string, commentId: string): Promise<Comment | null> {
    return this.comments.get(tenantId)?.get(commentId) ?? null;
  }

  async listComments(tenantId: string, objectType: string, objectId: string, query?: CommentQuery): Promise<CommentListResult> {
    const tenantComments = this.comments.get(tenantId);
    if (!tenantComments) return { comments: [], totalCount: 0 };

    let results = Array.from(tenantComments.values()).filter(
      c => c.objectType === objectType && c.objectId === objectId,
    );

    if (query?.threadsOnly) {
      results = results.filter(c => c.parentCommentId === null);
    }
    if (query?.resolved !== undefined) {
      results = results.filter(c => c.resolved === query.resolved);
    }
    if (query?.authorId) {
      results = results.filter(c => c.authorId === query.authorId);
    }

    const totalCount = results.length;

    // Sort by creation time ascending
    results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Pagination
    if (query?.offset) {
      results = results.slice(query.offset);
    }
    if (query?.limit) {
      results = results.slice(0, query.limit);
    }

    return { comments: results, totalCount };
  }

  async updateComment(tenantId: string, commentId: string, body: string): Promise<Comment> {
    const tenantComments = this.comments.get(tenantId);
    if (!tenantComments) throw new Error('Comment not found');
    const comment = tenantComments.get(commentId);
    if (!comment) throw new Error('Comment not found');

    const updated: Comment = {
      ...comment,
      body,
      edited: true,
      updatedAt: new Date().toISOString(),
      mentions: parseMentions(body),
    };
    tenantComments.set(commentId, updated);
    return updated;
  }

  async deleteComment(tenantId: string, commentId: string): Promise<void> {
    const tenantComments = this.comments.get(tenantId);
    if (!tenantComments) return;
    tenantComments.delete(commentId);
  }

  async setResolved(tenantId: string, commentId: string, resolved: boolean): Promise<void> {
    const tenantComments = this.comments.get(tenantId);
    if (!tenantComments) return;
    const comment = tenantComments.get(commentId);
    if (!comment) return;
    tenantComments.set(commentId, { ...comment, resolved });
  }

  async getNotifications(tenantId: string, userId: string, unreadOnly?: boolean): Promise<CommentNotification[]> {
    const tenantNotifs = this.notifications.get(tenantId);
    if (!tenantNotifs) return [];
    let results = Array.from(tenantNotifs.values()).filter(n => n.userId === userId);
    if (unreadOnly) {
      results = results.filter(n => !n.read);
    }
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results;
  }

  async markNotificationRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
    const tenantNotifs = this.notifications.get(tenantId);
    if (!tenantNotifs) return;
    const notif = tenantNotifs.get(notificationId);
    // Only the recipient may mark their own notification read.
    if (notif && notif.userId === userId) {
      tenantNotifs.set(notificationId, { ...notif, read: true });
    }
  }

  private getOrCreate<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
    }
    return m;
  }
}
