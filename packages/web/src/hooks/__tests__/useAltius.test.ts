/**
 * Tests for React hooks — useQuery, useMutation, useSubscription, useAutoRefresh.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useQuery,
  useMutation,
  useSubscription,
  useAutoRefresh,
  useVariable,
} from '../useAltius.js';

describe('useQuery', () => {
  it('returns loading then data', async () => {
    const mockClient = {};
    const queryFn = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const { result } = renderHook(() => useQuery(mockClient, queryFn));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual({ items: [1, 2, 3] });
    });
  });

  it('returns error on failure', async () => {
    const mockClient = {};
    const queryFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useQuery(mockClient, queryFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });
  });

  it('refetches on refetch call', async () => {
    const mockClient = {};
    const queryFn = vi.fn().mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useQuery(mockClient, queryFn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    queryFn.mockClear();
    act(() => result.current.refetch());
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
  });
});

describe('useMutation', () => {
  it('returns mutate function and loading state', async () => {
    const mockClient = {};
    const mutationFn = vi.fn().mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMutation(mockClient, mutationFn));

    expect(result.current[1].loading).toBe(false);
    expect(typeof result.current[0]).toBe('function');

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current[0]({ input: 'test' });
    });

    expect(mutationResult).toEqual({ success: true });
    expect(mutationFn).toHaveBeenCalledWith(mockClient, { input: 'test' });
  });

  it('sets error on failure', async () => {
    const mockClient = {};
    const mutationFn = vi.fn().mockRejectedValue(new Error('Mutation failed'));
    const { result } = renderHook(() => useMutation(mockClient, mutationFn));

    await act(async () => {
      try { await result.current[0]({}); } catch { /* expected */ }
    });

    expect(result.current[1].error).toBeInstanceOf(Error);
    expect(result.current[1].error?.message).toBe('Mutation failed');
  });
});

describe('useSubscription', () => {
  it('subscribes and receives data', async () => {
    const mockClient = {};
    let callback: ((data: string) => void) | undefined;
    const subscribeFn = vi.fn((_client: unknown, cb: (data: string) => void) => {
      callback = cb;
      return () => { callback = undefined; };
    });

    const { result } = renderHook(() => useSubscription<string>(mockClient, subscribeFn));

    expect(subscribeFn).toHaveBeenCalled();
    expect(result.current.data).toBeNull();

    act(() => callback?.('event-1'));
    expect(result.current.data).toBe('event-1');
  });

  it('unsubscribes on unmount', () => {
    const mockClient = {};
    const unsubscribe = vi.fn();
    const subscribeFn = vi.fn(() => unsubscribe);
    const { unmount } = renderHook(() => useSubscription(mockClient, subscribeFn));

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('useAutoRefresh', () => {
  it('fetches data on mount', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'refreshed' });
    const { result } = renderHook(() => useAutoRefresh(fetchFn, 60000, true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual({ data: 'refreshed' });
      expect(result.current.lastRefreshed).toBeInstanceOf(Date);
    });
  });

  it('does not fetch when disabled', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    renderHook(() => useAutoRefresh(fetchFn, 60000, false));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('useVariable', () => {
  it('returns initial value and setter', () => {
    const { result } = renderHook(() => useVariable(42));
    expect(result.current.value).toBe(42);
    act(() => result.current.set(100));
    expect(result.current.value).toBe(100);
  });
});
