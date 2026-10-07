import { useAppTheme } from '@/contexts/theme';
import { usePalette } from '@/hooks/use-palette';
import { radius } from '@/lib/theme';
import * as time from '@/lib/time';

import type { TimeFieldProps } from './time-field';

/**
 * The browser's own time picker.
 *
 * `<input type="time">` is what every phone browser already knows how to
 * present — iOS Safari opens its wheel, Android Chrome its clock — so this is
 * closer to the native control than anything drawn by hand would be, and it
 * carries no bundle weight.
 *
 * The input is written directly rather than through `TextInput`: the value has
 * to be exactly "HH:mm" for the browser to parse it, and react-native-web
 * offers no typed way to say that.
 */
export function TimeField({ value, onChange }: TimeFieldProps) {
  const c = usePalette();
  const { scheme } = useAppTheme();

  return (
    <input
      type="time"
      // `step` in seconds. 60 hides the seconds column, which a shift never
      // uses and which would let someone store 08:30:17.
      step={60}
      value={time.fromDate(value).slice(0, 5)}
      onChange={(event) => {
        const next = time.toDate(event.target.value);
        // An empty or half-typed field parses to midnight; treating that as a
        // real choice would silently move somebody's shift to 00:00.
        if (event.target.value) onChange(next);
      }}
      style={{
        fontSize: 15,
        color: c.text,
        backgroundColor: c.fill,
        border: 'none',
        borderRadius: radius.sm,
        padding: '8px 12px',
        fontFamily: 'inherit',
        // Safari renders the native control in its own light colours unless
        // told which scheme the surrounding app is in.
        colorScheme: scheme === 'dark' ? 'dark' : 'light',
      }}
    />
  );
}
