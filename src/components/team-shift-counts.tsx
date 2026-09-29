import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ScheduleHook } from '@/hooks/use-schedule';
import type { TeamHook } from '@/hooks/use-team';
import { usePalette } from '@/hooks/use-palette';
import { radius } from '@/lib/theme';

/**
 * How many shifts each person has in the week on screen — the manager's quick
 * fairness check before publishing.
 *
 * Everyone on the team is listed, including people with no shift at all:
 * the zeros are usually the reason to look. Someone who has since left but is
 * still on this week's schedule is listed too, or their shifts would vanish
 * from the tally.
 *
 * Tapping a person picks out their shifts in the grid; tapping again clears it.
 *
 * Sized to sit inline in the slim row under the week, next to the status —
 * the parent gives it the remaining width and it scrolls within that.
 */
export function TeamShiftCounts({
  schedule,
  team,
  selectedId,
  onSelect,
}: {
  schedule: ScheduleHook;
  team: TeamHook;
  selectedId: string | null;
  onSelect: (workerId: string | null) => void;
}) {
  const c = usePalette();

  const counts = new Map<string, number>();
  for (const worker of team.workers) counts.set(worker.id, 0);
  for (const shift of schedule.shifts) {
    if (!shift.assigned_worker_id) continue;
    counts.set(shift.assigned_worker_id, (counts.get(shift.assigned_worker_id) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([id, count]) => ({ id, name: team.nameOf(id), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sl'));

  if (rows.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 5, alignItems: 'center' }}>
      {rows.map((row) => {
        const selected = row.id === selectedId;
        const empty = row.count === 0;

        return (
          <Pressable
            key={row.id}
            onPress={() => onSelect(selected ? null : row.id)}
            hitSlop={4}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              height: 26,
              paddingLeft: 9,
              paddingRight: 3,
              borderRadius: radius.pill,
              backgroundColor: selected ? c.accentSoft : c.fill,
              borderWidth: 1,
              borderColor: selected ? c.accent + '73' : 'transparent',
            }}>
            <Text
              numberOfLines={1}
              style={{
                maxWidth: 96,
                fontSize: 11,
                fontWeight: selected ? '700' : '600',
                color: empty ? c.textTertiary : c.text,
              }}>
              {row.name}
            </Text>
            <View
              style={{
                minWidth: 19,
                paddingHorizontal: 5,
                paddingVertical: 1,
                borderRadius: radius.pill,
                alignItems: 'center',
                backgroundColor: empty ? 'transparent' : selected ? c.accent : c.accent + '24',
                borderWidth: empty ? 1 : 0,
                borderColor: c.border,
              }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: empty ? c.textTertiary : selected ? '#fff' : c.accent,
                }}>
                {row.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
