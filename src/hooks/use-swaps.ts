import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile, ShiftSwap } from '@/types';
import { isSwapActive } from '@/types';

/**
 * Rotations: two people trade shifts, both still work.
 *
 * Deliberately a sibling of `useCover` rather than part of it. A cover request
 * is one shift and one claim; a rotation is two shifts and two consents, and
 * folding them together made every list and badge ask "which kind is this?"
 * before it could say anything useful.
 *
 * One instance lives in the tabs layout, so the badge, the markers on the
 * schedule and the Menjave list read the same rows.
 */
export function useSwaps() {
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('shift_swaps')
      .select(
        'id, requester_id, requester_shift_id, target_id, target_shift_id, status, note',
      )
      .order('created_at', { ascending: false });
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setSwaps((data ?? []) as ShiftSwap[]);
  }, []);

  /** Returns whether it worked, so a sheet can stay open and show the reason
   *  instead of closing on a failure nobody ever sees. */
  const run = useCallback(
    async (
      action: () => PromiseLike<{ error: { message: string } | null }>,
      success: string,
    ) => {
      setWorking(true);
      setError(null);
      setNotice(null);
      const { error: actionError } = await action();
      setWorking(false);

      if (actionError) {
        setError(actionError.message);
        return false;
      }
      setNotice(success);
      await load();
      return true;
    },
    [load],
  );

  const active = swaps.filter((s) => isSwapActive(s.status));

  return {
    swaps,
    active,

    /** Both sides of every live rotation, for the markers on the schedule. */
    shiftIdsInSwap: new Set(active.flatMap((s) => [s.requester_shift_id, s.target_shift_id])),

    loading,
    working,
    error,
    notice,
    load,

    /** The live rotation either of whose shifts is this one, if any. */
    swapForShift: (shiftId: string) =>
      active.find((s) => s.requester_shift_id === shiftId || s.target_shift_id === shiftId) ??
      null,

    /**
     * Whose turn it is. A worker is nudged when someone is waiting on their
     * yes; a manager when both workers have agreed. Counting everything live
     * for both would make the badge permanent and therefore ignorable.
     */
    badgeCount: (profile: Profile) =>
      profile.role === 'manager'
        ? swaps.filter((s) => s.status === 'accepted').length
        : swaps.filter((s) => s.status === 'pending' && s.target_id === profile.id).length,

    /** Rotations waiting on this worker's answer. */
    incoming: (workerId: string) =>
      swaps.filter((s) => s.status === 'pending' && s.target_id === workerId),

    /** Anything live that this worker is part of, either side. */
    mine: (workerId: string) =>
      active.filter((s) => s.requester_id === workerId || s.target_id === workerId),

    propose: (myShiftId: string, theirShiftId: string, note: string | null) =>
      run(
        () =>
          supabase.rpc('propose_swap', {
            p_my_shift_id: myShiftId,
            p_their_shift_id: theirShiftId,
            p_note: note?.trim() || null,
          }),
        'Rotacija je predlagana. Čaka se sodelavec.',
      ),
    respond: (id: string, accept: boolean) =>
      run(
        () => supabase.rpc('respond_swap', { p_swap_id: id, p_accept: accept }),
        accept ? 'Sprejeto. Čaka še potrditev vodje.' : 'Zavrnjeno.',
      ),
    cancel: (id: string) =>
      run(() => supabase.rpc('cancel_swap', { p_swap_id: id }), 'Rotacija je preklicana.'),
    resolve: (id: string, approve: boolean) =>
      run(
        () => supabase.rpc('resolve_swap', { p_swap_id: id, p_approve: approve }),
        approve ? 'Rotacija je odobrena.' : 'Rotacija je zavrnjena.',
      ),

    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type SwapsHook = ReturnType<typeof useSwaps>;
