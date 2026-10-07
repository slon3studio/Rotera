-- ============================================================================
-- Rotaly — Migration 0002: Positions + weekly availability
--
-- Adds:
--   positions                 per-organization job roles (seeded Šank/Strežba)
--   availability_preferences  what each worker can work, per day, per week
--   save_availability()       the only way a client writes availability
--
-- Follows the same four-layer isolation pattern as 0001: RLS via
-- current_org_id(), narrow column grants, no client INSERT where an RPC
-- belongs, and the client never sends an organization_id.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Positions
--
-- Deliberately a table, not an enum. A different restaurant will have kitchen,
-- host, barista — bar/server is only OUR seed data.
-- ----------------------------------------------------------------------------
create table if not exists public.positions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 50),
  sort_order       int  not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists positions_organization_id_idx
  on public.positions (organization_id);

-- ----------------------------------------------------------------------------
-- 2. Availability preferences
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_preference') then
    create type public.shift_preference as enum ('morning', 'afternoon', 'off', 'any');
  end if;
end $$;

create table if not exists public.availability_preferences (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  worker_id        uuid not null references public.profiles(id) on delete cascade,

  -- Always a Monday. Enforced so a client can never split one week across
  -- two different "week_start_date" values.
  week_start_date  date not null check (extract(isodow from week_start_date) = 1),

  -- ISO day numbering: 1 = Monday … 7 = Sunday.
  day_of_week      int  not null check (day_of_week between 1 and 7),

  preference       public.shift_preference not null,

  -- NULL means "any position". FK is deliberately ON DELETE SET NULL: removing
  -- a position must not delete a worker's stated availability.
  position_id      uuid references public.positions(id) on delete set null,

  submitted_at     timestamptz not null default now(),

  unique (worker_id, week_start_date, day_of_week)
);

create index if not exists availability_org_week_idx
  on public.availability_preferences (organization_id, week_start_date);

-- ----------------------------------------------------------------------------
-- 3. Seed default positions
--
-- For any organization that has none yet, including the ones created before
-- this migration ran. Names are Slovenian because the UI is.
-- ----------------------------------------------------------------------------
insert into public.positions (organization_id, name, sort_order)
select o.id, v.name, v.sort_order
from public.organizations o
cross join (values ('Šank', 1), ('Strežba', 2)) as v(name, sort_order)
where not exists (select 1 from public.positions p where p.organization_id = o.id)
on conflict (organization_id, name) do nothing;

-- New organizations get the same seed. This replaces the 0001 version.
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
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. save_availability()
--
-- The only write path for availability. Derives organization_id and worker_id
-- from auth.uid() so a client cannot submit on someone else's behalf or into
-- another restaurant. Upserts the whole week in one call.
--
-- p_entries shape:
--   [{"day_of_week": 1, "preference": "morning", "position_id": "<uuid>|null"}, …]
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

    -- "Prosto" means not working, so a position preference is meaningless.
    if pref = 'off' then
      pos := null;
    end if;

    -- A position from another restaurant would be a cross-tenant reference.
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
-- 5. Row-Level Security
-- ----------------------------------------------------------------------------

alter table public.positions                enable row level security;
alter table public.availability_preferences enable row level security;

revoke all on public.positions                from anon, authenticated;
revoke all on public.availability_preferences from anon, authenticated;

grant select on public.positions                to authenticated;
grant select on public.availability_preferences to authenticated;

-- Managers may curate their own restaurant's positions. No UI yet, but the
-- data model is meant to be configurable per organization.
grant insert                                on public.positions to authenticated;
grant update (name, sort_order, is_active)  on public.positions to authenticated;

-- positions -------------------------------------------------------------------

drop policy if exists "positions_select_own_org" on public.positions;
create policy "positions_select_own_org"
  on public.positions
  for select
  to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "positions_insert_by_manager" on public.positions;
create policy "positions_insert_by_manager"
  on public.positions
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

drop policy if exists "positions_update_by_manager" on public.positions;
create policy "positions_update_by_manager"
  on public.positions
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  )
  with check (organization_id = public.current_org_id());

-- availability_preferences ----------------------------------------------------

-- Workers see only their own submissions; managers see the whole restaurant.
-- Availability is mildly personal (it says when you can't work), so there is
-- no reason for coworkers to read each other's.
drop policy if exists "availability_select_self_or_manager" on public.availability_preferences;
create policy "availability_select_self_or_manager"
  on public.availability_preferences
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (worker_id = auth.uid() or public.current_user_role() = 'manager')
  );

-- No INSERT/UPDATE/DELETE policy on purpose: save_availability() is the only
-- write path, and it derives the worker and organization from auth.uid().
