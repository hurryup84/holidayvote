import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonToggle, useIonAlert } from '@ionic/react';
import { createOutline, trashOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import type { Member, Vacation } from '../../domain/models';
import { fieldOn } from './fields';

/** Vacation settings section: edit, leave, delete + house-detail toggles. */
export function VacationSettings({
  vacation,
  members,
  iAmOwner,
  onEdit,
  onLeave,
  onDelete,
}: {
  vacation: Vacation;
  members: Member[];
  iAmOwner: boolean;
  onEdit(): void;
  onLeave(): void;
  onDelete(): void;
}) {
  const { t } = useTranslation();
  const { repos } = useApp();
  const [alert] = useIonAlert();

  const fields = [
    { key: 'price', label: 'fields.price' },
    { key: 'bedrooms', label: 'fields.bedrooms' },
    { key: 'beds', label: 'fields.beds' },
    { key: 'bathrooms', label: 'fields.bathrooms' },
    { key: 'has_pool', label: 'fields.has_pool' },
    { key: 'address', label: 'fields.address' },
    { key: 'description', label: 'fields.description' },
  ] as const;

  const remove = () =>
    void alert({
      header: t('vacation.deleteTitle', { name: vacation.name }),
      message: members.length > 1 ? t('vacation.deleteTextShared') : t('vacation.deleteText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: () => onDelete(),
        },
      ],
    });

  const leave = () =>
    void alert({
      header: t('vacation.leaveTitle', { name: vacation.name }),
      message: iAmOwner ? t('vacation.leaveTextOwner') : t('vacation.leaveText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('vacation.leave'),
          role: 'destructive',
          handler: () => onLeave(),
        },
      ],
    });

  return (
    <>
      {/* Vacation settings: edit */}
      <IonList inset>
        <IonListHeader>{t('vacation.settings')}</IonListHeader>
        <IonItem button detail={false} onClick={onEdit}>
          <IonIcon slot="start" icon={createOutline} />
          <IonLabel>{t('vacation.edit')}</IonLabel>
        </IonItem>
      </IonList>

      {/* House details: which details to show */}
      <IonList inset>
        <IonListHeader>{t('vacation.fields')}</IonListHeader>
        {fields.map((f) => (
          <IonItem key={f.key}>
            <IonToggle
              checked={fieldOn(vacation.settings, f.key)}
              onIonChange={(e) =>
                void repos.vacations.updateSettings(vacation.id, {
                  fields: { ...vacation.settings.fields, [f.key]: e.detail.checked },
                })
              }
            >
              {t(f.label)}
            </IonToggle>
          </IonItem>
        ))}
      </IonList>
      <p className="list-footer">{t('vacation.fieldsHint')}</p>

      {/* Vacation settings: leave / delete */}
      <IonList inset>
        {members.length > 1 && (
          <IonItem button detail={false} onClick={leave}>
            <IonLabel color="danger">{t('vacation.leave')}</IonLabel>
          </IonItem>
        )}
        {iAmOwner && (
          <IonItem button detail={false} onClick={remove}>
            <IonIcon slot="start" icon={trashOutline} color="danger" />
            <IonLabel color="danger">{t('vacation.delete')}</IonLabel>
          </IonItem>
        )}
      </IonList>
    </>
  );
}
