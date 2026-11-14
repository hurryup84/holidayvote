import type { Db, DbExecutor, SqlParam } from '../db/db';
import { SYNCABLE_TABLES, VACATION_DATA, columnsOf, type TableName } from '../db/schema';
import {
  FatalUploadError,
  OFFLINE_STATE,
  type BackendOp,
  type PullResult,
  type SyncBackend,
  type SyncEngine,
  type SyncState,
} from '../db/sync';

/**
 * Own sync engine – the same as Esstisch's (concept/02_architecture.md § 5), with vacations
 * instead of tables.
 *
 * Local side
 * - Every table keeps its normal name; nothing moves when sharing is switched on.
 * - SQLite triggers write each local change into `sync_outbox` (one entry per row, first position
 *   kept, so parents go before children). Writes made while applying downloaded data are not
 *   recorded (`sync_control.applying = 1` inside that transaction).
 * Cycle: upload the outbox (full rows, upsert) → download with `sync_pull(cursors)` → apply.
 * - Rows with pending local changes are never overwritten by downloads (local wins, it's uploaded next).
 * - A vacation that the server stops returning (left / removed / deleted) is removed from this
 *   device – but only if the server had it before (`known_tables`) and nothing is pending.
 * Triggers for a cycle: connect, local changes, realtime signal, app back in foreground, every 60 s,
 * retry with back-off after errors.
 */

/** Tables the app uploads (vacation_members is maintained by the server). */
export const UPLOAD_TABLES = SYNCABLE_TABLES.filter((t) => t !== 'vacation_members');
/** Data that belongs to one vacation (`vacation_id`; `vacations` itself by `id`). */
const TABLE_DATA = VACATION_DATA;
/** Column that says which vacation a row belongs to. */
const scopeCol = (name: string) => (name === 'vacations' ? 'id' : 'vacation_id');

const SYNC_DDL = [
  `CREATE TABLE IF NOT EXISTS sync_outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     key TEXT NOT NULL UNIQUE,
     tbl TEXT NOT NULL,
     row_id TEXT NOT NULL,
     table_id TEXT,
     op TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS sync_control (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     enabled INTEGER NOT NULL DEFAULT 0,
     applying INTEGER NOT NULL DEFAULT 0,
     cursors TEXT NOT NULL DEFAULT '{}',
     known_tables TEXT NOT NULL DEFAULT '[]',
     last_synced_at TEXT)`,
];

function tableIdExpr(t: string, rec: 'NEW' | 'OLD' | null): string {
  const p = rec ? `${rec}.` : '';
  return t === 'profiles' ? 'NULL' : t === 'vacations' ? `${p}id` : `${p}vacation_id`;
}

function triggerDdl(t: string): string[] {
  const when = 'WHEN (SELECT applying FROM sync_control WHERE id = 1) = 0';
  const record = (rec: 'NEW' | 'OLD', op: 'PUT' | 'DELETE') =>
    `INSERT OR IGNORE INTO sync_outbox (key, tbl, row_id, table_id, op) VALUES ('${t}:' || ${rec}.id, '${t}', ${rec}.id, ${tableIdExpr(t, rec)}, '${op}');
     UPDATE sync_outbox SET op = '${op}', version = version + 1 WHERE key = '${t}:' || ${rec}.id;`;
  // One line each: the Android plugin splits scripts at ";\n", which would cut a trigger body apart.
  const oneLine = (sql: string) => sql.replace(/\s+/g, ' ').trim();
  return [
    `CREATE TRIGGER IF NOT EXISTS sync_${t}_ins AFTER INSERT ON ${t} ${when} BEGIN ${record('NEW', 'PUT')} END`,
    `CREATE TRIGGER IF NOT EXISTS sync_${t}_upd AFTER UPDATE ON ${t} ${when} BEGIN ${record('NEW', 'PUT')} END`,
    `CREATE TRIGGER IF NOT EXISTS sync_${t}_del AFTER DELETE ON ${t} ${when} BEGIN ${record('OLD', 'DELETE')} END`,
  ].map(oneLine);
}

