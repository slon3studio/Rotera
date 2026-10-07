-- ============================================================================
-- Rotaly — Migration 0004: Hours worked + hourly rate + pay
--
-- Adds:
--   worker_rates              each worker's own hourly rate, private to them
--   worker_monthly_hours      hours per worker per month, published weeks only
--   set_hourly_rate()         the only write path for a rate
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hourly rates
--
-- A separate table rather than a column on `profiles` for one reason: RLS is
-- per-row, not per-column. `profiles` is readable by everyone in the
-- restaurant so coworkers can see each other's names — and a wage column there
-- would be readable by all of them too. A separate table gets its own policy.
-- ----------------------------------------------------------------------------
create table if not exists public.worker_rates (
  worker_id        uuid primary key references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  hourly_rate      numeric(8, 2) not null check (hourly_rate >= 0 and hourly_rate <= 10000),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. set_hourly_rate()
--
-- Client sends only the number; worker and organization come from auth.uid().
-- ----------------------------------------------------------------------------
create or replace function public.set_hourly_rate(p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if p_rate is null or p_rate < 0 then
    raise exception 'Urna postavka mora biti pozitivno število.' using errcode = '22023';
  end if;

  if p_rate > 10000 then
    raise exception 'Urna postavka je previsoka.' using errcode = '22023';
  end if;

  insert into public.worker_rates (worker_id, organization_id, hourly_rate)
  values (uid, org, round(p_rate, 2))
  on conflict (worker_id) do update
    set hourly_rate = excluded.hourly_rate,
        organization_id = excluded.organization_id,
        updated_at = now();
end;
$$;

revoke all on function public.set_hourly_rate(numeric) from public;
grant execute on function public.set_hourly_rate(numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Monthly hours
--
-- Only published weeks count — an unpublished draft is not a promise of work.
--
-- Two details worth naming:
--
--   * A week can straddle two months (Monday 30 June runs into July), so hours
--     are attributed by the shift's real date, `week_start_date + (day - 1)`,
--     not by the week it belongs to.
--
--   * A shift ending at or before its start crosses midnight (16:00 → 00:00).
--     `end_time - start_time` gives an interval, which goes negative in that
--     case, so 24 hours are added back. Adding 24h to the `time` value itself
--     would silently wrap to the same time and compute zero.
-- ----------------------------------------------------------------------------
drop view if exists public.worker_monthly_hours;

create view public.worker_monthly_hours
with (security_invoker = true)
as
select
  s.assigned_worker_id                                            as worker_id,
  date_trunc('month', (s.week_start_date + (s.day_of_week - 1)))::date as month,
  round(sum(
    extract(epoch from (
      case
        when s.end_time <= s.start_time
          then (s.end_time - s.start_time) + interval '24 hours'
        else (s.end_time - s.start_time)
      end
    )) / 3600.0
  )::numeric, 2)::double precision                                as hours,
  count(*)::int                                                   as shift_count
from public.shifts s
join public.schedules sc
  on  sc.organization_id = s.organization_id
  and sc.week_start_date = s.week_start_date
  and sc.status = 'published'
where s.assigned_worker_id is not null
group by 1, 2;

grant select on public.worker_monthly_hours to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security
-- ----------------------------------------------------------------------------

alter table public.worker_rates enable row level security;

revoke all on public.worker_rates from anon, authenticated;
grant select on public.worker_rates to authenticated;

-- Your wage is yours. Not the whole restaurant's, not even the manager's for
-- now — labour-cost reporting can widen this deliberately when it is built.
drop policy if exists "worker_rates_select_self" on public.worker_rates;
create policy "worker_rates_select_self"
  on public.worker_rates for select to authenticated
  using (worker_id = auth.uid());

-- No INSERT/UPDATE policy: set_hourly_rate() is the only writer.
