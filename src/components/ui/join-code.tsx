import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { usePalette } from '@/hooks/use-palette';
import { fonts, radius, semantic } from '@/lib/theme';

/**
 * The join code, tappable to copy.
 *
 * This code only ever leaves the app by being sent to somebody, so reading it
 * off the screen and retyping it was the real interaction — six characters
 * where O and 0 look alike. The whole block is the target rather than a small
 * icon, and the hint line doubles as the confirmation so nothing jumps.
 */
export function JoinCode({ code }: { code: string }) {
  const c = usePalette();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, leaving the screen inside the two seconds sets state on an
  // unmounted component.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Pressable onPress={() => void copy()} style={{ marginTop: 10 }}>
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              backgroundColor: c.accentSoft,
              borderWidth: 1,
              borderColor: pressed ? c.accent : 'transparent',
            }}>
            <Text
              style={{
                flex: 1,
                fontSize: 30,
                fontWeight: '700',
                letterSpacing: 3,
                textAlign: 'center',
                color: c.accent,
                fontFamily: fonts.mono,
              }}>
              {code}
            </Text>
            <Icon name={copied ? 'check' : 'copy'} size={18} color={c.accent} />
          </View>
        )}
      </Pressable>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingTop: 8,
        }}>
        {copied ? <Icon name="check" size={12} color={semantic.green} /> : null}
        <Text
          style={{
            fontSize: 12,
            fontWeight: copied ? '600' : '400',
            color: copied ? semantic.green : c.textTertiary,
          }}>
          {copied ? 'Koda je kopirana' : 'Tapni kodo, da jo kopiraš'}
        </Text>
      </View>
    </>
  );
}
