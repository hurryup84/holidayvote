import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Db } from './db';
import { openSqlJsDb } from './sqljsDb';

/**
 * Browser build (development, e2e tests): SQLite on sql.js, the database file is stored in
 * IndexedDB after every write. Not used on phones.
 */
const IDB_NAME = 'holidayvote';
const STORE = 'files';
const KEY = 'holidayvote.sqlite';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openWebDb(): Promise<Db> {
  const store = await idb();
  const data = await request<Uint8Array | undefined>(store.transaction(STORE).objectStore(STORE).get(KEY));
  return openSqlJsDb({
    wasmUrl: sqlWasmUrl,
    data,
    persist: async (bytes) => {
      const tx = store.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, KEY);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  });
}
