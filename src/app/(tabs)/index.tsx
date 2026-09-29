import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Icon } from '@/components/ui/icon';
import { ScheduleDayGrid } from '@/components/schedule-day-grid';
import { ScheduleGrid, type ScheduleLayout } from '@/components/schedule-grid';
import { ShiftActionSheet } from '@/components/shift-action-sheet';
import { AddShiftSheet, ShiftEditorSheet } from '@/components/shift-sheets';
import { TeamShiftCounts } from '@/components/team-shift-counts';
import { Message } from '@/components/ui/auth-parts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AppBackground, Card, WeekPicker } from '@/components/ui/design';
import { useAppData } from '@/contexts/app-data';
import { useAuth } from '@/contexts/auth';
import { usePalette } from '@/hooks/use-palette';
import { useSchedule } from '@/hooks/use-schedule';
import { shiftCount } from '@/lib/format';
import { radius, semantic } from '@/lib/theme';
import { defaultWeek } from '@/lib/week';
import type { Shift, ShiftSlot } from '@/types';

export default function ScheduleScreen() {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuth();
  const { team, cover, swaps } = useAppData();
  const schedule = useSchedule();

  const [weekStart, setWeekStart] = useState(defaultWeek());
  const [layout, setLayout] = useState<ScheduleLayout>('vertical');
  const [editing, setEditing] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [addTarget, setAddTarget] = useState<{ day: number; slot: ShiftSlot } | null>(null);
  const [actingShift, setActingShift] = useState<Shift | null>(null);
  const [focusedWorkerId, setFocusedWorkerId] = useState<string | null>(null);
  const [confirmingCopy, setConfirmingCopy] = useState(false);

  const isManager = session?.profile.role === 'manager';

  /**
   * Re-read everything whenever this tab comes back into view.
   *
   * Loading once on mount left the screen showing things that were no longer
   * true: a duty deleted in the catalog still appeared under people's names,
   * and an approved cover still showed the old person, because both live in
   * this screen's own cached copy. Signing out was the only way to clear it.
   *
   * `useFocusEffect` also runs on first mount, so it replaces the mount
   * effects rather than adding to them.
   */
  useFocusEffect(
    useCallback(() => {
      void schedule.loadLookups();
      void schedule.loadWeek(weekStart);
      void cover.load();
      void swaps.load();
      void team.load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]),
  );

  useEffect(() => {
    void schedule.loadWeek(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const refresh = useCallback(async () => {
    await Promise.all([schedule.loadWeek(weekStart), cover.load(), swaps.load(), team.load()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  if (!session) return null;
  const { organization, profile } = session;

  const myShifts = schedule.shifts.filter((s) => s.assigned_worker_id === profile.id);

  // An empty draft week is the normal case and needs no question. Anything
  // already there, or a week the team can already see, gets one first: the
  // copy only adds, but it adds to something someone is relying on.
  const copyNeedsConfirm = schedule.shifts.length > 0 || schedule.isPublished;
  const copyPreviousWeek = () => {
    setConfirmingCopy(false);
    void schedule.copyPreviousWeek(weekStart);
  };

  const gridProps = {
    organization,
    schedule,
    team,
    weekStart,
    editing: isManager && editing,
    highlightWorkerId: isManager ? (focusedWorkerId ?? undefined) : profile.id,
    coverShiftIds: cover.shiftIdsAwaitingCover,
    swapShiftIds: swaps.shiftIdsInSwap,
    onSelectShift: (shift: Shift) => {
      if (isManager) {
        if (editing) setEditingShift(shift);
        return;
      }
      // Any assigned shift opens the sheet, which then decides what a worker
      // may actually do with it: hand over their own, take over a red one,
      // or offer a rotation for a colleague's. Refusing to open on someone
      // else's shift is what forced people into the Menjave tab before.
      if (shift.assigned_worker_id) setActingShift(shift);
    },
    onSelectEmpty: (day: number, slot: ShiftSlot) => {
      if (isManager && editing) setAddTarget({ day, slot });
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <View style={{ flex: 1, paddingTop: 56 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 26, fontWeight: '700', color: c.text }}>Urnik</Text>

          <Pressable
            onPress={() => setLayout(layout === 'grid' ? 'vertical' : 'grid')}
            hitSlop={8}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: radius.sm,
              backgroundColor: c.fill,
            }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>
              {layout === 'grid' ? 'Navpično' : 'Teden'}
            </Text>
          </Pressable>

          {isManager ? (
            <Pressable
              onPress={() => setEditing(!editing)}
              hitSlop={8}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.sm,
                backgroundColor: editing ? c.accent : c.fill,
              }}>
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: editing ? '#fff' : c.text }}>
                {editing ? 'Končaj' : 'Uredi'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <Card padding={10}>
            <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isManager ? (
                <StatusPill
                  label={schedule.isPublished ? 'OBJAVLJENO' : 'OSNUTEK'}
                  tint={schedule.isPublished ? semantic.green : semantic.orange}
                />
              ) : myShifts.length > 0 ? (
                <StatusPill label={shiftCount(myShifts.length).toUpperCase()} tint={c.accent} />
              ) : (
                <Text style={{ fontSize: 13, color: c.textSecondary }}>
                  Ta teden nisi na urniku.
                </Text>
              )}

              {schedule.conflicts.length > 0 && isManager ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="warning" size={12} color={semantic.yellow} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: semantic.yellow }}>
                    {schedule.conflicts.length}
                  </Text>
                </View>
              ) : null}

              <View style={{ flex: 1 }} />

              <Text style={{ fontSize: 11, color: c.textSecondary }}>
                {isManager
                  ? editing
                    ? 'Klikni polje za urejanje'
                    : focusedWorkerId
                      ? `${team.nameOf(focusedWorkerId)}: ${shiftCount(
                          schedule.shifts.filter((s) => s.assigned_worker_id === focusedWorkerId)
                            .length,
                        )}`
                      : `${schedule.shifts.length} vnosov`
                  : 'Klikni svojo smeno za menjavo'}
              </Text>
            </View>

            {isManager ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <ActionButton
                  label="Sestavi iz želja"
                  onPress={() => void schedule.rebuild(weekStart)}
                  disabled={schedule.working}
                />
                <ActionButton
                  label={schedule.isPublished ? 'Prekliči objavo' : 'Objavi'}
                  onPress={() => void schedule.setPublished(!schedule.isPublished, weekStart)}
                  disabled={schedule.working}
                  tint={schedule.isPublished ? semantic.red : semantic.green}
                />
              </View>
            ) : null}

            {isManager ? (
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <ActionButton
                  label="Kopiraj prejšnji teden"
                  onPress={() => (copyNeedsConfirm ? setConfirmingCopy(true) : copyPreviousWeek())}
                  disabled={schedule.working}
                  tint={c.textSecondary}
                />
              </View>
            ) : null}

            {isManager ? (
              <TeamShiftCounts
                schedule={schedule}
                team={team}
                selectedId={focusedWorkerId}
                onSelect={setFocusedWorkerId}
              />
            ) : null}
          </Card>
        </View>

        {schedule.error ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            <Message text={schedule.error} kind="error" />
          </View>
        ) : schedule.notice ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            <Message text={schedule.notice} kind="notice" />
          </View>
        ) : null}

        {schedule.shifts.length === 0 && !editing ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingBottom: tabBarSpace, gap: 10 }}
            refreshControl={<RefreshControl refreshing={schedule.loading} onRefresh={refresh} />}>
            <Icon name="schedule" size={40} color={c.textTertiary} />
            <Text style={{ fontSize: 15, color: c.textSecondary, textAlign: 'center' }}>
              {isManager
                ? 'Urnik za ta teden še ni sestavljen.'
                : 'Urnik za ta teden še ni objavljen.'}
            </Text>
            {!isManager ? (
              <Text style={{ fontSize: 13, color: c.textTertiary, textAlign: 'center' }}>
                Ko ga vodja objavi, se prikaže tukaj.
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingTop: 12 }}>
            {layout === 'grid' ? (
              <ScheduleGrid {...gridProps} />
            ) : (
              <ScheduleDayGrid {...gridProps} />
            )}
          </View>
        )}
      </View>

      {editingShift ? (
        <ShiftEditorSheet
          key={editingShift.id}
          shift={editingShift}
          workerName={
            editingShift.assigned_worker_id
              ? team.nameOf(editingShift.assigned_worker_id)
              : 'Prosto'
          }
          conflict={schedule.conflictFor(editingShift.id)}
          positions={schedule.positions}
          duties={schedule.duties}
          onClose={() => setEditingShift(null)}
          onSave={(start, end, positionId, dutyId) =>
            void schedule.updateShift(
              editingShift.id,
              start,
              end,
              positionId,
              dutyId,
              weekStart,
            )
          }
          onDelete={() => void schedule.deleteShift(editingShift.id, weekStart)}
        />
      ) : null}

      {addTarget ? (
        <AddShiftSheet
          key={`${addTarget.day}-${addTarget.slot}`}
          target={addTarget}
          candidates={team.workers.filter(
            (worker) =>
              !schedule
                .shiftsFor(addTarget.day, addTarget.slot)
                .some((s) => s.assigned_worker_id === worker.id),
          )}
          positions={schedule.positions}
          duties={schedule.duties}
          onClose={() => setAddTarget(null)}
          onAdd={(workerId, positionId, dutyId) =>
            void schedule.addShift(
              workerId,
              addTarget.day,
              addTarget.slot,
              positionId,
              dutyId,
              organization,
              weekStart,
            )
          }
        />
      ) : null}

      <ConfirmDialog
        visible={confirmingCopy}
        title="Kopiram prejšnji teden?"
        message={
          schedule.isPublished
            ? 'Ta teden je že objavljen, zato bo ekipa kopirane smene videla takoj. Obstoječe smene ostanejo, dodajo se le manjkajoče.'
            : 'Ta teden že ima smene. Ostanejo, kot so; dodajo se le tiste iz prejšnjega tedna, ki jih še ni.'
        }
        confirmLabel="Kopiraj"
        busy={schedule.working}
        onConfirm={copyPreviousWeek}
        onCancel={() => setConfirmingCopy(false)}
      />

      {actingShift ? (
        <ShiftActionSheet
          key={actingShift.id}
          shift={actingShift}
          meId={profile.id}
          schedule={schedule}
          team={team}
          cover={cover}
          swaps={swaps}
          onClose={() => {
            cover.clearMessages();
            swaps.clearMessages();
            setActingShift(null);
            // An approved cover or rotation moves a shift to someone else, so
            // the grid has to be re-read, not just the request lists.
            void schedule.loadWeek(weekStart);
          }}
        />
      ) : null}
    </View>
  );
}

function StatusPill({ label, tint }: { label: string; tint: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: tint + '2B',
      }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: tint }}>
        {label}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  tint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  const c = usePalette();
  const color = tint ?? c.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        minHeight: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: color + '24',
        opacity: disabled ? 0.5 : 1,
      }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color }}>{label}</Text>
    </Pressable>
  );
}
