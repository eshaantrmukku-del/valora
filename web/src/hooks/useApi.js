import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/** Fetch an API path; refetches on `valora-store-change` and when the path changes. Pass null to skip. */
export function useApi(path, { pollMs = null } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const ctrl = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { signal: c.signal });
      setState({ data, error: null, loading: false });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setState((s) => ({ data: s.data, error: err, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
    const onChange = () => load(true);
    window.addEventListener('valora-store-change', onChange);
    return () => {
      window.removeEventListener('valora-store-change', onChange);
      ctrl.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!pollMs || !path) return undefined;
    const t = setInterval(() => load(true), pollMs);
    return () => clearInterval(t);
  }, [pollMs, path, load]);

  return { ...state, reload: load };
}
