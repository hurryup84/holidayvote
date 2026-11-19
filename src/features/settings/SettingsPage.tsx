import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonToggle,
  useIonAlert,
  useIonLoading,
  useIonToast,
} from '@ionic/react';
import { bugOutline, cloudDoneOutline, cloudOfflineOutline, homeOutline, phonePortraitOutline, syncOutline, trashOutline } from 'ionicons/icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { APP_CONFIG, DEBUG_TOOLS } from '../../core/config';
import { fmtShort } from '../../core/format';
import { useLiveQuery } from '../../data/db/DbContext';
import { openUrl } from '../../native/browser';
import { geocode } from '../../native/geocode';
import { pushDeviceId, getPushNotificationSettings, setPushNotificationSetting } from '../../native/pushNotifications';
import { sharingErrorText } from '../sharing/errors';
import { RecoveryCard } from './RecoveryCard';

/** One vacation's notification toggle in Settings. */
function VacationNotificationToggle({
  vacation,
  deviceId,
  on,
  setOn,
}: {
  vacation: { id: string; name: string };
  deviceId: string | null;
  on: boolean;
  setOn(on: boolean): void;
}) {
  const toggle = async (enabled: boolean) => {
    if (!deviceId) return;
    try {
      await setPushNotificationSetting(deviceId, vacation.id, enabled);
      setOn(enabled);
    } catch (e) {
      setOn(enabled);
    }
  };

  return (
    <IonItem>
      <IonLabel>{vacation.name}</IonLabel>
      <IonToggle
        checked={on}
        onIonChange={(e) => void toggle(!!e.detail.checked)}
        slot="end"
      />
    </IonItem>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { account, accountState, home, setHome, clock, pushNotificationsOn, setPushNotificationsOn, repos } = useApp();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [loading, dismissLoading] = useIonLoading();
  const { data: myName } = useLiveQuery(() => account.displayName(), ['profiles'], [accountState.user?.id]);
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [vacations, setVacations] = useState<{ id: string; name: string }[]>([]);
  const [vacNotifications, setVacNotifications] = useState<Record<string, boolean>>({});
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const online = !!accountState.user && accountState.synced;

  // Load this device's per-vacation notification settings.
  useEffect(() => {
    const load = async () => {
      if (!online || !pushNotificationsOn) return;
      const id = await pushDeviceId();
      setDeviceId(id);
      if (id) {
        const rows = await getPushNotificationSettings(id);
        const map: Record<string, boolean> = {};
        for (const r of rows) map[r.vacationId] = r.enabled;
        setVacNotifications(map);
      }
    };
    void load();
  }, [online, pushNotificationsOn]);

  // Load this phone's vacations (for the per-vacation toggles).
  useEffect(() => {
    const load = async () => {
      try {
        const list = await repos.vacations.list();
        setVacations(list);
      } catch {
        /* list may be empty before sync */
      }
    };
    void load();
  }, [repos, online]);

  // ---------- general notifications on/off ----------
  const toggleNotifications = async (on: boolean) => {
    await setPushNotificationsOn(on);
  };

  const editName = () =>
    void alert({
      header: t('sharing.yourName'),
      inputs: [{ name: 'name', value: myName ?? '', attributes: { maxlength: 60 } }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.save'), handler: (v: { name?: string }) => void account.setDisplayName(v.name ?? '') },
      ],
    });

  const saveHome = async () => {
    setLocating(true);
    const r = await geocode(address);
    setLocating(false);
    if (!r) return void toast({ message: t('property.addressNotFound'), duration: 2500, position: 'top', color: 'warning' });
    await setHome({ lat: r.lat, lng: r.lng, label: address.trim() });
    setAddress('');
  };

  const syncLine = () => {
    const s = accountState.sync;
    if (s.uploading || s.downloading || s.connecting) return { icon: syncOutline, text: t('sharing.syncing') };
    if (!s.connected) return { icon: cloudOfflineOutline, text: t('sharing.offline') };
    return {
      icon: cloudDoneOutline,
      text: s.lastSyncedAt ? t('sharing.syncedAt', { date: fmtShort(s.lastSyncedAt.slice(0, 10)), time: new Date(s.lastSyncedAt).toTimeString().slice(0, 5) }) : t('sharing.synced'),
    };
  };

  const deleteAll = () =>
    void alert({
      header: t('settings.deleteTitle'),
      message: t('settings.deleteText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('settings.deleteConfirm'),
          role: 'destructive',
          handler: () => {
            void (async () => {
              await loading({ message: t('settings.deleting') });
              try {
                await account.deleteMyData();
                window.location.replace('/');
              } catch (e) {
                await dismissLoading();
                void toast({ message: sharingErrorText(e), duration: 3000, position: 'top', color: 'danger' });
              }
            })();
          },
        },
      ],
    });

  const link = (label: string, url: string) => (
    <IonItem button detail onClick={() => void openUrl(url)}>
      <IonLabel>{label}</IonLabel>
    </IonItem>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('settings.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset>
          <IonItem button detail onClick={editName}>
            <IonLabel>{t('sharing.yourName')}</IonLabel>
            <IonNote slot="end">{myName || '–'}</IonNote>
          </IonItem>
          {online ? (
            <IonItem lines="none">
              <IonIcon slot="start" icon={syncLine().icon} color="medium" />
              <IonLabel className="ion-text-wrap">
                {syncLine().text}
                <p>{t('sharing.deviceNote')}</p>
              </IonLabel>
            </IonItem>
          ) : (
            <IonItem lines="none">
              <IonIcon slot="start" icon={phonePortraitOutline} color="medium" />
              <IonLabel className="ion-text-wrap">
                <p>{accountState.configured ? t('settings.localOnly') : t('sharing.notConfigured')}</p>
              </IonLabel>
            </IonItem>
          )}
        </IonList>

        <IonList inset>
          <IonListHeader>{t('settings.home')}</IonListHeader>
          {home ? (
            <IonItem>
              <IonIcon slot="start" icon={homeOutline} />
              <IonLabel className="ion-text-wrap">{home.label}</IonLabel>
              <IonButton slot="end" fill="clear" color="medium" onClick={() => void setHome(null)} aria-label={t('common.delete')}>
                <IonIcon slot="icon-only" icon={trashOutline} />
              </IonButton>
            </IonItem>
          ) : (
            <IonItem>
              <IonInput
                aria-label={t('settings.homePlaceholder')}
                placeholder={t('settings.homePlaceholder')}
                value={address}
                onIonInput={(e) => setAddress(String(e.detail.value ?? ''))}
              />
              <IonButton slot="end" fill="clear" disabled={!address.trim() || locating} onClick={() => void saveHome()}>
                {locating ? <IonSpinner name="dots" /> : t('common.save')}
              </IonButton>
            </IonItem>
          )}
        </IonList>
        <p className="list-footer">{t('settings.homeHint')}</p>

        {online ? <RecoveryCard /> : <p className="list-footer recovery-later">{t('recovery.later')}</p>}

        <IonList inset>
          <IonListHeader>{t('settings.notifications')}</IonListHeader>
          <IonItem>
            <IonLabel>{t('settings.notificationsOn')}</IonLabel>
            <IonToggle
              slot="end"
              checked={pushNotificationsOn}
              onIonChange={(e) => void toggleNotifications(!!e.detail.checked)}
            />
          </IonItem>
        </IonList>
        <p className="list-footer">{t('settings.notificationsHint')}</p>

        {online && pushNotificationsOn && vacations.length > 0 ? (
          <>
            <IonList inset>
              <IonListHeader>{t('settings.notificationsPerVacation')}</IonListHeader>
              {vacations.map((v) => (
                <VacationNotificationToggle
                  key={v.id}
                  vacation={v}
                  deviceId={deviceId}
                  on={vacNotifications[v.id] ?? true}
                  setOn={(enabled) => {
                    setVacNotifications((m) => ({ ...m, [v.id]: enabled }));
                    if (deviceId) {
                      void setPushNotificationSetting(deviceId, v.id, enabled);
                    }
                  }}
                />
              ))}
            </IonList>
            <p className="list-footer">{t('settings.notificationsPerVacationHint')}</p>
          </>
        ) : null}

        <IonList inset>
          <IonListHeader>{t('settings.about')}</IonListHeader>
          {link(t('settings.privacy'), APP_CONFIG.privacyUrl)}
          {link(t('settings.terms'), APP_CONFIG.termsUrl)}
          {link(t('settings.support'), APP_CONFIG.supportUrl)}
          {link(t('settings.imprint'), APP_CONFIG.imprintUrl)}
        </IonList>

        <IonList inset>
          <IonItem button detail={false} onClick={deleteAll}>
            <IonLabel color="danger">{t('settings.delete')}</IonLabel>
          </IonItem>
        </IonList>
        <p className="list-footer">{t('settings.deleteHint')}</p>

        {DEBUG_TOOLS && (
          <IonList inset>
            <IonItem button detail routerLink="/settings/debug">
              <IonIcon slot="start" icon={bugOutline} />
              <IonLabel>Debug</IonLabel>
            </IonItem>
          </IonList>
        )}
        <p className="ion-text-center muted small">
          {APP_CONFIG.appName} {__APP_VERSION__} · {fmtShort(clock.today())}
        </p>
      </IonContent>
    </IonPage>
  );
}
