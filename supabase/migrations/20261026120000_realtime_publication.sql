-- Live boards listen for row changes on these tables. Idempotent, so it is safe on
-- projects where they were already added to the publication from the dashboard.
do $$
declare
  t text;
begin
  foreach t in array array['boards', 'tasks', 'comments', 'activity', 'suggestions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
