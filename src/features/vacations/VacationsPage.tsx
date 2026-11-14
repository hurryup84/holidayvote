import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
} from '@ionic/react';
import { add, calendarOutline, checkmarkCircle, homeOutline, locationOutline, peopleOutline, sunnyOutline, ticketOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { fmtDateRange } from '../../core/format';
import { useLiveQuery } from '../../data/db/DbContext';
import { VACATION_TABLES } from '../../data/repositories/vacationRepo';
import { useSharing } from '../sharing/useSharing';
import { VacationEditModal } from './VacationEditModal';
import './vacations.css';

/** Start screen: my vacations, "new vacation", "join with a code". */
export function VacationsPage() {
  const { t } = useTranslation();
  const { repos, invite, clearInvite, account } = useApp();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const sharing = useSharing();
  const [creating, setCreating] = useState(false);
  const { data: vacations } = useLiveQuery(() => repos.vacations.list(), VACATION_TABLES, [repos]);

  const open = (id: string) => router.push(`/vacations/${id}`);

  // Joined during onboarding: open that vacation once.
  useEffect(() => {
    void repos.kv.get('open_vacation').then((id) => {
      if (!id) return;
      void repos.kv.set('open_vacation', null);
      open(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  const askJoin = (code = '') =>
    void alert({
      header: t('sharing.joinTitle'),
      message: t('sharing.joinText'),
      inputs: [{ name: 'code', placeholder: 'K7P2QX', value: code, attributes: { maxlength: 6, autocapitalize: 'characters' } }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('sharing.join'), handler: (v: { code?: string }) => void (v.code?.trim() && sharing.join(v.code.trim(), open)) },
      ],
    });

  // Invite link while the app is running.
  useEffect(() => {
    if (!invite) return;
    clearInvite();
    askJoin(invite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('vacations.title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => askJoin()} aria-label={t('sharing.joinWithCode')}>
              <IonIcon slot="icon-only" icon={ticketOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {account.online && (
          <IonRefresher slot="fixed" onIonRefresh={(e) => void account.syncNow().then(() => e.detail.complete())}>
            <IonRefresherContent />
          </IonRefresher>
        )}
        {vacations && vacations.length === 0 && (
          <div className="empty-state">
            <IonIcon icon={sunnyOutline} />
            <h2>{t('vacations.emptyTitle')}</h2>
            <p>{t('vacations.emptyText')}</p>
            <IonButton onClick={() => setCreating(true)}>
              <IonIcon slot="start" icon={add} />
              {t('vacation.new')}
            </IonButton>
            <IonButton fill="clear" onClick={() => askJoin()}>
              <IonIcon slot="start" icon={ticketOutline} />
              {t('sharing.joinWithCode')}
            </IonButton>
          </div>
        )}
        <div className="vacation-list">
          {vacations?.map((v) => (
            <button key={v.id} className="vacation-card card" onClick={() => open(v.id)}>
              <h2>{v.name}</h2>
              <div className="vacation-meta">
                {v.destination && (
                  <span>
                    <IonIcon icon={locationOutline} /> {v.destination}
                  </span>
                )}
                {(v.startDate || v.endDate) && (
                  <span>
                    <IonIcon icon={calendarOutline} /> {fmtDateRange(v.startDate, v.endDate)}
                  </span>
                )}
              </div>
              <div className="vacation-meta">
                <span>
                  <IonIcon icon={homeOutline} /> {t('vacations.houses', { count: v.properties })}
                </span>
                <span>
                  <IonIcon icon={peopleOutline} /> {t('vacations.people', { count: v.members })}
                </span>
              </div>
              {v.booked && (
                <div className="vacation-booked">
                  <IonIcon icon={checkmarkCircle} /> {t('vacations.booked', { title: v.booked })}
                </div>
              )}
            </button>
          ))}
        </div>
        {!!vacations?.length && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton onClick={() => setCreating(true)} aria-label={t('vacation.new')}>
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
      </IonContent>
      <VacationEditModal
        isOpen={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSave={async (input) => {
          const id = await repos.vacations.create(input);
          window.setTimeout(() => open(id), 250);
        }}
      />
      {sharing.ui}
    </IonPage>
  );
}
