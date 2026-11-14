import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useLiveQuery } from '../data/db/DbContext';
import type { Preview } from '../domain/models';

/**
 * The cached preview of a link; fetched only if this phone doesn't have it yet (not on every app start).
 * `loading` while the first fetch runs.
 */
export function usePreview(url: string | null): { preview: Preview | null; loading: boolean } {
  const { repos } = useApp();
  const [fetching, setFetching] = useState(false);
  const { data } = useLiveQuery(() => (url ? repos.previews.get(url) : Promise.resolve(null)), ['preview_cache'], [repos, url]);

  useEffect(() => {
    if (!url) return;
    let active = true;
    setFetching(true);
    void repos.previews.ensure(url).finally(() => active && setFetching(false));
    return () => {
      active = false;
    };
  }, [repos, url]);

  return { preview: data ?? null, loading: data === undefined || (data === null && fetching) };
}
