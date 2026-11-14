import { IonBadge, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonToggle, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { cloudOfflineOutline, createOutline, personAddOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { useChainedSheet } from '../../components/useChainedSheet';
import { useLiveQuery } from '../../data/db/DbContext';
import type { ReportReason } from '../../data/sync/account';
import { OPTIONAL_FIELDS, type Member, type Vacation } from '../../domain/models';
import { sharingErrorText } from '../sharing/errors';
import { fieldOn } from './fields';

/** "People" tab: members, invite, report / block, the owner's settings, leave / delete. */
export function PeopleSection({
  vacation,
  members,
  iAmOwner,
  onInvite,
  onEdit,
}: {
  vacation: Vacation;
  members: Member[];
  iAmOwner: boolean;
  onInvite(): void;
  onEdit(): void;
}) {
  const { t } = useTranslation();
  const { session, account, accountState, repos } = useApp();
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

  const leave = () =>
    void alert({
      header: t('vacation.leaveTitle', { name: vacation.name }),
      message: iAmOwner ? t('vacation.leaveTextOwner') : t('vacation.leaveText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('vacation.leave'),
          role: 'destructive',
          handler: () =>
            void account.leaveVacation(vacation.id).then(
              () => router.push('/vacations', 'root'),
              (e) => say(sharingErrorText(e), 'danger'),
            ),
        },
      ],
    });

  const remove = () =>
    void alert({
      header: t('vacation.deleteTitle', { name: vacation.name }),
      message: members.length > 1 ? t('vacation.deleteTextShared') : t('vacation.deleteText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: () =>
            void account.deleteVacation(vacation.id).then(
              () => router.push('/vacations', 'root'),
              (e) => say(sharingErrorText(e), 'danger'),
            ),
        },
      ],
    });

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

      {iAmOwner && (
        <>
          <IonList inset>
            <IonItem button detail onClick={onEdit}>
              <IonIcon slot="start" icon={createOutline} />
              <IonLabel>{t('vacation.edit')}</IonLabel>
            </IonItem>
          </IonList>
          <IonList inset>
            <IonListHeader>{t('vacation.fields')}</IonListHeader>
            {OPTIONAL_FIELDS.map((f) => (
              <IonItem key={f}>
                <IonToggle
                  checked={fieldOn(vacation.settings, f)}
                  onIonChange={(e) =>
                    void repos.vacations.updateSettings(vacation.id, { fields: { ...vacation.settings.fields, [f]: e.detail.checked } })
                  }
                >
                  {t(`fields.${f}`)}
                </IonToggle>
              </IonItem>
            ))}
          </IonList>
          <p className="list-footer">{t('vacation.fieldsHint')}</p>
        </>
      )}

      <IonList inset>
        {onServer && members.length > 1 && (
          <IonItem button detail={false} onClick={leave}>
            <IonLabel color="danger">{t('vacation.leave')}</IonLabel>
          </IonItem>
        )}
        {(iAmOwner || !onServer) && (
          <IonItem button detail={false} onClick={remove}>
            <IonLabel color="danger">{t('vacation.delete')}</IonLabel>
          </IonItem>
        )}
      </IonList>
    </>
  );
}
