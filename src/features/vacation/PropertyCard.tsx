import { IonIcon } from '@ionic/react';
import { banOutline, bedOutline, checkmarkCircle, chatbubbleOutline, create, heart, navigateOutline, waterOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import { PreviewImage } from '../../components/PreviewImage';
import { RatingBadge } from '../../components/Stars';
import { fmtPrice } from '../../core/format';
import type { PropertyWithStats, VacationSettings } from '../../domain/models';
import { fmtDistance } from '../../domain/services/geo';
import { fieldOn } from './fields';

export function PropertyCard({
  p,
  rank,
  people,
  settings,
  distanceKm,
  onOpen,
  onEdit,
}: {
  p: PropertyWithStats;
  rank: number | null;
  people: number;
  settings: VacationSettings;
  distanceKm: number | null;
  onOpen(): void;
  onEdit?(): void;
}) {
  const { t, i18n } = useTranslation();
  const on = (f: Parameters<typeof fieldOn>[1]) => fieldOn(settings, f);
  return (
    <button className={`property-card card status-${p.status}`} onClick={onOpen}>
      <div className="property-image">
        <PreviewImage url={p.url} avatar={p.avatar} />
        {onEdit && (
          <button
            className="property-card-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={t('property.edit')}
          >
            <IonIcon icon={create} />
          </button>
        )}
        {p.status === 'booked' && (
          <span className="property-flag booked">
            <IonIcon icon={checkmarkCircle} /> {t('status.booked')}
          </span>
        )}
        {p.status === 'eliminated' && <span className="property-flag eliminated">{t('status.eliminated')}</span>}
        {rank !== null && p.status === 'active' && <span className="property-rank">#{rank}</span>}
      </div>
      <div className="property-body">
        <div className="property-title-row">
          <h3>{p.title || p.provider || p.url}</h3>
          <RatingBadge avg={p.voteAvg} count={p.voteCount} />
        </div>
        <div className="property-sub muted small">
          {[p.provider, p.suggestedByName && t('property.suggestedBy', { name: p.suggestedByName })].filter(Boolean).join(' · ')}
        </div>
        <div className="property-facts">
          {on('price') && p.price !== null && (
            <span className="price">
              {fmtPrice(p.price, i18n.language)}
              {people > 1 && <span className="muted"> · {t('property.perPerson', { price: fmtPrice(p.price / people, i18n.language) })}</span>}
            </span>
          )}
          {on('bedrooms') && p.bedrooms !== null && (
            <span>
              <IonIcon icon={bedOutline} /> {t('property.bedroomsShort', { count: p.bedrooms })}
            </span>
          )}
          {on('has_pool') && p.hasPool && (
            <span>
              <IonIcon icon={waterOutline} /> {t('property.pool')}
            </span>
          )}
          {distanceKm !== null && (
            <span>
              <IonIcon icon={navigateOutline} /> {fmtDistance(distanceKm, i18n.language)}
            </span>
          )}
        </div>
        <div className="property-badges">
          {p.myVote === null && p.status === 'active' && <span className="badge todo">{t('property.notRatedYet')}</span>}
          {p.favoriteCount > 0 && (
            <span className={`badge favorite ${p.myFavorite ? 'mine' : ''}`}>
              <IonIcon icon={heart} /> {p.favoriteCount}
            </span>
          )}
          {p.vetoCount > 0 && (
            <span className={`badge veto ${p.myVeto ? 'mine' : ''}`}>
              <IonIcon icon={banOutline} /> {t('property.vetoes', { count: p.vetoCount })}
            </span>
          )}
          {p.commentCount > 0 && (
            <span className="badge">
              <IonIcon icon={chatbubbleOutline} /> {p.commentCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
