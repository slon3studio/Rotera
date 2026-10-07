/**
 * Week and day arithmetic, Monday-first to match both Slovenian convention and
 * Postgres `isodow`.
 *
 * Dates cross the boundary as `yyyy-MM-dd` strings, never as Date objects.
 * `week_start_date` is a Postgres `date` with no time zone, so round-tripping
 * it through a Date is the classic way to land on the wrong Monday for anyone
 * east or west of the server.
 *
 * Names are hardcoded rather than taken from Intl: the output has to be
 * identical on both platforms, and Hermes' locale data is not something to
 * bet the schedule on.
 */

const DAY_NAMES = [
  'Ponedeljek',
  'Torek',
  'Sreda',
  'Četrtek',
  'Petek',
  'Sobota',
  'Nedelja',
] as const;

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function dayName(isoWeekday: number): string {
  return DAY_NAMES[isoWeekday - 1] ?? '?';
}

export function shortDayName(isoWeekday: number): string {
  return dayName(isoWeekday).slice(0, 3);
}

/** Midnight, local time, so day arithmetic never drifts across a DST edge. */
function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** JS weeks start on Sunday (0); ISO starts on Monday (1). */
function isoWeekdayOf(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: Date): Date {
  const start = atMidnight(date);
  start.setDate(start.getDate() - (isoWeekdayOf(start) - 1));
  return start;
}

export function addWeeks(count: number, weekStart: Date): Date {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + count * 7);
  return atMidnight(next);
}

/** Wishes are submitted for the *following* week, so screens open on it. */
export function defaultWeek(now: Date = new Date()): Date {
  return addWeeks(1, mondayOf(now));
}

export function dateOf(isoWeekday: number, weekStart: Date): Date {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + (isoWeekday - 1));
  return atMidnight(date);
}

/** `yyyy-MM-dd`, built from local parts — never `toISOString()`, which is UTC. */
export function isoString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromISO(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "21. 9." */
export function dayDescription(isoWeekday: number, weekStart: Date): string {
  const date = dateOf(isoWeekday, weekStart);
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

/** "21. 9. – 27. 9. 2026" */
export function rangeDescription(weekStart: Date): string {
  const end = dateOf(7, weekStart);
  return `${weekStart.getDate()}. ${weekStart.getMonth() + 1}. – ${end.getDate()}. ${
    end.getMonth() + 1
  }. ${end.getFullYear()}`;
}

export function isToday(isoWeekday: number, weekStart: Date): boolean {
  return isoString(dateOf(isoWeekday, weekStart)) === isoString(new Date());
}

export function isCurrentWeek(weekStart: Date, now: Date = new Date()): boolean {
  return isoString(weekStart) === isoString(mondayOf(now));
}
