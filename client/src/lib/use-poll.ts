import { useCallback, useEffect, useState } from 'react';

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastUpdatedAt: number | null;
  refresh: () => void;
}

/**
 * Interval polling with stale-while-error semantics: the last good payload is
 * kept when a poll fails, polling pauses while the tab is hidden, and an
 * in-flight request is aborted when the next one starts.
 */
export function usePoll<T>(url: string | null, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const refresh = useCallback((): void => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const body: T = (await response.json()) as T;
        if (cancelled) {
          return;
        }
        setData(body);
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) {
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unknown polling error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void tick();
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [url, intervalMs, nonce]);

  return { data, error, loading, lastUpdatedAt, refresh };
}
