import { Preferences } from '@capacitor/preferences';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FatalUploadError, type BackendOp, type PullResult, type SyncBackend } from '../db/sync';
import { isFatalCode } from './engine';

export const SYNC_CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
};

/** Sharing needs both values (from .env.local at build time). Without them the app stays local. */
export const syncConfigured = Boolean(SYNC_CONFIG.supabaseUrl && SYNC_CONFIG.supabaseAnonKey);

let client: SupabaseClient | null = null;

/** Supabase client; the auth session is kept in native Preferences (WebView storage can be cleared). */
export function supabase(): SupabaseClient {
  if (!syncConfigured) throw new Error('Supabase not configured');
  client ??= createClient(SYNC_CONFIG.supabaseUrl, SYNC_CONFIG.supabaseAnonKey, {
    auth: {
      storage: {
        getItem: async (key) => (await Preferences.get({ key })).value,
        setItem: async (key, value) => Preferences.set({ key, value }),
        removeItem: async (key) => Preferences.remove({ key }),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function check(table: string, error: { code?: string; message: string } | null) {
  if (!error) return;
  if (isFatalCode(error.code)) throw new FatalUploadError(`${table}: ${error.code} ${error.message}`);
  throw new Error(error.message);
}

/** Uploads via PostgREST (row-level security applies), downloads via the sync_pull RPC. */
export const supabaseBackend: SyncBackend = {
  async upload(ops: BackendOp[]) {
    // Consecutive ops on the same table with the same kind go in one request (order is kept).
    for (let i = 0; i < ops.length; ) {
      let j = i + 1;
      while (j < ops.length && ops[j].table === ops[i].table && ops[j].op === ops[i].op) j++;
      const group = ops.slice(i, j);
      const table = supabase().from(group[0].table);
      if (group[0].op === 'PUT') {
        const { error } = await table.upsert(group.map((o) => ({ ...o.data, id: o.id })));
        check(group[0].table, error);
      } else {
        const { error } = await table.delete().in('id', group.map((o) => o.id));
        check(group[0].table, error);
      }
      i = j;
    }
  },

  async pull(cursors) {
    const { data, error } = await supabase().rpc('sync_pull', { p_cursors: cursors });
    if (error) throw new Error(`sync_pull: ${error.message}`);
    return data as PullResult;
  },

  /**
   * "Something changed" signal: the database sends an empty Broadcast message to the private channel
   * `vacation:<id>` (migration …_sync.sql); only members may join. One channel per vacation, all on the
   * same socket. A missed message is no problem: the engine polls every minute.
   */
  subscribe(vacationIds, onChange) {
    const channels: ReturnType<SupabaseClient['channel']>[] = [];
    let closed = false;
    void (async () => {
      // Private channels are checked with the user's token: make sure Realtime has the current one.
      const { data } = await supabase().auth.getSession();
      if (data.session) await supabase().realtime.setAuth(data.session.access_token);
      if (closed) return;
      for (const id of vacationIds) {
        const channel = supabase()
          .channel(`vacation:${id}`, { config: { private: true } })
          .on('broadcast', { event: 'changed' }, () => onChange())
          .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR') console.warn('[sync] realtime', id, err?.message ?? status);
          });
        channels.push(channel);
      }
    })().catch((e) => console.warn('[sync] realtime', e));
    return () => {
      closed = true;
      for (const channel of channels) void supabase().removeChannel(channel);
    };
  },
};
