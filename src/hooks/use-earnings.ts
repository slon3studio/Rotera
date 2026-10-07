import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { MonthlySummary, ShiftLog } from '@/types';

/**
 * Monthly hours, the worker's own hourly rate, and their record of shifts
 * actually worked.
 *
 * All of it is private to the worker: the manager never reads `shift_logs`, and
 * nothing here feeds payroll. That is why tips sit in the same table instead of
 * needing their own the way the rate does.
 */
export function useEarnings() {
  const [months, setMonths] = useState<MonthlySummary[]>([]);
  const [logs, setLogs] = useState<ShiftLog[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (workerId: string) => {
    setLoading(true);
    setError(null);

    // Seeding first: the summary is only right once logs exist for shifts that
    // have already happened.
    await supabase.rpc('sync_shift_logs');

    const [monthsResult, logsResult, ratesResult] = await Promise.all([
      supabase
        .from('worker_monthly_summary')
        .select('worker_id, month, planned_hours, actual_hours, tips, shift_count')
        .eq('worker_id', workerId)
        .order('month', { ascending: false }),
      supabase
        .from('shift_logs')
        .select('id, shift_id, work_date, clock_in, clock_out, tips_earned, notes')
        .order('work_date', { ascending: false })
        .limit(40),
      // RLS restricts this to the caller's own row, so an empty result simply
      // means no rate has been set yet.
      supabase.from('worker_rates').select('hourly_rate').limit(1),
    ]);

    setLoading(false);

    if (monthsResult.error) {
      setError(monthsResult.error.message);
      return;
    }
    setMonths((monthsResult.data ?? []) as MonthlySummary[]);
    setLogs((logsResult.data ?? []) as ShiftLog[]);
    setHourlyRate(
      ((ratesResult.data ?? [])[0] as { hourly_rate: number } | undefined)?.hourly_rate ?? null,
    );
  }, []);

  const saveRate = useCallback(
    async (rate: number, workerId: string) => {
      setSaving(true);
      setError(null);
      setNotice(null);
      const { error: rpcError } = await supabase.rpc('set_hourly_rate', { p_rate: rate });
      setSaving(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setHourlyRate(rate);
      setNotice('Urna postavka je shranjena.');
      await load(workerId);
    },
    [load],
  );

  const updateLog = useCallback(
    async (
      id: string,
      clockIn: string,
      clockOut: string,
      tips: number | null,
      notes: string,
      workerId: string,
    ) => {
      setSaving(true);
      setError(null);
      setNotice(null);
      const { error: updateError } = await supabase
        .from('shift_logs')
        .update({
          clock_in: clockIn,
          clock_out: clockOut,
          tips_earned: tips,
          notes: notes.trim() || null,
        })
        .eq('id', id);
      setSaving(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      setNotice('Shranjeno.');
      await load(workerId);
    },
    [load],
  );

  return {
    months,
    logs,
    hourlyRate,
    loading,
    saving,
    error,
    notice,
    load,
    saveRate,
    updateLog,
    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
  };
}

export type EarningsHook = ReturnType<typeof useEarnings>;
