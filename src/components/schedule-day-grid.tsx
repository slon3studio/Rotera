import { ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Cell, type GridProps } from '@/components/schedule-grid';
import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';
import { ALL_DAYS, dayDescription, isToday, shortDayName } from '@/lib/week';
import { enabledSlots } from '@/types';
import type { ShiftSlot } from '@/types';

const HEADER_HEIGHT = 46;
const CELL_HEIGHT = 66;
const DAY_COLUMN_WIDTH = 58;

function slotColor(slot: ShiftSlot) {
  return slot === 'morning' ? semantic.teal : semantic.orange;
}

/**
 * The same grid, transposed: one row per day, one column per slot.
 *
 * Identical parts to `ScheduleGrid` — pinned label column, fixed row heights,
 * the same chips — but with only two columns they can flex to fill the screen
 * instead of being scrolled past. On a phone this is the readable one.
 */
export function ScheduleDayGrid(props: GridProps) {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { organization, schedule, weekStart, editing } = props;
  const SLOTS = enabledSlots(organization);

  /** One day's height is set by whichever slot has more people, so the two
   *  columns stay level and the day label lines up with both. */
  const rows = (day: number) =>
    Math.max(1, ...SLOTS.map((slot) => schedule.shiftsFor(day, slot).length)) + (editing ? 1 : 0);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: tabBarSpace }}>
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        }}>
        {/* Header */}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: DAY_COLUMN_WIDTH, height: HEADER_HEIGHT }} />
          {SLOTS.map((slot) => (
            <View
              key={slot}
              style={{
                flex: 1,
                height: HEADER_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: slotColor(slot) + '1F',
                borderLeftWidth: 1,
                borderLeftColor: c.border,
              }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: slotColor(slot) }}>
                {slot === 'morning' ? 'DOPOLDNE' : 'POPOLDNE'}
              </Text>
              <Text style={{ fontSize: 10, color: c.textSecondary }}>
                {(slot === 'morning'
                  ? organization.morning_start
                  : organization.afternoon_start
                ).slice(0, 5)}{' '}
                –{' '}
                {(slot === 'morning'
                  ? organization.morning_end
                  : organization.afternoon_end
                ).slice(0, 5)}
              </Text>
            </View>
          ))}
        </View>

        {ALL_DAYS.map((day) => {
          const today = isToday(day, weekStart);
          const rowCount = rows(day);

          return (
            <View
              key={day}
              style={{
                flexDirection: 'row',
                borderTopWidth: 1,
                borderTopColor: c.border,
              }}>
              <View
                style={{
                  width: DAY_COLUMN_WIDTH,
                  height: rowCount * CELL_HEIGHT,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  backgroundColor: today ? c.accent + '1F' : undefined,
                }}>
                <Text style={{ fontSize: 11, fontWeight: '900', color: today ? c.accent : c.text }}>
                  {shortDayName(day).toUpperCase()}
                </Text>
                <Text style={{ fontSize: 10, color: today ? c.accent : c.textSecondary }}>
                  {dayDescription(day, weekStart)}
                </Text>
              </View>

              {SLOTS.map((slot) => {
                const items = schedule.shiftsFor(day, slot);
                return (
                  <View
                    key={slot}
                    style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: c.border }}>
                    {Array.from({ length: rowCount }).map((_, row) => (
                      <Cell
                        key={`${slot}-${row}`}
                        {...props}
                        day={day}
                        slot={slot}
                        shift={items[row]}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
