import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

/**
 * The people in the signed-in user's organization.
 *
 * The query carries no `organization_id` filter on purpose — RLS narrows it.
 * If another organization's staff ever appears, isolation has regressed.
 */
export function useTeam() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rotatedJoinCode, setRotatedJoinCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setMembers((data ?? []) as Profile[]);
  }, []);

  const setActive = useCallback(
    async (active: boolean, workerId: string) => {
      setWorking(true);
      setError(null);
      setNotice(null);
      const { error: rpcError } = await supabase.rpc('set_member_active', {
        p_worker_id: workerId,
        p_active: active,
      });
      setWorking(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setNotice(active ? 'Znova je v ekipi.' : 'Odstranjen iz ekipe.');
      await load();
    },
    [load],
  );

  const rotateJoinCode = useCallback(async () => {
    setWorking(true);
    setError(null);
    setNotice(null);
    const { data, error: rpcError } = await supabase.rpc('rotate_join_code');
    setWorking(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setRotatedJoinCode(data as string);
    setNotice(`Nova koda: ${data}. Stara ne velja več.`);
  }, []);

  const nameOf = useCallback(
    (workerId: string) => members.find((m) => m.id === workerId)?.full_name ?? 'Neznan sodelavec',
    [members],
  );

  /** People who still work here. Anything that schedules or chases uses this. */
  const active = members.filter((m) => m.is_active);

  return {
    members,
    active,
    workers: active.filter((m) => m.role !== 'manager'),
    inactive: members.filter((m) => !m.is_active),
    loading,
    working,
    error,
    notice,
    rotatedJoinCode,
    load,
    setActive,
    rotateJoinCode,
    nameOf,
    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type TeamHook = ReturnType<typeof useTeam>;
