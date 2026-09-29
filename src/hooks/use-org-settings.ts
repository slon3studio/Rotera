import { useCallback, useState } from 'react';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import type { ShiftSlot } from '@/types';

export type ScheduleSettings = {
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  uses_morning: boolean;
  uses_afternoon: boolean;
};

/**
 * The organization's own schedule rules: which halves of the day it runs and
 * when each one starts and ends.
 *
 * Writes straight to `organizations` rather than through an RPC. That is safe
 * here because the policy from 0001 already limits the update to a manager of
 * their own organization, and 0017 grants exactly these six columns and no
 * others — `join_code` in particular stays out of reach.
 *
 * The session carries the organization, so a successful save has to reload it:
 * the grids, the wishes screen and every new shift's default times all read
 * from there.
 */
export function useOrgSettings() {
  const { session, reload } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback(
    async (next: ScheduleSettings) => {
      if (!session) return false;

      if (!next.uses_morning && !next.uses_afternoon) {
        setError('Vsaj ena smena mora ostati vklopljena.');
        return false;
      }

      setSaving(true);
      setError(null);
      setNotice(null);

      const { error: updateError } = await supabase
        .from('organizations')
        .update(next)
        .eq('id', session.organization.id);

      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return false;
      }

      // Not optional: until the session is re-read, the app still schedules
      // against the old times.
      await reload();
      setSaving(false);
      setNotice('Nastavitve urnika so shranjene.');
      return true;
    },
    [session, reload],
  );

  /**
   * One switch, saved as soon as it is flipped — unlike the shift times there
   * is nothing to get half-right first. 0019 grants this column on its own.
   */
  const setTracksTips = useCallback(
    async (on: boolean) => {
      if (!session) return false;

      setSaving(true);
      setError(null);
      setNotice(null);

      const { error: updateError } = await supabase
        .from('organizations')
        .update({ tracks_tips: on })
        .eq('id', session.organization.id);

      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return false;
      }

      await reload();
      setSaving(false);
      setNotice(on ? 'Napitnine so vklopljene.' : 'Napitnine so izklopljene.');
      return true;
    },
    [session, reload],
  );

  return {
    saving,
    error,
    notice,
    save,
    setTracksTips,
    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

/** Human label for a slot, for the one place that needs it outside the grid. */
export const slotName: Record<ShiftSlot, string> = {
  morning: 'Dopoldanska',
  afternoon: 'Popoldanska',
};
