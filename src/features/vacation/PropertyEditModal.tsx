import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { clipboardOutline, locateOutline, warningOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { HOUSE_AVATARS } from '../../components/houseAvatars';
import { PreviewImage } from '../../components/PreviewImage';
import type { Property, PropertyInput, VacationSettings } from '../../domain/models';
import { detectProvider, extractUrl, isHttpUrl } from '../../domain/services/provider';
import { geocode } from '../../native/geocode';
import { fetchLinkPreview } from '../../native/linkPreview';
import { fieldOn } from './fields';

interface Form {
  url: string;
  title: string;
  description: string;
  provider: string;
  price: string;
  beds: string;
  bedrooms: string;
  bathrooms: string;
  hasPool: boolean;
  address: string;
  lat: number | null;
  lng: number | null;
  avatar: string;
}

/** Preview info from the listing page – shown to the user, never stored.
 * The user manually takes over what's relevant into title/description above. */
interface PreviewInfo {
  title: string | null;
  description: string | null;
  siteName: string | null;
}

const empty: Form = {
  url: '',
  title: '',
  description: '',
  provider: '',
  price: '',
  beds: '',
  bedrooms: '',
  bathrooms: '',
  hasPool: false,
  address: '',
  lat: null,
  lng: null,
  avatar: 'house',
};

const str = (v: number | null) => (v === null ? '' : String(v));
const toNum = (s: string, int = false): number | null => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  if (!s.trim() || !Number.isFinite(n) || n < 0) return null;
  return int ? Math.round(n) : Math.round(n * 100) / 100;
};

/**
 * Add a house (paste a link) or edit one. The link's preview is shown to the user but never stored –
 * the user manually takes over what's relevant into title and description. Only the link is saved.
 */
