-- The board saves as the person signed in, and Postgres checks every column a statement names, even one set to
-- what it already holds. Imports made the save write created_at on new tasks, comments and activity, and a
-- comment's author_name, and archiving made it write archived_at on every task it touches, but signed-in people
-- were never allowed those columns. So changing any task, adding one and commenting were all refused as
-- "permission denied". They may write them now
grant insert (created_at, archived_at) on public.tasks to authenticated;
grant update (archived_at) on public.tasks to authenticated;
grant insert (created_at, author_name) on public.comments to authenticated;
grant insert (created_at) on public.activity to authenticated;

-- Only agents may keep an imported date or credit a comment to another name. Agents save through functions that
-- mark the transaction with their key, which nobody can do from the API. Everyone else gets the time it is now,
-- and their own name
create function public.stamp_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('acta.key', true), '') = '' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create function public.stamp_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('acta.key', true), '') = '' then
    new.created_at := now();
    new.author_name := null;
  end if;
  return new;
end;
$$;

create trigger tasks_stamp before insert on public.tasks
  for each row execute function public.stamp_created();
create trigger activity_stamp before insert on public.activity
  for each row execute function public.stamp_created();
create trigger comments_stamp before insert on public.comments
  for each row execute function public.stamp_comment();
