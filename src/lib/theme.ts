import { Platform } from 'react-native';

/**
 * Rotera's palette. Taken from the app icon, whose gradient runs cyan
 * (#10DDF0) through #0474FE to a deep #0054FD.
 *
 * The accent is not the icon's own #0474FE: white text on it lands at 4.25:1,
 * which fails AA for the 13px accent labels ("Zamenjaj kodo", "Registracija").
 * The light accent below is a step deeper and reaches 5.9:1 while still
 * reading as the same blue; the dark one is a step lighter for the same reason
 * against black.
 *
 * The four semantic colours are load-bearing and must not be reused for
 * anything else:
 *   accent  — buttons, "you"
 *   teal    — morning shift
 *   orange  — afternoon shift, an adjusted time
 *   red     — a shift someone is trying to hand over
 *   purple  — a rotation: two people trading shifts
 *
 * Purple only became available when the accent moved to blue. On the schedule
 * a rotation is drawn as a dashed purple edge rather than a fill, so the cell
 * underneath can still say whether the shift is yours.
 */
/** The colour slots every screen reads. Declared so both themes share a shape. */
export type Palette = {
  accent: string;
  accentSoft: string;
  background: string;
  card: string;
  fill: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
};

export const palette: Record<'light' | 'dark', Palette> = {
  light: {
    accent: '#0A5BE0',
    accentSoft: 'rgba(10, 91, 224, 0.12)',
    background: '#F2F2F7',
    card: '#FFFFFF',
    fill: 'rgba(120, 120, 128, 0.12)',
    border: 'rgba(0, 0, 0, 0.07)',
    text: '#000000',
    textSecondary: '#60646C',
    textTertiary: '#9A9AA0',
  },
  dark: {
    accent: '#3D96FF',
    accentSoft: 'rgba(61, 150, 255, 0.16)',
    background: '#000000',
    card: '#1C1C1E',
    fill: 'rgba(120, 120, 128, 0.24)',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#FFFFFF',
    textSecondary: '#B0B4BA',
    textTertiary: '#7C7C80',
  },
};

/** Shared across both themes — these read on either background. */
export const semantic = {
  teal: '#30B0C7',
  purple: '#AF52DE',
  orange: '#FF9500',
  red: '#FF3B30',
  green: '#34C759',
  yellow: '#FFD60A',
} as const;

/** Position badge colours, matching the fixed palette allowed in the database. */
export const positionColors: Record<string, string> = {
  blue: '#0A84FF',
  green: '#34C759',
  orange: '#FF9500',
  purple: '#AF52DE',
  red: '#FF3B30',
  pink: '#FF2D55',
  teal: '#30B0C7',
  brown: '#A2845E',
  gray: '#8E8E93',
};

export const radius = { sm: 9, md: 14, lg: 16, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 14, lg: 16, xl: 24 } as const;

export const fonts = Platform.select({
  ios: { rounded: 'ui-rounded', mono: 'ui-monospace' },
  // A browser needs the whole stack spelled out: `ui-rounded` alone resolves
  // on Safari and nowhere else, which would leave the headlines flat on
  // Android Chrome.
  web: {
    rounded: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  default: { rounded: undefined, mono: 'monospace' },
})!;
