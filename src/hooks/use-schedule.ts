import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { minutes } from '@/lib/time';
import { ALL_DAYS, isoString } from '@/lib/week';
import type {
  Duty,
  Organization,
  Position,
  ScheduleConflict,
  ScheduleWeek,
  Shift,
  ShiftSlot,
} from '@/types';

const SHIFT_COLUMNS =
  'id, week_start_date, day_of_week, slot, start_time, end_time, position_id, duty_id, assigned_worker_id';

/**
 * Shifts, the week's publish state, the lookup tables, and the conflicts view.
 *
 * Manager edits are plain UPDATEs against `shifts` — a drag-and-drop is one row
 * update. `organization_id` is set by a database trigger, never sent from here,
 * and a trigger rejects any reference to another organization's worker, position
 * or duty.
 */
export function useSchedule() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [week, setWeek] = useState<ScheduleWeek | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLookups = useCallback(async () => {
    const [positionsResult, dutiesResult] = await Promise.all([
      supabase
        .from('positions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('duties')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    if (positionsResult.error || dutiesResult.error) {
      setError((positionsResult.error ?? dutiesResult.error)!.message);
      return;
    }
    setPositions((positionsResult.data ?? []) as Position[]);
    setDuties((dutiesResult.data ?? []) as Duty[]);
  }, []);

  /**
   * No organization filter — RLS scopes it. For a worker, RLS also hides the
   * whole week until it is published, so an empty result is the normal "not
   * published yet" state rather than an error.
   */
  const loadWeek = useCallback(async (weekStart: Date) => {
    const iso = isoString(weekStart);
    setLoading(true);
    setError(null);

    const [shiftsResult, weeksResult, conflictsResult] = await Promise.all([
      supabase.from('shifts').select(SHIFT_COLUMNS).eq('week_start_date', iso),
      supabase.from('schedules').select('week_start_date, status').eq('week_start_date', iso),
      supabase
        .from('schedule_conflicts')
        .select('worker_id, shift_id, kind')
        .eq('week_start_date', iso),
    ]);

    setLoading(false);

    if (shiftsResult.error) {
      setError(shiftsResult.error.message);
      return;
    }
    setShifts((shiftsResult.data ?? []) as Shift[]);
    setWeek(((weeksResult.data ?? [])[0] as ScheduleWeek | undefined) ?? null);
    setConflicts((conflictsResult.data ?? []) as ScheduleConflict[]);
  }, []);

  /** A cover request can point at any week, so the Menjave screen needs a window. */
  const loadWeeks = useCallback(async (weeks: Date[]) => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('shifts')
      .select(SHIFT_COLUMNS)
      .in('week_start_date', weeks.map(isoString));
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setShifts((data ?? []) as Shift[]);
  }, []);

  const act = useCallback(
    async (
      action: () => PromiseLike<{ error: { message: string } | null }>,
      weekStart: Date,
      success?: string,
    ) => {
      setError(null);
      setNotice(null);
      const { error: actionError } = await action();

      if (actionError) {
        setError(
          actionError.message.toLowerCase().includes('duplicate key')
            ? 'Ta oseba je že v tej smeni.'
            : actionError.message,
        );
        return;
      }
      if (success) setNotice(success);
      await loadWeek(weekStart);
    },
    [loadWeek],
  );

  /**
   * Refreshes the week from the wishes as they stand now: adds what is missing
   * and clears its own stale rows. Shifts the manager placed or edited, and
   * anything tied to a cover request, are left alone — the database decides
   * that from `shifts.origin`, not the app.
   */
  const rebuild = useCallback(
    async (weekStart: Date) => {
      setWorking(true);
      setError(null);
      setNotice(null);

      const { data, error: rpcError } = await supabase.rpc('rebuild_schedule', {
        p_week_start: isoString(weekStart),
      });
      setWorking(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      const result = (data ?? {}) as { added?: number; removed?: number };
      const added = result.added ?? 0;
      const removed = result.removed ?? 0;

      setNotice(
        added === 0 && removed === 0
          ? 'Urnik je že usklajen z željami.'
          : removed === 0
            ? `Dodanih vnosov: ${added}.`
            : added === 0
              ? `Odstranjenih vnosov: ${removed}.`
              : `Dodanih: ${added}, odstranjenih: ${removed}.`,
      );
      await loadWeek(weekStart);
    },
    [loadWeek],
  );

  const setPublished = useCallback(
    async (published: boolean, weekStart: Date) => {
      setWorking(true);
      setError(null);
      setNotice(null);
      const { error: rpcError } = await supabase.rpc('publish_week', {
        p_week_start: isoString(weekStart),
        p_published: published,
      });
      setWorking(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setNotice(
        published ? 'Urnik je objavljen. Ekipa ga zdaj vidi.' : 'Objava je preklicana.',
      );
      await loadWeek(weekStart);
    },
    [loadWeek],
  );

  const shiftsFor = useCallback(
    (day: number, slot: ShiftSlot) =>
      shifts
        .filter((s) => s.day_of_week === day && s.slot === slot)
        .sort((a, b) => {
          const left = minutes(a.start_time);
          const right = minutes(b.start_time);
          return left === right ? a.id.localeCompare(b.id) : left - right;
        }),
    [shifts],
  );

  const positionOf = useCallback(
    (id: string | null) => (id ? positions.find((p) => p.id === id) ?? null : null),
    [positions],
  );

  const dutyNameOf = useCallback(
    (id: string | null) => (id ? duties.find((d) => d.id === id)?.name ?? null : null),
    [duties],
  );

  /**
   * Only worth showing a time on a cell when it differs from the slot default —
   * repeating "8:30–16:00" everywhere would bury the exceptions, which are the
   * only times that actually matter.
   */
  const timeNoteOf = useCallback((shift: Shift, organization: Organization) => {
    const defaultStart =
      shift.slot === 'morning' ? organization.morning_start : organization.afternoon_start;
    const defaultEnd =
      shift.slot === 'morning' ? organization.morning_end : organization.afternoon_end;

    const startDiffers = minutes(shift.start_time) !== minutes(defaultStart);
    const endDiffers = minutes(shift.end_time, true) !== minutes(defaultEnd, true);

    if (!startDiffers && !endDiffers) return null;
    if (startDiffers && !endDiffers) return `od ${shift.start_time.slice(0, 5)}`;
    if (!startDiffers && endDiffers) return `do ${shift.end_time.slice(0, 5)}`;
    return `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)}`;
  }, []);

  /** Tallest column in a slot, so every day column lines up on the same rows. */
  const rowCount = useCallback(
    (slot: ShiftSlot, minimum: number) =>
      Math.max(minimum, ...ALL_DAYS.map((day) => shiftsFor(day, slot).length)),
    [shiftsFor],
  );

  return {
    shifts,
    positions,
    duties,
    week,
    conflicts,
    conflictShiftIds: new Set(conflicts.map((c) => c.shift_id)),
    isPublished: week?.status === 'published',
    loading,
    working,
    error,
    notice,

    loadLookups,
    loadWeek,
    loadWeeks,
    rebuild,
    setPublished,

    shiftsFor,
    shiftById: (id: string) => shifts.find((s) => s.id === id) ?? null,
    conflictFor: (shiftId: string) => conflicts.find((c) => c.shift_id === shiftId) ?? null,
    positionOf,
    dutyNameOf,
    timeNoteOf,
    rowCount,

    // Every client-side write stamps origin = "manual". That is what tells a
    // later rebuild to leave the row alone.
    move: (shiftId: string, day: number, slot: ShiftSlot, organization: Organization, weekStart: Date) =>
      act(
        () =>
          supabase
            .from('shifts')
            .update({
              day_of_week: day,
              slot,
              start_time:
                slot === 'morning' ? organization.morning_start : organization.afternoon_start,
              end_time: slot === 'morning' ? organization.morning_end : organization.afternoon_end,
              origin: 'manual',
            })
            .eq('id', shiftId),
        weekStart,
      ),

    updateShift: (
      shiftId: string,
      startTime: string,
      endTime: string,
      positionId: string | null,
      dutyId: string | null,
      weekStart: Date,
    ) =>
      act(
        () =>
          supabase
            .from('shifts')
            .update({
              start_time: startTime,
              end_time: endTime,
              position_id: positionId,
              duty_id: dutyId,
              origin: 'manual',
            })
            .eq('id', shiftId),
        weekStart,
      ),

    addShift: (
      workerId: string,
      day: number,
      slot: ShiftSlot,
      positionId: string | null,
      dutyId: string | null,
      organization: Organization,
      weekStart: Date,
    ) =>
      act(
        () =>
          supabase.from('shifts').insert({
            week_start_date: isoString(weekStart),
            day_of_week: day,
            slot,
            start_time:
              slot === 'morning' ? organization.morning_start : organization.afternoon_start,
            end_time: slot === 'morning' ? organization.morning_end : organization.afternoon_end,
            position_id: positionId,
            duty_id: dutyId,
            assigned_worker_id: workerId,
            origin: 'manual',
          }),
        weekStart,
      ),

    deleteShift: (shiftId: string, weekStart: Date) =>
      act(() => supabase.from('shifts').delete().eq('id', shiftId), weekStart),

    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type ScheduleHook = ReturnType<typeof useSchedule>;
