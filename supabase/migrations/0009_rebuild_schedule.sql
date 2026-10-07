-- ============================================================================
-- Rotaly — Migration 0009: rebuild a week from scratch
--
-- generate_schedule() only ever adds. That was deliberate — re-running it must
-- not wipe a manager's manual edits — but it means changed wishes leave the
-- old shifts sitting there, and there was no way to clear them except deleting
-- each one by hand.
--
-- rebuild_schedule() is the explicit opposite: throw the week away and build
-- it again from the wishes as they stand now. Two separate buttons, because
-- "add what's missing" and "start over" are genuinely different intentions and
-- guessing which one was meant is how schedules get destroyed.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create or replace function public.rebuild_schedule(p_week_start date)
returns int
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
    raise exception 'Samo vodja lahko sestavi urnik.' using errcode = '42501';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Teden se mora začeti v ponedeljek.' using errcode = '22023';
  end if;

  -- Refusing on a published week is deliberate. The team has already seen it,
  -- and deleting the shifts would take any cover requests with them through
  -- the cascade. Individual edits still work while published; only the bulk
  -- wipe is blocked.
  if exists (
    select 1 from public.schedules
    where organization_id = org and week_start_date = p_week_start and status = 'published'
  ) then
    raise exception 'Teden je objavljen. Najprej prekliči objavo, potem sestavi znova.'
      using errcode = '42501';
  end if;

  delete from public.shifts
  where organization_id = org and week_start_date = p_week_start;

  return public.generate_schedule(p_week_start);
end;
$$;

revoke all on function public.rebuild_schedule(date) from public;
grant execute on function public.rebuild_schedule(date) to authenticated;

notify pgrst, 'reload schema';
