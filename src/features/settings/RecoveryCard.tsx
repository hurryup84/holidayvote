import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonListHeader, useIonAlert, useIonToast } from '@ionic/react';
import { keyOutline, warningOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { fmtShort } from '../../core/format';
import { shareText } from '../../native/share';

/**
 * "New or lost phone?" in Settings: create a recovery code and save it.
 * The code is shown only right after creating it (the server keeps just a hash).
 */
export function RecoveryCard() {
  const { t } = useTranslation();
  const { account } = useApp();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [createdAt, setCreatedAt] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void account
      .recoveryCodeCreatedAt()
      .then(setCreatedAt)
      .catch(() => setCreatedAt(undefined));
  }, [account]);

  const create = async () => {
    setBusy(true);
    try {
      setCode(await account.createRecoveryCode());
      setCreatedAt(new Date().toISOString());
    } catch {
      void toast({ message: t('sharing.error.failed'), duration: 2500, position: 'top', color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    if (!createdAt) return void create();
    void alert({
      header: t('recovery.renewTitle'),
      message: t('recovery.renewText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('recovery.renew'), handler: () => void create() },
      ],
    });
  };

  const save = () =>
    code && void shareText({ title: t('recovery.shareTitle'), text: t('recovery.shareText', { code }) });
  const copy = () =>
    code &&
    void navigator.clipboard
      .writeText(code)
      .then(() => toast({ message: t('recovery.copied'), duration: 1500, position: 'top' }))
      .catch(() => undefined);

  return (
    <IonList inset>
      <IonListHeader>{t('recovery.title')}</IonListHeader>
      <IonItem lines="none">
        <IonLabel className="ion-text-wrap">
          <p>{t('recovery.text')}</p>
        </IonLabel>
      </IonItem>
      {code ? (
        <div className="recovery-code ion-padding-horizontal">
          <p className="small muted">{t('recovery.yourCode')}</p>
          <div className="recovery-code-value">{code}</div>
          <p className="small">{t('recovery.keepSafe')}</p>
          <div className="recovery-actions">
            <IonButton onClick={save}>{t('recovery.save')}</IonButton>
            <IonButton fill="outline" onClick={copy}>
              {t('recovery.copy')}
            </IonButton>
            <IonButton fill="clear" onClick={() => setCode(null)}>
              {t('recovery.done')}
            </IonButton>
          </div>
        </div>
      ) : (
        <>
          {createdAt !== undefined && (
            <IonItem lines="none">
              <IonIcon slot="start" icon={createdAt ? keyOutline : warningOutline} color={createdAt ? 'medium' : 'warning'} />
              <IonLabel className="ion-text-wrap">
                {createdAt ? t('recovery.createdAt', { date: fmtShort(createdAt.slice(0, 10)) }) : t('recovery.none')}
              </IonLabel>
            </IonItem>
          )}
          <IonItem button detail={false} disabled={busy} onClick={ask}>
            <IonIcon slot="start" icon={keyOutline} color="primary" />
            <IonLabel color="primary">{createdAt ? t('recovery.renew') : t('recovery.create')}</IonLabel>
          </IonItem>
        </>
      )}
    </IonList>
  );
}
