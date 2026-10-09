-- ----------------------------------------------------------------------------
-- 0021 — Delete your own account from the app
--
-- App Store guideline 5.1.1(v): an app that lets people create an account must
-- also let them delete it from inside the app. Until now 0001 left deletion as
-- a support action ("No DELETE policy"), and the privacy policy told people
-- to email us. That gets the iOS build rejected.
--
-- delete_my_account() removes the caller's row in auth.users. Every table
-- that points at profiles already cascades or nulls on delete (0002–0014), so
-- the profile, wishes, logged hours, hourly rate, cover requests and trades go
-- with it, and published shifts they worked stay on the schedule unassigned.
--
-- The last active manager is the one hard case: deleting just them would leave
-- an organization nobody can run, with no way back in from the app (0013
-- refuses the same thing for deactivation). So when the caller is the only
-- active manager, the whole organization is deleted with them. The app says
-- so in the confirmation before calling this.
--
-- SECURITY DEFINER because `authenticated` has no rights on auth.users; the
-- function is owned by postgres, which does. It only ever deletes auth.uid().
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ----------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  me  record;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  select organization_id, role, is_active into me
  from public.profiles
  where id = uid;

  if me.organization_id is not null
     and me.role = 'manager'
     and not exists (
       select 1 from public.profiles
       where organization_id = me.organization_id
         and role = 'manager'
         and is_active
         and id <> uid
     ) then
    -- Cascades to every tenant table, including the other members' profiles.
    delete from public.organizations where id = me.organization_id;
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
