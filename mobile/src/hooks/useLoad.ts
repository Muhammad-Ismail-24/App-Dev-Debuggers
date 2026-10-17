import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

// Initial load → skeleton; refresh keeps current content and only surfaces an error when there
// is nothing to show. `load` must be stable (wrap in useCallback) — a new identity reloads.
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const run = useCallback(async (): Promise<LoadState<T>> => {
    try {
      return { status: 'ready', data: await load() };
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : "Couldn't load this right now." };
    }
  }, [load]);

  useEffect(() => {
    alive.current = true;
    setState({ status: 'loading' });
    void run().then((next) => alive.current && setState(next));
    return () => {
      alive.current = false;
    };
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await run();
    if (!alive.current) return;
    setState((prev) => (next.status === 'error' && prev.status === 'ready' ? prev : next));
    setRefreshing(false);
  }, [run]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void run().then((next) => alive.current && setState(next));
  }, [run]);

  return { state, refreshing, refresh, retry };
}
