import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Icon } from '@/components/ui/icon';
import { ScheduleDayGrid } from '@/components/schedule-day-grid';
import {
  ConflictCount,
  PublishPill,
  ScheduleActionsSheet,
  ScheduleBanner,
  ScheduleHeader,
  StatusPill,
} from '@/components/schedule-header';
import { ScheduleGrid, type ScheduleLayout } from '@/components/schedule-grid';
import { ShiftActionSheet } from '@/components/shift-action-sheet';
import { AddShiftSheet, ShiftEditorSheet } from '@/components/shift-sheets';
import { TeamShiftCounts } from '@/components/team-shift-counts';
import { AppBackground } from '@/components/ui/design';
import { useAppData } from '@/contexts/app-data';
import { useAuth } from '@/contexts/auth';
import { usePalette } from '@/hooks/use-palette';
import { useSchedule } from '@/hooks/use-schedule';
import { shiftCount } from '@/lib/format';
import { semantic } from '@/lib/theme';
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
  const [showingActions, setShowingActions] = useState(false);

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

      <View style={{ flex: 1, paddingTop: 50 }}>
        <ScheduleHeader
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          layout={layout}
          onToggleLayout={() => setLayout(layout === 'grid' ? 'vertical' : 'grid')}
          editing={isManager ? editing : undefined}
          onToggleEditing={isManager ? () => setEditing(!editing) : undefined}
          onMore={isManager ? () => setShowingActions(true) : undefined}>
          {isManager ? (
            <>
              <StatusPill
                label={schedule.isPublished ? 'OBJAVLJENO' : 'OSNUTEK'}
                tint={schedule.isPublished ? semantic.green : semantic.orange}
              />
              <ConflictCount count={schedule.conflicts.length} />
              {editing ? (
                <Text style={{ flex: 1, fontSize: 12, color: c.textSecondary }}>
                  Klikni polje za urejanje
                </Text>
              ) : (
                <TeamShiftCounts
                  schedule={schedule}
                  team={team}
                  selectedId={focusedWorkerId}
                  onSelect={setFocusedWorkerId}
                />
              )}
              {!schedule.isPublished && !editing ? (
                <PublishPill
                  onPress={() => void schedule.setPublished(true, weekStart)}
                  disabled={schedule.working}
                />
              ) : null}
            </>
          ) : (
            <>
              {myShifts.length > 0 ? (
                <StatusPill label={shiftCount(myShifts.length).toUpperCase()} tint={c.accent} />
              ) : (
                <Text style={{ fontSize: 12, color: c.textSecondary }}>
                  Ta teden nisi na urniku.
                </Text>
              )}
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 11, color: c.textTertiary }}>
                Klikni smeno za menjavo
              </Text>
            </>
          )}
        </ScheduleHeader>

        {schedule.error || schedule.notice ? (
          <View style={{ paddingTop: 6 }}>
            <ScheduleBanner
              text={(schedule.error ?? schedule.notice)!}
              kind={schedule.error ? 'error' : 'notice'}
              onDismiss={schedule.clearMessages}
            />
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

      <ScheduleActionsSheet
        visible={showingActions}
        isPublished={schedule.isPublished}
        working={schedule.working}
        copyNeedsConfirm={schedule.shifts.length > 0 || schedule.isPublished}
        onClose={() => setShowingActions(false)}
        onRebuild={() => void schedule.rebuild(weekStart)}
        onCopy={() => void schedule.copyPreviousWeek(weekStart)}
        onTogglePublished={() => void schedule.setPublished(!schedule.isPublished, weekStart)}
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
