import type { Clock } from '../../core/clock';
import { newId } from '../../core/ids';
import type { Db } from '../db/db';
import type { Session } from '../../domain/models';

/** Local key/value store (local-only table, never synced). */
export function kv(db: Db) {
  return {
    async get(key: string): Promise<string | null> {
      const r = await db.getOptional<{ value: string | null }>('SELECT value FROM app_kv WHERE id = ?', [key]);
      return r?.value ?? null;
    },
    /** Atomic upsert (transactions are serialized, so concurrent sets can't collide). */
    async set(key: string, value: string | null): Promise<void> {
      await db.writeTransaction(async (tx) => {
        await tx.execute('DELETE FROM app_kv WHERE id = ?', [key]);
        if (value !== null) await tx.execute('INSERT INTO app_kv (id, value) VALUES (?, ?)', [key, value]);
      });
    },
  };
}

export type Kv = ReturnType<typeof kv>;

/**
 * First launch: a local placeholder user (no account yet – concept/02_architecture.md § 5). The
 * account is created quietly at the first invite / join / recovery; then this id is replaced by the
 * account id (AccountService.ensureAccount).
 */
export async function ensureLocalSession(db: Db, clock: Clock, defaults: { userName: string | null }): Promise<Session> {
  // Check and create inside ONE write transaction: two concurrent starts (React StrictMode) can't both create one.
  return db.writeTransaction(async (tx) => {
    const r = await tx.getOptional<{ value: string | null }>("SELECT value FROM app_kv WHERE id = 'user_id'");
    if (r?.value) return { userId: r.value };
    const uid = newId();
    const now = clock.nowIso();
    await tx.execute('INSERT INTO profiles (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      uid,
      defaults.userName,
      now,
      now,
    ]);
    await tx.execute("DELETE FROM app_kv WHERE id IN ('user_id', 'installed_at')");
    await tx.execute("INSERT INTO app_kv (id, value) VALUES ('user_id', ?)", [uid]);
    await tx.execute("INSERT INTO app_kv (id, value) VALUES ('installed_at', ?)", [now]);
    return { userId: uid };
  });
}
