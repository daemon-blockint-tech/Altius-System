/**
 * Tests for CommentsWidget — rendering, threads, replies, resolve.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentsWidget } from '../components/CommentsWidget.js';
import type { WidgetProps } from '../types.js';

function mockProps(config: Record<string, unknown>): WidgetProps {
  return {
    instance: {
      id: 'w1',
      type: 'comments',
      config,
    } as never,
    ctx: {
      client: {},
      variables: {},
      setVariable: vi.fn(),
      navigate: vi.fn(),
      currentPageId: 'page-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    },
  };
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CommentsWidget', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders the comments panel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ comments: [], totalCount: 0 }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Comments (0 threads)')).toBeDefined();
    });
  });

  it('loads and displays threads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        comments: [
          {
            id: 'c1', objectType: 'Patient', objectId: 'p1', parentCommentId: null,
            body: 'This patient needs review', authorId: 'u1', authorName: 'Dr. Alice',
            createdAt: '2026-08-19T10:00:00Z', edited: false, resolved: false, mentions: [],
          },
        ],
        totalCount: 1,
      }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Dr. Alice')).toBeDefined();
      expect(screen.getByText('This patient needs review')).toBeDefined();
    });
  });

  it('shows new thread textarea', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ comments: [], totalCount: 0 }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a comment... (use @username to mention)')).toBeDefined();
    });
  });

  it('creates a new thread on submit', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [], totalCount: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1', body: 'New comment' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [], totalCount: 0 }) });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a comment... (use @username to mention)')).toBeDefined();
    });
    const textarea = screen.getByPlaceholderText('Write a comment... (use @username to mention)') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New comment' } });
    const postButton = screen.getByText('Post Comment');
    fireEvent.click(postButton);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const callOpts = mockFetch.mock.calls[1]![1] as RequestInit;
      expect(callOpts.method).toBe('POST');
    });
  });

  it('highlights @mentions in comment body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        comments: [
          {
            id: 'c1', objectType: 'Patient', objectId: 'p1', parentCommentId: null,
            body: 'Hey @alice please review', authorId: 'u1', authorName: 'Dr. Bob',
            createdAt: '2026-08-19T10:00:00Z', edited: false, resolved: false, mentions: ['alice'],
          },
        ],
        totalCount: 1,
      }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      const mention = screen.getByText('@alice');
      expect(mention).toBeDefined();
      expect(mention.style.color).toBe('rgb(37, 99, 235)'); // #2563eb
    });
  });

  it('shows reply button and reply form on click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        comments: [
          {
            id: 'c1', objectType: 'Patient', objectId: 'p1', parentCommentId: null,
            body: 'Thread', authorId: 'u1', authorName: 'Alice',
            createdAt: '2026-08-19T10:00:00Z', edited: false, resolved: false, mentions: [],
          },
        ],
        totalCount: 1,
      }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'Patient', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Reply')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Reply'));
    expect(screen.getByPlaceholderText('Reply...')).toBeDefined();
  });

  it('shows resolve button and toggles on click', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [{ id: 'c1', objectType: 'P', objectId: 'p1', parentCommentId: null, body: 'Thread', authorId: 'u1', authorName: 'A', createdAt: '', edited: false, resolved: false, mentions: [] }], totalCount: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ resolved: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [{ id: 'c1', objectType: 'P', objectId: 'p1', parentCommentId: null, body: 'Thread', authorId: 'u1', authorName: 'A', createdAt: '', edited: false, resolved: true, mentions: [] }], totalCount: 1 }) });
    render(<CommentsWidget {...mockProps({ objectType: 'P', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Resolve')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Resolve'));
    await waitFor(() => {
      expect(mockFetch.mock.calls[1]![1]).toHaveProperty('method', 'POST');
    });
  });

  it('displays replies under threads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        comments: [
          { id: 'c1', objectType: 'P', objectId: 'p1', parentCommentId: null, body: 'Thread', authorId: 'u1', authorName: 'Alice', createdAt: '', edited: false, resolved: false, mentions: [] },
          { id: 'c2', objectType: 'P', objectId: 'p1', parentCommentId: 'c1', body: 'Reply 1', authorId: 'u2', authorName: 'Bob', createdAt: '', edited: false, resolved: false, mentions: [] },
        ],
        totalCount: 2,
      }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'P', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Thread')).toBeDefined();
      expect(screen.getByText('Reply 1')).toBeDefined();
    });
  });

  it('shows empty state when no comments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ comments: [], totalCount: 0 }),
    });
    render(<CommentsWidget {...mockProps({ objectType: 'P', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('No comments yet')).toBeDefined();
    });
  });

  it('displays error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<CommentsWidget {...mockProps({ objectType: 'P', objectId: 'p1' })} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });
});
