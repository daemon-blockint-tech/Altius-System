/**
 * Comments and collaboration store — threads on ontology objects.
 *
 * A comment thread is attached to an object by (objectType, objectId).
 * Each thread has a parent comment (the thread root) and optional
 * replies. @-mentions are parsed from comment body text and stored
 * as a separate list for notification dispatch.
 */

/** A comment on an ontology object. */
export interface Comment {
  /** Comment ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** The object type being commented on. */
  objectType: string;
  /** The object ID being commented on. */
  objectId: string;
  /** Parent comment ID (null for thread roots). */
  parentCommentId: string | null;
  /** Comment body (Markdown). */
  body: string;
  /** Author actor ID. */
  authorId: string;
  /** Author display name. */
  authorName?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last edit timestamp. */
  updatedAt?: string;
  /** Whether the comment has been edited. */
  edited: boolean;
  /** Whether the comment is resolved (for thread-level resolution). */
  resolved: boolean;
  /** User IDs mentioned in the comment body (parsed from @-mentions). */
  mentions: string[];
}

/** Query parameters for listing comments. */
export interface CommentQuery {
  /** Filter by thread root (parentCommentId === null). */
  threadsOnly?: boolean;
  /** Filter by resolved status. */
  resolved?: boolean;
  /** Filter by author. */
  authorId?: string;
  /** Maximum number of results. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

/** Result of listing comments. */
export interface CommentListResult {
  comments: Comment[];
  totalCount: number;
}

/** A notification for a mentioned user. */
export interface CommentNotification {
  id: string;
  tenantId: string;
  /** The user who was mentioned. */
  userId: string;
  /** The comment that triggered the notification. */
  commentId: string;
  /** The object the comment is on. */
  objectType: string;
  objectId: string;
  /** Notification type. */
  type: 'mention' | 'reply' | 'resolved';
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Whether the notification has been read. */
  read: boolean;
}

/**
 * Comment store — manages threads and replies on ontology objects.
 *
 * Authorization is enforced at the API layer: the caller must have
 * view access to the object to read comments, and write access to
 * post. The store itself is tenant-scoped.
 */
export interface CommentStore {
  /** Create a comment (thread root or reply). */
  createComment(comment: Omit<Comment, 'id' | 'createdAt' | 'edited' | 'resolved' | 'mentions'> & { mentions?: string[] }): Promise<Comment>;

  /** Get a comment by ID. */
  getComment(tenantId: string, commentId: string): Promise<Comment | null>;

  /** List comments for an object. */
  listComments(tenantId: string, objectType: string, objectId: string, query?: CommentQuery): Promise<CommentListResult>;

  /** Update a comment's body (marks as edited). */
  updateComment(tenantId: string, commentId: string, body: string): Promise<Comment>;

  /** Delete a comment. */
  deleteComment(tenantId: string, commentId: string): Promise<void>;

  /** Resolve/unresolve a thread. */
  setResolved(tenantId: string, commentId: string, resolved: boolean): Promise<void>;

  /** Get notifications for a user. */
  getNotifications(tenantId: string, userId: string, unreadOnly?: boolean): Promise<CommentNotification[]>;

  /** Mark a notification as read. */
  markNotificationRead(tenantId: string, notificationId: string): Promise<void>;
}

/**
 * Parse @-mentions from a comment body.
 * Returns an array of user IDs mentioned (without the @ prefix).
 * Supports @userId and @displayName formats.
 */
export function parseMentions(body: string): string[] {
  const mentions = new Set<string>();
  // Match @word patterns — userId or displayName
  const regex = /@([a-zA-Z0-9_.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    mentions.add(match[1]!);
  }
  return Array.from(mentions);
}
