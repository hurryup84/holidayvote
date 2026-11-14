import { IonIcon } from '@ionic/react';
import { star, starOutline } from 'ionicons/icons';
import { useTranslation } from 'react-i18next';
import './stars.css';

/** "4,3" in the app's language. */
export function fmtVote(avg: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: avg % 1 ? 1 : 0, maximumFractionDigits: 1 }).format(avg);
}

/** My vote: five stars to tap; tapping my current value again removes the vote. */
export function StarInput({ value, onChange, label }: { value: number | null; onChange(v: number | null): void; label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="star-input" role="radiogroup" aria-label={label ?? t('votes.yours')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('votes.stars', { count: n })}
          className={value !== null && n <= value ? 'on' : ''}
          onClick={() => onChange(value === n ? null : n)}
        >
          <IonIcon icon={value !== null && n <= value ? star : starOutline} />
        </button>
      ))}
    </div>
  );
}

/** Read-only stars for one vote. */
export function StarsShow({ value }: { value: number }) {
  return (
    <span className="stars-show" aria-label={String(value)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IonIcon key={n} icon={n <= value ? star : starOutline} />
      ))}
    </span>
  );
}

/** Small "★ 4,3 (3)" next to a house. Nothing without votes. */
export function RatingBadge({ avg, count, showCount = true }: { avg: number | null; count?: number; showCount?: boolean }) {
  const { t, i18n } = useTranslation();
  if (avg === null) return null;
  const level = avg >= 4.5 ? 'top' : avg >= 3.5 ? 'good' : avg >= 2.5 ? 'mid' : 'low';
  return (
    <span className={`rating-badge ${level}`} title={t('votes.average', { avg: fmtVote(avg, i18n.language), count: count ?? 0 })}>
      <IonIcon icon={star} />
      {fmtVote(avg, i18n.language)}
      {showCount && count ? <span className="rating-count">({count})</span> : null}
    </span>
  );
}
