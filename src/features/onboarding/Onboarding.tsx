import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonList, IonPage, IonSpinner, useIonToast } from '@ionic/react';
import {
  addCircleOutline,
  chevronBack,
  chevronForward,
  homeOutline,
  keyOutline,
  linkOutline,
  peopleOutline,
  starOutline,
  ticketOutline,
  sunnyOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { syncConfigured } from '../../data/sync/supabase';
import { sharingErrorText } from '../sharing/errors';
import { TermsCheckbox } from '../sharing/TermsCheckbox';
import { VacationFields, emptyVacationForm, type VacationForm } from '../vacations/VacationFields';
import './onboarding.css';

const PAGES = [
  { icon: linkOutline, key: 'collect' },
  { icon: starOutline, key: 'vote' },
  { icon: homeOutline, key: 'decide' },
] as const;

type Step = { kind: 'welcome' } | { kind: 'intro'; page: number } | { kind: 'first' } | { kind: 'join' } | { kind: 'recover' };

/**
 * First start (like Esstisch). Three ways in:
 * - "Urlaub planen": 3 intro pages + the first vacation (only on this phone until someone is invited).
 * - "Ich wurde eingeladen": code, name, terms → straight into the shared vacation.
 * - "Neues Handy?": recovery code → the vacations of the old phone come back.
 * An invite link (com.moidev.holidayvote://join/CODE) skips the choice and fills in the code.
 */
export function Onboarding({ onDone }: { onDone(): void }) {
  const { invite, clearInvite } = useApp();
  const [step, setStep] = useState<Step>(() => (invite ? { kind: 'join' } : { kind: 'welcome' }));
  const [code, setCode] = useState(invite ?? '');

  useEffect(() => {
    if (!invite) return;
    setCode(invite);
    setStep({ kind: 'join' });
    clearInvite();
  }, [invite, clearInvite]);

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="onboarding">
          {step.kind === 'welcome' && (
            <Welcome
              onNew={() => setStep({ kind: 'intro', page: 0 })}
              onInvited={() => setStep({ kind: 'join' })}
              onRecover={() => setStep({ kind: 'recover' })}
            />
          )}
          {step.kind === 'intro' && (
            <Intro
              page={step.page}
              onBack={() => setStep(step.page === 0 ? { kind: 'welcome' } : { kind: 'intro', page: step.page - 1 })}
              onNext={() => setStep(step.page === PAGES.length - 1 ? { kind: 'first' } : { kind: 'intro', page: step.page + 1 })}
            />
          )}
          {step.kind === 'first' && <FirstVacation onBack={() => setStep({ kind: 'intro', page: PAGES.length - 1 })} onDone={onDone} />}
          {step.kind === 'join' && <Join code={code} setCode={setCode} onBack={() => setStep({ kind: 'welcome' })} onDone={onDone} />}
          {step.kind === 'recover' && <Recover onBack={() => setStep({ kind: 'welcome' })} onDone={onDone} />}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Welcome({ onNew, onInvited, onRecover }: { onNew(): void; onInvited(): void; onRecover(): void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="onboarding-page">
        <IonIcon icon={sunnyOutline} className="onboarding-icon" />
        <h1>{t('onboarding.welcome.title')}</h1>
        <p className="muted">{t('onboarding.welcome.text')}</p>
      </div>
      <div className="onboarding-choices">
        <button className="onboarding-choice primary" onClick={onNew}>
          <IonIcon icon={addCircleOutline} />
          <span>
            <strong>{t('onboarding.welcome.new')}</strong>
            <span>{t('onboarding.welcome.newHint')}</span>
          </span>
          <IonIcon icon={chevronForward} className="chev" />
        </button>
        <button className="onboarding-choice" onClick={onInvited}>
          <IonIcon icon={ticketOutline} />
          <span>
            <strong>{t('onboarding.welcome.invited')}</strong>
            <span>{t('onboarding.welcome.invitedHint')}</span>
          </span>
          <IonIcon icon={chevronForward} className="chev" />
        </button>
        <IonButton fill="clear" size="small" className="onboarding-recover" onClick={onRecover}>
          <IonIcon slot="start" icon={keyOutline} />
          {t('onboarding.welcome.recover')}
        </IonButton>
      </div>
    </>
  );
}

function BackButton({ onClick }: { onClick(): void }) {
  const { t } = useTranslation();
  return (
    <IonButton fill="clear" size="small" className="onboarding-back" onClick={onClick}>
      <IonIcon slot="start" icon={chevronBack} />
      {t('onboarding.back')}
    </IonButton>
  );
}

function Intro({ page, onBack, onNext }: { page: number; onBack(): void; onNext(): void }) {
  const { t } = useTranslation();
  return (
    <>
      <BackButton onClick={onBack} />
      <div className="onboarding-page" key={page}>
        <IonIcon icon={PAGES[page].icon} className="onboarding-icon" />
        <h1>{t(`onboarding.${PAGES[page].key}.title`)}</h1>
        <p className="muted">{t(`onboarding.${PAGES[page].key}.text`)}</p>
      </div>
      <div className="onboarding-footer">
        <div className="onboarding-dots">
          {PAGES.map((_, i) => (
            <span key={i} className={i === page ? 'active' : ''} />
          ))}
        </div>
        <IonButton expand="block" onClick={onNext}>
          {t('onboarding.continue')}
        </IonButton>
      </div>
    </>
  );
}

/** Name + the first vacation. Stays on this phone until the first invite. */
function FirstVacation({ onBack, onDone }: { onBack(): void; onDone(): void }) {
  const { t } = useTranslation();
  const { repos, account } = useApp();
  const [name, setName] = useState('');
  const [form, setForm] = useState<VacationForm>(emptyVacationForm);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    await account.setDisplayName(name);
    if (form.name.trim()) await repos.vacations.create(form);
    await repos.kv.set('onboarding_completed', '1');
    onDone();
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="onboarding-page form-page">
        <h1>{t('onboarding.first.title')}</h1>
        <p className="muted">{t('onboarding.first.text')}</p>
        <IonList inset className="join-form">
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
        <VacationFields value={form} onChange={setForm} />
      </div>
      <div className="onboarding-footer">
        <IonButton expand="block" disabled={saving || !name.trim()} onClick={() => void finish()}>
          {form.name.trim() ? t('onboarding.first.create') : t('onboarding.first.later')}
        </IonButton>
      </div>
    </>
  );
}

/** Invited: code + name + terms, then straight into the shared vacation. */
function Join({ code, setCode, onBack, onDone }: { code: string; setCode(c: string): void; onBack(): void; onDone(): void }) {
  const { t } = useTranslation();
  const { account, repos } = useApp();
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  const canJoin = clean.length === 6 && name.trim().length > 0 && terms && !busy;

  const join = async () => {
    setError(null);
    if (!syncConfigured) return setError(t('sharing.notConfigured'));
    setBusy(true);
    try {
      await account.markTermsAccepted();
      await account.ensureAccount(name);
      const r = await account.acceptInvite(clean);
      await repos.kv.set('onboarding_completed', '1');
      await repos.kv.set('open_vacation', r.vacationId);
      onDone();
    } catch (e) {
      setError(sharingErrorText(e));
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="onboarding-page join">
        <IonIcon icon={peopleOutline} className="onboarding-icon" />
        <h1>{t('onboarding.join.title')}</h1>
        <p className="muted">{t('onboarding.join.text')}</p>
        <IonList inset className="join-form">
          <IonItem>
            <IonInput
              className="code-input"
              label={t('onboarding.join.code')}
              labelPlacement="stacked"
              placeholder="K7P2QX"
              value={clean}
              maxlength={6}
              autocapitalize="characters"
              autocorrect={false}
              spellcheck={false}
              onIonInput={(e) => setCode(String(e.detail.value ?? ''))}
            />
          </IonItem>
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
        <p className="muted small">{t('onboarding.join.noCode')}</p>
      </div>
      <div className="onboarding-footer">
        <IonButton expand="block" disabled={!canJoin} onClick={() => void join()}>
          {busy ? <IonSpinner name="dots" /> : t('onboarding.join.button')}
        </IonButton>
      </div>
    </>
  );
}

/** New phone: recovery code → the vacations (and owner roles) of the old phone come back. */
function Recover({ onBack, onDone }: { onBack(): void; onDone(): void }) {
  const { t } = useTranslation();
  const { account, repos } = useApp();
  const [toast] = useIonToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  const pretty = clean.replace(/(.{4})(?=.)/g, '$1-');

  const recover = async () => {
    setError(null);
    if (!syncConfigured) return setError(t('sharing.notConfigured'));
    setBusy(true);
    try {
      const r = await account.recoverAccount(clean);
      await repos.kv.set('onboarding_completed', '1');
      void toast({
        message: r.name ? t('onboarding.recover.welcomeBack', { name: r.name }) : t('onboarding.recover.welcomeBackNoName'),
        duration: 2500,
        position: 'top',
      });
      onDone();
    } catch (e) {
      setError(sharingErrorText(e));
      setBusy(false);
    }
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <div className="onboarding-page join">
        <IonIcon icon={keyOutline} className="onboarding-icon" />
        <h1>{t('onboarding.recover.title')}</h1>
        <p className="muted">{t('onboarding.recover.text')}</p>
        <IonList inset className="join-form">
          <IonItem>
            <IonInput
              className="code-input recovery-input"
              label={t('onboarding.recover.code')}
              labelPlacement="stacked"
              placeholder="XXXX-XXXX-XXXX"
              value={pretty}
              maxlength={14}
              autocapitalize="characters"
              autocorrect={false}
              spellcheck={false}
              onIonInput={(e) => setCode(String(e.detail.value ?? ''))}
            />
          </IonItem>
        </IonList>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">{t('onboarding.recover.noCode')}</p>
      </div>
      <div className="onboarding-footer">
        <IonButton expand="block" disabled={clean.length !== 12 || busy} onClick={() => void recover()}>
          {busy ? <IonSpinner name="dots" /> : t('onboarding.recover.button')}
        </IonButton>
      </div>
    </>
  );
}
