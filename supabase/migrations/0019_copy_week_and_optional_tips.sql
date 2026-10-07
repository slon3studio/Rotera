-- ----------------------------------------------------------------------------
-- 0019 — copy last week's schedule, and tips only where they apply
--
-- Two separate things, one migration because both are small:
--
-- 1. Most places run almost the same week every week. Building it again from
--    wishes, or by hand, is busywork. `copy_previous_week` puts last week's
--    shifts into the week on screen — same day, slot, times, position, duty
--    and person — and the manager edits from there.
--
--    Copied rows are `origin = 'manual'`: the manager chose to copy them, so a
--    later "Sestavi iz želja" must not clear them as if it had made them
--    itself. It only ever adds; nothing already in the target week is touched,
--    and running it twice does not double anything.
--
--    Skipped, not failed: people who have left since (the shift trigger from
--    0013 would refuse them anyway), slots switched off since (0017's trigger
--    would too), and rows the target week already has. One stale row should
--    not stop the other forty from being copied, so the RPC filters instead of
--    letting the whole copy abort, and reports how many it left out.
--
-- 2. Tips are a restaurant thing. A care home or a warehouse has no use for a
--    "Napitnina" field on every logged shift. `organizations.tracks_tips`
--    lets the manager switch it off. Default true, so every organization that
--    already exists keeps exactly what it has. Switching it off only hides the
--    field in the app — tips already written stay in `shift_logs`, so turning
--    it back on loses nothing.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. copy_previous_week
--
-- SECURITY DEFINER because it reads and writes `shifts` for the whole week in
-- one statement and needs to see `profiles.is_active` and the slot settings
-- without depending on the caller's policies. It checks org and role itself,
-- first, like every other schedule RPC. The insert still goes through the
-- `shifts` triggers, so `organization_id` is set from auth.uid() there as
-- well, and the reference checks from 0013 still run.
-- ----------------------------------------------------------------------------
create or replace function public.copy_previous_week(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  org     uuid;
  source  date;
  total   int := 0;
  copied  int := 0;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene organizacije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko kopira urnik.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  source := p_week_start - 7;

  select count(*) into total
  from public.shifts
  where organization_id = org
    and week_start_date = source;

  if total = 0 then
    raise exception 'Prejšnji teden nima nobene smene za kopiranje.' using errcode = 'P0002';
  end if;

  insert into public.schedules (organization_id, week_start_date)
  values (org, p_week_start)
  on conflict (organization_id, week_start_date) do nothing;

  insert into public.shifts (
    organization_id, week_start_date, day_of_week, slot,
    start_time, end_time, position_id, duty_id, assigned_worker_id,
    created_by, origin
  )
  select
    org, p_week_start, s.day_of_week, s.slot,
    s.start_time, s.end_time, s.position_id, s.duty_id, s.assigned_worker_id,
    uid, 'manual'
  from public.shifts s
  where s.organization_id = org
    and s.week_start_date = source
    and public.slot_is_enabled(org, s.slot::text)
    -- Someone who has left is not put back on the schedule.
    and (
      s.assigned_worker_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = s.assigned_worker_id
          and p.organization_id = org
          and p.is_active
      )
    )
    -- An open slot (no one assigned) is not covered by the unique key, so the
    -- "already there" check for it has to be spelled out.
    and not exists (
      select 1 from public.shifts t
      where t.organization_id = org
        and t.week_start_date = p_week_start
        and t.day_of_week     = s.day_of_week
        and t.slot            = s.slot
        and (
          t.assigned_worker_id = s.assigned_worker_id
          or (
            t.assigned_worker_id is null
            and s.assigned_worker_id is null
            and t.start_time  = s.start_time
            and t.position_id is not distinct from s.position_id
          )
        )
    )
  on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do nothing;

  get diagnostics copied = row_count;

  return jsonb_build_object('copied', copied, 'skipped', total - copied);
end;
$$;

revoke all on function public.copy_previous_week(date) from public;
grant execute on function public.copy_previous_week(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. tracks_tips
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists tracks_tips boolean not null default true;

-- Same column-by-column style as 0017: the 0001 policy limits the UPDATE to a
-- manager of their own organization, this adds the one new column to what
-- they may write. Every member can already read the row, which is how a
-- worker's app knows whether to show the field.
grant update (tracks_tips) on public.organizations to authenticated;

notify pgrst, 'reload schema';
