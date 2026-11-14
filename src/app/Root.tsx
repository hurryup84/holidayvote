import { App as CapApp } from '@capacitor/app';
import { IonApp, IonButton, IonSpinner } from '@ionic/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clock } from '../core/clock';
import { inviteCodeFromUrl } from '../core/inviteLink';
import type { Db } from '../data/db/db';
import { DbContext } from '../data/db/DbContext';
import { openAppDb } from '../data/db/openDb';
import type { SyncEngine } from '../data/db/sync';
import { createRepos } from '../data/repositories';
import { ensureLocalSession, kv } from '../data/repositories/kv';
import { AccountService, type AccountState } from '../data/sync/account';
import type { Session } from '../domain/models';
import { Onboarding } from '../features/onboarding/Onboarding';
import { isNative } from '../native/platform';
import { App } from './App';
import { AppContext, type AppContextValue, type HomeLocation } from './AppContext';

type Boot =
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'ready'; db: Db; sync: SyncEngine; onboarded: boolean };

let dbPromise: Promise<{ db: Db; sync: SyncEngine }> | null = null;

function parseHome(v: string | null): HomeLocation | null {
  try {
    const h = JSON.parse(v ?? 'null') as HomeLocation | null;
    return h && Number.isFinite(h.lat) && Number.isFinite(h.lng) ? h : null;
  } catch {
    return null;
  }
}

/** Opens the DB, creates the local session on first launch, then shows onboarding or the app. */
export function Root() {
  const { t } = useTranslation();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [today, setToday] = useState(clock.today());
  const [invite, setInvite] = useState<string | null>(null);
  const [home, setHomeState] = useState<HomeLocation | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const accountRef = useRef<AccountService | null>(null);
  const [accountState, setAccountState] = useState<AccountState | null>(null);

  // Invite links (com.moidev.holidayvote://join/CODE, or /join/CODE in the browser): remembered here,
  // used by the onboarding (new users) or the vacation list (existing users).
  useEffect(() => {
    void CapApp.getLaunchUrl()
      .then((r) => {
        const code = inviteCodeFromUrl(r?.url);
        if (code) setInvite(code);
      })
      .catch(() => undefined);
    if (!isNative) {
      const code = inviteCodeFromUrl(window.location.pathname + window.location.search);
      if (code) {
        setInvite(code);
        window.history.replaceState(null, '', '/');
      }
    }
    const sub = CapApp.addListener('appUrlOpen', ({ url }) => {
      const code = inviteCodeFromUrl(url);
      if (code) setInvite(code);
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  const start = useCallback(async (attempt = 1): Promise<void> => {
    try {
      dbPromise ??= openAppDb();
      const { db, sync } = await dbPromise;
      const s = await ensureLocalSession(db, clock, { userName: null });
      const store = kv(db);
      setHomeState(parseHome(await store.get('home_location')));
      setToday(clock.today());
      setSession(s);
      sessionRef.current = s;
      if (!accountRef.current) {
        const account = new AccountService({
          db,
          sync,
          clock,
          getSession: () => sessionRef.current!,
          setSession: (next) => {
            sessionRef.current = next;
            setSession(next);
          },
        });
        accountRef.current = account;
        setAccountState(account.state());
        account.onChange(setAccountState);
        void account.start().catch((e) => console.error('[account]', e));
      }
      setBoot({ state: 'ready', db, sync, onboarded: (await store.get('onboarding_completed')) === '1' });
    } catch (e) {
      console.error(e);
      dbPromise = null;
      // A lock is usually gone a moment later (app update, old process still closing): retry quietly.
      if (/locked|busy/i.test(String((e as Error)?.message ?? e)) && attempt < 3) {
        await new Promise((r) => window.setTimeout(r, 1500 * attempt));
        return start(attempt + 1);
      }
      setBoot({ state: 'error', error: String((e as Error)?.message ?? e) });
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  // Day roll-over: re-check "today" when the app comes back to the foreground and every minute.
  useEffect(() => {
    const check = () => setToday(clock.today());
    const timer = window.setInterval(check, 60_000);
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => isActive && check());
    return () => {
      window.clearInterval(timer);
      void sub.then((s) => s.remove());
    };
  }, []);

  const ready = boot.state === 'ready' ? boot : null;
  // Stable while the user stays the same: screens reload their data when `repos` changes.
  const repos = useMemo(() => (ready && session ? createRepos({ db: ready.db, session, clock }) : null), [ready, session]);
  const value = useMemo<AppContextValue | null>(() => {
    if (!ready || !session || !repos || !accountRef.current || !accountState) return null;
    return {
      session,
      repos,
      clock,
      today,
      invite,
      clearInvite: () => setInvite(null),
      home,
      setHome: async (h) => {
        setHomeState(h);
        await kv(ready.db).set('home_location', h ? JSON.stringify(h) : null);
      },
      account: accountRef.current,
      accountState,
    };
  }, [ready, session, repos, today, accountState, invite, home]);

  return (
    <IonApp>
      {boot.state === 'loading' && (
        <div className="empty-state" style={{ marginTop: '40vh' }}>
          <IonSpinner />
        </div>
      )}
      {boot.state === 'error' && (
        <div className="empty-state">
          <h2>{t('boot.errorTitle')}</h2>
          <p className="small">{boot.error}</p>
          <IonButton onClick={() => void start()}>{t('boot.retry')}</IonButton>
        </div>
      )}
      {ready && value && (
        <DbContext.Provider value={ready.db}>
          <AppContext.Provider value={value}>
            {ready.onboarded ? <App /> : <Onboarding onDone={() => setBoot({ ...ready, onboarded: true })} />}
          </AppContext.Provider>
        </DbContext.Provider>
      )}
    </IonApp>
  );
}
