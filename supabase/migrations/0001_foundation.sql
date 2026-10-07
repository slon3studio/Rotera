-- ============================================================================
-- Rotaly — Migration 0001: Foundation
-- Tables: organizations, profiles
-- Plus: RLS policies enforcing multi-tenant isolation by organization_id
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything is guarded with IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Enum: user role
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('worker', 'manager');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- One row per restaurant. This is the tenant boundary — every other table in
-- the app carries an organization_id pointing here.
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 100),
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

-- Extends auth.users. Deleting the auth user deletes the profile.
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  full_name        text not null check (length(btrim(full_name)) between 1 and 100),
  role             public.user_role not null default 'worker',
  created_at       timestamptz not null default now()
);

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

-- ----------------------------------------------------------------------------
-- 3. Helper functions used by every RLS policy
--
-- These are SECURITY DEFINER on purpose. A policy on `profiles` that queries
-- `profiles` to find the caller's organization would recurse infinitely, so
-- the lookup has to happen in a function that bypasses RLS.
--
-- Both return NULL for a user who has no profile yet (i.e. mid-signup). Every
-- policy below compares against these, and `x = NULL` is never true, so a
-- profile-less user sees exactly zero rows. That is the safe default.
-- ----------------------------------------------------------------------------

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Join-code generation
--
-- 6 characters from an alphabet with no 0/O/1/I/L, so codes can be read aloud
-- or texted without confusion. Not client-callable.
-- ----------------------------------------------------------------------------

create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.organizations where join_code = code);
  end loop;
  return code;
end;
$$;

revoke all on function public.generate_join_code() from public;

-- ----------------------------------------------------------------------------
-- 5. Signup RPCs
--
-- Profiles are NEVER inserted directly by the client — there is no INSERT
-- policy and no INSERT grant on public.profiles. The only two ways to get a
-- profile are these two functions, which both:
--   * require an authenticated caller
--   * refuse if the caller already has a profile (no org-hopping)
--   * decide the role themselves (a worker cannot make themselves a manager)
-- ----------------------------------------------------------------------------

-- Manager path: create a brand new restaurant and become its manager.
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
end;
$$;

-- Worker path: join an existing restaurant using its join code.
create or replace function public.join_organization(
  code        text,
  worker_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target_org_id uuid;
begin
  if uid is null then
    raise exception 'Niste prijavljeni.' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'Ta uporabnik je že član restavracije.' using errcode = '23505';
  end if;

  if length(btrim(coalesce(worker_name, ''))) = 0 then
    raise exception 'Ime in priimek sta obvezna.' using errcode = '22023';
  end if;

  select o.id into target_org_id
  from public.organizations o
  where o.join_code = upper(btrim(coalesce(code, '')));

  if target_org_id is null then
    raise exception 'Neveljavna koda restavracije.' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, target_org_id, btrim(worker_name), 'worker');
end;
$$;

revoke all on function public.create_organization(text, text) from public;
revoke all on function public.join_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.join_organization(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security
-- ----------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;

-- Column-level grants. RLS decides WHICH ROWS you can touch; these decide
-- WHICH COLUMNS. Without this a worker could pass the "update own profile"
-- policy while flipping their own role to 'manager'.
revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles      from anon, authenticated;

grant select         on public.organizations to authenticated;
grant update (name)  on public.organizations to authenticated;

grant select              on public.profiles to authenticated;
grant update (full_name)  on public.profiles to authenticated;

-- organizations ---------------------------------------------------------------

drop policy if exists "organizations_select_own" on public.organizations;
create policy "organizations_select_own"
  on public.organizations
  for select
  to authenticated
  using (id = public.current_org_id());

drop policy if exists "organizations_update_by_manager" on public.organizations;
create policy "organizations_update_by_manager"
  on public.organizations
  for update
  to authenticated
  using (id = public.current_org_id() and public.current_user_role() = 'manager')
  with check (id = public.current_org_id());

-- No INSERT/DELETE policy: organizations are only ever created through
-- public.create_organization(), and are never deleted from the client.

-- profiles --------------------------------------------------------------------

drop policy if exists "profiles_select_same_org" on public.profiles;
create policy "profiles_select_same_org"
  on public.profiles
  for select
  to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and organization_id = public.current_org_id());

-- No INSERT policy: profiles are only created through the two signup RPCs.
-- No DELETE policy: removing a user is a support action, not a client action.
