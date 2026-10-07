import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { ICONS, type IconName, type IconWeight } from './icon-set';

export type { IconName } from './icon-set';

export function Icon({
  name,
  size = 20,
  color,
  weight = 'regular',
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: IconWeight;
}) {
  const icon = ICONS[name];

  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android }}
      size={size}
      tintColor={color}
      weight={weight}
      fallback={<Ionicons name={icon.ion} size={size} color={color as string} />}
    />
  );
}
