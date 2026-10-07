-- ============================================================================
-- Rotaly — Migration 0010: one rebuild that knows what not to touch
--
-- Two buttons ("Dopolni iz želja" / "Sestavi znova") existed because a rebuild
-- could not tell a shift it had generated from one the manager had placed by
-- hand, so it either kept everything or destroyed everything.
--
-- shifts.origin fixes that. Generated rows are disposable; anything a person
-- touched is not. One button can then do the obvious thing: refresh from the
-- current wishes, and leave manual work and cover requests alone.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.shifts
  add column if not exists origin text not null default 'generated';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shifts_origin_allowed') then
    alter table public.shifts
      add constraint shifts_origin_allowed check (origin in ('generated', 'manual'));
  end if;
end $$;

-- The client marks its own edits; see the Swift payloads.
grant update (day_of_week, slot, start_time, end_time,
              position_id, duty_id, assigned_worker_id, origin)
  on public.shifts to authenticated;

-- ----------------------------------------------------------------------------
-- Rebuild: refresh from the wishes as they stand now.
--
-- Removes only rows it generated itself, and only those with no cover request
-- attached. A shift the manager added, moved, retimed, or that came out of an
-- approved swap carries origin = 'manual' and survives.
-- ----------------------------------------------------------------------------
drop function if exists public.rebuild_schedule(date);

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

  added := public.generate_schedule(p_week_start);

  return jsonb_build_object('added', added, 'removed', removed);
end;
$$;

revoke all on function public.rebuild_schedule(date) from public;
grant execute on function public.rebuild_schedule(date) to authenticated;

-- ----------------------------------------------------------------------------
-- An approved swap is a human decision. Mark the shift manual so a later
-- rebuild cannot quietly hand it back to the person who asked to be covered.
-- ----------------------------------------------------------------------------
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
  set assigned_worker_id = r.claimed_by,
      origin = 'manual'
  where id = r.shift_id;

  update public.cover_requests
  set status = 'approved', resolved_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.resolve_cover(uuid, boolean) from public;
grant execute on function public.resolve_cover(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
