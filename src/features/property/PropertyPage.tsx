import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import {
  ban,
  banOutline,
  checkmarkCircle,
  closeCircleOutline,
  create,
  ellipsisHorizontal,
  heart,
  heartOutline,
  locationOutline,
  openOutline,
  refreshOutline,
  sendOutline,
  trashOutline,
} from 'ionicons/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { PreviewImage } from '../../components/PreviewImage';
import { RatingBadge, StarInput, StarsShow } from '../../components/Stars';
import { useChainedSheet } from '../../components/useChainedSheet';
import { fmtPrice, fmtShort } from '../../core/format';
import { useLiveQuery } from '../../data/db/DbContext';
import { COMMENT_TABLES } from '../../data/repositories/commentRepo';
import { PROPERTY_TABLES } from '../../data/repositories/propertyRepo';
import type { ReportReason, ReportTarget } from '../../data/sync/account';
import type { PropertyStatus } from '../../domain/models';
import { fmtDistance, haversineKm } from '../../domain/services/geo';
import { openUrl } from '../../native/browser';
import { sharingErrorText } from '../sharing/errors';
import { fieldOn } from '../vacation/fields';
import { PropertyEditModal } from '../vacation/PropertyEditModal';
import './property.css';

/** One house: live preview, facts, my stars / veto / favourite, everybody's votes, comments. */
export function PropertyPage() {
  const { id = '', pid = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { repos, session, account, home } = useApp();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const { sheet, then } = useChainedSheet();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [commentStars, setCommentStars] = useState<number | null>(null);

  const { data: p } = useLiveQuery(() => repos.properties.getWithStats(pid), PROPERTY_TABLES, [repos, pid]);
  const { data: vacation } = useLiveQuery(() => repos.vacations.get(id), ['vacations'], [repos, id]);
  const { data: members } = useLiveQuery(() => repos.vacations.members(id), ['vacation_members'], [repos, id]);
  const { data: votes } = useLiveQuery(() => repos.votes.forProperty(pid), ['votes', 'vacation_members'], [repos, pid]);
  const { data: vetoedBy } = useLiveQuery(() => repos.votes.pickedBy('vetoes', pid), ['vetoes', 'vacation_members'], [repos, pid]);
  const { data: favoredBy } = useLiveQuery(() => repos.votes.pickedBy('favorites', pid), ['favorites', 'vacation_members'], [repos, pid]);
  const { data: comments } = useLiveQuery(() => repos.comments.forProperty(pid), COMMENT_TABLES, [repos, pid]);
  const { data: myVetoOn } = useLiveQuery(() => repos.votes.myVeto(id), ['vetoes'], [repos, id]);
  const { data: onServer } = useLiveQuery(() => account.isOnServer(id), ['vacations'], [id]);

  const say = (message: string, color?: string) => void toast({ message, duration: 2500, position: 'top', color });

  if (!p || !vacation) return <IonPage />;
  const settings = vacation.settings;
  const on = (f: Parameters<typeof fieldOn>[1]) => fieldOn(settings, f);
  const people = Math.max(1, members?.length ?? 1);
  const iAmOwner = members?.some((m) => m.userId === session.userId && m.role === 'owner') ?? false;
  const canDelete = iAmOwner || p.createdBy === session.userId;
  const distance = home && p.lat !== null && p.lng !== null ? haversineKm(home, { lat: p.lat, lng: p.lng }) : null;

  const toggleVeto = () => {
    if (p.myVeto) return void repos.votes.setVeto(id, null);
    const set = () => void repos.votes.setVeto(id, pid);
    if (myVetoOn && myVetoOn !== pid) {
      void alert({
        header: t('veto.moveTitle'),
        message: t('veto.moveText'),
        buttons: [
          { text: t('common.cancel'), role: 'cancel' },
          { text: t('veto.move'), handler: set },
        ],
      });
    } else set();
  };

  const setStatus = (status: PropertyStatus) => void repos.properties.setStatus(pid, status);

  const refreshPreview = async () => {
    const fresh = await repos.previews.refresh(p.url);
    if (fresh && fresh.status === 'ok') {
      await repos.properties.setPreviewInfo(pid, fresh);
      say(t('property.previewRefreshed'));
    } else say(t('property.previewRefreshFailed'), 'warning');
  };

  const remove = () =>
    void alert({
      header: t('property.deleteTitle'),
      message: t('property.deleteText'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
          role: 'destructive',
          handler: () => {
            void repos.properties.remove(pid).then(() => router.goBack());
          },
        },
      ],
    });

  const report = (target: ReportTarget) =>
    void sheet({
      header: t('ugc.reasonTitle'),
      buttons: [
        ...(['offensive', 'illegal', 'spam', 'other'] as const).map((r: ReportReason) => ({
          text: t(`ugc.reason.${r}`),
          handler: () =>
            void account.report(id, target, r).then(
              () => say(t('ugc.reported')),
              (e) => say(sharingErrorText(e), 'danger'),
            ),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const more = () =>
    void sheet({
      header: p.title ?? undefined,
      buttons: [
        { text: t('property.edit'), handler: () => setEditing(true) },
        { text: t('property.refreshPreview'), handler: () => void refreshPreview() },
        ...(iAmOwner && p.status !== 'eliminated' ? [{ text: t('status.eliminate'), handler: () => setStatus('eliminated') }] : []),
        ...(iAmOwner && p.status !== 'active' ? [{ text: t('status.reactivate'), handler: () => setStatus('active') }] : []),
        ...(onServer ? [{ text: t('ugc.reportContent'), handler: then(() => report({ type: 'property', id: pid })) }] : []),
        ...(canDelete ? [{ text: t('common.delete'), role: 'destructive', handler: remove }] : []),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });

  const sendComment = async () => {
    if (!comment.trim()) return;
    await repos.comments.add(id, pid, comment, commentStars);
    setComment('');
    setCommentStars(null);
  };

  const facts: [string, string][] = [];
  if (on('price') && p.price !== null) {
    facts.push([t('property.price'), fmtPrice(p.price, i18n.language)]);
    if (people > 1) facts.push([t('property.pricePerPerson', { count: people }), fmtPrice(p.price / people, i18n.language)]);
  }
  if (on('bedrooms') && p.bedrooms !== null) facts.push([t('property.bedrooms'), String(p.bedrooms)]);
  if (on('beds') && p.beds !== null) facts.push([t('property.beds'), String(p.beds)]);
  if (on('bathrooms') && p.bathrooms !== null) facts.push([t('property.bathrooms'), String(p.bathrooms)]);
  if (on('has_pool')) facts.push([t('property.pool'), p.hasPool ? t('common.yes') : t('common.no')]);
  if (distance !== null) facts.push([t('property.distanceFromHome'), fmtDistance(distance, i18n.language)]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/vacations/${id}`} text="" />
          </IonButtons>
          <IonTitle>{p.title || p.provider || t('property.house')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setEditing(true)} aria-label={t('property.edit')}>
              <IonIcon slot="icon-only" icon={create} />
            </IonButton>
            <IonButton onClick={more} aria-label={t('common.more')}>
              <IonIcon slot="icon-only" icon={ellipsisHorizontal} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className={`detail-image status-${p.status}`}>
          <PreviewImage url={p.url} avatar={p.avatar} alt={p.title ?? ''} />
        </div>
        <p className="detail-picture-note">{t('property.pictureLive')}</p>

        <div className="detail-head">
          {p.status === 'booked' && (
            <div className="detail-status booked">
              <IonIcon icon={checkmarkCircle} /> {t('status.bookedLong')}
            </div>
          )}
          {p.status === 'eliminated' && (
            <div className="detail-status eliminated">
              <IonIcon icon={closeCircleOutline} /> {t('status.eliminatedLong')}
            </div>
          )}
          <h1>{p.title || p.provider || p.url}</h1>
          <p className="muted small">
            {[p.provider, p.suggestedByName && t('property.suggestedBy', { name: p.suggestedByName }), fmtShort(p.createdAt.slice(0, 10))]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <IonButton expand="block" onClick={() => void openUrl(p.url)}>
            <IonIcon slot="start" icon={openOutline} />
            {t('property.open', { provider: p.provider || t('property.website') })}
          </IonButton>
        </div>

        <IonList inset className="vote-box">
          <IonListHeader>{t('votes.yours')}</IonListHeader>
          <div className="vote-row">
            <StarInput value={p.myVote} onChange={(v) => void repos.votes.set(id, pid, v)} />
          </div>
          <div className="pick-row">
            <button className={`pick favorite ${p.myFavorite ? 'on' : ''}`} onClick={() => void repos.votes.setFavorite(id, p.myFavorite ? null : pid)}>
              <IonIcon icon={p.myFavorite ? heart : heartOutline} />
              {p.myFavorite ? t('favorite.mine') : t('favorite.set')}
            </button>
            <button className={`pick veto ${p.myVeto ? 'on' : ''}`} onClick={toggleVeto}>
              <IonIcon icon={p.myVeto ? ban : banOutline} />
              {p.myVeto ? t('veto.mine') : t('veto.set')}
            </button>
          </div>
          <p className="list-footer pick-hint">{t('votes.pickHint')}</p>
        </IonList>

        {iAmOwner && p.status !== 'booked' && (
          <div className="ion-padding-horizontal">
            <IonButton expand="block" fill="outline" color="success" onClick={() => setStatus('booked')}>
              <IonIcon slot="start" icon={checkmarkCircle} />
              {t('status.markBooked')}
            </IonButton>
          </div>
        )}
        {iAmOwner && p.status === 'booked' && (
          <div className="ion-padding-horizontal">
            <IonButton expand="block" fill="clear" onClick={() => setStatus('active')}>
              <IonIcon slot="start" icon={refreshOutline} />
              {t('status.unbook')}
            </IonButton>
          </div>
        )}

        <IonList inset>
          <IonListHeader>
            <IonLabel>{t('votes.group')}</IonLabel>
            <RatingBadge avg={p.voteAvg} count={p.voteCount} />
          </IonListHeader>
          {votes?.length === 0 && (
            <IonItem lines="none">
              <IonLabel className="muted">{t('votes.none')}</IonLabel>
            </IonItem>
          )}
          {votes?.map((v) => (
            <IonItem key={v.userId}>
              <IonLabel>
                {v.name || t('sharing.unnamed')}
                {v.mine && <span className="muted"> ({t('sharing.you')})</span>}
              </IonLabel>
              <StarsShow value={v.value} />
            </IonItem>
          ))}
          {!!favoredBy?.length && (
            <IonItem lines="none">
              <IonIcon slot="start" icon={heart} className="favorite-icon" />
              <IonLabel className="ion-text-wrap">{t('favorite.by', { names: favoredBy.map((x) => x.name || t('sharing.unnamed')).join(', ') })}</IonLabel>
            </IonItem>
          )}
          {!!vetoedBy?.length && (
            <IonItem lines="none">
              <IonIcon slot="start" icon={ban} className="veto-icon" />
              <IonLabel className="ion-text-wrap">{t('veto.by', { names: vetoedBy.map((x) => x.name || t('sharing.unnamed')).join(', ') })}</IonLabel>
            </IonItem>
          )}
        </IonList>

        {(facts.length > 0 || (on('address') && p.address)) && (
          <IonList inset>
            <IonListHeader>{t('property.facts')}</IonListHeader>
            {facts.map(([k, v]) => (
              <IonItem key={k}>
                <IonLabel>{k}</IonLabel>
                <IonNote slot="end">{v}</IonNote>
              </IonItem>
            ))}
            {on('address') && p.address && (
              <IonItem>
                <IonIcon slot="start" icon={locationOutline} />
                <IonLabel className="ion-text-wrap">{p.address}</IonLabel>
              </IonItem>
            )}
          </IonList>
        )}
        {on('description') && p.description && <p className="detail-description pre-wrap">{p.description}</p>}
        {(p.previewDescription || (p.previewTitle && p.previewTitle !== p.title)) && (
          <IonList inset>
            <IonListHeader>{t('property.fromListing', { site: p.previewSite || p.provider || t('property.website') })}</IonListHeader>
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap">
                {p.previewTitle && p.previewTitle !== p.title && <h3>{p.previewTitle}</h3>}
                {p.previewDescription && <p className="listing-text">{p.previewDescription}</p>}
              </IonLabel>
            </IonItem>
          </IonList>
        )}

        <IonList inset>
          <IonListHeader>{t('comments.title', { count: comments?.length ?? 0 })}</IonListHeader>
          {comments?.map((c) => (
            <IonItem
              key={c.id}
              button={!c.mine && !!onServer}
              detail={false}
              onClick={() => !c.mine && onServer && report({ type: 'comment', id: c.id })}
            >
              <IonLabel className="ion-text-wrap">
                <div className="comment-head">
                  <strong>{c.authorName || t('comments.formerMember')}</strong>
                  {c.stars !== null && <StarsShow value={c.stars} />}
                  <span className="muted small">{fmtShort(c.createdAt.slice(0, 10))}</span>
                </div>
                <p className="comment-text pre-wrap">{c.text}</p>
              </IonLabel>
              {c.mine && (
                <IonButton slot="end" fill="clear" color="medium" onClick={() => void repos.comments.remove(c.id)} aria-label={t('common.delete')}>
                  <IonIcon slot="icon-only" icon={trashOutline} />
                </IonButton>
              )}
            </IonItem>
          ))}
          <IonItem lines="none">
            <IonTextarea
              aria-label={t('comments.placeholder')}
              placeholder={t('comments.placeholder')}
              value={comment}
              maxlength={1000}
              autoGrow
              rows={1}
              onIonInput={(e) => setComment(String(e.detail.value ?? ''))}
            />
            <IonButton slot="end" fill="clear" disabled={!comment.trim()} onClick={() => void sendComment()} aria-label={t('comments.send')}>
              <IonIcon slot="icon-only" icon={sendOutline} />
            </IonButton>
          </IonItem>
          {comment.trim() && (
            <div className="comment-stars">
              <span className="muted small">{t('comments.withStars')}</span>
              <StarInput value={commentStars} onChange={setCommentStars} label={t('comments.withStars')} />
            </div>
          )}
        </IonList>
        {!onServer && <p className="list-footer">{t('ugc.reportAfterSharing')}</p>}
        <div style={{ height: 32 }} />
      </IonContent>
      <PropertyEditModal isOpen={editing} vacationId={id} settings={settings} property={p} onClose={() => setEditing(false)} />
    </IonPage>
  );
}
