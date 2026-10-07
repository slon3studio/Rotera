-- ============================================================================
-- Rotaly — Migration 0003: Schedule building + publishing
--
-- Adds:
--   duties               per-organization tasks (Priprava / Rajon+Smeti / Roba)
--   organizations.*_time default shift times, configurable per restaurant
--   schedules            per-week draft/published state
--   shifts               one row per person per slot, with per-person times
--   generate_schedule()  builds a draft week from submitted availability
--   publish_week()       flips a week to published (and back)
--
-- Also: save_availability() now refuses a published week, so workers cannot
-- change their wishes after the schedule goes out.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Duties — the "(Priprava)" annotation, as data rather than hardcoded text
-- ----------------------------------------------------------------------------
create table if not exists public.duties (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 50),
  sort_order       int  not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists duties_organization_id_idx
  on public.duties (organization_id);

insert into public.duties (organization_id, name, sort_order)
select o.id, v.name, v.sort_order
from public.organizations o
cross join (values ('Priprava', 1), ('Rajon+Smeti', 2), ('Roba', 3)) as v(name, sort_order)
where not exists (select 1 from public.duties d where d.organization_id = o.id)
on conflict (organization_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Default shift times, per restaurant
--
-- 8:30-16:00 and 16:00-00:00 are OUR defaults, not a hardcoded rule. Every
-- shift row keeps its own times so "do 15" or "ob 17" is a per-person edit.
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists morning_start   time not null default '08:30',
  add column if not exists morning_end     time not null default '16:00',
  add column if not exists afternoon_start time not null default '16:00',
  add column if not exists afternoon_end   time not null default '00:00';

-- ----------------------------------------------------------------------------
-- 3. Week state
-- ----------------------------------------------------------------------------
create table if not exists public.schedules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  week_start_date  date not null check (extract(isodow from week_start_date) = 1),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  published_at     timestamptz,
  published_by     uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (organization_id, week_start_date)
);

-- ----------------------------------------------------------------------------
-- 4. Shifts
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_slot') then
    create type public.shift_slot as enum ('morning', 'afternoon');
  end if;
end $$;

create table if not exists public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  week_start_date     date not null check (extract(isodow from week_start_date) = 1),
  day_of_week         int  not null check (day_of_week between 1 and 7),
  slot                public.shift_slot not null,

  -- Copied from the organization defaults at creation, then freely edited.
  start_time          time not null,
  end_time            time not null,

  position_id         uuid references public.positions(id) on delete set null,
  duty_id             uuid references public.duties(id) on delete set null,
  assigned_worker_id  uuid references public.profiles(id) on delete set null,

  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One person cannot be placed twice in the same slot on the same day.
  -- Also what makes generate_schedule() safe to re-run.
  unique (week_start_date, day_of_week, slot, assigned_worker_id)
);

create index if not exists shifts_org_week_idx
  on public.shifts (organization_id, week_start_date);

-- The client never sends organization_id. This sets it from the caller's own
-- profile, which is what keeps drag-and-drop edits inside one restaurant.
create or replace function public.shifts_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.organization_id := public.current_org_id();
  if new.organization_id is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shifts_before_insert on public.shifts;
create trigger shifts_before_insert
  before insert on public.shifts
  for each row execute function public.shifts_set_defaults();

drop trigger if exists shifts_before_update on public.shifts;
create trigger shifts_before_update
  before update on public.shifts
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_week_published(p_week date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.schedules s
    where s.organization_id = public.current_org_id()
      and s.week_start_date = p_week
      and s.status = 'published'
  );
$$;

