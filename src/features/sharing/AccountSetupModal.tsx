import { IonButton, IonContent, IonInput, IonItem, IonList, IonModal, IonSpinner } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { useLiveQuery } from '../../data/db/DbContext';
import { sharingErrorText } from './errors';
import { TermsCheckbox } from './TermsCheckbox';

/**
 * Before the first invite / join on this phone: name + terms. Then the account is created quietly
 * (bot check, anonymous sign-in) and the vacations upload. Resolves `onReady` when done.
 */
export function AccountSetupModal({ isOpen, onClose, onReady, purpose }: { isOpen: boolean; onClose(): void; onReady(): void; purpose: 'invite' | 'join' }) {
  const { t } = useTranslation();
  const { account } = useApp();
  const { data: myName } = useLiveQuery(() => account.displayName(), ['profiles'], []);
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(myName ?? '');
      setError(null);
    }
  }, [isOpen, myName]);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await account.markTermsAccepted();
      await account.ensureAccount(name);
      onReady();
    } catch (e) {
      setError(sharingErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
      <IonContent className="ion-padding">
        <h2>{t(`sharing.setup.${purpose}Title`)}</h2>
        <p className="muted">{t('sharing.setup.text')}</p>
        <IonList inset>
          <IonItem>
            <IonInput
              label={t('sharing.yourName')}
              labelPlacement="stacked"
              placeholder={t('sharing.namePlaceholder')}
              value={name}
              maxlength={60}
              autocapitalize="words"
              onIonInput={(e) => setName(String(e.detail.value ?? ''))}
            />
          </IonItem>
        </IonList>
        <TermsCheckbox checked={terms} onChange={setTerms} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <IonButton expand="block" disabled={!name.trim() || !terms || busy} onClick={() => void go()}>
          {busy ? <IonSpinner name="dots" /> : t('common.continue')}
        </IonButton>
        <p className="muted small">{t('sharing.privacyNote')}</p>
      </IonContent>
    </IonModal>
  );
}
