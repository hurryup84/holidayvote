import { createContext, useContext, useEffect, useRef, useState, type DependencyList } from 'react';
import type { Db } from './db';

export const DbContext = createContext<Db | null>(null);

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('DbContext missing');
  return db;
}

/**
 * Runs `query` and re-runs it whenever one of `tables` changes – locally or (phase 2)
 * through sync. This is how the UI stays live.
 */
export function useLiveQuery<T>(
  query: (db: Db) => Promise<T>,
  tables: string[],
  deps: DependencyList,
): { data: T | undefined; error: unknown } {
  const db = useDb();
  const [state, setState] = useState<{ data: T | undefined; error: unknown }>({
    data: undefined,
    error: undefined,
  });
  const run = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    let active = true;
    const exec = () => {
      const n = ++run.current;
      queryRef.current(db).then(
        (data) => active && n === run.current && setState({ data, error: undefined }),
        (error) => {
          console.error(error);
          if (active && n === run.current) setState((s) => ({ data: s.data, error }));
        },
      );
    };
    exec();
    const unsubscribe = db.onChange(tables, exec);
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tables.join(','), ...deps]);

  return state;
}
