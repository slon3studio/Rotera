import { useCallback, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';

/** How far you drag to bring the button all the way in. */
const TRAVEL = 58;
const CIRCLE = 38;
const OPEN_THRESHOLD = TRAVEL / 2;

/**
 * Drag a row left to bring in a round delete button on the right.
 *
 * The row itself does not move — only the button slides in over its trailing
 * end. Translating the whole row is the usual way to do this, and was the
 * first attempt here, but a short label like "kolo" starts near the left edge
 * and a 58px shift carries it out of sight: you end up deleting something you
 * can no longer read. Holding the row still and animating the button costs
 * nothing and keeps the name on screen.
 *
 * Built on `PanResponder` rather than `react-native-gesture-handler`'s
 * `Swipeable`: this version of the library ships only the legacy one, which
 * wants a `GestureHandlerRootView` above the whole app. PanResponder is part
 * of React Native and works through react-native-web with a mouse as well as
 * a finger.
 */
export function SwipeToDelete({
  children,
  onDelete,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  accessibilityLabel: string;
}) {
  const c = usePalette();

  // In state, not a ref: created once and read while rendering, which the
  // React Compiler rules forbid doing to `ref.current`.
  // 0 = fully hidden off to the right, 1 = fully in.
  const [progress] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);

  const settle = useCallback(
    (to: 0 | 1) => {
      setOpen(to === 1);
      Animated.spring(progress, {
        toValue: to,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [progress],
  );

  const [responder] = useState(() => {
    // Where the button rested when this drag started. A closure variable, not
    // a React ref: only the gesture ever touches it.
    let base: 0 | 1 = 0;

    const close = (to: 0 | 1) => {
      base = to;
      settle(to);
    };

    return PanResponder.create({
      // Not on start: claiming the gesture immediately would swallow taps on
      // whatever the row contains.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

      onPanResponderMove: (_, g) => {
        // Dragging left is positive progress; never past either end.
        progress.setValue(Math.max(0, Math.min(1, base + -g.dx / TRAVEL)));
      },

      onPanResponderRelease: (_, g) => {
        // A flick counts even when it did not travel far.
        if (g.vx < -0.5) return close(1);
        if (g.vx > 0.5) return close(0);
        close(-g.dx + base * TRAVEL > OPEN_THRESHOLD ? 1 : 0);
      },

      onPanResponderTerminate: () => close(base),
    });
  });

  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius.sm,
        // 44 is the smallest comfortable touch target, and it gives the circle
        // room without touching the rows above and below.
        minHeight: 44,
        justifyContent: 'center',
        backgroundColor: c.card,
      }}>
      {children}

      {/* Slides in over the row's trailing end, where only the chevron sits.
          Untouchable until it is actually in, so a closed row cannot be
          deleted by a stray tap near its right edge. */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: TRAVEL,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.card,
          opacity: progress,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [TRAVEL, 0],
              }),
            },
          ],
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => ({
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: CIRCLE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: semantic.red,
            opacity: pressed ? 0.75 : 1,
          })}>
          <Icon name="trash" size={18} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* While it is open, a tap anywhere else on the row closes it rather
          than opening whatever the row would normally open. */}
      {open ? (
        <Pressable
          onPress={() => settle(0)}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: TRAVEL }}
        />
      ) : null}
    </View>
  );
}
