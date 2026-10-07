---
description: Write the next Supabase migration with RLS, types and isolation checks
argument-hint: <what the schema change should do>
---
Write a Supabase migration for: $ARGUMENTS

1. List `supabase/migrations/` and use the next number. Never edit an existing migration.
2. Read the migrations that touch the same tables first, plus 0016/0017 for house style: a header comment explaining why, numbered sections, idempotent (`drop … if exists` before `create`).
3. Any new tenant table: `organization_id` set by trigger from `auth.uid()` (the client never sends it), RLS enabled, policies using `public.current_org_id()` / `public.current_user_role()`, and grants limited to the columns actually needed.
4. `SECURITY DEFINER` functions: `set search_path = public`, check org and role inside the function, and say in a comment why definer is needed.
5. Update `src/types/index.ts` to mirror the change, and the hooks that read those tables.
6. If a tenant table was added, add PASS and attack steps to `supabase/verify_isolation.sql`.
7. Do not apply it. Finish by telling me the file to paste into the Supabase SQL editor, and which `verify_isolation.sql` steps to run afterwards.
