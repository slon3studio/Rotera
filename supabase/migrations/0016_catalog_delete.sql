-- ----------------------------------------------------------------------------
-- 0016 — let a manager delete a position or a duty
--
-- Until now the catalog could only hide an entry (`is_active = false`).
--
-- Deleting is not free: both foreign keys are `on delete set null`, so
-- removing a position that older shifts point at does not fail — it blanks the
-- position on those shifts. Last month's schedule stops saying who was on the
-- bar. That is the owner's call to make, and it has been made; the app names
-- the number of affected shifts in its confirmation so the choice is at least
-- an informed one.
--
-- An earlier draft of this migration blocked the delete with a trigger. If
-- that version was already run, the drops below remove it.
-- ----------------------------------------------------------------------------

drop trigger if exists positions_block_used_delete on public.positions;
drop trigger if exists duties_block_used_delete    on public.duties;
drop function if exists public.positions_block_used_delete();
drop function if exists public.duties_block_used_delete();

-- ----------------------------------------------------------------------------
-- 1. The grant and the policy
--
-- Narrow on purpose: only a manager, and only inside their own restaurant.
-- Nothing here lets a worker delete anything, and nothing lets either of them
-- reach another restaurant's catalog.
-- ----------------------------------------------------------------------------
grant delete on public.positions to authenticated;
grant delete on public.duties    to authenticated;

drop policy if exists "positions_delete_by_manager" on public.positions;
create policy "positions_delete_by_manager"
  on public.positions
  for delete
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

drop policy if exists "duties_delete_by_manager" on public.duties;
create policy "duties_delete_by_manager"
  on public.duties
  for delete
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'manager'
  );

-- ----------------------------------------------------------------------------
-- 2. How many things point at a catalog entry
--
-- Only used to warn. The app shows "uporabljeno v 12 smenah" in the
-- confirmation rather than refusing, so a deletion is never a surprise.
--
-- SECURITY DEFINER because a worker cannot read every shift row, and the count
-- alone reveals nothing beyond their own restaurant.
-- ----------------------------------------------------------------------------
create or replace function public.catalog_usage()
returns table (kind text, id uuid, uses bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select 'position', p.id,
         (select count(*) from public.shifts s where s.position_id = p.id)
       + (select count(*) from public.availability_preferences a where a.position_id = p.id)
  from public.positions p
  where p.organization_id = public.current_org_id()

  union all

  select 'duty', d.id,
         (select count(*) from public.shifts s where s.duty_id = d.id)
  from public.duties d
  where d.organization_id = public.current_org_id();
$$;

grant execute on function public.catalog_usage() to authenticated;

notify pgrst, 'reload schema';
