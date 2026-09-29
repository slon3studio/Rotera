-- ----------------------------------------------------------------------------
-- 0018 — a new organization starts with no positions and no duties
--
-- Since 0003 every signup has been handed a restaurant's vocabulary: Šank and
-- Rajon as positions, Priprava / Rajon+Smeti / Roba as duties. Rotera is now
-- for any business that works in shifts, and a care home or a warehouse
-- should not open its settings to find a bar. The owner adds their own in
-- Nastavitve urnika; every screen already handles an empty catalog.
--
-- Only `create_organization` changes. Organizations that already exist keep
-- whatever positions and duties they have — those may be on shifts and
-- wishes, and removing them is the manager's call, not a migration's.
--
-- The error messages move to the neutral wording while the function is being
-- replaced anyway.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. create_organization without the seed
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
    raise exception 'Ta uporabnik je že član organizacije.' using errcode = '23505';
  end if;

  if length(btrim(coalesce(org_name, ''))) = 0 then
    raise exception 'Ime organizacije je obvezno.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(manager_name, ''))) = 0 then
    raise exception 'Ime in priimek sta obvezna.' using errcode = '22023';
  end if;

  insert into public.organizations (name, join_code)
  values (btrim(org_name), public.generate_join_code())
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, new_org_id, btrim(manager_name), 'manager');
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

notify pgrst, 'reload schema';
