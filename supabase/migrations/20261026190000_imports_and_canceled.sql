-- Work that was dropped rather than finished
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('backlog', 'todo', 'in_progress', 'review', 'done', 'canceled'));

-- Who wrote a comment somewhere else, such as on a GitHub issue an agent brought over. The comment still
-- belongs to the person whose key added it
alter table public.comments add column author_name text check (char_length(author_name) between 1 and 60);

-- Same as before, except that an agent bringing work over from elsewhere can keep when tasks, comments and
-- activity happened, and who wrote each comment. People's own edits always happen now
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
      description, subtasks, public, shipped_on, position, origin, created_at
    )
    values (
      p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
      coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
      (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
      coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
      (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
      case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end
    )
    on conflict (board_id, number) do update set
      title = excluded.title, status = excluded.status, priority = excluded.priority, size = excluded.size,
      project = excluded.project, labels = excluded.labels, start_on = excluded.start_on, due_on = excluded.due_on,
      assignee = excluded.assignee, description = excluded.description, subtasks = excluded.subtasks,
      public = excluded.public, shipped_on = excluded.shipped_on, position = excluded.position, deleted_at = null
    where x.deleted_at is not null;

    if not found then
      n := public.take_task_number(p_board);
      insert into public.tasks (
        board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
        description, subtasks, public, shipped_on, position, origin, created_at
      )
      values (
        p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
        (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
        coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
        (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
        case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end
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
      shipped_on = case when f ? 'shipped_on' then (f ->> 'shipped_on')::date else x.shipped_on end
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

-- Canceled work stays off the public roadmap
create or replace function public.public_roadmap(p_workspace text, p_board text, p_visitor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workspaces;
  b public.boards;
  who text;
  team boolean;
begin
  select * into w from public.workspaces where slug = p_workspace;
  if w.id is null then
    return null;
  end if;
  select * into b from public.boards where workspace_id = w.id and slug = p_board;
  if b.id is null then
    return null;
  end if;
  if not b.roadmap_public then
    return jsonb_build_object('private', true, 'workspace', jsonb_build_object('name', w.name, 'slug', w.slug));
  end if;

  who := case
    when (select auth.uid()) is not null then 'u:' || (select auth.uid())::text
    when p_visitor ~ '^v:[A-Za-z0-9-]{8,64}$' then p_visitor
  end;
  team := public.page_flag(b.page, 'showTeam', false);

  return jsonb_build_object(
    'workspace', jsonb_build_object('name', w.name, 'slug', w.slug, 'sigil', w.sigil, 'tone', w.tone),
    'board', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'prefix', b.prefix, 'projects', b.projects, 'page', b.page
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', t.number,
        'title', t.title,
        'status', t.status,
        'project', t.project,
        'start_on', t.start_on,
        'due_on', t.due_on,
        'shipped_on', t.shipped_on,
        'description', t.description,
        'subtasks', (
          select coalesce(jsonb_agg(jsonb_build_object('id', s -> 'id', 'done', coalesce(s -> 'done', 'false'))), '[]')
          from jsonb_array_elements(t.subtasks) s
        ),
        'votes', t.vote_count,
        'voted', who is not null and exists (
          select 1 from public.task_votes v where v.board_id = t.board_id and v.number = t.number and v.voter = who
        ),
        'assignee', case when team and p.id is not null then
          jsonb_build_object('id', p.id, 'name', coalesce(p.name, 'Member'), 'avatar', p.avatar_url)
        end
      ) order by t.position, t.number)
      from public.tasks t
      left join public.profiles p on p.id = t.assignee
      where t.board_id = b.id and t.public and t.deleted_at is null and t.status <> 'canceled'
    ), '[]'),
    'suggestions', case when public.page_flag(b.page, 'ideasPublic', true) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'details', s.details,
        'by', s.by_name,
        'at', s.created_at,
        'votes', s.vote_count,
        'voted', who is not null and exists (
          select 1 from public.suggestion_votes v where v.suggestion_id = s.id and v.voter = who
        )
      ) order by s.vote_count desc, s.created_at desc)
      from (
        select * from public.suggestions where board_id = b.id order by vote_count desc, created_at desc limit 200
      ) s
    ), '[]') else '[]' end
  );
end;
$$;
