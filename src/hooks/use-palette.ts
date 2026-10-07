import { useAppTheme } from '@/contexts/theme';
import { palette, type Palette } from '@/lib/theme';

/**
 * The colour set for the active appearance.
 *
 * Reads the app's own preference rather than `useColorScheme()` directly, so
 * that choosing Svetlo or Temno in Nastavitve actually changes anything.
 */
export function usePalette(): Palette {
  return useAppTheme().scheme === 'dark' ? palette.dark : palette.light;
}
