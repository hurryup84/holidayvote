import type { Db, DbExecutor, SqlParam } from './db';
import { SCHEMA, schemaToDdl, type TableDef } from './schema';

/** What a SQLite driver must provide (sql.js, @capacitor-community/sqlite). One connection. */
export interface RawConn {
  /** Statement without result rows (INSERT / UPDATE / DELETE). */
  run(sql: string, params: SqlParam[]): Promise<void>;
  /** DDL, may contain several statements (CREATE TRIGGER … BEGIN …; END). */
  script(sql: string): Promise<void>;
  all<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  batch(sql: string, paramSets: SqlParam[][]): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
  /** Called after every completed write (web: persist the file). */
  afterWrite?(): Promise<void>;
}

const WRITE_RE = /^\s*(?:insert\s+(?:or\s+\w+\s+)?into|replace\s+into|update(?:\s+or\s+\w+)?|delete\s+from)\s+(\w+)/i;

export function writtenTable(sql: string): string | null {
  return WRITE_RE.exec(sql)?.[1] ?? null;
}

/** Creates missing tables / indexes and adds columns that were added to SCHEMA later. */
export async function ensureSchema(raw: RawConn): Promise<void> {
  for (const stmt of schemaToDdl()) await raw.script(stmt);
  for (const [name, def] of Object.entries(SCHEMA) as [string, TableDef][]) {
    const have = new Set((await raw.all<{ name: string }>(`PRAGMA table_info(${name})`, [])).map((c) => c.name));
    for (const [col, type] of Object.entries(def.columns)) {
      if (!have.has(col)) await raw.script(`ALTER TABLE ${name} ADD COLUMN ${col} ${type.toUpperCase()}`);
    }
  }
}

/**
 * The app's Db on top of one SQLite connection:
 * - writes are serialized (a write never lands inside someone else's transaction),
 * - reads run immediately,
 * - change notifications by table name after each write / committed transaction.
 * Rule (as before): inside writeTransaction use the `tx` passed in, never the outer db.
 */
export function createDb(driverName: string, raw: RawConn): Db {
  const listeners = new Map<number, { tables: string[]; cb: () => void }>();
  let nextListener = 1;
  let lock: Promise<unknown> = Promise.resolve();

  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = lock.then(fn, fn);
    lock = p.catch(() => undefined);
    return p;
  };

  const notify = (changed: Set<string>) => {
    if (!changed.size) return;
    for (const l of [...listeners.values()]) {
      if (l.tables.some((t) => changed.has(t))) {
        try {
          l.cb();
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const finishWrite = async (changed: Set<string>) => {
    await raw.afterWrite?.();
    notify(changed);
  };

  const executor = (changed: Set<string>): DbExecutor => ({
    execute: async (sql, params = []) => {
      const t = writtenTable(sql);
      if (t) {
        await raw.run(sql, params);
        changed.add(t);
      } else if (/^\s*select/i.test(sql)) {
        await raw.all(sql, params);
      } else {
        await raw.script(sql);
      }
    },
    getAll: <T>(sql: string, params: SqlParam[] = []) => raw.all<T>(sql, params),
    getOptional: async <T>(sql: string, params: SqlParam[] = []) => (await raw.all<T>(sql, params))[0] ?? null,
    executeBatch: async (sql, paramSets) => {
      if (!paramSets.length) return;
      await raw.batch(sql, paramSets);
      const t = writtenTable(sql);
      if (t) changed.add(t);
    },
  });

  const reader = executor(new Set());

  return {
    driverName,
    getAll: reader.getAll,
    getOptional: reader.getOptional,
    execute: (sql, params) =>
      exclusive(async () => {
        const changed = new Set<string>();
        await executor(changed).execute(sql, params);
        await finishWrite(changed);
      }),
    executeBatch: (sql, paramSets) =>
      exclusive(async () => {
        const changed = new Set<string>();
        await executor(changed).executeBatch(sql, paramSets);
        await finishWrite(changed);
      }),
    writeTransaction: <T>(fn: (tx: DbExecutor) => Promise<T>) =>
      exclusive(async () => {
        const changed = new Set<string>();
        await raw.begin();
        let result: T;
        try {
          result = await fn(executor(changed));
        } catch (e) {
          await raw.rollback().catch((err) => console.error('[db] rollback failed', err));
          throw e;
        }
        await raw.commit();
        await finishWrite(changed);
        return result;
      }),
    onChange: (tables, cb) => {
      const id = nextListener++;
      listeners.set(id, { tables, cb });
      return () => listeners.delete(id);
    },
    close: () => exclusive(() => raw.close()),
  };
}
