/**
 * Postgres `time` values arrive as "HH:mm:ss".
 *
 * Kept as strings for the same reason dates are: a `time` has no date and no
 * zone, so routing it through a Date invites an off-by-one-hour shift the first
 * time daylight saving changes.
 */

/** "08:30:00" → "8:30". Slovenian schedules don't pad the hour. */
export function display(raw: string): string {
  const parts = raw.split(':');
  if (parts.length < 2) return raw;
  const hour = Number(parts[0]);
  if (Number.isNaN(hour)) return raw;
  return `${hour}:${parts[1]}`;
}

/**
 * Minutes since midnight. `treatMidnightAsEnd` makes "00:00" sort last rather
 * than first, which is what it means at the end of a shift.
 */
export function minutes(raw: string, treatMidnightAsEnd = false): number {
  const parts = raw.split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  const total = hour * 60 + minute;
  return treatMidnightAsEnd && total === 0 ? 24 * 60 : total;
}

/** Hours worked, handling a shift that runs past midnight. */
export function hoursBetween(start: string, end: string): number {
  const from = minutes(start);
  let to = minutes(end);
  if (to <= from) to += 24 * 60;
  return (to - from) / 60;
}

/** "8:30 – 16:00" */
export function range(start: string, end: string): string {
  return `${display(start)} – ${display(end)}`;
}

/** A Date on a fixed reference day, for feeding a time picker. */
export function toDate(raw: string): Date {
  const total = minutes(raw);
  return new Date(2000, 0, 1, Math.floor(total / 60), total % 60);
}

/** A picker value back to "HH:mm:00". */
export function fromDate(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const mins = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${mins}:00`;
}
