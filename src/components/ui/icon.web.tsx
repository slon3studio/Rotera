import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';

import { ICONS, type IconName, type IconWeight } from './icon-set';

export type { IconName } from './icon-set';

/**
 * Icons in the browser.
 *
 * `expo-symbols` does work on web, but it renders through
 * `@expo-google-fonts/material-symbols` — a 943 KB font shipped for glyphs
 * Ionicons already carries. Metro picks this file on web by extension, so the
 * phone still gets real SF Symbols from `icon.tsx`.
 *
 * `weight` is accepted and ignored: an icon font has one weight, and dropping
 * the prop from the shared API would mean every caller needing a platform
 * check.
 */
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: IconWeight;
}) {
  return <Ionicons name={ICONS[name].ion} size={size} color={color as string} />;
}
