import { fromISO } from '@/lib/week';

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'Marec',
  'April',
  'Maj',
  'Junij',
  'Julij',
  'Avgust',
  'September',
  'Oktober',
  'November',
  'December',
] as const;

/** "2026-08-01" → "Avgust 2026" */
export function monthLabel(raw: string): string {
  const date = fromISO(raw);
  if (!date) return raw;
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "2026-09-18" → "Petek, 18. 9." */
export function dayAndDate(raw: string): string {
  const date = fromISO(raw);
  if (!date) return raw;
  const jsDay = date.getDay();
  const iso = jsDay === 0 ? 7 : jsDay;
  const names = ['Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota', 'Nedelja'];
  return `${names[iso - 1]}, ${date.getDate()}. ${date.getMonth() + 1}.`;
}

/** Comma decimal separator, no trailing zeros. Formatted by hand rather than
 *  through Intl so both platforms print the same thing. */
function decimal(value: number, maxFractionDigits = 2): string {
  const rounded = Number(value.toFixed(maxFractionDigits));
  return String(rounded).replace('.', ',');
}

/** "42,5 h" */
export function hours(value: number): string {
  return `${decimal(value)} h`;
}

/** "425,00 €" */
export function money(value: number): string {
  const fixed = value.toFixed(2).replace('.', ',');
  return `${fixed} €`;
}

/**
 * Slovenian counts in four forms: 1 smena, 2 smeni, 3-4 smene, 5+ smen.
 * Always printing "smen" is wrong for most small numbers, which is exactly the
 * range a weekly schedule lives in.
 */
export function shiftCount(count: number): string {
  const remainder = Math.abs(count) % 100;
  if (remainder === 1) return `${count} smena`;
  if (remainder === 2) return `${count} smeni`;
  if (remainder === 3 || remainder === 4) return `${count} smene`;
  return `${count} smen`;
}

/** Accepts both "8,5" and "8.5". */
export function parseDecimal(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!normalised) return null;
  const value = Number(normalised);
  if (Number.isNaN(value) || value < 0) return null;
  return value;
}
