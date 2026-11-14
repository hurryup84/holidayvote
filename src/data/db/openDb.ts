import { Capacitor } from '@capacitor/core';
import { createSyncEngine } from '../sync/engine';
import type { Db } from './db';
import type { SyncEngine } from './sync';

/** Opens the local database (native SQLite on phones, sql.js in the browser) and the sync engine. */
export async function openAppDb(): Promise<{ db: Db; sync: SyncEngine }> {
  const db = Capacitor.isNativePlatform()
    ? await (await import('./capacitorDb')).openCapacitorDb()
    : await (await import('./webDb')).openWebDb();
  const sync = await createSyncEngine(db);
  return { db, sync };
}
