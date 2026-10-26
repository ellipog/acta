-- Tasks put away without being deleted. They leave the board, table and timeline but stay on the public roadmap
alter table public.tasks add column archived_at timestamptz;

-- Same as before, and it can archive tasks and bring them back
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
begin
  if not public.can_edit_board(p_board) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'created', '[]'))
  loop
    n := (t ->> 'number')::int;
    insert into public.tasks as x (
      board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
      description, subtasks, public, shipped_on, position, origin, created_at, archived_at
    )
    values (
      p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
      coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
      (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
      coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
      (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
      case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end,
      (t ->> 'archived_at')::timestamptz
    )
    on conflict (board_id, number) do update set
      title = excluded.title, status = excluded.status, priority = excluded.priority, size = excluded.size,
      project = excluded.project, labels = excluded.labels, start_on = excluded.start_on, due_on = excluded.due_on,
      assignee = excluded.assignee, description = excluded.description, subtasks = excluded.subtasks,
      public = excluded.public, shipped_on = excluded.shipped_on, position = excluded.position,
      archived_at = excluded.archived_at, deleted_at = null
    where x.deleted_at is not null;

    if not found then
      n := public.take_task_number(p_board);
      insert into public.tasks (
        board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
        description, subtasks, public, shipped_on, position, origin, created_at, archived_at
      )
      values (
        p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
        (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
        coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
        (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
        case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end,
        (t ->> 'archived_at')::timestamptz
      );
      moved := moved || jsonb_build_object(t ->> 'number', n);
    end if;
  end loop;

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
      archived_at = case when f ? 'archived_at' then (f ->> 'archived_at')::timestamptz else x.archived_at end
    where x.board_id = p_board and x.number = n;
  end loop;

  update public.tasks set deleted_at = now()
  where board_id = p_board and deleted_at is null
    and number in (select (value #>> '{}')::int from jsonb_array_elements(coalesce(p_changes -> 'deleted', '[]')));

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'order', '[]'))
  loop
    n := coalesce((moved ->> (t ->> 'number'))::int, (t ->> 'number')::int);
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
