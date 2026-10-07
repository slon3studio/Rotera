import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { addWeeks, isCurrentWeek, rangeDescription } from '@/lib/week';
import { fonts, positionColors, radius, semantic } from '@/lib/theme';
import type { Position, ShiftPreference, ShiftSlot, UserRole } from '@/types';
import { preferenceShort } from '@/types';

/**
 * Shared surfaces and controls for the signed-in screens.
 *
 * Content sits on cards over a softly tinted background, so the app reads as a
 * product rather than a settings pane.
 */

export function AppBackground() {
  const c = usePalette();

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.background }}>
      <LinearGradient
        colors={[c.accent + '21', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}

export function Card({
  children,
  padding = 16,
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
}) {
  const c = usePalette();

  return (
    <View
      style={[
        {
          padding,
          backgroundColor: c.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionTitle({ text, trailing }: { text: string; trailing?: string }) {
  const c = usePalette();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.6,
          color: c.textSecondary,
        }}>
        {text.toUpperCase()}
      </Text>
      <View style={{ flex: 1 }} />
      {trailing ? <Text style={{ fontSize: 12, color: c.textTertiary }}>{trailing}</Text> : null}
    </View>
  );
}

export function InitialsAvatar({ name, size = 52 }: { name: string; size?: number }) {
  const c = usePalette();

  const initials =
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase() || '?';

  return (
    <LinearGradient
      colors={[c.accent, c.accent + 'AD']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '700',
          color: '#fff',
          fontFamily: fonts.rounded,
        }}>
        {initials}
      </Text>
    </LinearGradient>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  const tint = role === 'manager' ? positionColors.purple : semantic.teal;
  const label = role === 'manager' ? 'VODJA' : 'ZAPOSLENI';

  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: tint + '2E',
      }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: tint }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The little coloured letter next to a name — "Š", "R".
 *
 * A fixed palette rather than stored hex: these adapt well to both light and
 * dark, and an arbitrary colour chosen on one background eventually becomes
 * unreadable on the other.
 */
export function PositionBadge({
  position,
  size = 9,
}: {
  position: Position | null | undefined;
  size?: number;
}) {
  if (!position) return null;

  const label =
    position.short_label?.trim() || position.name.charAt(0).toUpperCase() || '?';
  const color = positionColors[position.color ?? 'gray'] ?? positionColors.gray;

  return (
    <View
      style={{
        paddingHorizontal: size * 0.5,
        paddingVertical: size * 0.2,
        borderRadius: radius.pill,
        backgroundColor: color,
      }}>
      <Text style={{ fontSize: size, fontWeight: '900', color: '#fff' }}>{label}</Text>
    </View>
  );
}

/** Ties wish colours to the schedule grid: morning teal, afternoon orange. */
export function preferenceTint(preference: ShiftPreference, accent: string): string {
  if (preference === 'morning') return semantic.teal;
  if (preference === 'afternoon') return semantic.orange;
  if (preference === 'any') return accent;
  return positionColors.gray;
}

export function PreferenceSelector({
  value,
  onChange,
  slots,
}: {
  value: ShiftPreference;
  onChange: (next: ShiftPreference) => void;
  /** Which slots the organization runs. Anything else must not be offerable —
   *  the database refuses a wish for a switched-off slot, and a button that
   *  always errors is worse than no button. `any` is dropped when only one
   *  slot is live, because there it would mean the same as that slot. */
  slots: ShiftSlot[];
}) {
  const c = usePalette();
  const options: ShiftPreference[] = [
    ...slots,
    'off',
    ...(slots.length > 1 ? (['any'] as ShiftPreference[]) : []),
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: radius.md,
        backgroundColor: c.fill,
      }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={{
              flex: 1,
              minHeight: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              backgroundColor: active ? preferenceTint(option, c.accent) : 'transparent',
            }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: active ? '#fff' : c.textSecondary,
              }}>
              {preferenceShort[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PositionChips({
  positions,
  value,
  onChange,
}: {
  positions: Position[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const c = usePalette();

  const chip = (label: string, tint: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: selected ? tint : tint + '24',
      }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : tint }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {chip('Karkoli', c.textSecondary, value === null, () => onChange(null))}
      {positions.map((position) =>
        chip(
          position.name,
          positionColors[position.color ?? 'gray'] ?? positionColors.gray,
          value === position.id,
          () => onChange(position.id),
        ),
      )}
    </View>
  );
}

export function StatTile({
  title,
  value,
  caption,
  tint,
}: {
  title: string;
  value: string;
  caption?: string;
  tint?: string;
}) {
  const c = usePalette();

  return (
    <Card padding={14} style={{ flex: 1 }}>
      <Text
        style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.4, color: c.textSecondary }}>
        {title.toUpperCase()}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: 20, fontWeight: '700', marginTop: 4, color: tint ?? c.accent }}>
        {value}
      </Text>
      {caption ? (
        <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 2 }}>{caption}</Text>
      ) : null}
    </Card>
  );
}

export function EmptyHint({ text }: { text: string }) {
  const c = usePalette();
  return <Text style={{ fontSize: 15, color: c.textSecondary }}>{text}</Text>;
}

/** One person as a compact pill — name plus their position badge. */
export function PersonChip({
  name,
  position,
  highlighted,
}: {
  name: string;
  position?: Position | null;
  highlighted?: boolean;
}) {
  const c = usePalette();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: highlighted ? c.accentSoft : c.fill,
      }}>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: c.text }}>
        {name}
      </Text>
      <PositionBadge position={position} size={8} />
    </View>
  );
}

/** A coloured dot + label, for the two slot headings. */
export function SlotLabel({ slot, count }: { slot: ShiftSlot; count: number }) {
  const c = usePalette();
  const tint = slot === 'morning' ? semantic.teal : semantic.orange;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tint }} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
        {slot === 'morning' ? 'Dopoldne' : 'Popoldne'}
      </Text>
      <View style={{ flex: 1 }} />
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: count === 0 ? c.textTertiary : c.textSecondary,
        }}>
        {count}
      </Text>
    </View>
  );
}

export function WeekPicker({
  weekStart,
  onChange,
}: {
  weekStart: Date;
  onChange: (next: Date) => void;
}) {
  const c = usePalette();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={() => onChange(addWeeks(-1, weekStart))}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, color: c.text }}>‹</Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>
          {rangeDescription(weekStart)}
        </Text>
        {isCurrentWeek(weekStart) ? (
          <Text style={{ fontSize: 11, color: c.textSecondary }}>Ta teden</Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => onChange(addWeeks(1, weekStart))}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, color: c.text }}>›</Text>
      </Pressable>
    </View>
  );
}
