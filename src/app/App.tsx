import { IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, useIonRouter } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { airplaneOutline, settingsOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route } from 'react-router-dom';
import { DEBUG_TOOLS } from '../core/config';
import { DebugPage } from '../features/debug/DebugPage';
import { PropertyPage } from '../features/property/PropertyPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { VacationPage } from '../features/vacation/VacationPage';
import { VacationsPage } from '../features/vacations/VacationsPage';
import { useApp } from './AppContext';

/** Invite link while the app is open: show the vacation list with the join dialog. */
function InviteRouting({ startInvite }: { startInvite: string | null }) {
  const router = useIonRouter();
  const { invite } = useApp();
  const handledAtStart = useRef(startInvite);
  useEffect(() => {
    if (!invite) return;
    if (invite === handledAtStart.current) {
      handledAtStart.current = null;
      return;
    }
    router.push('/vacations', 'root');
  }, [invite, router]);
  return null;
}

export function App() {
  const { t } = useTranslation();
  const { invite } = useApp();
  const [start] = useState(() => ({ invite }));
  return (
    <IonReactRouter>
      <InviteRouting startInvite={start.invite} />
      <IonTabs>
        <IonRouterOutlet>
          <Route path="/vacations" element={<VacationsPage />} />
          <Route path="/vacations/:id" element={<VacationPage />} />
          <Route path="/vacations/:id/houses/:pid" element={<PropertyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Always a Route: Ionic's outlet can't handle `false` children (release builds crashed in Esstisch). */}
          <Route path="/settings/debug" element={DEBUG_TOOLS ? <DebugPage /> : <Navigate to="/settings" replace />} />
          <Route path="/" element={<Navigate to="/vacations" replace />} />
        </IonRouterOutlet>
        <IonTabBar slot="bottom">
          <IonTabButton tab="vacations" href="/vacations">
            <IonIcon icon={airplaneOutline} />
            <IonLabel>{t('tabs.vacations')}</IonLabel>
          </IonTabButton>
          <IonTabButton tab="settings" href="/settings">
            <IonIcon icon={settingsOutline} />
            <IonLabel>{t('tabs.settings')}</IonLabel>
          </IonTabButton>
        </IonTabBar>
      </IonTabs>
    </IonReactRouter>
  );
}
