import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Icon } from '@/components/ui/icon';
import { PositionBadge } from '@/components/ui/design';
import type { ScheduleHook } from '@/hooks/use-schedule';
import type { TeamHook } from '@/hooks/use-team';
import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';
import { ALL_DAYS, dayDescription, isToday, shortDayName } from '@/lib/week';
import { enabledSlots } from '@/types';
import type { Organization, Shift, ShiftSlot } from '@/types';

/**
 * Which way the schedule is laid out. Stored per device, so the choice sticks.
 */
export type ScheduleLayout = 'grid' | 'vertical';

export type GridProps = {
  organization: Organization;
  schedule: ScheduleHook;
  team: TeamHook;
  weekStart: Date;
  editing?: boolean;
  /** Whose shifts to pick out of the crowd. Undefined for the manager. */
  highlightWorkerId?: string;
  /**
   * Shifts with a cover request in flight. Comes from `useCover`, not
   * `useSchedule` — red beats the "mine" highlight, because a shift someone is
   * trying to give away is the more urgent fact.
   */
  coverShiftIds?: Set<string>;
  /**
   * Shifts on either side of a live rotation. Kept apart from
   * `coverShiftIds` on purpose: red means "nobody is down to work this yet",
   * purple means "two people have agreed to trade". Reading one as the other
   * is how someone turns up on the wrong day.
   */
  swapShiftIds?: Set<string>;
  onSelectShift?: (shift: Shift) => void;
  onSelectEmpty?: (day: number, slot: ShiftSlot) => void;
};

const HEADER_HEIGHT = 50;
const CELL_HEIGHT = 68;
const SLOT_COLUMN_WIDTH = 48;
const DAY_COLUMN_WIDTH = 124;

function slotColor(slot: ShiftSlot) {
  return slot === 'morning' ? semantic.teal : semantic.orange;
}

/**
 * Days across, slots down — the paper layout. Seven columns will not fit a
 * phone at a readable size, so the days scroll sideways while the slot column
 * stays put, the same trade-off a spreadsheet makes.
 *
 * Row heights are fixed constants on purpose: that is the only thing keeping
 * the pinned column aligned with the scrolling ones.
 */
