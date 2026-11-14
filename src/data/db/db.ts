/**
 * The only database API the app uses (concept/02_architecture.md § 13.2, measure 1).
 * Implemented by the PowerSync driver (app) and a plain SQLite driver (tests / fallback).
 * Rules: plain SQL with `?` params; no `RETURNING` (unsupported on Android by the PowerSync
 * Capacitor driver); no multi-statement strings.
 */
export type SqlParam = string | number | null;

export interface DbExecutor {
  execute(sql: string, params?: SqlParam[]): Promise<void>;
  getAll<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getOptional<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Same statement for many parameter sets in ONE native call (bulk writes: restore, sync copy). */
  executeBatch(sql: string, paramSets: SqlParam[][]): Promise<void>;
}

export interface Db extends DbExecutor {
  writeTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  /** Calls `cb` whenever one of `tables` changes. Returns an unsubscribe function. */
  onChange(tables: string[], cb: () => void): () => void;
  close(): Promise<void>;
  readonly driverName: string;
}
