import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { CoverRequest, Profile } from '@/types';
import { isCoverActive } from '@/types';

/**
 * Cover requests: ask to be replaced, offer to take someone's shift, and the
 * manager's decision.
 *
 * One instance lives in the tabs layout and is handed down, so the badge, the
 * red cells on the schedule and the Menjave list all read the same data.
 */
export function useCover() {
  const [requests, setRequests] = useState<CoverRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('cover_requests')
      .select('id, shift_id, requested_by, status, claimed_by, note')
      .order('created_at', { ascending: false });
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRequests((data ?? []) as CoverRequest[]);
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

  const active = requests.filter((r) => isCoverActive(r.status));

  return {
    requests,
    active,
    shiftIdsAwaitingCover: new Set(active.map((r) => r.shift_id)),
    loading,
    working,
    error,
    notice,
    load,

    requestFor: (shiftId: string) => active.find((r) => r.shift_id === shiftId) ?? null,

    /**
     * What the badge counts, per role. A worker is nudged about shifts they
     * could pick up; a manager about decisions waiting on them. Counting
     * "everything active" for both would make the badge permanent and
     * therefore ignorable.
     */
    badgeCount: (profile: Profile) =>
      profile.role === 'manager'
        ? requests.filter((r) => r.status === 'claimed').length
        : requests.filter((r) => r.status === 'open' && r.requested_by !== profile.id).length,

    openForOthers: (workerId: string) =>
      requests.filter((r) => r.status === 'open' && r.requested_by !== workerId),

    mine: (workerId: string) =>
      requests.filter(
        (r) => (r.requested_by === workerId || r.claimed_by === workerId) && isCoverActive(r.status),
      ),

    requestCover: (shiftId: string, note: string | null) =>
      run(
        () =>
          supabase.rpc('request_cover', {
            p_shift_id: shiftId,
            p_note: note?.trim() || null,
          }),
        'Prošnja za menjavo je oddana.',
      ),
    cancel: (id: string) =>
      run(() => supabase.rpc('cancel_cover', { p_request_id: id }), 'Prošnja je preklicana.'),
    claim: (id: string) =>
      run(
        () => supabase.rpc('claim_cover', { p_request_id: id }),
        'Prevzeto. Čaka še potrditev vodje.',
      ),
    unclaim: (id: string) =>
      run(() => supabase.rpc('unclaim_cover', { p_request_id: id }), 'Umaknjeno.'),
    resolve: (id: string, approve: boolean) =>
      run(
        () => supabase.rpc('resolve_cover', { p_request_id: id, p_approve: approve }),
        approve ? 'Menjava je odobrena.' : 'Menjava je zavrnjena.',
      ),

    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type CoverHook = ReturnType<typeof useCover>;
