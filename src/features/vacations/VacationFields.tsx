import { IonInput, IonItem, IonList, IonTextarea } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import type { VacationInput } from '../../domain/models';

export type VacationForm = Required<{ [K in keyof VacationInput]: string }>;

export const emptyVacationForm: VacationForm = { name: '', description: '', destination: '', startDate: '', endDate: '' };

export function toForm(v: Partial<VacationInput>): VacationForm {
  return {
    name: v.name ?? '',
    description: v.description ?? '',
    destination: v.destination ?? '',
    startDate: v.startDate ?? '',
    endDate: v.endDate ?? '',
  };
}

/** Name, destination, dates, description – used by onboarding and the vacation editor. */
export function VacationFields({ value, onChange }: { value: VacationForm; onChange(v: VacationForm): void }) {
  const { t } = useTranslation();
  const set = (k: keyof VacationForm) => (e: { detail: { value?: string | null } }) => onChange({ ...value, [k]: String(e.detail.value ?? '') });
  return (
    <IonList inset className="join-form">
      <IonItem>
        <IonInput
          label={t('vacation.name')}
          labelPlacement="stacked"
          placeholder={t('vacation.namePlaceholder')}
          value={value.name}
          maxlength={120}
          autocapitalize="sentences"
          onIonInput={set('name')}
        />
      </IonItem>
      <IonItem>
        <IonInput
          label={t('vacation.destination')}
          labelPlacement="stacked"
          placeholder={t('vacation.destinationPlaceholder')}
          value={value.destination}
          maxlength={200}
          autocapitalize="words"
          onIonInput={set('destination')}
        />
      </IonItem>
      <IonItem>
        <IonInput label={t('vacation.from')} labelPlacement="stacked" type="date" value={value.startDate} onIonInput={set('startDate')} />
        <IonInput label={t('vacation.to')} labelPlacement="stacked" type="date" value={value.endDate} min={value.startDate || undefined} onIonInput={set('endDate')} />
      </IonItem>
      <IonItem>
        <IonTextarea
          label={t('vacation.description')}
          labelPlacement="stacked"
          placeholder={t('vacation.descriptionPlaceholder')}
          value={value.description}
          maxlength={2000}
          autoGrow
          rows={2}
          onIonInput={set('description')}
        />
      </IonItem>
    </IonList>
  );
}
