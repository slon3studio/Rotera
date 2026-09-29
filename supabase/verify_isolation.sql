-- ============================================================================
-- Rotaly — Multi-tenant isolation test
--
-- This is the gate for Phase 2: proof that one restaurant can never see
-- another's data.
--
-- Nothing in here needs editing — it finds the test users by itself. Every
-- block ends in ROLLBACK, so your data is never modified.
--
-- SETUP IT EXPECTS: two organizations named 'Org A' and 'Org B', each with a
-- manager, and at least one worker somewhere.
--
-- HOW TO RUN — one block at a time. Highlight a block, press Run (the button
-- changes to "Run selected"). Running several at once only shows you the last
-- one's result, and the first error stops everything after it.
--
--   STEPS 1-4 and 10 must each return result = PASS.
--
--   STEPS 5-9 are attack tests that are SUPPOSED to fail. Each must produce a
--   red error message. An error there is the pass condition; a block that
--   succeeds quietly is a security hole.
--
-- Each block impersonates a real user by setting the same JWT claim Supabase's
-- API sets, then switches to the `authenticated` role so RLS actually applies.
-- Running as `postgres` (the editor default) bypasses RLS entirely — that is
-- why the role switch matters.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0 — What are we testing against?
-- ----------------------------------------------------------------------------
select
  o.name         as organization,
  o.join_code,
  p.full_name,
  p.role,
  p.id           as user_id
from public.profiles p
join public.organizations o on o.id = p.organization_id
order by o.name, p.role desc, p.full_name;


-- ----------------------------------------------------------------------------
-- STEP 1 — The Org A manager sees only Org A
--
-- EXPECTED: both checks PASS. `names` must not contain anyone from Org B.
-- ----------------------------------------------------------------------------
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select p.id
              from public.profiles p
              join public.organizations o on o.id = p.organization_id
              where o.name = 'Org A' and p.role = 'manager'
              limit 1),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select
    case when count(*) = 1 and min(name) = 'Org A' then 'PASS' else 'FAIL' end as result,
    'Org A manager sees exactly 1 organization'                               as check,
    count(*)                                                                  as visible,
    coalesce(string_agg(name, ', '), '(none)')                                as names
  from public.organizations
  union all
  select
    case when count(*) > 0
          and count(*) filter (where organization_id <> public.current_org_id()) = 0
         then 'PASS' else 'FAIL' end,
    'Org A manager sees only Org A staff',
    count(*),
    coalesce(string_agg(full_name, ', '), '(none)')
  from public.profiles;
rollback;


-- ----------------------------------------------------------------------------
-- STEP 2 — The Org B manager sees only Org B
--
-- EXPECTED: both checks PASS. `names` must not contain the Org A manager.
-- ----------------------------------------------------------------------------
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select p.id
              from public.profiles p
              join public.organizations o on o.id = p.organization_id
              where o.name = 'Org B' and p.role = 'manager'
              limit 1),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select
    case when count(*) = 1 and min(name) = 'Org B' then 'PASS' else 'FAIL' end as result,
    'Org B manager sees exactly 1 organization'                               as check,
    count(*)                                                                  as visible,
    coalesce(string_agg(name, ', '), '(none)')                                as names
  from public.organizations
  union all
  select
    case when count(*) > 0
          and count(*) filter (where organization_id <> public.current_org_id()) = 0
         then 'PASS' else 'FAIL' end,
    'Org B manager sees only Org B staff',
    count(*),
    coalesce(string_agg(full_name, ', '), '(none)')
  from public.profiles;
rollback;


-- ----------------------------------------------------------------------------
-- STEP 3 — A signed-up user with no profile yet sees nothing
--
-- Simulates the moment between "account created" and "joined a restaurant".
-- EXPECTED: PASS, 0 organizations and 0 profiles visible.
-- ----------------------------------------------------------------------------
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select
    case when (select count(*) from public.organizations) = 0
          and (select count(*) from public.profiles) = 0
         then 'PASS' else 'FAIL' end                as result,
    'user with no profile sees nothing'             as check,
    (select count(*) from public.organizations)     as orgs_visible,
    (select count(*) from public.profiles)          as people_visible;
rollback;


