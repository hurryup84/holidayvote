import { IonCheckbox, IonItem, IonLabel } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { APP_CONFIG } from '../../core/config';
import { openUrl } from '../../native/browser';

/** "I accept the terms of use" – required before the first invite / join (UGC rules). */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange(v: boolean): void }) {
  const { t } = useTranslation();
  return (
    <IonItem lines="none" className="terms-item">
      <IonCheckbox slot="start" checked={checked} onIonChange={(e) => onChange(e.detail.checked)} aria-label={t('ugc.accept')} />
      <IonLabel className="ion-text-wrap small">
        {t('ugc.acceptPrefix')}{' '}
        <a
          href={APP_CONFIG.termsUrl}
          onClick={(e) => {
            e.preventDefault();
            void openUrl(APP_CONFIG.termsUrl);
          }}
        >
          {t('ugc.terms')}
        </a>
        {t('ugc.acceptSuffix')}
      </IonLabel>
    </IonItem>
  );
}
