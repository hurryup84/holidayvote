import { IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import { useApp } from '../../app/AppContext';
import { useDb, useLiveQuery } from '../../data/db/DbContext';
import { seedDemo } from '../../data/demo';

/** Dev builds only (npm run dev / build:dev): demo data, sync state, reset. */
export function DebugPage() {
  const { repos, accountState, account, session } = useApp();
  const db = useDb();
  const [toast] = useIonToast();
  const { data: pending } = useLiveQuery(() => account.pendingUploads(), ['properties', 'votes', 'comments', 'vacations'], []);
  const say = (message: string) => void toast({ message, duration: 1500, position: 'top' });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/settings" />
          </IonButtons>
          <IonTitle>Debug</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset>
          <IonListHeader>State</IonListHeader>
          <IonItem>
            <IonLabel className="ion-text-wrap">
              <p>user: {session.userId}</p>
              <p>driver: {db.driverName}</p>
              <p>account: {accountState.user?.id ?? '–'} · synced: {String(accountState.synced)}</p>
              <p>sync: {JSON.stringify(accountState.sync)}</p>
              <p>pending uploads: {pending ?? '…'}</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <IonList inset>
          <IonItem button onClick={() => void seedDemo(repos).then(() => say('Demo vacation created'))}>
            <IonLabel>Seed demo vacation</IonLabel>
          </IonItem>
          <IonItem button onClick={() => void account.syncNow().then(() => say('Synced'))}>
            <IonLabel>Sync now</IonLabel>
          </IonItem>
          <IonItem button onClick={() => void repos.previews.clear().then(() => say('Preview cache cleared'))}>
            <IonLabel>Clear preview cache</IonLabel>
          </IonItem>
          <IonItem button onClick={() => void repos.kv.set('onboarding_completed', null).then(() => window.location.reload())}>
            <IonLabel>Show onboarding again</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}
