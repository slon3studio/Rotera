import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { ALL_DAYS, isoString } from '@/lib/week';
import type { AvailabilityEntry, DaySelection, Position, ShiftSlot } from '@/types';
import { preferenceAllowsPosition, preferenceCovers } from '@/types';

/**
 * Wishes. Shared by the worker's editor and the manager's grid — they differ
 * only in which rows RLS lets them read.
 */
export function useAvailability() {
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('positions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setPositions((data ?? []) as Position[]);
  }, []);

  /** No worker filter and no org filter — RLS decides what comes back. */
  const loadWeek = useCallback(async (weekStart: Date) => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('availability_preferences')
      .select('id, worker_id, week_start_date, day_of_week, preference, position_id')
      .eq('week_start_date', isoString(weekStart));
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setEntries((data ?? []) as AvailabilityEntry[]);
  }, []);

  const save = useCallback(
    async (weekStart: Date, selections: Record<number, DaySelection>) => {
      setSaving(true);
      setError(null);
      setNotice(null);

      const { error: rpcError } = await supabase.rpc('save_availability', {
        p_week_start: isoString(weekStart),
        p_entries: ALL_DAYS.map((day) => {
          const selection = selections[day] ?? { preference: 'off', positionId: null };
          return {
            day_of_week: day,
            preference: selection.preference,
            position_id: preferenceAllowsPosition(selection.preference)
              ? selection.positionId
              : null,
          };
        }),
      });
      setSaving(false);

      if (rpcError) {
        setError(rpcError.message);
        return false;
      }
      setNotice('Razpoložljivost je shranjena.');
      await loadWeek(weekStart);
      return true;
    },
    [loadWeek],
  );

  /** The given worker's own entries, keyed by ISO weekday, ready to edit. */
  const selectionsFor = useCallback(
    (workerId: string) => {
      const result: Record<number, DaySelection> = {};
      entries
        .filter((entry) => entry.worker_id === workerId)
        .forEach((entry) => {
          result[entry.day_of_week] = {
            preference: entry.preference,
            positionId: entry.position_id,
          };
        });
      return result;
    },
    [entries],
  );

  return {
    entries,
    positions,
    loading,
    saving,
    error,
    notice,
    loadPositions,
    loadWeek,
    save,
    selectionsFor,
    hasSubmitted: (workerId: string) => entries.some((e) => e.worker_id === workerId),
    /** Everyone available for one slot on one day, for the manager's grid. */
    availableFor: (day: number, slot: ShiftSlot) =>
      entries.filter((e) => e.day_of_week === day && preferenceCovers(e.preference, slot)),
    positionOf: (id: string | null) => (id ? positions.find((p) => p.id === id) ?? null : null),
    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type AvailabilityHook = ReturnType<typeof useAvailability>;