-- ----------------------------------------------------------------------------
-- STEP 4 — Sanity check: RLS is switched on for both tables
--
-- EXPECTED: PASS, both tables listed with rowsecurity true.
-- ----------------------------------------------------------------------------
select
  case when bool_and(rowsecurity) and count(*) = 2 then 'PASS' else 'FAIL' end as result,
  'RLS enabled on both tables'                                                as check,
  string_agg(tablename || '=' || rowsecurity::text, ', ')                     as detail
from pg_tables
where schemaname = 'public'
  and tablename in ('organizations', 'profiles');


-- ============================================================================
-- PASS 2 STARTS HERE — run each remaining block ON ITS OWN.
-- Every one of these is SUPPOSED to produce an error.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 5 — A worker CANNOT promote themselves to manager
--
-- EXPECTED: this block FAILS with "permission denied for column role".
-- An error here is the correct outcome. If it succeeds, that is a
-- privilege-escalation hole.
-- ----------------------------------------------------------------------------
begin;
  select set_config('test.worker_id',
    (select id::text from public.profiles where role = 'worker' limit 1), true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.worker_id'), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  update public.profiles
  set role = 'manager'
  where id = current_setting('test.worker_id')::uuid;
rollback;


-- ----------------------------------------------------------------------------
-- STEP 6 — A worker CANNOT move themselves into another organization
--
-- EXPECTED: FAILS with "permission denied for column organization_id".
-- ----------------------------------------------------------------------------
begin;
  select set_config('test.worker_id',
    (select id::text from public.profiles where role = 'worker' limit 1), true);
  select set_config('test.other_org_id',
    (select o.id::text
     from public.organizations o
     where o.id <> (select organization_id from public.profiles
                    where id = current_setting('test.worker_id')::uuid)
     limit 1), true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.worker_id'), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  update public.profiles
  set organization_id = current_setting('test.other_org_id')::uuid
  where id = current_setting('test.worker_id')::uuid;
rollback;


-- ----------------------------------------------------------------------------
-- STEP 7 — A worker CANNOT join a second restaurant
--
-- EXPECTED: FAILS with "Ta uporabnik je že član restavracije."
-- ----------------------------------------------------------------------------
begin;
  select set_config('test.worker_id',
    (select id::text from public.profiles where role = 'worker' limit 1), true);
  select set_config('test.other_join_code',
    (select o.join_code
     from public.organizations o
     where o.id <> (select organization_id from public.profiles
                    where id = current_setting('test.worker_id')::uuid)
     limit 1), true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.worker_id'), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select public.join_organization(current_setting('test.other_join_code'), 'Vsiljivec');
rollback;


-- ----------------------------------------------------------------------------
-- STEP 8 — A user CANNOT insert a profile directly
--
-- EXPECTED: FAILS with "permission denied for table profiles".
-- ----------------------------------------------------------------------------
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  insert into public.profiles (id, organization_id, full_name, role)
  values (gen_random_uuid(),
          (select id from public.organizations limit 1),
          'Vsiljivec', 'manager');
rollback;


-- ----------------------------------------------------------------------------
-- STEP 9 — A worker CANNOT copy last week's schedule (0019)
--
-- EXPECTED: FAILS with "Samo vodja lahko kopira urnik."
-- ----------------------------------------------------------------------------
begin;
  select set_config('test.worker_id',
    (select id::text from public.profiles where role = 'worker' limit 1), true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.worker_id'), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select public.copy_previous_week(date_trunc('week', current_date)::date);
rollback;


-- ----------------------------------------------------------------------------
-- STEP 10 — A worker CANNOT switch tips off for the organization (0019)
--
-- Not an error: the 0001 update policy is manager-only, so the worker's
-- update matches no row. EXPECTED: result = PASS, rows_changed = 0.
-- ----------------------------------------------------------------------------
begin;
  select set_config('test.worker_id',
    (select id::text from public.profiles where role = 'worker' limit 1), true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.worker_id'), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  with changed as (
    update public.organizations
    set tracks_tips = not tracks_tips
    returning id
  )
  select
    case when (select count(*) from changed) = 0 then 'PASS' else 'FAIL' end as result,
    (select count(*) from changed) as rows_changed;
rollback;
