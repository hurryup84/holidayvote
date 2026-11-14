import { IonButton, IonContent, IonModal } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { fmtShort } from '../../core/format';

export function InviteSheet({
  invite,
  onShare,
  onClose,
}: {
  invite: { code: string; expiresAt: string } | null;
  onShare(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  return (
    <IonModal isOpen={invite !== null} onDidDismiss={onClose} initialBreakpoint={0.6} breakpoints={[0, 0.6]}>
      <IonContent className="ion-padding">
        <div className="invite-sheet">
          <h2>{t('sharing.inviteTitle')}</h2>
          <p className="muted">{t('sharing.inviteText')}</p>
          <div className="invite-code" aria-label={t('sharing.inviteTitle')}>
            {invite?.code}
          </div>
          <p className="muted small">{invite && t('sharing.inviteExpires', { date: fmtShort(invite.expiresAt.slice(0, 10)) })}</p>
          <IonButton expand="block" onClick={onShare}>
            {t('sharing.inviteShare')}
          </IonButton>
          <IonButton expand="block" fill="clear" onClick={onClose}>
            {t('common.close')}
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
}
