import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { App as CapApp } from '@capacitor/app';
import { homeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onIncomingShare,
  pendingShares,
  removeShare,
  sharedHolidayHomeUrl,
  type IncomingShare,
} from '../../native/incomingShare';
import { useApp } from '../../app/AppContext';
import type { VacationSettings } from '../../domain/models';
import { PropertyEditModal } from '../vacation/PropertyEditModal';

/** Shares stay in the native inbox until the review is saved or explicitly dismissed.
 *  Unlike dining_table, the user first picks the vacation the house is added to. */
export function SharedProperty() {
  const { t } = useTranslation();
  const { repos } = useApp();
  const [toast] = useIonToast();
  const [share, setShare] = useState<(IncomingShare & { url: string }) | null>(null);
  const [vacationId, setVacationId] = useState<string>('');
  const [settings, setSettings] = useState<VacationSettings>({ fields: {} });
  const [vacations, setVacations] = useState<{ id: string; name: string; settings: VacationSettings }[]>([]);
  const current = useRef<string | null>(null);
  const closing = useRef<Promise<boolean> | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || current.current) return;
      checking = true;
      try {
        const shares = await pendingShares();
        if (!active) return;
        // Filter out invalid shares silently; only show error if there are actual shares to process
        const validShares: IncomingShare[] = [];
        for (const item of shares) {
          if (!active) return;
          const url = sharedHolidayHomeUrl(item.text);
          if (url) {
            validShares.push(item);
          } else {
            await removeShare(item.id);
          }
        }
        if (!active) return;
        if (validShares.length > 0) {
          current.current = validShares[0].id;
          setShare({ ...validShares[0], url: sharedHolidayHomeUrl(validShares[0].text)! });
          setVacationId('');
        }
      } catch (error) {
        console.error('[incoming-share] inbox', error);
        // Only show error toast if there was actually something to process
        if (active) {
          try {
            const shares = await pendingShares();
            if (shares.length > 0) {
              void toast({ message: t('property.sharedLinkError'), duration: 4000, color: 'danger' });
            }
          } catch {
            // Ignore - no shares to process
          }
        }
      } finally {
        checking = false;
      }
    };
    void check();
    const received = onIncomingShare(() => void check());
    // Re-check for pending shares when the app comes to the foreground. This covers
    // the case where the Share Extension opened the app while it was already running
    // (mount check already ran and found nothing), so the newly saved share is picked up.
    const state = CapApp.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
      if (isActive) void check();
    });
    return () => {
      active = false;
      void state.then((s: { remove: () => void }) => s.remove());
      void received.then((s: { remove: () => void }) => s.remove());
    };
  }, [revision, t, toast]);

  useEffect(() => {
    if (!share) return;
    void repos.vacations.list().then((list) => {
      setVacations(list.map((v) => ({ id: v.id, name: v.name, settings: v.settings })));
    });
  }, [share, repos]);

  const openFor = (id: string, s: VacationSettings) => {
    setSettings(s);
    setVacationId(id);
  };

  const close = () => {
    if (!share || current.current !== share.id) return Promise.resolve(true);
    closing.current ??= removeShare(share.id).then(() => {
      setShare(null);
      return true;
    }).catch((error: unknown) => {
      closing.current = null;
      console.error('[incoming-share] dismiss', error);
      void toast({ message: t('property.sharedLinkError'), duration: 4000, color: 'danger' });
      return false;
    });
    return closing.current;
  };

  const finish = () => {
    current.current = null;
    closing.current = null;
    setRevision((n) => n + 1);
    setShare(null);
    setVacationId('');
  };

  return (
    <>
      {share && !vacationId ? (
        <IonModal isOpen onDidDismiss={finish}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{t('property.sharedPickVacation')}</IonTitle>
              <IonButtons slot="start">
                <IonButton onClick={() => { void close(); finish(); }}>{t('common.cancel')}</IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <p className="muted small">{t('property.sharedPickVacationHint')}</p>
            <IonList>
              {vacations.length === 0 && (
                <IonItem>
                  <IonLabel>{t('property.sharedNoVacations')}</IonLabel>
                </IonItem>
              )}
              {vacations.map((v) => (
                <IonItem key={v.id} button onClick={() => openFor(v.id, v.settings)}>
                  <IonIcon slot="start" icon={homeOutline} />
                  <IonLabel>{v.name}</IonLabel>
                </IonItem>
              ))}
            </IonList>
          </IonContent>
        </IonModal>
      ) : null}
      <PropertyEditModal
        isOpen={share !== null && !!vacationId}
        vacationId={vacationId}
        settings={settings}
        property={null}
        initialPropertyUrl={share?.url ?? undefined}
        initialTitle={share?.title}
        onClose={() => { void close(); }}
        onDismissed={() => { void close().then(finish); }}
        onSaved={() => { void close().then(finish); }}
      />
    </>
  );
}
