-- ============================================================================
-- Rotaly — Migration 0008: catch the double-booking at claim time
--
-- claim_cover() let anyone take a request, and only resolve_cover() checked
-- whether the claimer already worked that slot. So a worker could claim a
-- shift, the request would sit there looking settled, and the manager would
-- hit a wall they had no way to explain or fix.
--
-- The check now runs when the worker taps "Prevzamem", where the person who
-- can actually do something about it is the one reading the message. It stays
-- in resolve_cover() as well, since the rota can change between claiming and
-- approving.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

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

notify pgrst, 'reload schema';
