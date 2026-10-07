-- ============================================================================
-- Rotaly — Migration 0012: the worker's own record of hours worked
--
-- `shifts` is the plan. `shift_logs` is what actually happened, and it belongs
-- to the worker alone: nobody approves it, the manager never reads it, and it
-- does not feed payroll. It exists so a worker can keep their own count.
--
-- That single decision removes a lot of machinery. No approval status, no
-- deviation report, and — because the whole row is private — tips can sit in
-- the same table instead of needing their own like `worker_rates` did.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create table if not exists public.shift_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  worker_id        uuid not null references public.profiles(id) on delete cascade,

  -- NULL when the worker came in on a day they were not scheduled. Keeping the
  -- link where it exists is what lets the app show plan next to actual.
  shift_id         uuid references public.shifts(id) on delete set null,

  -- A real calendar date, not week + day: a log can exist with no shift, and
  -- then there is no week to hang it off.
  work_date        date not null,

  clock_in         time not null,
  clock_out        time not null,

  tips_earned      numeric(8, 2) check (tips_earned is null or tips_earned >= 0),
  notes            text check (notes is null or length(notes) <= 500),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- hours_worked is deliberately NOT a column. A stored total drifts away from
-- the times it came from the first time someone edits one and not the other.
-- It is computed in the view below.

create index if not exists shift_logs_worker_date_idx
  on public.shift_logs (worker_id, work_date);

-- One log per planned shift. Logs with no shift are unconstrained, since a
-- worker can legitimately record two unplanned stints on one day.
create unique index if not exists shift_logs_one_per_shift
  on public.shift_logs (worker_id, shift_id)
  where shift_id is not null;

-- ----------------------------------------------------------------------------
-- The client sends neither worker_id nor organization_id.
-- ----------------------------------------------------------------------------
create or replace function public.shift_logs_set_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.worker_id := auth.uid();
  new.organization_id := public.current_org_id();

  if new.worker_id is null or new.organization_id is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  -- A log may only point at your own shift, in your own restaurant.
  if new.shift_id is not null and not exists (
    select 1 from public.shifts s
    where s.id = new.shift_id
      and s.organization_id = new.organization_id
      and s.assigned_worker_id = new.worker_id
  ) then
    raise exception 'Ta smena ni tvoja.' using errcode = '42501';
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shift_logs_before_insert on public.shift_logs;
create trigger shift_logs_before_insert
  before insert on public.shift_logs
  for each row execute function public.shift_logs_set_owner();

drop trigger if exists shift_logs_before_update on public.shift_logs;
create trigger shift_logs_before_update
  before update on public.shift_logs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- sync_shift_logs() — seed logs for shifts that have already happened
--
-- Not a cron job and not a trigger on publish: publishing happens before the
-- week does, and seeding then would create logs for shifts nobody has worked
-- yet. The app calls this when the worker opens their hours; it is idempotent,
-- so calling it twice costs nothing.
--
-- Pre-filled with the planned times, which is right most weeks — the worker
-- only edits the exceptions.
-- ----------------------------------------------------------------------------
create or replace function public.sync_shift_logs()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  org     uuid;
  created int := 0;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  insert into public.shift_logs
    (organization_id, worker_id, shift_id, work_date, clock_in, clock_out)
  select
    org,
    uid,
    s.id,
    (s.week_start_date + (s.day_of_week - 1)),
    s.start_time,
    s.end_time
  from public.shifts s
  join public.schedules sc
    on  sc.organization_id = s.organization_id
    and sc.week_start_date = s.week_start_date
    and sc.status = 'published'
  where s.organization_id = org
    and s.assigned_worker_id = uid
    -- Only shifts that are over. A shift ending at midnight belongs to the
    -- day it started, so the cutoff is the day after.
    and (s.week_start_date + (s.day_of_week - 1)) < current_date
    and not exists (
      select 1 from public.shift_logs l
      where l.worker_id = uid and l.shift_id = s.id
    );

  get diagnostics created = row_count;
  return created;
