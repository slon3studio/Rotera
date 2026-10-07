-- ============================================================================
-- Rotaly — Migration 0005: generate_schedule() picks up positions on re-run
--
-- Bug: the original used ON CONFLICT DO NOTHING, so a second "Sestavi iz
-- želja" was a complete no-op for anyone already on the schedule. If a worker
-- chose Šank/Strežba *after* the manager first generated the week, the shift
-- kept its NULL position and nothing would ever fill it in.
--
-- Fix: on conflict, fill the position in only when the shift does not already
-- have one. `coalesce(shifts.position_id, excluded.position_id)` keeps a
-- manager's manual choice — re-generating must never silently undo an edit.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create or replace function public.generate_schedule(p_week_start date)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid        uuid := auth.uid();
  org        uuid;
  created    int := 0;
  v_inserted boolean;
  times      record;
  a          record;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko sestavi urnik.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  select morning_start, morning_end, afternoon_start, afternoon_end
    into times
  from public.organizations
  where id = org;

  insert into public.schedules (organization_id, week_start_date)
  values (org, p_week_start)
  on conflict (organization_id, week_start_date) do nothing;

  for a in
    select ap.worker_id, ap.day_of_week, ap.preference, ap.position_id
    from public.availability_preferences ap
    where ap.organization_id = org
      and ap.week_start_date = p_week_start
      and ap.preference <> 'off'
    order by ap.day_of_week
  loop
    if a.preference in ('morning', 'any') then
      insert into public.shifts (
        organization_id, week_start_date, day_of_week, slot,
        start_time, end_time, position_id, assigned_worker_id, created_by
      ) values (
        org, p_week_start, a.day_of_week, 'morning',
        times.morning_start, times.morning_end, a.position_id, a.worker_id, uid
      )
      on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do update
        set position_id = coalesce(public.shifts.position_id, excluded.position_id)
      -- xmax = 0 is true only for a genuine insert, so the count stays honest
      -- now that a conflict updates instead of doing nothing.
      returning (xmax = 0) into v_inserted;

      if coalesce(v_inserted, false) then created := created + 1; end if;
    end if;

    if a.preference in ('afternoon', 'any') then
      insert into public.shifts (
        organization_id, week_start_date, day_of_week, slot,
        start_time, end_time, position_id, assigned_worker_id, created_by
      ) values (
        org, p_week_start, a.day_of_week, 'afternoon',
        times.afternoon_start, times.afternoon_end, a.position_id, a.worker_id, uid
      )
      on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do update
        set position_id = coalesce(public.shifts.position_id, excluded.position_id)
      returning (xmax = 0) into v_inserted;

      if coalesce(v_inserted, false) then created := created + 1; end if;
    end if;
  end loop;

  return created;
end;
$$;

revoke all on function public.generate_schedule(date) from public;
grant execute on function public.generate_schedule(date) to authenticated;

-- ----------------------------------------------------------------------------
-- One-off repair for shifts already created without a position.
--
-- Fills in the position from the matching wish, but only where the shift has
-- none — an existing choice is left alone.
-- ----------------------------------------------------------------------------
update public.shifts s
set position_id = ap.position_id
from public.availability_preferences ap
where ap.organization_id  = s.organization_id
  and ap.worker_id        = s.assigned_worker_id
  and ap.week_start_date  = s.week_start_date
  and ap.day_of_week      = s.day_of_week
  and ap.position_id is not null
  and s.position_id is null;
