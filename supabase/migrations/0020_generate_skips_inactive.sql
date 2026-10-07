-- ----------------------------------------------------------------------------
-- 0020 — "Sestavi iz želja" skips people who have left, again
--
-- 0013 made the generator skip wishes from deactivated members: a person taken
-- off the team keeps their wishes for weeks already submitted, and
-- `shifts_validate_references` (also 0013) refuses to place an inactive
-- worker. 0017 then rewrote `generate_schedule` from the 0011 body to add the
-- slot switches, and the `is_active` join fell out.
--
-- The result: if anyone removed from the team had a wish for the week, the
-- insert for them raises, the whole function aborts, and "Sestavi iz želja"
-- (and `rebuild_schedule`, which calls it) shows an error instead of a
-- schedule. Nothing is lost — the call rolls back — but the week cannot be
-- built until the manager deletes that person's wishes by hand, which the app
-- has no screen for.
--
-- Same body as 0017 plus the join back. The one error message it raises
-- about membership moves to the neutral wording while it is being replaced.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ----------------------------------------------------------------------------

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
    raise exception 'Uporabnik ni član nobene organizacije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko sestavi urnik.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  select morning_start, morning_end, afternoon_start, afternoon_end,
         uses_morning, uses_afternoon
    into times
  from public.organizations
  where id = org;

  insert into public.schedules (organization_id, week_start_date)
  values (org, p_week_start)
  on conflict (organization_id, week_start_date) do nothing;

  for a in
    select ap.worker_id, ap.day_of_week, ap.preference, ap.position_id
    from public.availability_preferences ap
    -- The line 0017 dropped. Without it one wish from someone who has left
    -- makes the shift trigger raise, and the whole generate fails.
    join public.profiles p on p.id = ap.worker_id and p.is_active
    where ap.organization_id = org
      and ap.week_start_date = p_week_start
      and ap.preference <> 'off'
    order by ap.day_of_week
  loop
    if times.uses_morning
       and a.preference in ('morning', 'any')
       and not exists (
         select 1 from public.shift_exclusions e
         where e.week_start_date = p_week_start
           and e.day_of_week = a.day_of_week
           and e.slot = 'morning'
           and e.worker_id = a.worker_id
       )
    then
      insert into public.shifts (
        organization_id, week_start_date, day_of_week, slot,
        start_time, end_time, position_id, assigned_worker_id, created_by
      ) values (
        org, p_week_start, a.day_of_week, 'morning',
        times.morning_start, times.morning_end, a.position_id, a.worker_id, uid
      )
      on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do update
        set position_id = coalesce(public.shifts.position_id, excluded.position_id)
      returning (xmax = 0) into v_inserted;

      if coalesce(v_inserted, false) then created := created + 1; end if;
    end if;

    if times.uses_afternoon
       and a.preference in ('afternoon', 'any')
       and not exists (
         select 1 from public.shift_exclusions e
         where e.week_start_date = p_week_start
           and e.day_of_week = a.day_of_week
           and e.slot = 'afternoon'
           and e.worker_id = a.worker_id
       )
    then
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

notify pgrst, 'reload schema';
