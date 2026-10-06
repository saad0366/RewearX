import { useEffect, useRef, useState, useCallback } from 'react';
import { ApiError } from './api/client';

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setData: (next: T | null) => void;
}

export function useAsync<T>(
  factory: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const cancelled = useRef(false);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    setError(null);
    factory()
      .then((res) => {
        if (!cancelled.current) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled.current) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Request failed';
        setError(message);
        setLoading(false);
      });
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refetch, setData };
}

export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
