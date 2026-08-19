/**
 * CommentsWidget — threads on ontology objects with @mentions, replies, resolve.
 *
 * Config:
 *   objectType?: string       — the object type to comment on
 *   objectId?: string         — the object ID to comment on
 *   plural?: string           — plural form (auto-derived if not set)
 *   showResolve?: boolean     — show resolve/unresolve buttons (default true)
 *   width?: number            — default 500
 *   height?: number           — default 400
 *
 * Features:
 *   - List comment threads on an object
 *   - Create new threads
 *   - Reply to threads
 *   - Edit and delete comments
 *   - Resolve/unresolve threads
 *   - @-mention parsing (display highlighted)
 *   - Loading and error states
 *   - Bound variable for selected comment
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  resolveThread,
  unresolveThread,
  type Comment,
} from '../comments-client.js';

interface CommentsConfig {
  objectType?: string;
  objectId?: string;
  plural?: string;
  showResolve?: boolean;
  width?: number;
  height?: number;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function renderMentions(body: string): React.ReactNode {
  // Split on @mentions and highlight them
  const parts = body.split(/(@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={i} style={{ color: '#2563eb', fontWeight: 500, background: '#eff6ff', padding: '0 2px', borderRadius: 2 }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export function CommentsWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as CommentsConfig;
  const width = config.width ?? 500;
  const height = config.height ?? 400;
  const objectType = config.objectType ?? '';
  const objectId = config.objectId ?? '';
  const plural = config.plural ?? (objectType ? objectType.toLowerCase() + 's' : 'objects');
  const showResolve = config.showResolve ?? true;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newThreadBody, setNewThreadBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const loadComments = useCallback(async () => {
    if (!objectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listComments(plural, objectId);
      setComments(result.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [plural, objectId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleCreateThread = useCallback(async () => {
    if (!newThreadBody.trim() || !objectId) return;
    setLoading(true);
    setError(null);
    try {
      await createComment(plural, objectId, newThreadBody);
      setNewThreadBody('');
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create comment');
    } finally {
      setLoading(false);
    }
  }, [newThreadBody, plural, objectId, loadComments]);

  const handleReply = useCallback(async (parentId: string) => {
    if (!replyBody.trim() || !objectId) return;
    setLoading(true);
    setError(null);
    try {
      await createComment(plural, objectId, replyBody, parentId);
      setReplyBody('');
      setReplyingTo(null);
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reply');
    } finally {
      setLoading(false);
    }
  }, [replyBody, plural, objectId, loadComments]);

  const handleEdit = useCallback(async (commentId: string) => {
    if (!editBody.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateComment(commentId, editBody);
      setEditingId(null);
      setEditBody('');
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit');
    } finally {
      setLoading(false);
    }
  }, [editBody, loadComments]);

  const handleDelete = useCallback(async (commentId: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteComment(commentId);
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setLoading(false);
    }
  }, [loadComments]);

  const handleResolve = useCallback(async (commentId: string, resolved: boolean) => {
    setLoading(true);
    setError(null);
    try {
      if (resolved) {
        await unresolveThread(commentId);
      } else {
        await resolveThread(commentId);
      }
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle resolve');
    } finally {
      setLoading(false);
    }
  }, [loadComments]);

  // Build thread tree
  const threads = comments.filter(c => c.parentCommentId === null);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }

  return (
    <div style={{ width, height, border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: 12, overflow: 'auto', padding: 8, boxSizing: 'border-box' }} aria-label="Comments panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Comments ({threads.length} threads)</strong>
        <button onClick={loadComments} disabled={loading} style={{ fontSize: 11, padding: '2px 8px' }}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: '4px 8px', borderRadius: 4, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* New thread */}
      {objectId && (
        <div style={{ marginBottom: 12, padding: 8, background: '#f9fafb', borderRadius: 4 }}>
          <textarea
            placeholder="Write a comment... (use @username to mention)"
            value={newThreadBody}
            onChange={(e) => setNewThreadBody(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '4px', border: '1px solid #ddd', fontSize: 11, fontFamily: 'sans-serif', boxSizing: 'border-box' }}
            aria-label="New comment body"
          />
          <button onClick={handleCreateThread} disabled={loading || !newThreadBody.trim()} style={{ marginTop: 4, padding: '2px 12px', fontSize: 11 }}>
            Post Comment
          </button>
        </div>
      )}

      {/* Threads */}
      {threads.length === 0 && !loading && (
        <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>No comments yet</div>
      )}
      {threads.map((thread) => {
        const replies = repliesByParent.get(thread.id) ?? [];
        return (
          <div key={thread.id} style={{ marginBottom: 12, padding: 8, background: thread.resolved ? '#f0fdf4' : '#fff', border: '1px solid #e5e7eb', borderRadius: 4 }}>
            {/* Thread root */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <strong>{thread.authorName ?? thread.authorId}</strong>
                <span style={{ color: '#999', marginLeft: 8, fontSize: 10 }}>{formatTime(thread.createdAt)}</span>
                {thread.edited && <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>(edited)</span>}
                {thread.resolved && <span style={{ color: '#10b981', marginLeft: 8, fontSize: 10 }}>✓ Resolved</span>}
              </div>
            </div>
            {editingId === thread.id ? (
              <div>
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} style={{ width: '100%', fontSize: 11, boxSizing: 'border-box' }} aria-label="Edit body" />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button onClick={() => handleEdit(thread.id)} disabled={loading} style={{ fontSize: 10, padding: '1px 8px' }}>Save</button>
                  <button onClick={() => { setEditingId(null); setEditBody(''); }} style={{ fontSize: 10, padding: '1px 8px' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 4 }}>{renderMentions(thread.body)}</div>
            )}
            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#666' }}>
              <button onClick={() => { setReplyingTo(replyingTo === thread.id ? null : thread.id); setReplyBody(''); }} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: '#666', cursor: 'pointer' }}>
                Reply
              </button>
              <button onClick={() => { setEditingId(thread.id); setEditBody(thread.body); }} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: '#666', cursor: 'pointer' }}>
                Edit
              </button>
              <button onClick={() => handleDelete(thread.id)} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>
                Delete
              </button>
              {showResolve && (
                <button onClick={() => handleResolve(thread.id, thread.resolved)} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: thread.resolved ? '#999' : '#10b981', cursor: 'pointer' }}>
                  {thread.resolved ? 'Unresolve' : 'Resolve'}
                </button>
              )}
            </div>
            {/* Reply form */}
            {replyingTo === thread.id && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
                <textarea
                  placeholder="Reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '4px', border: '1px solid #ddd', fontSize: 11, boxSizing: 'border-box' }}
                  aria-label="Reply body"
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button onClick={() => handleReply(thread.id)} disabled={loading || !replyBody.trim()} style={{ fontSize: 10, padding: '1px 8px' }}>Post Reply</button>
                  <button onClick={() => { setReplyingTo(null); setReplyBody(''); }} style={{ fontSize: 10, padding: '1px 8px' }}>Cancel</button>
                </div>
              </div>
            )}
            {/* Replies */}
            {replies.length > 0 && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
                {replies.map((reply) => (
                  <div key={reply.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{reply.authorName ?? reply.authorId}</strong>
                        <span style={{ color: '#999', marginLeft: 8, fontSize: 10 }}>{formatTime(reply.createdAt)}</span>
                        {reply.edited && <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>(edited)</span>}
                      </div>
                    </div>
                    {editingId === reply.id ? (
                      <div>
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} style={{ width: '100%', fontSize: 11, boxSizing: 'border-box' }} aria-label="Edit reply body" />
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                          <button onClick={() => handleEdit(reply.id)} disabled={loading} style={{ fontSize: 10, padding: '1px 6px' }}>Save</button>
                          <button onClick={() => { setEditingId(null); setEditBody(''); }} style={{ fontSize: 10, padding: '1px 6px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 2 }}>{renderMentions(reply.body)}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                      <button onClick={() => { setEditingId(reply.id); setEditBody(reply.body); }} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: '#666', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => handleDelete(reply.id)} style={{ fontSize: 10, padding: '0', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