end;
$$;

revoke all on function public.sync_shift_logs() from public;
grant execute on function public.sync_shift_logs() to authenticated;

-- ----------------------------------------------------------------------------
-- Monthly summary: planned next to actual, plus tips
--
-- `security_invoker` means the logs half is scoped by RLS to the caller, so a
-- worker sees their own actual hours. Rows for coworkers fall back to planned
-- hours with no tips, which is correct — their logs are private.
-- ----------------------------------------------------------------------------
drop view if exists public.worker_monthly_summary;

create view public.worker_monthly_summary
with (security_invoker = true)
as
with entries as (
  -- Planned shifts, overlaid with the caller's own log where one exists.
  select
    s.assigned_worker_id                                   as worker_id,
    coalesce(l.work_date, s.week_start_date + (s.day_of_week - 1)) as on_date,
    s.start_time                                           as planned_in,
    s.end_time                                             as planned_out,
    coalesce(l.clock_in,  s.start_time)                    as actual_in,
    coalesce(l.clock_out, s.end_time)                      as actual_out,
    l.tips_earned
  from public.shifts s
  join public.schedules sc
    on  sc.organization_id = s.organization_id
    and sc.week_start_date = s.week_start_date
    and sc.status = 'published'
  left join public.shift_logs l on l.shift_id = s.id
  where s.assigned_worker_id is not null

  union all

  -- Worked without being on the schedule.
  select
    l.worker_id,
    l.work_date,
    null::time, null::time,
    l.clock_in, l.clock_out,
    l.tips_earned
  from public.shift_logs l
  where l.shift_id is null
),
spans as (
  select
    worker_id,
    date_trunc('month', on_date)::date as month,
    case
      when planned_in is null then null
      when planned_out <= planned_in
        then (planned_out - planned_in) + interval '24 hours'
      else (planned_out - planned_in)
    end as planned_span,
    case
      when actual_out <= actual_in
        then (actual_out - actual_in) + interval '24 hours'
      else (actual_out - actual_in)
    end as actual_span,
    tips_earned
  from entries
)
select
  worker_id,
  month,
  round(coalesce(sum(extract(epoch from planned_span)), 0)::numeric / 3600, 2)::double precision as planned_hours,
  round(sum(extract(epoch from actual_span))::numeric / 3600, 2)::double precision               as actual_hours,
  round(coalesce(sum(tips_earned), 0), 2)::double precision                                      as tips,
  count(*)::int                                                                                  as shift_count
from spans
group by 1, 2;

grant select on public.worker_monthly_summary to authenticated;

-- ----------------------------------------------------------------------------
-- RLS — the whole row is private to the worker it belongs to
-- ----------------------------------------------------------------------------
alter table public.shift_logs enable row level security;

revoke all on public.shift_logs from anon, authenticated;

grant select on public.shift_logs to authenticated;
grant insert on public.shift_logs to authenticated;
grant delete on public.shift_logs to authenticated;
grant update (shift_id, work_date, clock_in, clock_out, tips_earned, notes)
  on public.shift_logs to authenticated;

drop policy if exists "shift_logs_own_select" on public.shift_logs;
create policy "shift_logs_own_select"
  on public.shift_logs for select to authenticated
  using (worker_id = auth.uid());

drop policy if exists "shift_logs_own_insert" on public.shift_logs;
create policy "shift_logs_own_insert"
  on public.shift_logs for insert to authenticated
  with check (worker_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "shift_logs_own_update" on public.shift_logs;
create policy "shift_logs_own_update"
  on public.shift_logs for update to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());

drop policy if exists "shift_logs_own_delete" on public.shift_logs;
create policy "shift_logs_own_delete"
  on public.shift_logs for delete to authenticated
  using (worker_id = auth.uid());

notify pgrst, 'reload schema';