export function PropertyEditModal({
  isOpen,
  vacationId,
  settings,
  property,
  onClose,
  onDismissed,
  onSaved,
  initialPropertyUrl,
  initialTitle,
}: {
  isOpen: boolean;
  vacationId: string;
  settings: VacationSettings;
  property: Property | null;
  onClose(): void;
  onDismissed?(): void;
  onSaved?(id: string): void;
  /** URL of a shared holiday-home link prefilled into the form. */
  initialPropertyUrl?: string;
  /** Suggested title read from the shared link's page (shown to the user, not prefilled). */
  initialTitle?: string;
}) {
  const { t } = useTranslation();
  const { repos } = useApp();
  const [toast] = useIonToast();
  const [form, setForm] = useState<Form>(empty);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [duplicate, setDuplicate] = useState<Property | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleUnavailable, setTitleUnavailable] = useState(false);
  const lastFetched = useRef('');
  const titleChanged = useRef(false);
  const urlChanged = useRef(false);
  const on = (f: Parameters<typeof fieldOn>[1]) => fieldOn(settings, f);

  useEffect(() => {
    if (!isOpen) return;
    lastFetched.current = property?.url ?? '';
    setPreviewFailed(false);
    setDuplicate(null);
    setForm(property
      ? {
          url: property.url,
          title: property.title ?? '',
          description: property.description ?? '',
          provider: property.provider ?? '',
          price: str(property.price),
          beds: str(property.beds),
          bedrooms: str(property.bedrooms),
          bathrooms: str(property.bathrooms),
          hasPool: property.hasPool,
          address: property.address ?? '',
          lat: property.lat,
          lng: property.lng,
          avatar: property.avatar ?? 'house',
        }
      : { ...empty, url: initialPropertyUrl ?? '' }
    );
    titleChanged.current = false;
    urlChanged.current = false;
    setTitleUnavailable(false);
    setTitleLoading(false);

    // Show this house's existing preview info (if any) as temporary, not-stored info.
    if (property) {
      setPreview({
        title: property.previewTitle ?? null,
        description: property.previewDescription ?? null,
        siteName: property.previewSite ?? null,
      });
    }

    if (!property && initialPropertyUrl) {
      setTitleLoading(true);
      void fetchLinkPreview(initialPropertyUrl).then((p) => {
        if (!isOpen) return;
        setPreview({
          title: p?.title ?? null,
          description: p?.description ?? null,
          siteName: p?.siteName ?? null,
        });
        setTitleUnavailable(!p?.title);
        setTitleLoading(false);
      });
    }
  }, [isOpen, property, initialPropertyUrl, initialTitle]);

  const url = isHttpUrl(form.url.trim()) ? form.url.trim() : null;

  // New link → duplicate check + preview (from this phone's cache, or fetched once).
  // The preview is shown to the user but NOT stored – the user takes over what's relevant.
  useEffect(() => {
    if (!url || url === lastFetched.current) return;
    lastFetched.current = url;
    let active = true;
    void repos.properties.findByUrl(vacationId, url, property?.id).then((d) => active && setDuplicate(d));
    setLoadingPreview(true);
    setPreviewFailed(false);
    void repos.previews.ensure(url).then((p) => {
      if (!active) return;
      setLoadingPreview(false);
      setPreviewFailed(!p || p.status === 'failed' || (!p.title && !p.imageSrc));
      setPreview({
        title: p?.title ?? null,
        description: p?.description ?? null,
        siteName: p?.siteName ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [url, repos, vacationId, property?.id]);

  const set = (k: keyof Form) => (e: { detail: { value?: string | null } }) => {
    if (k === 'title') titleChanged.current = true;
    if (k === 'url') urlChanged.current = true;
    setForm((f) => ({ ...f, [k]: String(e.detail.value ?? '') }));
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const found = extractUrl(text);
      if (found) setForm((f) => ({ ...f, url: found }));
      else void toast({ message: t('property.noLinkInClipboard'), duration: 2000, position: 'top' });
    } catch {
      void toast({ message: t('property.pasteFailed'), duration: 2000, position: 'top' });
    }
  };

  const locate = async () => {
    setGeocoding(true);
    const r = await geocode(form.address);
    setGeocoding(false);
    if (r) setForm((f) => ({ ...f, lat: r.lat, lng: r.lng }));
    else void toast({ message: t('property.addressNotFound'), duration: 2500, position: 'top', color: 'warning' });
  };

  const save = async () => {
    if (!url || saving) return;
    setSaving(true);
    const input: PropertyInput = {
      url,
      title: form.title,
      description: form.description,
      provider: form.provider || detectProvider(url),
      price: toNum(form.price),
      beds: toNum(form.beds, true),
      bedrooms: toNum(form.bedrooms, true),
      bathrooms: toNum(form.bathrooms, true),
      hasPool: form.hasPool,
      address: form.address,
      // Coordinates only while the address they belong to is still there.
      lat: form.address.trim() ? form.lat : null,
      lng: form.address.trim() ? form.lng : null,
      avatar: form.avatar,
    };
    try {
      if (property) {
        await repos.properties.update(property.id, input);
        onSaved?.(property.id);
      } else {
        // Not `onSaved?.(await create())`: an optional call skips evaluating its arguments.
        const id = await repos.properties.create(vacationId, input);
        onSaved?.(id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => { onClose(); onDismissed?.(); }}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onClose}>{t('common.cancel')}</IonButton>
          </IonButtons>
          <IonTitle>{property ? t('property.edit') : t('property.add')}</IonTitle>
          <IonButtons slot="end">
            <IonButton strong disabled={!url || saving || titleLoading} onClick={() => void save()}>
              {t('common.save')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {initialPropertyUrl && (
          <div className="edit-preview-note ion-padding-horizontal" role="status">
            <p>{t('property.sharedPhotoNotice')}</p>
            {titleLoading && <p>{t('property.sharedTitleLoading')}</p>}
            {titleUnavailable && <p>{t('property.sharedTitleUnavailable')}</p>}
          </div>
        )}
        <IonList inset>
          <IonItem>
            <IonInput
              label={t('property.link')}
              labelPlacement="stacked"
              placeholder="https://www.airbnb.de/rooms/…"
              type="url"
              inputmode="url"
              value={form.url}
              autocapitalize="off"
              autocorrect={false}
              spellcheck={false}
              onIonInput={(e) => {
                const v = String(e.detail.value ?? '');
                urlChanged.current = true;
                setForm((f) => ({ ...f, url: extractUrl(v) ?? v }));
              }}
            />
            <IonButton slot="end" fill="clear" onClick={() => void paste()} aria-label={t('property.paste')}>
              <IonIcon slot="icon-only" icon={clipboardOutline} />
            </IonButton>
          </IonItem>
        </IonList>
        {!url && <p className="list-footer">{t('property.linkHint')}</p>}
        {duplicate && (
          <p className="form-error" role="alert">
            <IonIcon icon={warningOutline} /> {t('property.duplicate', { title: duplicate.title || duplicate.url })}
          </p>
        )}

        {url && (
          <div className="edit-preview">
            <PreviewImage url={url} avatar={form.avatar} />
            {loadingPreview && (
              <div className="edit-preview-note">
                <IonSpinner name="dots" /> {t('property.loadingPreview')}
              </div>
            )}
          </div>
        )}
        {url && <p className="list-footer">{previewFailed ? t('property.previewFailed') : t('property.previewNote')}</p>}

        {url && preview && (
          <div className="preview-temporary" role="note">
            <p>{t('property.previewTemporary')}</p>
            {preview.title && <p><strong>{preview.title}</strong></p>}
            {preview.description && <p className="listing-text">{preview.description}</p>}
            {preview.siteName && <p><em>{t('property.fromListing', { site: preview.siteName })}</em></p>}
          </div>
        )}

        <IonList inset>
          <IonItem>
            <IonInput label={t('property.title')} labelPlacement="stacked" value={form.title} maxlength={200} onIonInput={set('title')} />
          </IonItem>
          <IonItem>
            <IonInput label={t('property.provider')} labelPlacement="stacked" value={form.provider} maxlength={100} onIonInput={set('provider')} />
          </IonItem>
          {on('price') && (
            <IonItem>
              <IonInput label={t('property.price')} labelPlacement="stacked" inputmode="decimal" value={form.price} placeholder="1800" onIonInput={set('price')} />
              <IonNote slot="end">€</IonNote>
            </IonItem>
          )}
          {(on('bedrooms') || on('beds') || on('bathrooms')) && (
            <IonItem>
              {on('bedrooms') && <IonInput label={t('property.bedrooms')} labelPlacement="stacked" inputmode="numeric" value={form.bedrooms} onIonInput={set('bedrooms')} />}
              {on('beds') && <IonInput label={t('property.beds')} labelPlacement="stacked" inputmode="numeric" value={form.beds} onIonInput={set('beds')} />}
              {on('bathrooms') && <IonInput label={t('property.bathrooms')} labelPlacement="stacked" inputmode="numeric" value={form.bathrooms} onIonInput={set('bathrooms')} />}
            </IonItem>
          )}
          {on('has_pool') && (
            <IonItem>
              <IonToggle checked={form.hasPool} onIonChange={(e) => setForm((f) => ({ ...f, hasPool: e.detail.checked }))}>
                {t('property.pool')}
              </IonToggle>
            </IonItem>
          )}
          {on('address') && (
            <IonItem>
              <IonInput
                label={t('property.address')}
                labelPlacement="stacked"
                value={form.address}
                maxlength={300}
                placeholder={t('property.addressPlaceholder')}
                onIonInput={(e) => setForm((f) => ({ ...f, address: String(e.detail.value ?? ''), lat: null, lng: null }))}
              />
              <IonButton slot="end" fill="clear" disabled={!form.address.trim() || geocoding} onClick={() => void locate()} aria-label={t('property.locate')}>
                {geocoding ? <IonSpinner name="dots" /> : <IonIcon slot="icon-only" icon={locateOutline} color={form.lat !== null ? 'success' : undefined} />}
              </IonButton>
            </IonItem>
          )}
          {on('description') && (
            <IonItem>
              <IonTextarea label={t('property.description')} labelPlacement="stacked" value={form.description} maxlength={2000} autoGrow rows={2} onIonInput={set('description')} />
            </IonItem>
          )}
        </IonList>
        {on('address') && <p className="list-footer">{form.lat !== null ? t('property.located') : t('property.locateHint')}</p>}

        <IonList inset>
          <IonListHeader>
            <IonLabel>{t('property.avatar')}</IonLabel>
          </IonListHeader>
          <div className="avatar-grid">
            {HOUSE_AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={form.avatar === a.id ? 'on' : ''}
                aria-pressed={form.avatar === a.id}
                onClick={() => setForm((f) => ({ ...f, avatar: a.id }))}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </IonList>
        <p className="list-footer">{t('property.avatarHint')}</p>
      </IonContent>
    </IonModal>
  );
}
