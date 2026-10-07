-- ============================================================================
-- Rotaly — Migration 0006: short labels + colours for positions
--
-- The schedule cell showed the first letter of the position name, which gave
-- "S" for Strežba. On paper that shift is marked R, for rajon. Rather than
-- hardcoding that mapping, each position now carries its own label and colour,
-- so a restaurant with kitchen/host/barista picks its own.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.positions
  add column if not exists short_label text,
  add column if not exists color       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'positions_short_label_len') then
    alter table public.positions
      add constraint positions_short_label_len
      check (short_label is null or length(btrim(short_label)) between 1 and 3);
  end if;

  -- A fixed palette rather than free hex: the app maps these to system
  -- colours that stay legible in both light and dark mode. An arbitrary hex
  -- would sooner or later be unreadable on one of the two backgrounds.
  if not exists (select 1 from pg_constraint where conname = 'positions_color_allowed') then
    alter table public.positions
      add constraint positions_color_allowed
      check (color is null or color in (
        'blue', 'green', 'orange', 'purple', 'red', 'pink', 'teal', 'brown', 'gray'
      ));
  end if;
end $$;

-- Seed the two we ship with. Only fills blanks, so a label you changed by
-- hand survives a re-run.
update public.positions
set short_label = 'Š', color = 'blue'
where name = 'Šank' and short_label is null;

update public.positions
set short_label = 'R', color = 'green'
where name = 'Strežba' and short_label is null;

-- Anything else gets its first letter and a neutral colour, so no position
-- ends up with a blank badge.
update public.positions
set short_label = upper(left(btrim(name), 1)),
    color = coalesce(color, 'gray')
where short_label is null;

grant update (name, sort_order, is_active, short_label, color)
  on public.positions to authenticated;

-- New restaurants get the same defaults.
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
  values (new_org_id, 'Šank',    1, 'Š', 'blue'),
         (new_org_id, 'Strežba', 2, 'R', 'green');

  insert into public.duties (organization_id, name, sort_order)
  values (new_org_id, 'Priprava', 1), (new_org_id, 'Rajon+Smeti', 2), (new_org_id, 'Roba', 3);
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

notify pgrst, 'reload schema';
