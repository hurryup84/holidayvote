import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VacationInput } from '../../domain/models';
import { VacationFields, emptyVacationForm, toForm, type VacationForm } from './VacationFields';

/** Create (initial = null) or edit a vacation. */
export function VacationEditModal({
  isOpen,
  initial,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  initial: VacationInput | null;
  onClose(): void;
  onSave(v: VacationInput): Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<VacationForm>(emptyVacationForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(initial ? toForm(initial) : emptyVacationForm);
  }, [isOpen, initial]);

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        destination: form.destination || null,
        description: form.description || null,
        startDate: form.startDate || null,
        endDate: form.endDate && (!form.startDate || form.endDate >= form.startDate) ? form.endDate : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onClose}>{t('common.cancel')}</IonButton>
          </IonButtons>
          <IonTitle>{initial ? t('vacation.edit') : t('vacation.new')}</IonTitle>
          <IonButtons slot="end">
            <IonButton strong disabled={!form.name.trim() || saving} onClick={() => void save()}>
              {t('common.save')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <VacationFields value={form} onChange={setForm} />
      </IonContent>
    </IonModal>
  );
}
