import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { createDb, ensureSchema, type RawConn } from './baseDb';
import type { Db, SqlParam } from './db';

export interface SqlJsOptions {
  /** Browser: URL of sql-wasm.wasm. Node (tests) finds it by itself. */
  wasmUrl?: string;
  /** Existing database file to open. */
  data?: Uint8Array;
  /** Called with the database file after every write (browser persistence). */
  persist?: (data: Uint8Array) => Promise<void>;
}

export function sqlJsConn(raw: Database, persist?: (data: Uint8Array) => Promise<void>): RawConn {
  return {
    run: async (sql, params) => {
      raw.run(sql, params as SqlValue[]);
    },
    script: async (sql) => {
      raw.exec(sql);
    },
    all: async <T>(sql: string, params: SqlParam[]) => {
      const stmt = raw.prepare(sql);
      try {
        stmt.bind(params as SqlValue[]);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
    batch: async (sql, paramSets) => {
      const stmt = raw.prepare(sql);
      try {
        for (const p of paramSets) stmt.run(p as SqlValue[]);
      } finally {
        stmt.free();
      }
    },
    begin: async () => {
      raw.run('BEGIN');
    },
    commit: async () => {
      raw.run('COMMIT');
    },
    rollback: async () => {
      raw.run('ROLLBACK');
    },
    close: async () => raw.close(),
    afterWrite: persist ? () => persist(raw.export()) : undefined,
  };
}

/** SQLite on sql.js (WASM). Tests: in memory. Browser (dev / e2e): persisted by the caller. */
export async function openSqlJsDb(opts: SqlJsOptions = {}): Promise<Db> {
  const SQL = await initSqlJs(opts.wasmUrl ? { locateFile: () => opts.wasmUrl! } : undefined);
  const raw = new SQL.Database(opts.data);
  const conn = sqlJsConn(raw, opts.persist);
  await ensureSchema(conn);
  return createDb('sqljs', conn);
}
