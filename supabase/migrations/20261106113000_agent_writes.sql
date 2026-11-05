-- Fewer writes and requests for the agent API and the board, with nothing anyone may see or do changed.
--
-- The new index is built first. Building one only holds up writes to its table, while swapping the trigger on tasks
-- holds up reads of tasks too until the migration ends, so that comes last, once everything else is done

-- The roadmap API now and then deletes the minutes of calls that no longer count. The table's key starts with the
-- key and the caller, so finding the old minutes read every row. This finds them by the minute
create index if not exists roadmap_key_hits_minute on public.roadmap_key_hits (minute);

-- Same as before, with two changes that leave every task as it was left:
--
-- New tasks go in with one statement instead of one each. Which number each one gets is worked out first, the way
-- adding them in turn gave it: the number it came with, unless a task that isn't deleted has that one, and then the
-- board's next. A deleted task's number still brings that task back.
--
-- A task that's both updated and placed, like a card dropped in another column, is written once, with its new
-- position, instead of once for the change and again for the place. Each write to a task also goes out live.
--
-- 20261106110000_sparse_positions made that second change too, and this comes after it so this one is what stays:
-- it also places a task by the number it ended up with, when its own was taken
create or replace function public.apply_board_changes(p_board uuid, p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t jsonb;
  f jsonb;
  n int;
  moved jsonb := '{}'::jsonb;
  me uuid := (select auth.uid());
  my_name text;
  agent boolean := nullif(current_setting('acta.key', true), '') is not null;
  ws uuid;
  -- For new tasks: the board's numbers they ask for that are taken, true where the task is deleted, the board's
  -- next free number, the tasks with the numbers they'll get, and the numbers that went in
  taken jsonb;
  next_free int;
  arriving jsonb := '[]'::jsonb;
  landed int[];
  -- For placing: each placed task's position by its number, and the tasks whose update wrote it
  positions jsonb;
  rewritten int[] := '{}';
begin
  select workspace_id into ws from public.boards where id = p_board;
  if ws is null or not public.is_member(ws) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Each part of the changes needs its own permission, so a viewer can still comment and vote
  if (public.has_items(p_changes, 'created') or public.has_items(p_changes, 'updated')
      or public.has_items(p_changes, 'order') or public.has_items(p_changes, 'unactivity'))
    and not public.can(ws, 'edit') then
    raise exception 'You can’t edit tasks on this board' using errcode = '42501';
  end if;
  if public.has_items(p_changes, 'deleted') and not public.can(ws, 'delete') then
    raise exception 'You can’t delete tasks on this board' using errcode = '42501';
  end if;
  if (public.has_items(p_changes, 'comments') or public.has_items(p_changes, 'voted')
      or public.has_items(p_changes, 'suggested') or public.has_items(p_changes, 'suggestionVoted'))
    and not public.can(ws, 'comment') then
    raise exception 'You can’t comment or vote on this board' using errcode = '42501';
  end if;
  -- A comment leaves a line in its task's activity. Anything else written there comes with an edit
  if public.has_items(p_changes, 'activity') and not public.can(ws, 'edit') and (
    not public.can(ws, 'comment')
    or exists (
      select 1 from jsonb_array_elements(p_changes -> 'activity') a where a ->> 'text' is distinct from 'commented'
    )
  ) then
    raise exception 'You can’t edit tasks on this board' using errcode = '42501';
  end if;
  if (p_changes ? 'board' or public.has_items(p_changes, 'declined')) and not public.can(ws, 'roadmap') then
    raise exception 'You can’t change the public roadmap here' using errcode = '42501';
  end if;

  if public.has_items(p_changes, 'created') then
    -- Holding the board's row, without writing it, keeps another save from adding tasks here until this one is
    -- done, as writing the next number for its first task used to, so the numbers worked out below stay free
    select next_number into next_free from public.boards where id = p_board for update;
    select coalesce(jsonb_object_agg(x.number::text, x.deleted_at is not null), '{}') into taken
    from public.tasks x
    where x.board_id = p_board
      and x.number in (select (c ->> 'number')::int from jsonb_array_elements(p_changes -> 'created') c);

    for t in select * from jsonb_array_elements(p_changes -> 'created')
    loop
      n := (t ->> 'number')::int;
      if n is not null then
        -- Taken by a task that isn't deleted, so it gets the board's next
        if taken -> (n::text) = 'false'::jsonb then
          n := next_free;
          moved := moved || jsonb_build_object(t ->> 'number', n);
        end if;
        -- A number no task had moves the next one past it. Bringing a deleted task back doesn't
        if not (taken ? (n::text)) then
          next_free := greatest(next_free, n + 1);
        end if;
        taken := taken || jsonb_build_object(n::text, false);
      end if;
      arriving := arriving || jsonb_build_array(t || jsonb_build_object('number', n, 'asked', t -> 'number'));
    end loop;

    with put as (
      insert into public.tasks as x (
        board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
        description, subtasks, public, shipped_on, position, origin, created_at, archived_at, custom, closed_at
      )
      select
        p_board, (e.task ->> 'number')::int, e.task ->> 'title', e.task ->> 'status',
        coalesce(e.task ->> 'priority', 'none'), e.task ->> 'size', e.task ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(e.task -> 'labels', '[]'))), '{}'),
        (e.task ->> 'start_on')::date, (e.task ->> 'due_on')::date, (e.task ->> 'assignee')::uuid,
        coalesce(e.task ->> 'description', ''), coalesce(e.task -> 'subtasks', '[]'),
        coalesce((e.task ->> 'public')::boolean, false), (e.task ->> 'shipped_on')::date,
        coalesce((e.task ->> 'position')::double precision, 0), (e.task ->> 'origin')::uuid,
        case when agent then least(coalesce((e.task ->> 'created_at')::timestamptz, now()), now()) else now() end,
        (e.task ->> 'archived_at')::timestamptz, coalesce(e.task -> 'custom', '{}'),
        case when agent then (e.task ->> 'closed_at')::timestamptz end
      from jsonb_array_elements(arriving) as e(task)
      on conflict (board_id, number) do update set
        title = excluded.title, status = excluded.status, priority = excluded.priority, size = excluded.size,
        project = excluded.project, labels = excluded.labels, start_on = excluded.start_on, due_on = excluded.due_on,
        assignee = excluded.assignee, description = excluded.description, subtasks = excluded.subtasks,
        public = excluded.public, shipped_on = excluded.shipped_on, position = excluded.position,
        archived_at = excluded.archived_at, custom = excluded.custom, deleted_at = null
      where x.deleted_at is not null
      returning x.number
    )
    select coalesce(array_agg(put.number), '{}') into landed from put;

    -- A task whose number was taken meanwhile anyway, by a task added some other way, gets the board's next
    for t in
      select e.task from jsonb_array_elements(arriving) as e(task) where (e.task ->> 'number')::int <> all (landed)
    loop
      n := public.take_task_number(p_board);
      insert into public.tasks (
        board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
        description, subtasks, public, shipped_on, position, origin, created_at, archived_at, custom, closed_at
      )
      values (
        p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
        (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
        coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
        (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
        case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end,
        (t ->> 'archived_at')::timestamptz, coalesce(t -> 'custom', '{}'),
        case when agent then (t ->> 'closed_at')::timestamptz end
      );
      moved := moved || jsonb_build_object(t ->> 'asked', n);
    end loop;
  end if;

  -- Where the changes place each task, the last place given winning as it did when they were written in turn
  select coalesce(jsonb_object_agg(l.num::text, l.place), '{}') into positions
  from (
    select distinct on (o.num) o.num, o.place
    from (
      select coalesce((moved ->> (a.item ->> 'number'))::int, (a.item ->> 'number')::int) as num,
        a.item -> 'position' as place, a.i
      from jsonb_array_elements(coalesce(p_changes -> 'order', '[]')) with ordinality as a(item, i)
    ) o
    where o.num is not null
    order by o.num, o.i desc
  ) l;

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'updated', '[]'))
  loop
    f := t -> 'fields';
    n := coalesce((moved ->> (t ->> 'number'))::int, (t ->> 'number')::int);
    update public.tasks x set
      title = case when f ? 'title' then f ->> 'title' else x.title end,
      status = case when f ? 'status' then f ->> 'status' else x.status end,
      priority = case when f ? 'priority' then f ->> 'priority' else x.priority end,
      size = case when f ? 'size' then f ->> 'size' else x.size end,
      project = case when f ? 'project' then f ->> 'project' else x.project end,
      labels = case when f ? 'labels' then array(select jsonb_array_elements_text(f -> 'labels')) else x.labels end,
      start_on = case when f ? 'start_on' then (f ->> 'start_on')::date else x.start_on end,
      due_on = case when f ? 'due_on' then (f ->> 'due_on')::date else x.due_on end,
      assignee = case when f ? 'assignee' then (f ->> 'assignee')::uuid else x.assignee end,
      description = case when f ? 'description' then f ->> 'description' else x.description end,
      subtasks = case when f ? 'subtasks' then f -> 'subtasks' else x.subtasks end,
      public = case when f ? 'public' then (f ->> 'public')::boolean else x.public end,
      shipped_on = case when f ? 'shipped_on' then (f ->> 'shipped_on')::date else x.shipped_on end,
      archived_at = case when f ? 'archived_at' then (f ->> 'archived_at')::timestamptz else x.archived_at end,
      custom = case when f ? 'custom' then coalesce(f -> 'custom', '{}') else x.custom end,
      position = case when positions ? (n::text) then (positions ->> (n::text))::double precision else x.position end
    where x.board_id = p_board and x.number = n;
    rewritten := rewritten || n;
  end loop;

  update public.tasks set deleted_at = now()
  where board_id = p_board and deleted_at is null
    and number in (select (value #>> '{}')::int from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')));

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'order', '[]'))
  loop
    n := coalesce((moved ->> (t ->> 'number'))::int, (t ->> 'number')::int);
    -- Its update above wrote its position already
    continue when n = any (rewritten);
    update public.tasks set position = (t ->> 'position')::double precision
    where board_id = p_board and number = n and position is distinct from (t ->> 'position')::double precision;
  end loop;

  insert into public.task_votes (board_id, number, voter)
  select p_board, coalesce((moved ->> (value #>> '{}'))::int, (value #>> '{}')::int), 'u:' || me::text
  from jsonb_array_elements(coalesce(p_changes -> 'voted', '[]'))
  on conflict do nothing;

  delete from public.task_votes
  where board_id = p_board and voter = 'u:' || me::text
    and number in (select (value #>> '{}')::int from jsonb_array_elements(coalesce(p_changes -> 'unvoted', '[]')));

  insert into public.comments (id, board_id, number, body, created_at, author_name)
  select (c ->> 'id')::uuid, p_board, coalesce((moved ->> (c ->> 'number'))::int, (c ->> 'number')::int), c ->> 'body',
    case when agent then least(coalesce((c ->> 'created_at')::timestamptz, now()), now()) else now() end,
    case when agent then nullif(left(btrim(c ->> 'author_name'), 60), '') end
  from jsonb_array_elements(coalesce(p_changes -> 'comments', '[]')) c
  on conflict (id) do nothing;

  delete from public.comments
  where board_id = p_board
    and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'uncomments', '[]')));

  insert into public.activity (id, board_id, number, text, created_at)
  select (a ->> 'id')::uuid, p_board, coalesce((moved ->> (a ->> 'number'))::int, (a ->> 'number')::int), left(a ->> 'text', 300),
    case when agent then least(coalesce((a ->> 'created_at')::timestamptz, now()), now()) else now() end
  from jsonb_array_elements(coalesce(p_changes -> 'activity', '[]')) a
  on conflict (id) do nothing;

  delete from public.activity
  where board_id = p_board
    and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'unactivity', '[]')));

  -- Old dates would slip past a board that catches up on what changed lately, so their task counts as changed now
  if agent then
    update public.tasks set updated_at = now()
    where board_id = p_board and number in (
      select coalesce((moved ->> (x ->> 'number'))::int, (x ->> 'number')::int)
      from jsonb_array_elements(coalesce(p_changes -> 'comments', '[]') || coalesce(p_changes -> 'activity', '[]')) x
      where x ? 'created_at'
    );
  end if;

  if p_changes ? 'board' then
    f := p_changes -> 'board';
    update public.boards set
      roadmap_public = case when f ? 'roadmap_public' then (f ->> 'roadmap_public')::boolean else roadmap_public end,
      page = case when f ? 'page' then f -> 'page' else page end
    where id = p_board;
  end if;

  if jsonb_array_length(coalesce(p_changes -> 'suggested', '[]')) > 0 then
    select name into my_name from public.profiles where id = me;
    insert into public.suggestions (id, board_id, title, details, by_name)
    select (s ->> 'id')::uuid, p_board, s ->> 'title', s ->> 'details', coalesce(left(my_name, 60), 'Anonymous')
    from jsonb_array_elements(p_changes -> 'suggested') s
    on conflict (id) do nothing;
  end if;

  insert into public.suggestion_votes (suggestion_id, voter)
  select (value #>> '{}')::uuid, 'u:' || me::text
  from jsonb_array_elements(coalesce(p_changes -> 'suggestionVoted', '[]'))
  on conflict do nothing;

  delete from public.suggestion_votes
  where voter = 'u:' || me::text
    and suggestion_id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'suggestionUnvoted', '[]')));

  delete from public.suggestions
  where board_id = p_board
    and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'declined', '[]')));

  return jsonb_build_object('moved', moved, 'next', (select next_number from public.boards where id = p_board));
