-- ============================================================================
-- Rotaly — Migration 0014: shift swaps + a conflicts view
--
--   1. shift_swaps — "I'll take your Friday if you take my Saturday".
--      cover_requests only handles giving a shift away; a swap is two shifts
--      and two consents, so it cannot be squeezed into that table.
--
--   2. schedule_conflicts — the mistakes worth catching: someone scheduled on
--      a day they said they could not work, or put in both slots of one day.
--      A view rather than app code, so the rule is written once and the React
--      Native port just reads it.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Swaps
-- ----------------------------------------------------------------------------
create table if not exists public.shift_swaps (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  requester_id        uuid not null references public.profiles(id) on delete cascade,
  requester_shift_id  uuid not null references public.shifts(id) on delete cascade,

  target_id           uuid not null references public.profiles(id) on delete cascade,
  target_shift_id     uuid not null references public.shifts(id) on delete cascade,

  -- pending  → waiting for the other worker
  -- accepted → they said yes, waiting for the manager
  -- approved → done, the two shifts changed hands
  status              text not null default 'pending'
                        check (status in ('pending', 'accepted', 'approved',
                                          'declined', 'rejected', 'cancelled')),
  note                text check (note is null or length(note) <= 300),
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,

  check (requester_id <> target_id),
  check (requester_shift_id <> target_shift_id)
);

create index if not exists shift_swaps_org_status_idx
  on public.shift_swaps (organization_id, status);

-- Either shift can only be in one live swap at a time.
create unique index if not exists shift_swaps_one_active_requester
  on public.shift_swaps (requester_shift_id)
  where status in ('pending', 'accepted');

create unique index if not exists shift_swaps_one_active_target
  on public.shift_swaps (target_shift_id)
  where status in ('pending', 'accepted');

-- ----------------------------------------------------------------------------
-- Helper: is this shift already tied up in a cover request or another swap?
-- ----------------------------------------------------------------------------
create or replace function public.shift_is_busy(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cover_requests
    where shift_id = p_shift_id and status in ('open', 'claimed')
  ) or exists (
    select 1 from public.shift_swaps
    where status in ('pending', 'accepted')
      and (requester_shift_id = p_shift_id or target_shift_id = p_shift_id)
  );
$$;

