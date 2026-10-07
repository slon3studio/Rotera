-- ----------------------------------------------------------------------------
-- 0015 — put shift_swaps on Realtime
--
-- 0013 added shifts, schedules and cover_requests to the Realtime publication;
-- 0014 created shift_swaps afterwards and never joined it. Without this, a
-- rotation only appears on the other person's schedule after a manual pull,
-- which for something two people are waiting on is too slow to trust.
--
-- Nothing else changes: no new columns, no policy changes. RLS still decides
-- who receives a row, so a worker never sees another restaurant's rotations.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shift_swaps'
  ) then
    alter publication supabase_realtime add table public.shift_swaps;
  end if;
end $$;

notify pgrst, 'reload schema';
