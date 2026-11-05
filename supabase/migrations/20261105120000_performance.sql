-- Faster reads and fewer writes, with nothing anyone may see or do changed.
--
-- The new indexes are built first. Building one only holds up writes to its table, while changing a policy or
-- dropping an index holds up reads too until the migration ends, so those come last, once the slow part is done

-- Catching up after a reconnect reads a board's comments and activity since a time, and agents read a board's
-- latest activity. The board load reads each task's thread in order and its latest 100 activity lines, which these
-- let it read in order and stop early, so they replace the indexes on (board_id, number) alone (dropped at the end).
-- Deletes from tasks still find their rows through the leading columns
create index if not exists activity_board_recent on public.activity (board_id, created_at desc);
create index if not exists comments_board_recent on public.comments (board_id, created_at);
create index if not exists activity_task_recent on public.activity (board_id, number, created_at desc);
create index if not exists comments_task_thread on public.comments (board_id, number, created_at);

-- My tasks and the counts beside each board's name look tasks up by who they're assigned to. Columns that change on
-- every move, like position and updated_at, stay unindexed so those updates can stay in place
create index if not exists tasks_assignee_open on public.tasks (assignee, board_id) where deleted_at is null;

-- Row security on the big tables asked can_edit_board(board_id) of every row. It's a security definer function, so
-- Postgres can't fold it into the query and calls it once a row, and a board load reads every task, comment and
-- activity line on the board. my_board_ids() answers the same question once a query: the boards in the workspaces
-- you belong to. A row is visible exactly when can_edit_board said so, since that was membership of the board's
-- workspace too. Policies on writes are left as they are, as they run once for each row written

create or replace function public.my_board_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bo.id
  from public.boards bo
  join public.members m on m.workspace_id = bo.workspace_id
  where m.user_id = (select auth.uid());
$$;

revoke execute on function public.my_board_ids() from public, anon;
grant execute on function public.my_board_ids() to authenticated;

alter policy "Members see tasks" on public.tasks using (board_id in (select public.my_board_ids()));
alter policy "Members see comments" on public.comments using (board_id in (select public.my_board_ids()));
alter policy "Members see activity" on public.activity using (board_id in (select public.my_board_ids()));
alter policy "Members see suggestions" on public.suggestions using (board_id in (select public.my_board_ids()));
alter policy "Members see declined ideas" on public.declined_suggestions
  using (board_id in (select public.my_board_ids()));
-- Every pull request, branch and commit on a task is a row here. This asked is_member() of each one's board, which
-- comes to the same as membership of the board's workspace
alter policy "Members see what GitHub says about tasks" on public.task_links
  using (board_id in (select public.my_board_ids()));

-- Each new task wrote its board's row again, even when next_number was already past it, and every write to boards
-- also goes out to everyone watching the board live. Now it's only written when the number moves on
create or replace function public.task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boards set next_number = new.number + 1 where id = new.board_id and next_number <= new.number;
  if new.origin is not null then
    insert into public.task_votes (board_id, number, voter)
    select new.board_id, new.number, voter from public.suggestion_votes where suggestion_id = new.origin
    on conflict do nothing;
  end if;
  return null;
end;
$$;

-- The guard on boards only looks at these columns, and boards has no other trigger that changes a row before it's
-- written, so it fires only when an update sets one of them. Taking the next task number no longer runs it
create or replace trigger boards_guard
  before update of roadmap_public, page, name, slug, labels, projects, position, fields, status_names, icon
  on public.boards
  for each row execute function public.guard_board_edit();

-- New comments ask which agent key is acting. Comparing ids as text couldn't use the primary key, so it read every
-- key. The setting is a key's id or something else, like "github": only an id written the way Postgres writes one
-- matched before, so only that is turned into a uuid
create or replace function public.current_agent_key()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select k.id
  from public.agent_keys k
  where k.id = (
    select case when s ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid end
    from (select current_setting('acta.key', true) as s) setting
  );
$$;

-- The public page is cached and shared between visitors now, so it no longer knows what each of them voted for.
-- This says, for one visitor: what they voted for on the page, with the latest counts for those, and ideas they
-- sent in the last hour, which a cached page may not have yet. Like public_roadmap it shows only what the page shows
create or replace function public.public_votes(p_board uuid, p_visitor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.boards;
  who text;
begin
  who := case
    when (select auth.uid()) is not null then 'u:' || (select auth.uid())::text
    when p_visitor ~ '^v:[A-Za-z0-9-]{8,64}$' then p_visitor
  end;
  select * into b from public.boards where id = p_board;
  if who is null or b.id is null or not b.roadmap_public then
    return jsonb_build_object('tasks', '[]'::jsonb, 'suggestions', '[]'::jsonb, 'mine', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('number', t.number, 'votes', t.vote_count))
      from public.tasks t
      where t.board_id = b.id and t.public and t.deleted_at is null and t.status <> 'canceled'
        and exists (select 1 from public.task_votes v where v.board_id = t.board_id and v.number = t.number and v.voter = who)
    ), '[]'),
    -- The ideas the page lists, as public_roadmap picks them
    'suggestions', case when public.page_flag(b.page, 'ideasPublic', true) then coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'votes', s.vote_count))
      from (
        select id, vote_count from public.suggestions
        where board_id = b.id order by vote_count desc, created_at desc limit 200
      ) s
      where exists (select 1 from public.suggestion_votes v where v.suggestion_id = s.id and v.voter = who)
    ), '[]') else '[]' end,
    'mine', case when public.page_flag(b.page, 'ideasPublic', true) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'details', s.details, 'by', s.by_name, 'at', s.created_at, 'votes', s.vote_count,
        'voted', exists (select 1 from public.suggestion_votes v where v.suggestion_id = s.id and v.voter = who)
      ) order by s.created_at desc)
      from (
        select * from public.suggestions
        where by_visitor = who and board_id = b.id and created_at > now() - interval '1 hour'
        order by created_at desc
        limit 20
      ) s
    ), '[]') else '[]' end
  );
end;
$$;

revoke execute on function public.public_votes(uuid, text) from public;
grant execute on function public.public_votes(uuid, text) to anon, authenticated;

-- The indexes the new ones replace
drop index if exists public.activity_task;
drop index if exists public.comments_task;
