import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, Pressable, Text, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';

/**
 * The tab bar, written by hand rather than configured.
 *
 * Three reasons the stock one could not do this:
 *
 * 1. It floats over the content, the way the Xcode app's did — a capsule inset
 *    from all three edges with the schedule visible around it.
 *
 * 2. The selected tab reads as one button around both the icon and the label.
 *    The stock bar renders those as separate pieces with no shared container
 *    to put a fill or a border on.
 *
 * 3. The home-indicator strip. `expo-router` hands `SafeAreaProvider` a hard
 *    `insets: { bottom: 0 }` on web, so `useSafeAreaInsets()` can never report
 *    it there and the stock bar has nothing to pad with. The web path below
 *    reads `env(safe-area-inset-bottom)` from CSS instead.
 *
 * Because it floats, it no longer takes space out of the screen above it —
 * every scrolling screen has to reserve that space itself with
 * `useTabBarSpace()`. That is the one thing to remember when adding a screen.
 */

const BAR_HEIGHT = 66;
const BAR_INSET = 12;

/**
 * Bottom padding a scrolling screen needs so its last row clears the bar.
 *
 * Exported as a hook rather than a constant because the home-indicator strip
 * is a runtime value, and it arrives by a different route on each platform.
 */
export function useTabBarSpace(): DimensionValue {
  const insets = useSafeAreaInsets();

  return Platform.OS === 'web'
    ? (`calc(${BAR_HEIGHT + BAR_INSET * 2}px + env(safe-area-inset-bottom, 0px))` as unknown as DimensionValue)
    : BAR_HEIGHT + BAR_INSET * 2 + insets.bottom;
}

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Urnik', icon: 'schedule' },
  { name: 'wishes', label: 'Želje', icon: 'wishes' },
  { name: 'swaps', label: 'Menjave', icon: 'swap' },
  { name: 'profile', label: 'Profil', icon: 'profile' },
];

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type Props = TabBarProps & {
  /** Route name → count. Only routes listed here get a badge. */
  badges?: Partial<Record<string, number>>;
};

export function TabBar(props: Props) {
  return (
    <>
      <BottomFade />
      <Bar {...props} />
    </>
  );
}

/**
 * Fades the content out before it reaches the bar, and covers the strip
 * beside and below it.
 *
 * Without this, a floating bar leaves the schedule fully visible around and
 * under itself, which reads as the app spilling out of its own frame. The fade
 * makes a row sliding underneath dissolve instead of being chopped in half.
 *
 * `pointerEvents: none` matters: it sits over the scroll view, and without it
 * the bottom of every screen would stop responding to taps.
 */
function BottomFade() {
  const c = usePalette();
  const insets = useSafeAreaInsets();

  // Reaches a little above the bar so the fade has room to be gradual.
  const height: DimensionValue =
    Platform.OS === 'web'
      ? (`calc(${BAR_HEIGHT + BAR_INSET * 2 + 34}px + env(safe-area-inset-bottom, 0px))` as unknown as DimensionValue)
      : BAR_HEIGHT + BAR_INSET * 2 + 34 + insets.bottom;

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[c.background + '00', c.background + 'E6', c.background]}
      locations={[0, 0.55, 0.8]}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    />
  );
}

function Bar({ state, navigation, badges }: Props) {
  const c = usePalette();
  const insets = useSafeAreaInsets();

  const bottom: DimensionValue =
    Platform.OS === 'web'
      ? (`calc(${BAR_INSET}px + env(safe-area-inset-bottom, 0px))` as unknown as DimensionValue)
      : BAR_INSET + insets.bottom;

  return (
    <View
      style={{
        position: 'absolute',
        left: BAR_INSET,
        right: BAR_INSET,
        bottom,
        height: BAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        borderRadius: BAR_HEIGHT / 2,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        // The lift is what makes it read as floating rather than as a panel
        // that happens to have rounded corners.
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 12,
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;

        const focused = state.index === index;
        const badge = badges?.[route.name] ?? 0;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
            onPress={() => {
              // Let the navigator cancel it, which is how "tap the active tab
              // to scroll to top" and similar behaviours stay possible.
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented && !focused) navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                alignItems: 'center',
                gap: 1,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: focused ? c.fill : 'transparent',
              }}>
              <View
                style={{
                  width: 30,
                  height: 26,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? c.accentSoft : 'transparent',
                }}>
                <Icon
                  name={tab.icon}
                  size={20}
                  color={focused ? c.accent : c.textSecondary}
                  weight={focused ? 'semibold' : 'regular'}
                />

                {badge > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -7,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: radius.pill,
                      backgroundColor: semantic.red,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>
                      {badge > 9 ? '9+' : badge}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10.5,
                  fontWeight: focused ? '700' : '500',
                  color: focused ? c.accent : c.textSecondary,
                }}>
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
