import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { createDb, ensureSchema, type RawConn } from './baseDb';
import type { Db, SqlParam } from './db';

/**
 * Native SQLite via @capacitor-community/sqlite: one connection, plain tables.
 * Android: SELECTs go through `query`, writes through `executeSet` (`run` is unreliable there);
 * iOS: `run`. DDL with triggers goes through `execute` (handles `BEGIN … END`).
 */
const DB_NAME = 'holidayvote_data';

async function openConnection(sqlite: SQLiteConnection, name: string): Promise<SQLiteDBConnection> {
  // After a web-view reload the native side may still hold the connection (and even a transaction).
  try {
    const { result } = await CapacitorSQLite.isTransactionActive({ database: name, readonly: false });
    if (result) await CapacitorSQLite.rollbackTransaction({ database: name, readonly: false });
  } catch {
    /* no native connection yet */
  }
  // Close every connection the native side still knows (also ones left behind by an earlier web view).
  await sqlite.closeConnection(name, false).catch(() => undefined);
  await sqlite.closeAllConnections().catch(() => undefined);
  const conn = await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  // Wait for a lock instead of failing at once ("database is locked"), e.g. right after an app update
  // while the old process is still shutting down.
  await conn.query('PRAGMA busy_timeout = 10000').catch(() => undefined);
  return conn;
}

function nativeConn(conn: SQLiteDBConnection): RawConn {
  const android = Capacitor.getPlatform() === 'android';
  const run = async (sql: string, params: SqlParam[]) => {
    if (android) await conn.executeSet([{ statement: sql, values: params }], false);
    else await conn.run(sql, params, false, 'no');
  };
  return {
    run,
    // One statement per call, on one line: the plugin splits scripts at ";\n" (that cut trigger
    // bodies apart on Android) and runs only the first statement of a line.
    script: async (sql) => {
      await conn.execute(sql.replace(/\s+/g, ' ').trim(), false);
    },
    all: async <T>(sql: string, params: SqlParam[]) => ((await conn.query(sql, params)).values ?? []) as T[],
    batch: async (sql, paramSets) => {
      for (let i = 0; i < paramSets.length; i += 500) {
        await conn.executeSet(
          paramSets.slice(i, i + 500).map((values) => ({ statement: sql, values })),
          false,
        );
      }
    },
    begin: async () => {
      await conn.beginTransaction();
    },
    commit: async () => {
      await conn.commitTransaction();
    },
    rollback: async () => {
      await conn.rollbackTransaction();
    },
    close: () => conn.close(),
  };
}

export async function openCapacitorDb(): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const conn = await openConnection(sqlite, DB_NAME);
  await conn.query('PRAGMA journal_mode = WAL').catch(() => undefined);
  const raw = nativeConn(conn);
  await ensureSchema(raw);
  return createDb('capacitor-sqlite', raw);
}
