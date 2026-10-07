import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { usePalette } from '@/hooks/use-palette';
import { fonts, radius } from '@/lib/theme';

/**
 * The signed-out screens are the first thing anyone sees of Rotera, so they
 * get a branded background rather than a plain form.
 */
export function AuthBackground() {
  const c = usePalette();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[c.accent + '4D', c.accent + '12', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function BrandMark({ subtitle = 'Urnik za tvojo ekipo' }: { subtitle?: string }) {
  const c = usePalette();

  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      {/* The real app icon rather than a tinted glyph: whoever installs this
          sees the same mark on their home screen a second later, and two
          almost-alike marks read as a mistake. */}
      <Image
        source={require('../../../assets/images/brand-icon.png')}
        style={{ width: 78, height: 78, borderRadius: 20 }}
        contentFit="cover"
      />

      <View style={{ alignItems: 'center', gap: 5 }}>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '700',
            color: c.text,
            fontFamily: fonts.rounded,
          }}>
          Rotera
        </Text>
        <Text style={{ fontSize: 15, color: c.textSecondary }}>{subtitle}</Text>
      </View>
    </View>
  );
}

type FieldProps = {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  mono?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
};

export function AuthField({
  icon,
  placeholder,
  value,
  onChangeText,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  mono,
  returnKeyType,
  onSubmitEditing,
}: FieldProps) {
  const c = usePalette();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: c.card,
        borderRadius: radius.md,
        borderWidth: focused ? 1.6 : 1,
        borderColor: focused ? c.accent : c.border,
      }}>
      <View style={{ width: 22, alignItems: 'center' }}>
        <Icon name={icon} size={18} color={focused ? c.accent : c.textTertiary} />
      </View>
      <TextInput
        style={{
          flex: 1,
          fontSize: 16,
          color: c.text,
          fontFamily: mono ? fonts.mono : undefined,
        }}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = usePalette();
  const inactive = disabled && !loading;

  return (
    <Pressable onPress={onPress} disabled={disabled || loading}>
      {({ pressed }) =>
        inactive ? (
          // Dimming the whole button dims its label too, which on a light
          // background leaves the title invisible. The disabled state gets its
          // own fill and text colour instead.
          <View
            style={{
              minHeight: 54,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.fill,
              borderWidth: 1,
              borderColor: c.border,
            }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: c.textSecondary }}>{title}</Text>
          </View>
        ) : (
          <LinearGradient
            colors={[c.accent, c.accent + 'C7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              minHeight: 54,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            }}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff' }}>{title}</Text>
            )}
          </LinearGradient>
        )
      }
    </Pressable>
  );
}

export function Message({ text, kind }: { text: string; kind: 'error' | 'notice' }) {
  const c = usePalette();
  const tint = kind === 'error' ? '#FF3B30' : c.accent;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: radius.sm + 3,
        backgroundColor: tint + '1F',
        borderWidth: 1,
        borderColor: tint + '40',
      }}>
      <Icon name={kind === 'error' ? 'warning' : 'info'} size={15} color={tint} />
      <Text style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

export function ModeToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const c = usePalette();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        backgroundColor: c.card,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: c.border,
      }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 42,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm + 2,
              backgroundColor: active ? c.accent : 'transparent',
            }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: active ? '#fff' : c.textSecondary,
              }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
