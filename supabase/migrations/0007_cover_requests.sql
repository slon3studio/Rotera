-- ============================================================================
-- Rotaly — Migration 0007: Cover requests + position rename
--
--   1. "Strežba" becomes "Rajon", the word actually used on the floor.
--   2. cover_requests: a worker asks to be covered for a shift, a coworker
--      claims it, the manager has the final say.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rename
-- ----------------------------------------------------------------------------
update public.positions set name = 'Rajon' where name = 'Strežba';

-- ----------------------------------------------------------------------------
-- 2. Cover requests
-- ----------------------------------------------------------------------------
create table if not exists public.cover_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  shift_id         uuid not null references public.shifts(id) on delete cascade,
  requested_by     uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'open'
                     check (status in ('open', 'claimed', 'approved', 'denied', 'cancelled')),
  claimed_by       uuid references public.profiles(id) on delete set null,
  note             text check (note is null or length(note) <= 300),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create index if not exists cover_requests_org_status_idx
  on public.cover_requests (organization_id, status);

-- A shift can only have one request in flight. Approved/denied/cancelled ones
-- stay as history, so the index is partial.
create unique index if not exists cover_requests_one_active
  on public.cover_requests (shift_id)
  where status in ('open', 'claimed');

-- ----------------------------------------------------------------------------
-- 3. RPCs — the only write paths
-- ----------------------------------------------------------------------------

-- Worker asks to be covered for one of their own shifts.
create or replace function public.request_cover(p_shift_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  org uuid;
  s   record;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  select * into s from public.shifts where id = p_shift_id and organization_id = org;
  if s.id is null then
    raise exception 'Smena ne obstaja.' using errcode = 'P0002';
  end if;

  if s.assigned_worker_id is distinct from uid then
    raise exception 'Menjavo lahko zaprosiš samo za svojo smeno.' using errcode = '42501';
  end if;

  -- Asking to be covered for a draft nobody has seen would only confuse the
  -- team; the schedule has to be out first.
  if not exists (
    select 1 from public.schedules
    where organization_id = org and week_start_date = s.week_start_date and status = 'published'
  ) then
    raise exception 'Urnik za ta teden še ni objavljen.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cover_requests
    where shift_id = p_shift_id and status in ('open', 'claimed')
  ) then
    raise exception 'Za to smeno je prošnja že oddana.' using errcode = '23505';
  end if;

  insert into public.cover_requests (organization_id, shift_id, requested_by, note)
  values (org, p_shift_id, uid, nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

-- Requester withdraws their own request.
create or replace function public.cancel_cover(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  r   record;
begin
  select * into r from public.cover_requests where id = p_request_id;
  if r.id is null then
    raise exception 'Prošnja ne obstaja.' using errcode = 'P0002';
  end if;

  if r.requested_by is distinct from uid then
    raise exception 'Prekliče lahko samo tisti, ki je zaprosil.' using errcode = '42501';
  end if;

  if r.status not in ('open', 'claimed') then
    raise exception 'Ta prošnja je že zaključena.' using errcode = '42501';
  end if;

  update public.cover_requests
  set status = 'cancelled', resolved_at = now()
  where id = p_request_id;
end;
$$;

-- A coworker offers to take the shift.
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
begin
  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
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

  update public.cover_requests
  set status = 'claimed', claimed_by = uid
  where id = p_request_id;
end;
$$;

-- Claimer backs out; the request goes back on the board.
create or replace function public.unclaim_cover(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  r   record;
begin
  select * into r from public.cover_requests where id = p_request_id;
  if r.id is null then
    raise exception 'Prošnja ne obstaja.' using errcode = 'P0002';
  end if;

  if r.claimed_by is distinct from uid or r.status <> 'claimed' then
    raise exception 'Te prošnje nisi prevzel.' using errcode = '42501';
  end if;

  update public.cover_requests
  set status = 'open', claimed_by = null
  where id = p_request_id;
end;
$$;

-- Manager decides. Approval is what actually moves the shift.
create or replace function public.resolve_cover(p_request_id uuid, p_approve boolean)
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
  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'O menjavi odloča vodja.' using errcode = '42501';
  end if;

  select * into r from public.cover_requests where id = p_request_id and organization_id = org;
  if r.id is null then
    raise exception 'Prošnja ne obstaja.' using errcode = 'P0002';
  end if;

  if r.status not in ('open', 'claimed') then
    raise exception 'Ta prošnja je že zaključena.' using errcode = '42501';
  end if;

  if not p_approve then
    update public.cover_requests
    set status = 'denied', resolved_at = now()
    where id = p_request_id;
    return;
  end if;

  if r.claimed_by is null then
    raise exception 'Menjave ni prevzel še nihče.' using errcode = '42501';
  end if;

  select * into s from public.shifts where id = r.shift_id;

  -- The replacement might already be working that slot. Approving would then
  -- violate the one-person-per-slot constraint, so say so plainly instead of
  -- surfacing a raw duplicate-key error.
  if exists (
    select 1 from public.shifts
    where week_start_date = s.week_start_date
      and day_of_week = s.day_of_week
      and slot = s.slot
      and assigned_worker_id = r.claimed_by
      and id <> s.id
  ) then
    raise exception 'Ta oseba že dela v tej smeni.' using errcode = '23505';
  end if;

  update public.shifts
  set assigned_worker_id = r.claimed_by
  where id = r.shift_id;

  update public.cover_requests
  set status = 'approved', resolved_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.request_cover(uuid, text)   from public;
revoke all on function public.cancel_cover(uuid)          from public;
revoke all on function public.claim_cover(uuid)           from public;
revoke all on function public.unclaim_cover(uuid)         from public;
revoke all on function public.resolve_cover(uuid, boolean) from public;

grant execute on function public.request_cover(uuid, text)    to authenticated;
grant execute on function public.cancel_cover(uuid)           to authenticated;
grant execute on function public.claim_cover(uuid)            to authenticated;
grant execute on function public.unclaim_cover(uuid)          to authenticated;
grant execute on function public.resolve_cover(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.cover_requests enable row level security;

revoke all on public.cover_requests from anon, authenticated;
grant select on public.cover_requests to authenticated;

-- Everyone in the restaurant reads them: that is how a coworker finds a shift
-- to pick up. Writes go through the RPCs above.
drop policy if exists "cover_requests_select_own_org" on public.cover_requests;
create policy "cover_requests_select_own_org"
  on public.cover_requests for select to authenticated
  using (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- 5. New restaurants seed "Rajon" rather than "Strežba"
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

  insert into public.positions (organization_id, name, sort_order, short_label, color)
  values (new_org_id, 'Šank',  1, 'Š', 'blue'),
         (new_org_id, 'Rajon', 2, 'R', 'green');

  insert into public.duties (organization_id, name, sort_order)
  values (new_org_id, 'Priprava', 1), (new_org_id, 'Rajon+Smeti', 2), (new_org_id, 'Roba', 3);
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

notify pgrst, 'reload schema';
