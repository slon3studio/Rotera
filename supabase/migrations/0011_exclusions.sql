-- ============================================================================
-- Rotaly — Migration 0011: remember who the manager took off
--
-- 0010 protects shifts the manager edited, but not the ones they DELETED.
-- Removing someone leaves no trace, so the next "Sestavi iz želja" reads their
-- unchanged wish and puts them straight back. Moving someone has the same
-- effect: the old slot is vacated, and generation refills it.
--
-- A deletion is a decision, exactly like an edit, and has to survive a rebuild
-- the same way. shift_exclusions records it.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create table if not exists public.shift_exclusions (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  week_start_date  date not null,
  day_of_week      int  not null check (day_of_week between 1 and 7),
  slot             public.shift_slot not null,
  worker_id        uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (week_start_date, day_of_week, slot, worker_id)
);

alter table public.shift_exclusions enable row level security;
revoke all on public.shift_exclusions from anon, authenticated;
-- No policies and no grants: only the triggers below ever touch this table.

-- ----------------------------------------------------------------------------
-- Record a removal — but not the wholesale delete a rebuild does itself.
--
-- rebuild_schedule() sets a transaction-local flag before its own delete, so
-- the trigger can tell "the manager took Ana off Monday" apart from "the
-- rebuild is clearing its own previous output".
-- ----------------------------------------------------------------------------
create or replace function public.shifts_record_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('rotaly.rebuilding', true), 'off') = 'on' then
    return old;
  end if;

  if old.assigned_worker_id is not null then
    insert into public.shift_exclusions
      (organization_id, week_start_date, day_of_week, slot, worker_id)
    values
      (old.organization_id, old.week_start_date, old.day_of_week, old.slot, old.assigned_worker_id)
    on conflict do nothing;
  end if;

  return old;
end;
$$;

drop trigger if exists shifts_after_delete on public.shifts;
create trigger shifts_after_delete
  after delete on public.shifts
  for each row execute function public.shifts_record_exclusion();

-- Moving someone vacates the slot they came from; that is a removal too.
-- Landing somewhere new clears any exclusion sitting on the destination.
create or replace function public.shifts_track_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_worker_id is not null
     and (old.day_of_week is distinct from new.day_of_week
          or old.slot is distinct from new.slot
          or old.assigned_worker_id is distinct from new.assigned_worker_id)
  then
    if old.assigned_worker_id is not null then
      insert into public.shift_exclusions
        (organization_id, week_start_date, day_of_week, slot, worker_id)
      values
        (old.organization_id, old.week_start_date, old.day_of_week, old.slot, old.assigned_worker_id)
      on conflict do nothing;
    end if;

    delete from public.shift_exclusions
    where week_start_date = new.week_start_date
      and day_of_week     = new.day_of_week
      and slot            = new.slot
      and worker_id       = new.assigned_worker_id;
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_after_update_move on public.shifts;
create trigger shifts_after_update_move
  after update on public.shifts
  for each row execute function public.shifts_track_move();

-- Adding someone back by hand is the manager changing their mind.
create or replace function public.shifts_clear_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_worker_id is not null then
    delete from public.shift_exclusions
    where week_start_date = new.week_start_date
      and day_of_week     = new.day_of_week
      and slot            = new.slot
      and worker_id       = new.assigned_worker_id;
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_after_insert_clear on public.shifts;
create trigger shifts_after_insert_clear
  after insert on public.shifts
  for each row execute function public.shifts_clear_exclusion();

-- ----------------------------------------------------------------------------
-- generate_schedule() now skips anyone the manager took off that slot.
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
    if a.preference in ('morning', 'any')
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

    if a.preference in ('afternoon', 'any')
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

-- ----------------------------------------------------------------------------
-- rebuild_schedule() flags its own delete so it does not exclude everyone.
-- ----------------------------------------------------------------------------
create or replace function public.rebuild_schedule(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  org     uuid;
  removed int := 0;
  added   int := 0;
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

  perform set_config('rotaly.rebuilding', 'on', true);

  delete from public.shifts s
  where s.organization_id = org
    and s.week_start_date = p_week_start
    and s.origin = 'generated'
    and not exists (
      select 1 from public.cover_requests cr
      where cr.shift_id = s.id
        and cr.status in ('open', 'claimed', 'approved')
    );

  get diagnostics removed = row_count;

  perform set_config('rotaly.rebuilding', 'off', true);

  added := public.generate_schedule(p_week_start);

  return jsonb_build_object('added', added, 'removed', removed);
end;
$$;

revoke all on function public.generate_schedule(date) from public;
revoke all on function public.rebuild_schedule(date)  from public;
grant execute on function public.generate_schedule(date) to authenticated;
grant execute on function public.rebuild_schedule(date)  to authenticated;

notify pgrst, 'reload schema';