revoke all on function public.shift_is_busy(uuid) from public;
grant execute on function public.shift_is_busy(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- propose_swap — offer one of yours for one of theirs
-- ----------------------------------------------------------------------------
create or replace function public.propose_swap(
  p_my_shift_id    uuid,
  p_their_shift_id uuid,
  p_note           text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  org   uuid;
  mine  record;
  their record;
begin
  select organization_id into org from public.profiles where id = uid and is_active;
  if org is null then
    raise exception 'Tvoj račun ni več aktiven v tej restavraciji.' using errcode = '42501';
  end if;

  select * into mine from public.shifts where id = p_my_shift_id and organization_id = org;
  select * into their from public.shifts where id = p_their_shift_id and organization_id = org;

  if mine.id is null or their.id is null then
    raise exception 'Smena ne obstaja.' using errcode = 'P0002';
  end if;

  if mine.assigned_worker_id is distinct from uid then
    raise exception 'Zamenjavo lahko predlagaš samo za svojo smeno.' using errcode = '42501';
  end if;

  if their.assigned_worker_id is null or their.assigned_worker_id = uid then
    raise exception 'Izberi smeno sodelavca.' using errcode = '22023';
  end if;

  -- Both weeks have to be out, or the other person has no way to see what
  -- they are agreeing to. Checked one at a time: the clever single-query
  -- version was unreadable and got the two-different-weeks case wrong.
  if not exists (
    select 1 from public.schedules
    where organization_id = org
      and week_start_date = mine.week_start_date
      and status = 'published'
  ) or not exists (
    select 1 from public.schedules
    where organization_id = org
      and week_start_date = their.week_start_date
      and status = 'published'
  ) then
    raise exception 'Urnik za ta teden še ni objavljen.' using errcode = '42501';
  end if;

  if public.shift_is_busy(p_my_shift_id) or public.shift_is_busy(p_their_shift_id) then
    raise exception 'Za eno od teh smen je že v teku menjava.' using errcode = '23505';
  end if;

  insert into public.shift_swaps (
    organization_id, requester_id, requester_shift_id,
    target_id, target_shift_id, note
  ) values (
    org, uid, p_my_shift_id,
    their.assigned_worker_id, p_their_shift_id,
    nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- respond_swap — the other worker agrees or refuses
-- ----------------------------------------------------------------------------
create or replace function public.respond_swap(p_swap_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  s   record;
begin
  select * into s from public.shift_swaps where id = p_swap_id;
  if s.id is null then
    raise exception 'Predlog ne obstaja.' using errcode = 'P0002';
  end if;

  if s.target_id is distinct from uid then
    raise exception 'O tem predlogu odloča tisti, ki mu je namenjen.' using errcode = '42501';
  end if;

  if s.status <> 'pending' then
    raise exception 'Ta predlog ni več odprt.' using errcode = '42501';
  end if;

  update public.shift_swaps
  set status = case when p_accept then 'accepted' else 'declined' end,
      resolved_at = case when p_accept then null else now() end
  where id = p_swap_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_swap — either side pulls out while it is still live
-- ----------------------------------------------------------------------------
create or replace function public.cancel_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  s   record;
begin
  select * into s from public.shift_swaps where id = p_swap_id;
  if s.id is null then
    raise exception 'Predlog ne obstaja.' using errcode = 'P0002';
  end if;

  if uid not in (s.requester_id, s.target_id) then
    raise exception 'Ta predlog ni tvoj.' using errcode = '42501';
  end if;

  if s.status not in ('pending', 'accepted') then
    raise exception 'Ta predlog je že zaključen.' using errcode = '42501';
  end if;

  update public.shift_swaps
  set status = 'cancelled', resolved_at = now()
  where id = p_swap_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_swap — the manager has the final say, and the shifts change hands
-- ----------------------------------------------------------------------------
create or replace function public.resolve_swap(p_swap_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  org   uuid;
  s     record;
  mine  record;
  their record;
begin
  select organization_id into org from public.profiles where id = uid;
  if org is null then
    raise exception 'Uporabnik ni član nobene restavracije.' using errcode = 'P0002';
  end if;

  if public.current_user_role() <> 'manager' then
    raise exception 'O zamenjavi odloča vodja.' using errcode = '42501';
  end if;

  select * into s from public.shift_swaps where id = p_swap_id and organization_id = org;
  if s.id is null then
    raise exception 'Predlog ne obstaja.' using errcode = 'P0002';
  end if;

  if s.status <> 'accepted' then
    raise exception 'Zamenjave še nista potrdila oba delavca.' using errcode = '42501';
  end if;

  if not p_approve then
    update public.shift_swaps
    set status = 'rejected', resolved_at = now()
    where id = p_swap_id;
    return;
  end if;

  select * into mine  from public.shifts where id = s.requester_shift_id;
  select * into their from public.shifts where id = s.target_shift_id;

  -- After the exchange neither person may stand in the same slot twice. The
  -- two shifts themselves are excluded from the check, since they are the ones
  -- being vacated.
  if exists (
    select 1 from public.shifts
    where week_start_date = their.week_start_date
      and day_of_week = their.day_of_week
      and slot = their.slot
      and assigned_worker_id = s.requester_id
      and id not in (mine.id, their.id)
  ) then
    raise exception 'Predlagatelj v tej smeni že dela.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.shifts
    where week_start_date = mine.week_start_date
      and day_of_week = mine.day_of_week
      and slot = mine.slot
      and assigned_worker_id = s.target_id
      and id not in (mine.id, their.id)
  ) then
    raise exception 'Sodelavec v tej smeni že dela.' using errcode = '23505';
  end if;

  -- Both become manual: an agreed exchange must survive a later rebuild.
  update public.shifts
  set assigned_worker_id = s.target_id, origin = 'manual'
  where id = mine.id;

  update public.shifts
  set assigned_worker_id = s.requester_id, origin = 'manual'
  where id = their.id;

  update public.shift_swaps
  set status = 'approved', resolved_at = now()
  where id = p_swap_id;
end;
$$;

revoke all on function public.propose_swap(uuid, uuid, text)  from public;
revoke all on function public.respond_swap(uuid, boolean)     from public;
revoke all on function public.cancel_swap(uuid)               from public;
revoke all on function public.resolve_swap(uuid, boolean)      from public;

grant execute on function public.propose_swap(uuid, uuid, text) to authenticated;
grant execute on function public.respond_swap(uuid, boolean)    to authenticated;
grant execute on function public.cancel_swap(uuid)              to authenticated;
grant execute on function public.resolve_swap(uuid, boolean)     to authenticated;

alter table public.shift_swaps enable row level security;
revoke all on public.shift_swaps from anon, authenticated;
grant select on public.shift_swaps to authenticated;

drop policy if exists "shift_swaps_select_own_org" on public.shift_swaps;
create policy "shift_swaps_select_own_org"
  on public.shift_swaps for select to authenticated
  using (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- 2. Conflicts
--
-- Three kinds, all per shift so the grid can outline the offending cell:
--   off        — the worker marked that whole day as unavailable
--   wrong_slot — they are free that day, but said the other half
--   double     — the same person in both slots of one day
--
-- A worker only ever sees rows about themselves: the availability half is
-- limited by its own RLS policy, and `security_invoker` makes this view honour
-- it rather than the owner's rights.
-- ----------------------------------------------------------------------------
drop view if exists public.schedule_conflicts;

create view public.schedule_conflicts
with (security_invoker = true)
as
select
  s.organization_id,
  s.week_start_date,
  s.day_of_week,
  s.slot,
  s.assigned_worker_id as worker_id,
  s.id                 as shift_id,
  'off'::text          as kind
from public.shifts s
join public.availability_preferences ap
  on  ap.organization_id = s.organization_id
  and ap.worker_id       = s.assigned_worker_id
  and ap.week_start_date = s.week_start_date
  and ap.day_of_week     = s.day_of_week
where s.assigned_worker_id is not null
  and ap.preference = 'off'

union all

select
  s.organization_id, s.week_start_date, s.day_of_week, s.slot,
  s.assigned_worker_id, s.id,
  'wrong_slot'
from public.shifts s
join public.availability_preferences ap
  on  ap.organization_id = s.organization_id
  and ap.worker_id       = s.assigned_worker_id
  and ap.week_start_date = s.week_start_date
  and ap.day_of_week     = s.day_of_week
where s.assigned_worker_id is not null
  and ap.preference in ('morning', 'afternoon')
  and ap.preference::text <> s.slot::text

union all

select
  s.organization_id, s.week_start_date, s.day_of_week, s.slot,
  s.assigned_worker_id, s.id,
  'double'
from public.shifts s
where s.assigned_worker_id is not null
  and exists (
    select 1 from public.shifts o
    where o.week_start_date    = s.week_start_date
      and o.day_of_week        = s.day_of_week
      and o.assigned_worker_id = s.assigned_worker_id
      and o.slot <> s.slot
  );

grant select on public.schedule_conflicts to authenticated;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 3. positions / duties: organization_id comes from the caller, not the client
--
-- Both tables predate this rule and expected the client to send it. Every
-- other table in the app derives it from auth.uid() via a trigger, and now
-- that a manager can add rows from the app, these should match.
-- ----------------------------------------------------------------------------
create or replace function public.catalog_set_org()
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

  return new;
end;
$$;

drop trigger if exists positions_before_insert on public.positions;
create trigger positions_before_insert
  before insert on public.positions
  for each row execute function public.catalog_set_org();

drop trigger if exists duties_before_insert on public.duties;
create trigger duties_before_insert
  before insert on public.duties
  for each row execute function public.catalog_set_org();

notify pgrst, 'reload schema';
