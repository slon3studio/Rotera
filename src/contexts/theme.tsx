import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

export const themePreferenceLabel: Record<ThemePreference, string> = {
  system: 'Samodejno',
  light: 'Svetlo',
  dark: 'Temno',
};

const KEY = 'rotera.theme';

type ThemeValue = {
  /** What the person chose. */
  preference: ThemePreference;
  /** What to actually paint, with `system` already resolved. */
  scheme: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
};

/**
 * Read straight out at first render rather than in an effect.
 *
 * `localStorage` exists on every platform here: in a browser it is the real
 * one, and on iOS and Android `expo-sqlite/localStorage/install` (imported by
 * `lib/supabase`, which the root layout pulls in before anything renders)
 * installs a SQLite-backed one. Loading the choice asynchronously instead
 * would paint the wrong theme for a frame and then snap.
 */
function storedPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private browsing, blocked site data, or the shim not installed. The
    // app works fine following the system instead.
  }
  return 'system';
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>(storedPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies for this session; it just will not survive.
    }
  }, []);

  const scheme: 'light' | 'dark' =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  // On the web the page behind the app is painted from `prefers-color-scheme`,
  // so choosing dark on a light phone would leave a light strip around the
  // safe areas. In an effect rather than in render: this writes to the
  // document, which is exactly what render is not allowed to do.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = scheme === 'dark' ? '#000000' : '#F2F2F7';
  }, [scheme]);

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}
