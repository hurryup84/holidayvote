import { IonBadge, IonIcon, IonItem, IonLabel, IonList, IonListHeader, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { cloudOfflineOutline, personAddOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { useChainedSheet } from '../../components/useChainedSheet';
import { useLiveQuery } from '../../data/db/DbContext';
import type { ReportReason } from '../../data/sync/account';
import type { Member, Vacation } from '../../domain/models';
import { sharingErrorText } from '../sharing/errors';

/** "People" section: members list + invite + member actions (report / block / remove). */
export function PeopleSection({
  vacation,
  members,
  iAmOwner,
  onInvite,
}: {
  vacation: Vacation;
  members: Member[];
  iAmOwner: boolean;
  onInvite(): void;
}) {
  const { t } = useTranslation();
  const { session, account, accountState } = useApp();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const { sheet, then } = useChainedSheet();
  const { data: onServer } = useLiveQuery(() => account.isOnServer(vacation.id), ['vacations', 'vacation_members'], [vacation.id, accountState.synced]);
  const me = session.userId;
  const say = (message: string, color?: string) => void toast({ message, duration: 2500, position: 'top', color });

  const reportReasons = (onPick: (r: ReportReason) => void) =>
    void sheet({
      header: t('ugc.reasonTitle'),
      buttons: [
        ...(['offensive', 'illegal', 'spam', 'other'] as const).map((r) => ({ text: t(`ugc.reason.${r}`), handler: () => onPick(r) })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const memberActions = (m: Member) => {
    const name = m.name || t('sharing.unnamed');
    void sheet({
      header: name,
      buttons: [
        {
          text: t('ugc.reportMember'),
          handler: then(() =>
            reportReasons((reason) =>
              void account.report(vacation.id, { type: 'member', id: m.userId }, reason).then(
                () => say(t('ugc.reported')),
                (e) => say(sharingErrorText(e), 'danger'),
              ),
            ),
          ),
        },
        {
          text: t('ugc.block'),
          role: 'destructive',
          handler: () =>
            void alert({
              header: t('ugc.blockTitle', { name }),
              message: iAmOwner ? t('ugc.blockTextOwner') : t('ugc.blockText'),
              buttons: [
                { text: t('common.cancel'), role: 'cancel' },
                {
                  text: t('ugc.block'),
                  role: 'destructive',
                  handler: () =>
                    void account.blockMember(vacation.id, m.userId).then(
                      () => {
                        say(t('ugc.blocked'));
                        if (!iAmOwner) router.push('/vacations', 'root');
                      },
                      (e) => say(sharingErrorText(e), 'danger'),
                    ),
                },
              ],
            }),
        },
        ...(iAmOwner
          ? [
              {
                text: t('sharing.remove'),
                handler: () =>
                  void alert({
                    header: t('sharing.removeTitle', { name }),
                    buttons: [
                      { text: t('common.cancel'), role: 'cancel' },
                      {
                        text: t('sharing.remove'),
                        role: 'destructive',
                        handler: () => void account.removeMember(vacation.id, m.userId).catch((e) => say(sharingErrorText(e), 'danger')),
                      },
                    ],
                  }),
              },
            ]
          : []),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
  };

  return (
    <>
      {onServer === false && (
        <p className="local-note">
          <IonIcon icon={cloudOfflineOutline} /> {t('vacation.onlyHere')}
        </p>
      )}
      <IonList inset>
        <IonListHeader>{t('vacation.people', { count: members.length })}</IonListHeader>
        {members.map((m) => (
          <IonItem key={m.userId} button={m.userId !== me && onServer === true} detail={false} onClick={() => m.userId !== me && onServer && memberActions(m)}>
            <IonLabel>
              {m.name || t('sharing.unnamed')}
              {m.userId === me && <span className="muted"> ({t('sharing.you')})</span>}
            </IonLabel>
            {m.role === 'owner' && (
              <IonBadge color="medium" slot="end">
                {t('sharing.owner')}
              </IonBadge>
            )}
          </IonItem>
        ))}
        <IonItem button detail={false} onClick={onInvite}>
          <IonIcon slot="start" icon={personAddOutline} color="primary" />
          <IonLabel color="primary">{t('sharing.invite')}</IonLabel>
        </IonItem>
      </IonList>
      <p className="list-footer">{t('sharing.inviteHint')}</p>
    </>
  );
}
