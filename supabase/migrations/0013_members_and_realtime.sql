-- ============================================================================
-- Rotaly — Migration 0013: leavers, join-code rotation, realtime
--
--   1. profiles.is_active — a worker who quits stops appearing everywhere that
--      matters, without deleting their history.
--   2. rotate_join_code() — the code was permanent, so anyone who ever had it
--      could keep joining.
--   3. Realtime on shifts and cover_requests, for the React Native rewrite.
--
-- Deactivation is soft on purpose. Deleting a profile would cascade through
-- availability and null out shift assignments, destroying the record of who
-- worked what — and this data mirrors real pay.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- ----------------------------------------------------------------------------
-- 1. Activate / deactivate a member
-- ----------------------------------------------------------------------------
create or replace function public.set_member_active(
  p_worker_id uuid,
  p_active    boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid    uuid := auth.uid();
  org    uuid;
  target record;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko ureja ekipo.' using errcode = '42501';
  end if;

  select * into target
  from public.profiles
  where id = p_worker_id and organization_id = org;

  if target.id is null then
    raise exception 'Ta oseba ni član tvoje restavracije.' using errcode = 'P0002';
  end if;

  if p_worker_id = uid then
    raise exception 'Sebe ne moreš odstraniti iz ekipe.' using errcode = '42501';
  end if;

  -- Losing the last active manager would leave the restaurant with nobody who
  -- can build a schedule, and no way back in from the app.
  if not p_active and target.role = 'manager' and (
    select count(*) from public.profiles
    where organization_id = org and role = 'manager' and is_active
  ) <= 1 then
    raise exception 'To je edini aktivni vodja. Najprej dodaj drugega.' using errcode = '42501';
  end if;

  update public.profiles
  set is_active = p_active
  where id = p_worker_id;
end;
$$;

revoke all on function public.set_member_active(uuid, boolean) from public;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Rotate the join code
-- ----------------------------------------------------------------------------
create or replace function public.rotate_join_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid      uuid := auth.uid();
  org      uuid;
  new_code text;
begin
  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko zamenja kodo.' using errcode = '42501';
  end if;

  new_code := public.generate_join_code();

  update public.organizations
  set join_code = new_code
  where id = org;

  return new_code;
end;
$$;

revoke all on function public.rotate_join_code() from public;
grant execute on function public.rotate_join_code() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. An inactive member is out of the working set
-- ----------------------------------------------------------------------------

-- Cannot submit wishes any more.
create or replace function public.save_availability(
  p_week_start date,
  p_entries    jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  org   uuid;
  entry jsonb;
  d     int;
  pref  public.shift_preference;
  pos   uuid;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid and is_active;
  if org is null then
    raise exception 'Tvoj račun ni več aktiven v tej restavraciji.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.schedules s
    where s.organization_id = org
      and s.week_start_date = p_week_start
      and s.status = 'published'
  ) then
    raise exception 'Urnik za ta teden je že objavljen. Želja ni več mogoče spreminjati.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_entries, 'null'::jsonb)) <> 'array' then
    raise exception 'Neveljavni podatki o razpoložljivosti.' using errcode = '22023';
  end if;

  for entry in select value from jsonb_array_elements(p_entries) loop
    d := (entry->>'day_of_week')::int;
    if d is null or d < 1 or d > 7 then
      raise exception 'Neveljaven dan v tednu: %', coalesce(d::text, 'null')
        using errcode = '22023';
    end if;

    pref := (entry->>'preference')::public.shift_preference;
    pos  := nullif(entry->>'position_id', '')::uuid;

    if pref = 'off' then
      pos := null;
    end if;

    if pos is not null and not exists (
      select 1 from public.positions
      where id = pos and organization_id = org and is_active
    ) then
      raise exception 'Neveljavno delovno mesto.' using errcode = '22023';
    end if;

    insert into public.availability_preferences
      (organization_id, worker_id, week_start_date, day_of_week, preference, position_id, submitted_at)
    values
      (org, uid, p_week_start, d, pref, pos, now())
    on conflict (worker_id, week_start_date, day_of_week) do update
      set preference   = excluded.preference,
          position_id  = excluded.position_id,
          submitted_at = now();
  end loop;
end;
$$;

revoke all on function public.save_availability(date, jsonb) from public;
grant execute on function public.save_availability(date, jsonb) to authenticated;

-- Not placed on new schedules.
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
    join public.profiles p on p.id = ap.worker_id and p.is_active
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

revoke all on function public.generate_schedule(date) from public;
grant execute on function public.generate_schedule(date) to authenticated;

-- Cannot pick up a cover shift.
create or replace function public.claim_cover(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  org uuid;
  r   record;
  s   record;
begin
  select organization_id into org from public.profiles where id = uid and is_active;
  if org is null then
    raise exception 'Tvoj račun ni več aktiven v tej restavraciji.' using errcode = '42501';
  end if;

  select * into r from public.cover_requests where id = p_request_id and organization_id = org;
  if r.id is null then
    raise exception 'Prošnja ne obstaja.' using errcode = 'P0002';
  end if;

  if r.status <> 'open' then
    raise exception 'Ta prošnja ni več odprta.' using errcode = '42501';
  end if;

  if r.requested_by = uid then
    raise exception 'Svoje prošnje ne moreš prevzeti.' using errcode = '42501';
  end if;

  select * into s from public.shifts where id = r.shift_id;
  if s.id is null then
    raise exception 'Smena ne obstaja.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.shifts
    where week_start_date = s.week_start_date
      and day_of_week     = s.day_of_week
      and slot            = s.slot
      and assigned_worker_id = uid
      and id <> s.id
  ) then
    raise exception 'V tej smeni že delaš, zato je ne moreš prevzeti.' using errcode = '23505';
  end if;

  update public.cover_requests
  set status = 'claimed', claimed_by = uid
  where id = p_request_id;
end;
$$;

revoke all on function public.claim_cover(uuid) from public;
grant execute on function public.claim_cover(uuid) to authenticated;

-- A deactivated worker cannot be placed on a shift by hand either.
create or replace function public.shifts_validate_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_worker_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.assigned_worker_id
      and p.organization_id = new.organization_id
      and p.is_active
  ) then
    raise exception 'Delavec ni aktiven član te restavracije.' using errcode = '42501';
  end if;

  if new.position_id is not null and not exists (
    select 1 from public.positions p
    where p.id = new.position_id
      and p.organization_id = new.organization_id
  ) then
    raise exception 'Delovno mesto ne pripada tej restavraciji.' using errcode = '42501';
  end if;

  if new.duty_id is not null and not exists (
    select 1 from public.duties d
    where d.id = new.duty_id
      and d.organization_id = new.organization_id
  ) then
    raise exception 'Zadolžitev ne pripada tej restavraciji.' using errcode = '42501';
  end if;

  if new.end_time = new.start_time then
    raise exception 'Konec smene ne sme biti enak začetku.' using errcode = '22023';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Realtime — unused by the Swift app, ready for React Native
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['shifts', 'schedules', 'cover_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