revoke all on function public.is_week_published(date) from public;
grant execute on function public.is_week_published(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. generate_schedule() — turn submitted wishes into a draft week
--
-- Places every available worker into the slot(s) they said they could work,
-- at the restaurant's default times. "Karkoli" produces both a morning and an
-- afternoon row; the manager deletes whichever they don't need.
--
-- Re-running never duplicates and never overwrites a manual edit: the unique
-- constraint makes each insert a no-op if that person is already in that slot.
-- ----------------------------------------------------------------------------
create or replace function public.generate_schedule(p_week_start date)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  org     uuid;
  created int := 0;
  times   record;
  a       record;
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
      on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do nothing;
      if found then created := created + 1; end if;
    end if;

    if a.preference in ('afternoon', 'any') then
      insert into public.shifts (
        organization_id, week_start_date, day_of_week, slot,
        start_time, end_time, position_id, assigned_worker_id, created_by
      ) values (
        org, p_week_start, a.day_of_week, 'afternoon',
        times.afternoon_start, times.afternoon_end, a.position_id, a.worker_id, uid
      )
      on conflict (week_start_date, day_of_week, slot, assigned_worker_id) do nothing;
      if found then created := created + 1; end if;
    end if;
  end loop;

  return created;
end;
$$;

revoke all on function public.generate_schedule(date) from public;
grant execute on function public.generate_schedule(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. publish_week()
-- ----------------------------------------------------------------------------
create or replace function public.publish_week(p_week_start date, p_published boolean)
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

  if public.current_user_role() <> 'manager' then
    raise exception 'Samo vodja lahko objavi urnik.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  insert into public.schedules (
    organization_id, week_start_date, status, published_at, published_by
  ) values (
    org,
    p_week_start,
    case when p_published then 'published' else 'draft' end,
    case when p_published then now() else null end,
    case when p_published then uid else null end
  )
  on conflict (organization_id, week_start_date) do update
    set status       = excluded.status,
        published_at = excluded.published_at,
        published_by = excluded.published_by,
        updated_at   = now();
end;
$$;

revoke all on function public.publish_week(date, boolean) from public;
grant execute on function public.publish_week(date, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. save_availability() — now refuses a published week
--
-- Replaces the 0002 version. Everything else is unchanged.
-- ----------------------------------------------------------------------------
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

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
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

-- ----------------------------------------------------------------------------
-- 9. create_organization() — now seeds duties as well as positions
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  org_name     text,
  manager_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  new_org_id uuid;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'Ta uporabnik je že član restavracije.' using errcode = '23505';
  end if;

  if length(btrim(coalesce(org_name, ''))) = 0 then
    raise exception 'Ime restavracije je obvezno.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(manager_name, ''))) = 0 then
    raise exception 'Ime in priimek sta obvezna.' using errcode = '22023';
  end if;

  insert into public.organizations (name, join_code)
  values (btrim(org_name), public.generate_join_code())
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, new_org_id, btrim(manager_name), 'manager');

  insert into public.positions (organization_id, name, sort_order)
  values (new_org_id, 'Šank', 1), (new_org_id, 'Strežba', 2);

  insert into public.duties (organization_id, name, sort_order)
  values (new_org_id, 'Priprava', 1), (new_org_id, 'Rajon+Smeti', 2), (new_org_id, 'Roba', 3);
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Row-Level Security
-- ----------------------------------------------------------------------------

alter table public.duties    enable row level security;
alter table public.schedules enable row level security;
alter table public.shifts    enable row level security;

revoke all on public.duties    from anon, authenticated;
revoke all on public.schedules from anon, authenticated;
revoke all on public.shifts    from anon, authenticated;

grant select on public.duties    to authenticated;
grant select on public.schedules to authenticated;
grant select on public.shifts    to authenticated;

grant insert                               on public.duties to authenticated;
grant update (name, sort_order, is_active) on public.duties to authenticated;

-- Managers edit shifts directly; that is what makes drag-and-drop a single
-- UPDATE. organization_id and week_start_date are deliberately NOT grantable,
-- so a shift can never be dragged into another restaurant or another week.
grant insert on public.shifts to authenticated;
grant delete on public.shifts to authenticated;
grant update (day_of_week, slot, start_time, end_time,
              position_id, duty_id, assigned_worker_id)
  on public.shifts to authenticated;

-- duties ----------------------------------------------------------------------

drop policy if exists "duties_select_own_org" on public.duties;
create policy "duties_select_own_org"
  on public.duties for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "duties_insert_by_manager" on public.duties;
create policy "duties_insert_by_manager"
  on public.duties for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

drop policy if exists "duties_update_by_manager" on public.duties;
create policy "duties_update_by_manager"
  on public.duties for update to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  )
  with check (organization_id = public.current_org_id());

-- schedules -------------------------------------------------------------------
-- Read-only for clients. publish_week() is the only writer.

drop policy if exists "schedules_select_own_org" on public.schedules;
create policy "schedules_select_own_org"
  on public.schedules for select to authenticated
  using (organization_id = public.current_org_id());

-- shifts ----------------------------------------------------------------------

-- Managers see every week including drafts. Workers see a week only once it
-- has been published — this is what makes "Objavi" mean something.
drop policy if exists "shifts_select_manager_or_published" on public.shifts;
create policy "shifts_select_manager_or_published"
  on public.shifts for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_user_role() = 'manager'
      or public.is_week_published(week_start_date)
    )
  );

drop policy if exists "shifts_insert_by_manager" on public.shifts;
create policy "shifts_insert_by_manager"
  on public.shifts for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

drop policy if exists "shifts_update_by_manager" on public.shifts;
create policy "shifts_update_by_manager"
  on public.shifts for update to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  )
  with check (organization_id = public.current_org_id());

drop policy if exists "shifts_delete_by_manager" on public.shifts;
create policy "shifts_delete_by_manager"
  on public.shifts for delete to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

-- ----------------------------------------------------------------------------
-- 11. Cross-tenant reference guard
--
-- organization_id is locked down by the trigger and column grants, but
-- assigned_worker_id / position_id / duty_id are all client-settable. Without
-- this, a manager who learned another restaurant's worker UUID could place
-- that person on their own schedule. Enforced in a trigger rather than a
-- policy so it covers INSERT, UPDATE, and the SECURITY DEFINER RPCs alike.
-- ----------------------------------------------------------------------------
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
  ) then
    raise exception 'Delavec ni član te restavracije.' using errcode = '42501';
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

drop trigger if exists shifts_validate on public.shifts;
create trigger shifts_validate
  before insert or update on public.shifts
  for each row execute function public.shifts_validate_references();
