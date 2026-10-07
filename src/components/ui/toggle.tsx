import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { radius } from '@/lib/theme';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const THUMB = 26;
const TRAVEL = TRACK_WIDTH - THUMB - (TRACK_HEIGHT - THUMB);

/**
 * An on/off switch drawn by hand, in place of React Native's `Switch`.
 *
 * The stock one looks different on every platform — iOS green, Android's
 * Material track, and in the browser a plain checkbox-sized slider — so the
 * same setting looked like three different controls. This one is the same
 * everywhere: a gradient track in the accent (or in `tint`, when the setting
 * belongs to something that already has a colour, like a shift slot) and a
 * white thumb that slides across it.
 *
 * `disabled` dims it and ignores taps; it does not hide the current value,
 * because "this is on and you cannot turn it off" is itself information.
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
  tint,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Track colour when on. Defaults to the accent gradient. */
  tint?: string;
  accessibilityLabel?: string;
}) {
  const c = usePalette();

  // In state, not a ref: created once and read while rendering.
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 5,
    }).start();
  }, [value, progress]);

  const onColors: [string, string] = tint ? [tint, tint + 'D9'] : c.accentGradient;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={6}
      style={{ opacity: disabled ? 0.6 : 1 }}>
      <View
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: c.fill,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        }}>
        {/* The "on" track fades in over the neutral one rather than the colour
            switching abruptly, so it moves together with the thumb. */}
        <Animated.View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: progress }}>
          <LinearGradient
            colors={onColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          style={{
            position: 'absolute',
            top: (TRACK_HEIGHT - THUMB) / 2 - 1,
            left: (TRACK_HEIGHT - THUMB) / 2 - 1,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.22,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
            transform: [
              {
                translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }),
              },
            ],
          }}
        />
      </View>
    </Pressable>
  );
}
