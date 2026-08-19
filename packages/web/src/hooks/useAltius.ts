/**
 * React hooks for the Altius SDK — useQuery, useMutation, useSubscription.
 *
 * These hooks wrap the generated SDK client to provide React-friendly
 * data access with loading/error states and automatic re-rendering.
 *
 * Usage:
 *   const { data, loading, error } = useQuery(client, (c) => c.facility.list());
 *   const [mutate, { loading }] = useMutation(client, (c, input) => c.dischargePatient.execute(input));
 *   const { data } = useSubscription(client, (c, cb) => c.facility.onAnyChange(cb));
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── useQuery ──

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useQuery<T>(
  client: unknown,
  queryFn: (client: unknown) => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(queryFn);
  fnRef.current = queryFn;

  const execute = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef.current(client)
      .then((result) => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err instanceof Error ? err : new Error(String(err))); setLoading(false); } });
    return () => { cancelled = true; };
  }, [client, ...deps]);

  useEffect(() => {
    const cancel = execute();
    return cancel;
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// ── useMutation ──

interface MutationResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useMutation<TInput, TOutput>(
  client: unknown,
  mutationFn: (client: unknown, input: TInput) => Promise<TOutput>,
): [((input: TInput) => Promise<TOutput>), MutationResult<TOutput>] {
  const [data, setData] = useState<TOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(mutationFn);
  fnRef.current = mutationFn;

  const mutate = useCallback(async (input: TInput): Promise<TOutput> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(client, input);
      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setLoading(false);
      throw e;
    }
  }, [client]);

  return [mutate, { data, loading, error }];
}

// ── useSubscription ──

interface SubscriptionResult<T> {
  data: T | null;
  error: Error | null;
}

export function useSubscription<T>(
  client: unknown,
  subscribeFn: (client: unknown, callback: (data: T) => void) => () => void,
  deps: unknown[] = [],
): SubscriptionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(subscribeFn);
  fnRef.current = subscribeFn;

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = fnRef.current(client, (event: T) => {
        setData(event);
        setError(null);
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [client, ...deps]);

  return { data, error };
}

// ── useAutoRefresh ──

interface AutoRefreshResult {
  data: unknown;
  loading: boolean;
  error: Error | null;
  lastRefreshed: Date | null;
}

export function useAutoRefresh(
  fetchFn: () => Promise<unknown>,
  intervalMs: number,
  enabled: boolean = true,
): AutoRefreshResult {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const result = await fnRef.current();
        if (!cancelled) {
          setData(result);
          setError(null);
          setLastRefreshed(new Date());
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    refresh();
    const interval = setInterval(refresh, intervalMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, intervalMs]);

  return { data, loading, error, lastRefreshed };
}

// ── useVariable ──

interface VariableResult<T> {
  value: T;
  set: (value: T) => void;
}

export function useVariable<T>(
  initialValue: T,
): VariableResult<T> {
  const [value, setValue] = useState<T>(initialValue);
  return { value, set: setValue };
}