export function ScheduleGrid(props: GridProps) {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { organization, schedule, editing } = props;
  const SLOTS = enabledSlots(organization);

  const rows = (slot: ShiftSlot) => schedule.rowCount(slot, 1) + (editing ? 1 : 0);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: tabBarSpace }}>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        }}>
        {/* Pinned slot column */}
        <View>
          <View style={{ width: SLOT_COLUMN_WIDTH, height: HEADER_HEIGHT }} />
          {SLOTS.map((slot) => (
            <View
              key={slot}
              style={{
                width: SLOT_COLUMN_WIDTH,
                height: rows(slot) * CELL_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: slotColor(slot) + '1F',
                borderTopWidth: slot === 'afternoon' ? 1 : 0,
                borderTopColor: c.border,
              }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: slotColor(slot) }}>
                {slot === 'morning' ? 'DOP' : 'POP'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '500', color: c.textSecondary }}>
                {(slot === 'morning'
                  ? organization.morning_start
                  : organization.afternoon_start
                ).slice(0, 5)}
              </Text>
              <Text style={{ fontSize: 10, color: c.textSecondary }}>
                {(slot === 'morning' ? organization.morning_end : organization.afternoon_end).slice(
                  0,
                  5,
                )}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ flexDirection: 'row' }}>
            {ALL_DAYS.map((day) => (
              <DayColumn key={day} {...props} day={day} rows={rows} />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function DayColumn({
  day,
  rows,
  ...props
}: GridProps & { day: number; rows: (slot: ShiftSlot) => number }) {
  const c = usePalette();
  const today = isToday(day, props.weekStart);
  const SLOTS = enabledSlots(props.organization);

  return (
    <View style={{ borderLeftWidth: 1, borderLeftColor: c.border }}>
      <View
        style={{
          width: DAY_COLUMN_WIDTH,
          height: HEADER_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          backgroundColor: today ? c.accent + '1F' : undefined,
        }}>
        <Text
          style={{ fontSize: 11, fontWeight: '900', color: today ? c.accent : c.text }}>
          {shortDayName(day).toUpperCase()}
        </Text>
        <Text style={{ fontSize: 10, color: today ? c.accent : c.textSecondary }}>
          {dayDescription(day, props.weekStart)}
        </Text>
      </View>

      {SLOTS.map((slot) => {
        const items = props.schedule.shiftsFor(day, slot);
        return Array.from({ length: rows(slot) }).map((_, row) => (
          <Cell
            key={`${slot}-${row}`}
            {...props}
            day={day}
            slot={slot}
            shift={items[row]}
            width={DAY_COLUMN_WIDTH}
          />
        ));
      })}
    </View>
  );
}

export function Cell({
  organization,
  schedule,
  team,
  editing,
  highlightWorkerId,
  coverShiftIds,
  swapShiftIds,
  onSelectShift,
  onSelectEmpty,
  day,
  slot,
  shift,
  width,
}: GridProps & {
  day: number;
  slot: ShiftSlot;
  shift: Shift | undefined;
  width?: number;
}) {
  const c = usePalette();

  const mine = !!shift && !!highlightWorkerId && shift.assigned_worker_id === highlightWorkerId;

  return (
    <Pressable
      onPress={() => {
        if (shift) onSelectShift?.(shift);
        else onSelectEmpty?.(day, slot);
      }}
      style={{
        width,
        flex: width ? undefined : 1,
        height: CELL_HEIGHT,
        backgroundColor: slotColor(slot) + '0D',
        borderTopWidth: 1,
        borderTopColor: c.border,
        justifyContent: 'center',
      }}>
      {shift ? (
        <Chip
          shift={shift}
          mine={mine}
          needsCover={coverShiftIds?.has(shift.id) ?? false}
          inRotation={swapShiftIds?.has(shift.id) ?? false}
          schedule={schedule}
          team={team}
          organization={organization}
        />
      ) : editing ? (
        <View
          style={{
            marginHorizontal: 5,
            marginVertical: 4,
            flex: 1,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 13, color: c.textTertiary }}>+</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A person reads as a card inside the cell rather than loose text on a tinted
 * block — it gives the name an edge to sit against, and makes the "mine" and
 * "needs cover" states obvious without shouting.
 */
export function Chip({
  shift,
  mine,
  needsCover,
  inRotation,
  schedule,
  team,
  organization,
}: {
  shift: Shift;
  mine: boolean;
  needsCover: boolean;
  inRotation: boolean;
  schedule: ScheduleHook;
  team: TeamHook;
  organization: Organization;
}) {
  const c = usePalette();

  const conflict = schedule.conflictFor(shift.id);
  const duty = schedule.dutyNameOf(shift.duty_id);
  const note = schedule.timeNoteOf(shift, organization);

  // Cover outranks rotation, which outranks "mine": the further a shift is
  // from being settled, the louder it should be.
  //
  // A rotation is a dashed purple edge rather than a purple fill. The broken
  // line says "agreed, not final", and leaving the fill alone means the cell
  // still shows whether the shift is yours underneath.
  const fill = needsCover ? semantic.red + '24' : mine ? c.accentSoft : c.fill;
  const stroke = needsCover
    ? semantic.red + '73'
    : inRotation
      ? semantic.purple
      : mine
        ? c.accent + '73'
        : 'transparent';

  return (
    <View
      style={{
        marginHorizontal: 5,
        marginVertical: 4,
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: radius.sm,
        backgroundColor: fill,
        borderWidth: inRotation ? 1.4 : 1,
        borderStyle: inRotation ? 'dashed' : 'solid',
        borderColor: stroke,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontSize: 12,
            fontWeight: mine ? '700' : '600',
            color: needsCover ? semantic.red : c.text,
          }}>
          {shift.assigned_worker_id ? team.nameOf(shift.assigned_worker_id) : 'Prosto'}
        </Text>

        <PositionBadge position={schedule.positionOf(shift.position_id)} />

        {conflict ? <Icon name="warning" size={10} color={semantic.yellow} /> : null}
        {needsCover ? <Icon name="swap" size={10} color={semantic.red} /> : null}
        {inRotation ? <Icon name="rotate" size={10} color={semantic.purple} /> : null}
      </View>

      {duty ? (
        <Text numberOfLines={1} style={{ fontSize: 10, color: c.textSecondary }}>
          {duty}
        </Text>
      ) : null}

      {note ? (
        <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '600', color: semantic.orange }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
