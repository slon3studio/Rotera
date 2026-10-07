-- ----------------------------------------------------------------------------
-- 0017 — the manager decides which shifts the restaurant runs, and when
--
-- Two gaps this closes:
--
-- 1. The shift times have been on `organizations` since 0003, but the only
--    column a manager was ever granted UPDATE on was `name`. They could see
--    08:30–16:00 and never change it.
--
-- 2. Not every place runs both halves of the day. A café that closes at four
--    has no afternoon shift, and offering one produces wishes and shifts that
--    can never happen.
--
-- Turning a slot off is a setting, not a deletion: shifts already on the
-- schedule for that slot stay exactly as they are. It stops new ones being
-- wished for or generated. That way flipping it back does not lose history,
-- and flipping it off does not silently rewrite last week.
-- ----------------------------------------------------------------------------

alter table public.organizations
  add column if not exists uses_morning   boolean not null default true,
  add column if not exists uses_afternoon boolean not null default true;

-- Both off would leave a restaurant that cannot schedule anything at all, and
-- no screen would be able to explain why.
alter table public.organizations
  drop constraint if exists organizations_at_least_one_slot;
alter table public.organizations
  add constraint organizations_at_least_one_slot
  check (uses_morning or uses_afternoon);

-- The policy from 0001 already restricts this to a manager of their own
-- restaurant; only the column grant was missing. Still column-by-column: a
-- blanket `grant update` would also hand over `join_code`.
grant update (
  name,
  morning_start, morning_end,
  afternoon_start, afternoon_end,
  uses_morning, uses_afternoon
) on public.organizations to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Which slots are live
-- ----------------------------------------------------------------------------
create or replace function public.slot_is_enabled(p_org uuid, p_slot text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_slot
           when 'morning'   then uses_morning
           when 'afternoon' then uses_afternoon
           else true
         end
  from public.organizations
  where id = p_org;
$$;

grant execute on function public.slot_is_enabled(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 1a. A wish cannot ask for a slot the restaurant does not run
--
-- A trigger rather than a rewrite of save_availability: it is a fraction of
-- the code and it covers every path into the table, not just the one RPC.
-- `any` needs no check — the constraint above guarantees at least one slot is
-- live, and the generator resolves `any` to whichever that is.
-- ----------------------------------------------------------------------------
create or replace function public.availability_check_slot_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.preference in ('morning', 'afternoon')
     and not public.slot_is_enabled(new.organization_id, new.preference)
  then
    raise exception 'Ta smena je v nastavitvah urnika izklopljena.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists availability_check_slot_enabled on public.availability_preferences;
create trigger availability_check_slot_enabled
  before insert or update on public.availability_preferences
  for each row execute function public.availability_check_slot_enabled();

-- ----------------------------------------------------------------------------
-- 2. The generator skips a slot that is switched off
--
-- Same body as 0011 with two extra conditions. Everything else — the
-- exclusions from 0011, the honest `added` count from 0005, the position
-- coalesce — is unchanged.
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

-- ----------------------------------------------------------------------------
-- 3. A manager may not add a shift by hand into a slot that is switched off
--
-- The app hides that column, but the API is still open, and "the client would
-- never send that" is how the other holes in this schema were nearly made.
-- ----------------------------------------------------------------------------
create or replace function public.shifts_check_slot_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only on the way in, and only when the slot itself changes: switching a
  -- slot off must not freeze the shifts already on it.
  if tg_op = 'UPDATE' and new.slot = old.slot then
    return new;
  end if;

  if not public.slot_is_enabled(new.organization_id, new.slot) then
    raise exception 'Ta smena je v nastavitvah urnika izklopljena.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_check_slot_enabled on public.shifts;
create trigger shifts_check_slot_enabled
  before insert or update on public.shifts
  for each row execute function public.shifts_check_slot_enabled();

notify pgrst, 'reload schema';