const DROP_TRIGGERS = UPLOAD_TABLES.flatMap((t) => ['ins', 'upd', 'del'].map((k) => `DROP TRIGGER IF EXISTS sync_${t}_${k}`));

/** Postgres timestamps (`…+00:00`, microseconds) → the app's ISO format (`…Z`, milliseconds). */
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function toLocal(v: unknown): SqlParam {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return PG_TIMESTAMP.test(v) ? new Date(v).toISOString() : v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b));

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

async function getAllIn<T>(tx: DbExecutor, sql: (ph: string) => string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    out.push(...(await tx.getAll<T>(sql(placeholders(chunk.length)), chunk)));
  }
  return out;
}

/** Writes the rows that differ from the local copy. Columns the server didn't send keep their local value. */
async function upsertRows(tx: DbExecutor, table: TableName, incoming: Record<string, unknown>[], skip: (id: string) => boolean) {
  const cols = columnsOf(table);
  const rows = incoming.filter((r) => typeof r.id === 'string' && !skip(r.id as string));
  if (!rows.length) return;
  const local = new Map(
    (await getAllIn<Record<string, unknown>>(tx, (ph) => `SELECT * FROM ${table} WHERE id IN (${ph})`, rows.map((r) => r.id as string))).map(
      (r) => [r.id as string, r],
    ),
  );
  const changed: SqlParam[][] = [];
  for (const r of rows) {
    const cur = local.get(r.id as string);
    const next = cols.map((c) => (c in r ? toLocal(r[c]) : ((cur?.[c] ?? null) as SqlParam)));
    if (cur && cols.every((c, i) => same(cur[c], next[i]))) continue;
    changed.push(next);
  }
  await tx.executeBatch(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)})`, changed);
}

async function deleteIds(tx: DbExecutor, table: string, ids: string[]) {
  if (ids.length) await tx.executeBatch(`DELETE FROM ${table} WHERE id = ?`, ids.map((id) => [id]));
}

interface Control {
  enabled: number;
  cursors: string;
  known_tables: string;
  last_synced_at: string | null;
}

interface OutboxRow {
  seq: number;
  key: string;
  tbl: string;
  row_id: string;
  table_id: string | null;
  op: 'PUT' | 'DELETE';
  version: number;
}

/** Creates the sync bookkeeping tables (idempotent) and the change triggers if sharing is on. */
export async function initSyncTables(db: Db): Promise<boolean> {
  for (const ddl of SYNC_DDL) await db.execute(ddl);
  await db.execute('INSERT OR IGNORE INTO sync_control (id) VALUES (1)');
  const ctl = await db.getOptional<Control>('SELECT enabled FROM sync_control WHERE id = 1');
  const enabled = ctl?.enabled === 1;
  if (enabled) {
    await db.writeTransaction(async (tx) => {
      await tx.execute('UPDATE sync_control SET applying = 0 WHERE id = 1');
      for (const t of UPLOAD_TABLES) for (const ddl of triggerDdl(t)) await tx.execute(ddl);
    });
  }
  return enabled;
}

export interface EngineOptions {
  /** Fallback poll interval while connected (ms). */
  pollMs?: number;
  /** Debounce for local changes / realtime signals (ms). */
  debounceMs?: number;
}

export async function createSyncEngine(db: Db, opts: EngineOptions = {}): Promise<SyncEngine> {
  const pollMs = opts.pollMs ?? 60_000;
  const debounceMs = opts.debounceMs ?? 400;
  let enabled = await initSyncTables(db);
  const ctl0 = await db.getOptional<Control>('SELECT last_synced_at FROM sync_control WHERE id = 1');

  let backend: SyncBackend | null = null;
  let state: SyncState = { ...OFFLINE_STATE, hasSynced: !!ctl0?.last_synced_at, lastSyncedAt: ctl0?.last_synced_at ?? null };
  const statusListeners = new Set<(s: SyncState) => void>();
  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    for (const l of [...statusListeners]) l(state);
  };

  // ---------- upload ----------
  async function buildOps(entries: OutboxRow[]): Promise<BackendOp[]> {
    const rows = new Map<string, Record<string, SqlParam>>();
    for (const tbl of new Set(entries.filter((e) => e.op === 'PUT').map((e) => e.tbl))) {
      const ids = entries.filter((e) => e.tbl === tbl && e.op === 'PUT').map((e) => e.row_id);
      const cols = columnsOf(tbl as TableName);
      for (const r of await getAllIn<Record<string, SqlParam>>(db, (ph) => `SELECT ${cols.join(', ')} FROM ${tbl} WHERE id IN (${ph})`, ids)) {
        rows.set(`${tbl}:${r.id}`, r);
      }
    }
    return entries.map((e) => {
      const data = e.op === 'PUT' ? rows.get(e.key) : undefined;
      // Row gone meanwhile → delete on the server too.
      return data ? { table: e.tbl, op: 'PUT', id: e.row_id, data } : { table: e.tbl, op: 'DELETE', id: e.row_id, data: {} };
    });
  }

  const ack = (entries: OutboxRow[]) =>
    db.executeBatch('DELETE FROM sync_outbox WHERE key = ? AND version = ?', entries.map((e) => [e.key, e.version]));

  async function forgetCursor(tableId: string | null) {
    if (!tableId) return;
    // Rejected change: download that table completely next time, so the server's version comes back.
    const ctl = await db.getOptional<Control>('SELECT cursors FROM sync_control WHERE id = 1');
    const cursors = JSON.parse(ctl?.cursors ?? '{}') as Record<string, number>;
    delete cursors[tableId];
    await db.execute('UPDATE sync_control SET cursors = ? WHERE id = 1', [JSON.stringify(cursors)]);
  }

  async function pushAll(b: SyncBackend) {
    for (;;) {
      const entries = await db.getAll<OutboxRow>(
        'SELECT seq, key, tbl, row_id, table_id, op, version FROM sync_outbox ORDER BY seq LIMIT 250',
      );
      if (!entries.length) return;
      set({ uploading: true });
      const ops = await buildOps(entries);
      try {
        await b.upload(ops);
        await ack(entries);
      } catch (e) {
        if (!(e instanceof FatalUploadError)) throw e;
        // Find the rejected change(s); everything else goes through.
        for (let i = 0; i < ops.length; i++) {
          try {
            await b.upload([ops[i]]);
          } catch (e2) {
            if (!(e2 instanceof FatalUploadError)) throw e2;
            console.error('[sync] change rejected by the server, discarded:', e2.message, ops[i]);
            await forgetCursor(entries[i].table_id);
          }
          await ack([entries[i]]);
        }
      }
    }
  }

  // ---------- download ----------
  async function apply(res: PullResult): Promise<string[]> {
    const now = new Date().toISOString();
    const tableIds = Object.keys(res.vacations);
    await db.writeTransaction(async (tx) => {
      await tx.execute('UPDATE sync_control SET applying = 1 WHERE id = 1');
      const outbox = await tx.getAll<{ key: string; table_id: string | null }>('SELECT key, table_id FROM sync_outbox');
      const pendingKeys = new Set(outbox.map((o) => o.key));
      const pendingTables = new Set(outbox.map((o) => o.table_id).filter((t): t is string => !!t));
      const pending = (table: string) => (id: string) => pendingKeys.has(`${table}:${id}`);
      const ctl = await tx.getOptional<Control>('SELECT known_tables FROM sync_control WHERE id = 1');
      const known = JSON.parse(ctl?.known_tables ?? '[]') as string[];

      if (res.profile) await upsertRows(tx, 'profiles', [res.profile], pending('profiles'));

      // Memberships: the server list is complete; vacations with pending local changes keep theirs.
      const members = res.members.filter((m) => !pendingTables.has(m.vacation_id as string));
      await upsertRows(tx, 'vacation_members', members, () => false);
      const keepIds = new Set(members.map((m) => m.id as string));
      const localMembers = await tx.getAll<{ id: string; vacation_id: string }>('SELECT id, vacation_id FROM vacation_members');
      await deleteIds(
        tx,
        'vacation_members',
        localMembers.filter((m) => !keepIds.has(m.id) && !pendingTables.has(m.vacation_id)).map((m) => m.id),
      );

      for (const [tableId, pt] of Object.entries(res.vacations)) {
        for (const name of TABLE_DATA) await upsertRows(tx, name, pt.rows[name] ?? [], pending(name));
        for (const [tbl, id] of pt.deletes) {
          if ((TABLE_DATA as readonly string[]).includes(tbl) && !pendingKeys.has(`${tbl}:${id}`)) await deleteIds(tx, tbl, [id]);
        }
        if (pt.full) {
          // Deletion records were too old: drop what the server no longer has.
          for (const name of TABLE_DATA) {
            const have = new Set((pt.rows[name] ?? []).map((r) => r.id as string));
            const col = scopeCol(name);
            const local = await tx.getAll<{ id: string }>(`SELECT id FROM ${name} WHERE ${col} = ?`, [tableId]);
            await deleteIds(tx, name, local.map((r) => r.id).filter((id) => !have.has(id) && !pendingKeys.has(`${name}:${id}`)));
          }
        }
      }

      // Vacations the server had before but doesn't return any more: left / removed / deleted.
      const gone = known.filter((t) => !tableIds.includes(t) && !pendingTables.has(t));
      for (const t of gone) {
        for (const name of TABLE_DATA) await tx.execute(`DELETE FROM ${name} WHERE ${scopeCol(name)} = ?`, [t]);
        await tx.execute('DELETE FROM vacation_members WHERE vacation_id = ?', [t]);
      }
      const stillKnown = known.filter((t) => !gone.includes(t) && !tableIds.includes(t));
      await tx.execute('UPDATE sync_control SET applying = 0, cursors = ?, known_tables = ?, last_synced_at = ? WHERE id = 1', [
        JSON.stringify(Object.fromEntries(tableIds.map((t) => [t, res.cursor]))),
        JSON.stringify([...tableIds, ...stillKnown]),
        now,
      ]);
    });
    set({ hasSynced: true, lastSyncedAt: now });
    return tableIds;
  }

  // ---------- cycle ----------
  let chain: Promise<void> = Promise.resolve();
  let queued: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 0;
  let subscribedTo = '';
  let unsubscribeRealtime: (() => void) | null = null;

  async function cycle() {
    const b = backend;
    if (!b || !enabled) return;
    if (!state.connected) set({ connecting: true });
    try {
      await pushAll(b);
      set({ uploading: false, downloading: true });
      const ctl = await db.getOptional<Control>('SELECT cursors FROM sync_control WHERE id = 1');
      const res = await b.pull(JSON.parse(ctl?.cursors ?? '{}'));
      if (backend !== b) return; // disconnected meanwhile
      const tableIds = await apply(res);
      set({ connected: true, connecting: false, uploading: false, downloading: false, error: null });
      retryDelay = 0;
      clearTimeout(retryTimer);
      resubscribe(b, tableIds);
    } catch (e) {
      set({ connected: false, connecting: false, uploading: false, downloading: false, error: String((e as Error)?.message ?? e) });
      if (backend === b) {
        retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60_000);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void request().catch(() => undefined), retryDelay);
      }
      throw e;
    }
  }

  /** Runs a cycle after the current one; calls while one is waiting share it. */
  function request(): Promise<void> {
    if (queued) return queued;
    const p = chain.then(() => {
      queued = null;
      return cycle();
    });
    queued = p;
    chain = p.catch(() => undefined);
    return p;
  }

  function resubscribe(b: SyncBackend, tableIds: string[]) {
    const key = [...tableIds].sort().join(',');
    if (key === subscribedTo) return;
    unsubscribeRealtime?.();
    subscribedTo = key;
    unsubscribeRealtime = tableIds.length ? b.subscribe(tableIds, debounced) : null;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function debounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void request().catch(() => undefined), debounceMs);
  }

  let stopWatching: (() => void) | null = null;
  function startWatching() {
    const offLocal = db.onChange([...UPLOAD_TABLES], () => {
      void db.getOptional<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox').then((r) => {
        if (Number(r?.n ?? 0) > 0) debounced();
      });
    });
    const poll = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void request().catch(() => undefined);
    }, pollMs);
    const onVisible = () => document.visibilityState === 'visible' && void request().catch(() => undefined);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    stopWatching = () => {
      offLocal();
      clearInterval(poll);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }

  async function disconnect() {
    backend = null;
    stopWatching?.();
    stopWatching = null;
    unsubscribeRealtime?.();
    unsubscribeRealtime = null;
    subscribedTo = '';
    clearTimeout(retryTimer);
    clearTimeout(debounceTimer);
    set({ connected: false, connecting: false, uploading: false, downloading: false, error: null });
    // Let a running cycle finish (it won't apply anything any more), but don't hang on a dead network.
    await Promise.race([chain, new Promise((r) => setTimeout(r, 5000))]);
  }

  return {
    get synced() {
      return enabled;
    },

    async enableSync(prepare) {
      if (enabled) return;
      await db.writeTransaction(async (tx) => {
        await prepare(tx);
        for (const t of UPLOAD_TABLES) for (const ddl of triggerDdl(t)) await tx.execute(ddl);
        // Queue everything that exists (parents first).
        for (const t of UPLOAD_TABLES) {
          await tx.execute(
            `INSERT OR IGNORE INTO sync_outbox (key, tbl, row_id, table_id, op)
             SELECT '${t}:' || id, '${t}', id, ${tableIdExpr(t, null)}, 'PUT' FROM ${t}`,
          );
        }
        await tx.execute(
          "UPDATE sync_control SET enabled = 1, applying = 0, cursors = '{}', known_tables = '[]', last_synced_at = NULL WHERE id = 1",
        );
      });
      enabled = true;
      set({ hasSynced: false, lastSyncedAt: null });
    },

    async connect(b) {
      if (!enabled) throw new Error('sync not enabled');
      if (backend === b) return;
      await disconnect();
      backend = b;
      startWatching();
      void request().catch((e) => console.warn('[sync]', e));
    },

    disconnect,

    syncNow: () => request(),

    async resetToLocal() {
      await disconnect();
      await db.writeTransaction(async (tx) => {
        for (const ddl of DROP_TRIGGERS) await tx.execute(ddl);
        await tx.execute('DELETE FROM sync_outbox');
        await tx.execute(
          "UPDATE sync_control SET enabled = 0, applying = 0, cursors = '{}', known_tables = '[]', last_synced_at = NULL WHERE id = 1",
        );
        for (const t of SYNCABLE_TABLES) await tx.execute(`DELETE FROM ${t}`);
      });
      enabled = false;
      set({ ...OFFLINE_STATE });
    },

    status: () => state,

    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },

    async pendingUploads() {
      const r = await db.getOptional<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
      return Number(r?.n ?? 0);
    },
  };
}

/**
 * Postgres / PostgREST error codes that will never succeed on retry (bad data, constraint,
 * row-level security). Not: PGRST3xx (JWT expired / invalid) – the session gets refreshed.
 */
export function isFatalCode(code: string | undefined): boolean {
  if (!code) return false;
  if (code.startsWith('PGRST')) return !code.startsWith('PGRST3');
  return /^22...$/.test(code) || /^23...$/.test(code) || code === '42501';
}
