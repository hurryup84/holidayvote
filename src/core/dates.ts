import {
  addDays,
  differenceInCalendarDays,
  format,
  getISOWeek,
  startOfISOWeek,
} from 'date-fns';

/** Plan dates are local calendar dates stored as `YYYY-MM-DD` – never UTC timestamps. */
export type IsoDate = string;

export function toIsoDate(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd');
}

export function parseIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysIso(s: IsoDate, n: number): IsoDate {
  return toIsoDate(addDays(parseIsoDate(s), n));
}

/** Monday of the week containing `s`. */
export function weekStartIso(s: IsoDate): IsoDate {
  return toIsoDate(startOfISOWeek(parseIsoDate(s)));
}

export function weekDaysIso(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}

export function isoWeekNumber(s: IsoDate): number {
  return getISOWeek(parseIsoDate(s));
}

/** b - a in calendar days. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return differenceInCalendarDays(parseIsoDate(b), parseIsoDate(a));
}