end;
$$;

-- An agent's save can name tasks that have to be there and not deleted, like the one a comment goes on, and they're
-- checked here as it saves. The server used to read the task first, a round trip of its own, and now reads it only
-- when this turns the save down, to say what's wrong. Same as before otherwise. The new argument has a default, so
-- the old function goes, or the two would be too alike to call
drop function if exists public.agent_apply(text, uuid, jsonb);

create function public.agent_apply(p_key text, p_board uuid, p_changes jsonb, p_live int[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.boards where id = p_board;
  if ws is null then
    raise exception 'No such board' using errcode = 'P0002';
  end if;
  perform public.agent_act(p_key, case when p_changes ?| array['board', 'declined'] then 'manage' else 'write' end, ws);
  if exists (
    select 1 from unnest(p_live) as l(number)
    where not exists (
      select 1 from public.tasks x where x.board_id = p_board and x.number = l.number and x.deleted_at is null
    )
  ) then
    raise exception 'No such task' using errcode = 'P0002';
  end if;
  return public.apply_board_changes(
    p_board,
    p_changes - array['uncomments', 'unactivity', 'voted', 'unvoted', 'suggested', 'suggestionVoted', 'suggestionUnvoted']
  );
end;
$$;

revoke execute on function public.agent_apply(text, uuid, jsonb, int[]) from public, anon, authenticated;
grant execute on function public.agent_apply(text, uuid, jsonb, int[]) to service_role;

-- list_boards counted each board's open tasks with a request a board, and get_board each status with a request a
-- status. This counts them all at once: tasks that aren't deleted, by board, status and whether they're archived.
-- Only the agent API calls it, with the server's own key, which already reads every board
create function public.agent_task_counts(p_boards uuid[])
returns table (board_id uuid, status text, archived boolean, tasks bigint)
language sql
stable
set search_path = ''
as $$
  select t.board_id, t.status, t.archived_at is not null, count(*)
  from public.tasks t
  where t.board_id = any (p_boards) and t.deleted_at is null
  group by t.board_id, t.status, t.archived_at is not null;
$$;

revoke execute on function public.agent_task_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.agent_task_counts(uuid[]) to service_role;

-- A new task moved its board's next number on once a task, so a save that added 50 wrote the board's row 50 times,
-- and every write to boards also goes out to everyone watching the board live. Now it's once a statement, past the
-- highest number the statement took, and apply_board_changes above adds its tasks in one statement. As before, the
-- board is only written when the number moves on, a task brought back from deleted doesn't move it, and a task made
-- from a suggestion takes the suggestion's votes
drop trigger if exists tasks_created on public.tasks;

create or replace function public.task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boards b set next_number = m.top + 1
  from (select c.board_id, max(c.number) as top from created c group by c.board_id) m
  where b.id = m.board_id and b.next_number <= m.top;
  insert into public.task_votes (board_id, number, voter)
  select c.board_id, c.number, v.voter
  from created c
  join public.suggestion_votes v on v.suggestion_id = c.origin
  on conflict do nothing;
  return null;
end;
$$;

create trigger tasks_created after insert on public.tasks
  referencing new table as created
  for each statement execute function public.task_created();
