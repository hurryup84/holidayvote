import type { DbExecutor, SqlParam } from './db';

/** Driver-independent view of the sync engine (implemented in data/sync/engine.ts). */
export interface SyncState {
  connected: boolean;
  connecting: boolean;
  uploading: boolean;
  downloading: boolean;
  hasSynced: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}

export const OFFLINE_STATE: SyncState = {
  connected: false,
  connecting: false,
  uploading: false,
  downloading: false,
  hasSynced: false,
  lastSyncedAt: null,
  error: null,
};

export interface BackendOp {
  table: string;
  op: 'PUT' | 'DELETE';
  id: string;
  /** Full row for PUT (all local columns). */
  data: Record<string, SqlParam>;
}

/** Rows of one vacation as returned by the server (`sync_pull`). */
export interface PulledVacation {
  /** Cursor was too old: the app replaces its copy of this vacation with `rows`. */
  full: boolean;
  rows: Record<string, Record<string, unknown>[]>;
  /** Hard deletes: [table name, row id]. */
  deletes: [string, string][];
}

export interface PullResult {
  cursor: number;
  profile: Record<string, unknown> | null;
  /** All memberships the user can see (own + members of their vacations). */
  members: Record<string, unknown>[];
  /** Keyed by vacation id: every vacation the user is a member of. */
  vacations: Record<string, PulledVacation>;
}

/** The server side (Supabase). */
export interface SyncBackend {
  /** Apply local changes in order. Throw FatalUploadError if the server rejects them for good. */
  upload(ops: BackendOp[]): Promise<void>;
  /** Changes since the cursors (per vacation id; missing = everything). */
  pull(cursors: Record<string, number>): Promise<PullResult>;
  /** Calls `onChange` when something changed on the server for one of the vacations (realtime). */
  subscribe(vacationIds: string[], onChange: () => void): () => void;
}

export class FatalUploadError extends Error {}

export interface SyncEngine {
  /** true once sync has been switched on for this device (after the account was created). */
  readonly synced: boolean;
  /** Runs `prepare` on the local data, then queues everything for upload and starts tracking changes. */
  enableSync(prepare: (tx: DbExecutor) => Promise<void>): Promise<void>;
  connect(backend: SyncBackend): Promise<void>;
  disconnect(): Promise<void>;
  /** Upload pending changes and download news now (resolves when done; throws if offline). */
  syncNow(): Promise<void>;
  /** Sign-out / delete: stop syncing, drop the upload queue and ALL synced data on this device. */
  resetToLocal(): Promise<void>;
  status(): SyncState;
  onStatus(cb: (s: SyncState) => void): () => void;
  pendingUploads(): Promise<number>;
}
