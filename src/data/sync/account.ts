import type { Session as AuthSession } from '@supabase/supabase-js';
import type { Clock } from '../../core/clock';
import { APP_CONFIG } from '../../core/config';
import type { Session } from '../../domain/models';
import { CaptchaCancelled, captchaToken } from '../../native/captcha';
import type { Db, DbExecutor } from '../db/db';
import { TABLE_NAMES } from '../db/schema';
import { PREVIEW_DIR } from '../media/previewCache';
import { files } from '../../native/files';
import { OFFLINE_STATE, type SyncEngine, type SyncState } from '../db/sync';
import { supabase, supabaseBackend, syncConfigured } from './supabase';

export type ReportReason = 'offensive' | 'illegal' | 'spam' | 'other';
export type ReportTarget = { type: 'property' | 'comment' | 'member'; id: string };

export interface AccountState {
  /** Supabase configured in this build. */
  configured: boolean;
  user: { id: string } | null;
  /** Local data has been moved to the synced tables (after the account was created). */
  synced: boolean;
  sync: SyncState;
}

interface Deps {
  db: Db;
  sync: SyncEngine;
  clock: Clock;
  getSession(): Session;
  setSession(s: Session): void;
}

/** Columns that hold a user id (rewritten when the local placeholder user gets its account). */
const USER_COLUMNS: [string, string][] = [
  ['vacations', 'owner_id'],
  ['vacations', 'created_by'],
  ['vacations', 'updated_by'],
  ['vacation_members', 'user_id'],
  ['properties', 'created_by'],
  ['properties', 'updated_by'],
  ['votes', 'user_id'],
  ['votes', 'created_by'],
  ['votes', 'updated_by'],
  ['vetoes', 'user_id'],
  ['vetoes', 'created_by'],
  ['vetoes', 'updated_by'],
  ['favorites', 'user_id'],
  ['favorites', 'created_by'],
  ['favorites', 'updated_by'],
  ['comments', 'created_by'],
  ['comments', 'updated_by'],
];

export class AccountError extends Error {
  constructor(
    public readonly code:
      | 'invalid_code'
      | 'invalid_recovery_code'
      | 'too_many_attempts'
      | 'other_account'
      | 'not_signed_in'
      | 'timeout'
      | 'failed'
      | 'terms_required'
      | 'blocked'
      | 'captcha'
      | 'captcha_cancelled',
    msg?: string,
  ) {
    super(msg ?? code);
  }
}

/**
 * Accounts, sync and sharing – the same mechanism as Esstisch: no login screen, no e-mail, no
 * password. The first invite / join / recovery on a phone quietly creates an anonymous account
 * (after a bot check, src/native/captcha.ts); a recovery code brings it to a new phone.
 * Everything Supabase-specific for the app lives here; the UI talks to this service only.
 */
export class AccountService {
  private listeners = new Set<(s: AccountState) => void>();
  private current: AccountState;

  constructor(private readonly d: Deps) {
    this.current = { configured: syncConfigured, user: null, synced: d.sync.synced, sync: OFFLINE_STATE };
  }

  state(): AccountState {
    return this.current;
  }

