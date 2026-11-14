import i18n from 'i18next';
import { daysBetween, parseIsoDate, type IsoDate } from './dates';

const fmt = (iso: IsoDate, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(i18n.language, o).format(parseIsoDate(iso));

/** "Mo" / "Mon" */
export const fmtWeekday = (iso: IsoDate) => fmt(iso, { weekday: 'short' });
/** "9. Nov." / "Nov 9" */
export const fmtDayMonth = (iso: IsoDate) => fmt(iso, { day: 'numeric', month: 'short' });
/** "9." / "9" */
export const fmtDayNum = (iso: IsoDate) => fmt(iso, { day: 'numeric' });
/** "Mo., 9. Nov." */
export const fmtShort = (iso: IsoDate) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
/** "Montag, 9. November 2026" */
export const fmtLong = (iso: IsoDate) =>
  fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "today" / "tomorrow" / "yesterday" or the short date. */
export function fmtRelativeDay(iso: IsoDate, today: IsoDate): string {
  const d = daysBetween(today, iso);
  if (d === 0) return i18n.t('day.today');
  if (d === 1) return i18n.t('day.tomorrow');
  if (d === -1) return i18n.t('day.yesterday');
  return fmtShort(iso);
}

/** "10. Juli – 24. Juli 2027" / "ab 10. Juli 2027". */
export function fmtDateRange(start: IsoDate | null, end: IsoDate | null): string {
  const f = (iso: IsoDate) => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  if (start && end) return `${fmt(start, { day: 'numeric', month: 'short' })} – ${f(end)}`;
  if (start) return i18n.t('vacation.fromDate', { date: f(start) });
  if (end) return i18n.t('vacation.untilDate', { date: f(end) });
  return '';
}

/** Number of nights between two dates, null if unknown. */
export function nights(start: IsoDate | null, end: IsoDate | null): number | null {
  if (!start || !end) return null;
  const n = daysBetween(start, end);
  return n > 0 ? n : null;
}

/** "1.800 €" */
export function fmtPrice(v: number | null, lang: string): string {
  if (v === null) return '–';
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}
