import { createContext, useContext } from 'react';
import type { Clock } from '../core/clock';
import type { Repos } from '../data/repositories';
import type { AccountService, AccountState } from '../data/sync/account';
import type { Session } from '../domain/models';
import type { LatLng } from '../domain/services/geo';

export interface HomeLocation extends LatLng {
  label: string;
}

export interface AppContextValue {
  session: Session;
  repos: Repos;
  clock: Clock;
  /** Current local date (YYYY-MM-DD). */
  today: string;
  /** Invite code from a link that opened the app (not yet used). */
  invite: string | null;
  clearInvite(): void;
  /** House or vacation route from a push notification tap, pending until the router is ready. */
  pushRoute: string | null;
  setPushRoute(route: string | null): void;
  /** Own home address for "distance from home" – only on this phone, never synced. */
  home: HomeLocation | null;
  setHome(h: HomeLocation | null): Promise<void>;
  /** Accounts, sync and sharing. */
  account: AccountService;
  accountState: AccountState;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}