  onChange(cb: (s: AccountState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(patch: Partial<AccountState>) {
    this.current = { ...this.current, ...patch, synced: this.d.sync.synced };
    for (const l of this.listeners) l(this.current);
  }

  /** App start: restore the session and reconnect if sync was on before. */
  async start(): Promise<void> {
    if (!syncConfigured) return;
    this.d.sync.onStatus((sync) => this.emit({ sync }));
    supabase().auth.onAuthStateChange((_event, session) => {
      this.emit({ user: session?.user ? { id: session.user.id } : null });
    });
    const { data } = await supabase().auth.getSession();
    const user = data.session?.user;
    this.emit({ user: user ? { id: user.id } : null });
    if (user && this.d.sync.synced) await this.d.sync.connect(supabaseBackend);
    // Signed out on the server side (e.g. account deleted on another device): keep working locally.
  }

  /** Has an account and syncs: invites are possible. */
  get online(): boolean {
    return !!this.current.user && this.d.sync.synced;
  }

  /**
   * The first "invite" or "join" quietly creates an anonymous account for this device. On the first
   * time, the local data (incl. the placeholder user id) moves into the synced tables, which uploads
   * it. Safe to call repeatedly.
   */
  async ensureAccount(displayName: string): Promise<void> {
    await this.ensureAccountInner(displayName);
    await this.acceptTermsIfNeeded();
  }

  /** Terms of use (UGC rules) are accepted in the UI before the first invite / join; recorded on the server. */
  async termsAccepted(): Promise<boolean> {
    const r = await this.d.db.getOptional<{ value: string }>("SELECT value FROM app_kv WHERE id = 'terms_version'");
    return r?.value === APP_CONFIG.termsVersion;
  }

  private async acceptTermsIfNeeded(): Promise<void> {
    if (await this.termsAccepted()) return;
    const pending = await this.d.db.getOptional<{ value: string }>("SELECT value FROM app_kv WHERE id = 'terms_pending'");
    if (pending?.value !== APP_CONFIG.termsVersion) throw new AccountError('terms_required');
    const { error } = await supabase().rpc('accept_terms', { p_version: APP_CONFIG.termsVersion });
    if (error) throw new AccountError('failed', error.message);
    await this.d.db.writeTransaction(async (tx) => {
      await tx.execute("DELETE FROM app_kv WHERE id IN ('terms_version', 'terms_pending')");
      await tx.execute("INSERT INTO app_kv (id, value) VALUES ('terms_version', ?)", [APP_CONFIG.termsVersion]);
    });
  }

  /** The user ticked "I accept the terms" – recorded on the server with the next ensureAccount(). */
  async markTermsAccepted(): Promise<void> {
    await this.d.db.writeTransaction(async (tx) => {
      await tx.execute("DELETE FROM app_kv WHERE id = 'terms_pending'");
      await tx.execute("INSERT INTO app_kv (id, value) VALUES ('terms_pending', ?)", [APP_CONFIG.termsVersion]);
    });
  }

  /**
   * New anonymous account for this phone – after the bot check (Cloudflare Turnstile, src/native/captcha.ts).
   * Supabase asks for the token because CAPTCHA is on (supabase/config.toml [auth.captcha]).
   */
  private async signInAnonymously(): Promise<AuthSession> {
    let token: string | undefined;
    try {
      token = await captchaToken();
    } catch (e) {
      if (e instanceof CaptchaCancelled) throw new AccountError('captcha_cancelled');
      throw e;
    }
    const res = await supabase().auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined);
    if (res.error && /captcha/i.test(res.error.message)) throw new AccountError('captcha', res.error.message);
    if (res.error || !res.data.session) throw new AccountError('failed', res.error?.message);
    return res.data.session;
  }

  private async authSession(): Promise<AuthSession> {
    const { data } = await supabase().auth.getSession();
    return data.session ?? (await this.signInAnonymously());
  }

  /** Switches sync on: the placeholder user id becomes the account id in every row, then everything uploads. */
  private async moveToAccount(uid: string, name: string | null): Promise<void> {
    const old = this.d.getSession().userId;
    const now = this.d.clock.nowIso();
    await this.d.sync.enableSync(async (tx: DbExecutor) => {
      if (old !== uid) {
        await tx.execute('DELETE FROM profiles WHERE id = ?', [old]);
        for (const [table, col] of USER_COLUMNS) await tx.execute(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [uid, old]);
      }
      await tx.execute('DELETE FROM profiles WHERE id = ?', [uid]);
      await tx.execute('INSERT INTO profiles (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)', [uid, name, now, now]);
      await tx.execute('UPDATE vacation_members SET display_name = ? WHERE user_id = ?', [name, uid]);
      await tx.execute("DELETE FROM app_kv WHERE id = 'user_id'");
      await tx.execute("INSERT INTO app_kv (id, value) VALUES ('user_id', ?)", [uid]);
    });
    this.d.setSession({ userId: uid });
    this.emit({});
    await this.d.sync.connect(supabaseBackend);
  }

  private async ensureAccountInner(displayName: string): Promise<void> {
    const auth = await this.authSession();
    const uid = auth.user.id;
    if (this.d.sync.synced) {
      if (this.d.getSession().userId !== uid) throw new AccountError('other_account');
      if (!this.current.sync.connected && !this.current.sync.connecting) await this.d.sync.connect(supabaseBackend);
      return;
    }
    const name = displayName.trim() || (await this.displayName());
    await this.moveToAccount(uid, name);
  }

  // ---------- recovery code (new / lost phone) ----------

  /** When this account's recovery code was created, null = none yet. */
  async recoveryCodeCreatedAt(): Promise<string | null> {
    const { data, error } = await supabase().rpc('recovery_code_created_at');
    if (error) throw new AccountError('failed', error.message);
    return (data as string | null) ?? null;
  }

  /** Creates a new recovery code (an older one stops working). The only time the code is visible. */
  async createRecoveryCode(): Promise<string> {
    const { data, error } = await supabase().rpc('create_recovery_code');
    if (error) throw new AccountError('failed', error.message);
    return data as string;
  }

  /**
   * New phone: take over the account behind a recovery code (vacations, owner role, name). The old
   * phone loses access. Vacations made on this phone before stay and are uploaded too.
   */
  async recoverAccount(code: string): Promise<{ name: string | null; vacations: number }> {
    const auth = await this.authSession();
    const uid = auth.user.id;
    const { data: raw, error } = await supabase().rpc('recover_account', { p_code: code });
    if (error) {
      const known = (['too_many_attempts', 'blocked'] as const).find((c) => error.message.includes(c));
      throw new AccountError(known ?? 'failed', error.message);
    }
    const r = raw as { error?: string; display_name?: string | null; vacations?: number };
    if (r.error === 'invalid_code') throw new AccountError('invalid_recovery_code');
    const name = r.display_name ?? null;
    if (!this.d.sync.synced) await this.moveToAccount(uid, name);
    // The terms were accepted on the old phone (carried over on the server).
    await this.d.db.writeTransaction(async (tx) => {
      await tx.execute("DELETE FROM app_kv WHERE id IN ('terms_version', 'terms_pending')");
      await tx.execute("INSERT INTO app_kv (id, value) VALUES ('terms_version', ?)", [APP_CONFIG.termsVersion]);
    });
    await this.d.sync.syncNow().catch(() => undefined);
    return { name, vacations: r.vacations ?? 0 };
  }

  async setDisplayName(name: string): Promise<void> {
    const uid = this.d.getSession().userId;
    await this.d.db.writeTransaction(async (tx) => {
      await tx.execute('UPDATE profiles SET display_name = ?, updated_at = ? WHERE id = ?', [name.trim() || null, this.d.clock.nowIso(), uid]);
      // Shown at once; the server keeps its own copy in sync.
      await tx.execute('UPDATE vacation_members SET display_name = ? WHERE user_id = ?', [name.trim() || null, uid]);
    });
  }

  async displayName(): Promise<string | null> {
    const r = await this.d.db.getOptional<{ display_name: string | null }>('SELECT display_name FROM profiles WHERE id = ?', [
      this.d.getSession().userId,
    ]);
    return r?.display_name ?? null;
  }

  // ---------- sharing ----------

  /** Waits until local changes are on the server (e.g. the vacation itself before inviting to it). */
  private async waitForUploads(timeoutMs = 30_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while ((await this.d.sync.pendingUploads()) > 0) {
      if (Date.now() > until) throw new AccountError('timeout');
      await new Promise((r) => window.setTimeout(r, 300));
    }
  }

  async createInvite(vacationId: string): Promise<{ code: string; expiresAt: string }> {
    await this.d.sync.syncNow().catch(() => undefined);
    await this.waitForUploads();
    const { data, error } = await supabase().rpc('create_invite', { p_vacation: vacationId });
    if (error) {
      const known = (['terms_required', 'blocked'] as const).find((c) => error.message.includes(c));
      throw new AccountError(known ?? 'failed', error.message);
    }
    const r = data as { code: string; expires_at: string };
    return { code: r.code, expiresAt: r.expires_at };
  }

  /** Join with a code; waits until the vacation has arrived through sync. */
  async acceptInvite(code: string): Promise<{ vacationId: string; vacationName: string }> {
    const { data, error } = await supabase().rpc('accept_invite', { p_code: code });
    if (error) {
      const known = (['invalid_code', 'terms_required', 'blocked'] as const).find((c) => error.message.includes(c));
      throw new AccountError(known ?? 'failed', error.message);
    }
    const r = data as { vacation_id: string; vacation_name: string };
    void this.d.sync.syncNow().catch(() => undefined);
    await this.waitForVacation(r.vacation_id);
    return { vacationId: r.vacation_id, vacationName: r.vacation_name };
  }

  private waitForVacation(vacationId: string, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = async () => {
        const row = await this.d.db.getOptional('SELECT id FROM vacations WHERE id = ?', [vacationId]);
        if (row) {
          done();
          resolve();
        }
      };
      const unsubscribe = this.d.db.onChange(['vacations', 'vacation_members'], () => void check());
      const timer = window.setTimeout(() => {
        done();
        reject(new AccountError('timeout'));
      }, timeoutMs);
      const done = () => {
        unsubscribe();
        window.clearTimeout(timer);
      };
      void check();
    });
  }

  /** Is this vacation on the server (shared or shareable), or only on this phone? */
  async isOnServer(vacationId: string): Promise<boolean> {
    if (!this.d.sync.synced) return false;
    const r = await this.d.db.getOptional<{ known_tables: string }>('SELECT known_tables FROM sync_control WHERE id = 1');
    return (JSON.parse(r?.known_tables ?? '[]') as string[]).includes(vacationId);
  }

  async leaveVacation(vacationId: string): Promise<void> {
    const { error } = await supabase().rpc('leave_vacation', { p_vacation: vacationId });
    if (error) throw new AccountError('failed', error.message);
    // Sync removes the vacation from this phone.
    await this.d.sync.syncNow().catch(() => undefined);
  }

  /** Owner: delete the vacation for everyone. A vacation only on this phone is simply removed. */
  async deleteVacation(vacationId: string): Promise<void> {
    if (await this.isOnServer(vacationId)) {
      const { error } = await supabase().rpc('delete_vacation', { p_vacation: vacationId });
      if (error) throw new AccountError('failed', error.message);
      await this.d.sync.syncNow().catch(() => undefined);
      return;
    }
    await this.d.db.writeTransaction(async (tx) => {
      // Not on the server yet: also drop queued uploads of it.
      if (this.d.sync.synced) await tx.execute('DELETE FROM sync_outbox WHERE table_id = ?', [vacationId]);
      for (const t of ['comments', 'votes', 'vetoes', 'favorites', 'properties', 'vacation_members']) {
        await tx.execute(`DELETE FROM ${t} WHERE vacation_id = ?`, [vacationId]);
      }
      await tx.execute('DELETE FROM vacations WHERE id = ?', [vacationId]);
    });
  }

  async removeMember(vacationId: string, userId: string): Promise<void> {
    const { error } = await supabase().rpc('remove_member', { p_vacation: vacationId, p_user: userId });
    if (error) throw new AccountError('failed', error.message);
    await this.d.sync.syncNow().catch(() => undefined);
  }

  /** Report content of a shared vacation to the operator. */
  async report(vacationId: string, target: ReportTarget, reason: ReportReason, note?: string): Promise<void> {
    const { error } = await supabase().from('content_reports').insert({
      reporter_id: this.d.getSession().userId,
      vacation_id: vacationId,
      target_type: target.type,
      target_id: target.id,
      reason,
      note: note?.trim() || null,
    });
    if (error) throw new AccountError('failed', error.message);
  }

  /** Block a member: reported + can't share a vacation with me again; the owner removes them, others leave. */
  async blockMember(vacationId: string, userId: string, reason: ReportReason = 'offensive'): Promise<void> {
    const { error } = await supabase().rpc('block_member', { p_vacation: vacationId, p_user: userId, p_reason: reason });
    if (error) throw new AccountError('failed', error.message);
    await this.d.sync.syncNow().catch(() => undefined);
  }

  /** Pull to refresh: upload and download now (no-op before the account exists). */
  async syncNow(): Promise<void> {
    if (this.d.sync.synced && this.current.user) await this.d.sync.syncNow().catch(() => undefined);
  }

  async pendingUploads(): Promise<number> {
    return this.d.sync.pendingUploads();
  }

  /**
   * "Delete my data": account + server data (where nobody else uses it) + everything on this
   * device. Caller reloads the app afterwards (→ onboarding).
   */
  async deleteMyData(): Promise<void> {
    if (syncConfigured && this.current.user) {
      const { error } = await supabase().rpc('delete_my_account');
      if (error && this.d.sync.synced) throw new AccountError('failed', error.message);
      await supabase().auth.signOut();
    }
    await this.d.sync.resetToLocal(); // also empties all synced tables
    await this.d.db.writeTransaction(async (tx) => {
      for (const t of TABLE_NAMES) await tx.execute(`DELETE FROM ${t}`);
    });
    await files.removeDir(PREVIEW_DIR);
  }
}
