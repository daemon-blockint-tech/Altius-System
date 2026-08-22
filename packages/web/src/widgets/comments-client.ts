import { authedFetch } from './auth-fetch.js';
/**
 * Comments client — helpers for fetching and posting comments from the backend.
 *
 * Wraps the REST API at /api/v1/{plural}/:id/comments and /api/v1/comments/*.
 */

/** A comment on an ontology object. */
export interface Comment {
  id: string;
  objectType: string;
  objectId: string;
  parentCommentId: string | null;
  body: string;
  authorId: string;
  authorName?: string;
  createdAt: string;
  updatedAt?: string;
  edited: boolean;
  resolved: boolean;
  mentions: string[];
}

/** Query parameters for listing comments. */
export interface CommentQuery {
  threadsOnly?: boolean;
  resolved?: boolean;
  authorId?: string;
  limit?: number;
  offset?: number;
}

/** A comment notification. */
export interface CommentNotification {
  id: string;
  userId: string;
  commentId: string;
  objectType: string;
  objectId: string;
  type: 'mention' | 'reply' | 'resolved';
  createdAt: string;
  read: boolean;
}

// ── Comments ──

export async function listComments(
  plural: string,
  objectId: string,
  query?: CommentQuery,
  baseUrl = '/api/v1',
): Promise<{ comments: Comment[]; totalCount: number }> {
  const url = new URL(`${baseUrl}/${plural}/${encodeURIComponent(objectId)}/comments`, window.location.origin);
  if (query?.threadsOnly) url.searchParams.set('threadsOnly', 'true');
  if (query?.resolved !== undefined) url.searchParams.set('resolved', String(query.resolved));
  if (query?.authorId) url.searchParams.set('authorId', query.authorId);
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.offset) url.searchParams.set('offset', String(query.offset));
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listComments: ${res.status}`);
  return res.json() as Promise<{ comments: Comment[]; totalCount: number }>;
}

export async function createComment(
  plural: string,
  objectId: string,
  body: string,
  parentCommentId?: string,
  baseUrl = '/api/v1',
): Promise<Comment> {
  const res = await authedFetch(`${baseUrl}/${plural}/${encodeURIComponent(objectId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, parentCommentId }),
  });
  if (!res.ok) throw new Error(`createComment: ${res.status}`);
  return res.json() as Promise<Comment>;
}

export async function updateComment(
  commentId: string,
  body: string,
  baseUrl = '/api/v1',
): Promise<Comment> {
  const res = await authedFetch(`${baseUrl}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`updateComment: ${res.status}`);
  return res.json() as Promise<Comment>;
}

export async function deleteComment(commentId: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await authedFetch(`${baseUrl}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteComment: ${res.status}`);
}

export async function resolveThread(commentId: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await authedFetch(`${baseUrl}/comments/${encodeURIComponent(commentId)}/resolve`, { method: 'POST' });
  if (!res.ok) throw new Error(`resolveThread: ${res.status}`);
}

export async function unresolveThread(commentId: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await authedFetch(`${baseUrl}/comments/${encodeURIComponent(commentId)}/unresolve`, { method: 'POST' });
  if (!res.ok) throw new Error(`unresolveThread: ${res.status}`);
}

// ── Notifications (comment-store notifications) ──

export async function listNotifications(unreadOnly?: boolean, baseUrl = '/api/v1'): Promise<CommentNotification[]> {
  const url = new URL(`${baseUrl}/notifications`, window.location.origin);
  if (unreadOnly) url.searchParams.set('unreadOnly', 'true');
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listNotifications: ${res.status}`);
  const data = await res.json() as { notifications: CommentNotification[] };
  return data.notifications;
}

export async function markNotificationRead(notificationId: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await authedFetch(`${baseUrl}/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });
  if (!res.ok) throw new Error(`markNotificationRead: ${res.status}`);
}
