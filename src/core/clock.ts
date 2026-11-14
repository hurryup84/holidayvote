import { toIsoDate } from './dates';

/**
 * The only source of "now" and "today" in the app (house rule: TimeManager).
 * The debug offset lets us simulate future days without waiting.
 */
export interface Clock {
  now(): Date;
  /** Local calendar date, `YYYY-MM-DD`. */
  today(): string;
  nowIso(): string;
}

let offsetDays = 0;

export const clock: Clock = {
  now: () => new Date(Date.now() + offsetDays * 86_400_000),
  today: () => toIsoDate(clock.now()),
  nowIso: () => clock.now().toISOString(),
};

export function setClockOffsetDays(days: number): void {
  offsetDays = days;
}

export function getClockOffsetDays(): number {
  return offsetDays;
}

/** Fixed clock for tests. */
export function fixedClock(isoDateTime: string): Clock {
  const d = new Date(isoDateTime);
  return { now: () => new Date(d), today: () => toIsoDate(d), nowIso: () => d.toISOString() };
}
