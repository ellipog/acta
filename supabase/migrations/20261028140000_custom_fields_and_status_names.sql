-- Boards can have fields of their own, beyond labels and projects: text, numbers, dates and single or multi
-- selects. A board keeps what its fields are, and each task keeps its values in custom, by field id. Boards can
-- also give the statuses names of their own. Both are board settings, so changing them needs the boards permission
alter table public.boards add column fields jsonb not null default '[]'
  check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 30 and octet_length(fields::text) <= 20000);
alter table public.boards add column status_names jsonb not null default '{}'
  check (jsonb_typeof(status_names) = 'object' and octet_length(status_names::text) <= 2000);
alter table public.tasks add column custom jsonb not null default '{}'
  check (jsonb_typeof(custom) = 'object' and octet_length(custom::text) <= 10000);

grant insert (fields, status_names) on public.boards to authenticated;
grant update (fields, status_names) on public.boards to authenticated;
grant insert (custom) on public.tasks to authenticated;
grant update (custom) on public.tasks to authenticated;

-- Same as before, with the new board settings needing the boards permission
create or replace function public.guard_board_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.roadmap_public, new.page) is distinct from (old.roadmap_public, old.page)
    and not public.can(old.workspace_id, 'roadmap') then
    raise exception 'You can’t change the public roadmap here' using errcode = '42501';
  end if;
  if (new.name, new.slug, new.labels, new.projects, new.position, new.fields, new.status_names)
    is distinct from (old.name, old.slug, old.labels, old.projects, old.position, old.fields, old.status_names)
    and not public.can(old.workspace_id, 'boards') then
    raise exception 'You can’t change boards here' using errcode = '42501';
  end if;
  return new;
end;
$$;


-- Same as before, saving each task's custom values
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

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'created', '[]'))
  loop
    n := (t ->> 'number')::int;
    insert into public.tasks as x (
      board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
      description, subtasks, public, shipped_on, position, origin, created_at, archived_at, custom
    )
    values (
      p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
      coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
      (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
      coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
      (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
      case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end,
      (t ->> 'archived_at')::timestamptz, coalesce(t -> 'custom', '{}')
    )
    on conflict (board_id, number) do update set
      title = excluded.title, status = excluded.status, priority = excluded.priority, size = excluded.size,
      project = excluded.project, labels = excluded.labels, start_on = excluded.start_on, due_on = excluded.due_on,
      assignee = excluded.assignee, description = excluded.description, subtasks = excluded.subtasks,
      public = excluded.public, shipped_on = excluded.shipped_on, position = excluded.position,
      archived_at = excluded.archived_at, custom = excluded.custom, deleted_at = null
    where x.deleted_at is not null;

    if not found then
      n := public.take_task_number(p_board);
      insert into public.tasks (
        board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
        description, subtasks, public, shipped_on, position, origin, created_at, archived_at, custom
      )
      values (
        p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
        (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
        coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
        (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid,
        case when agent then least(coalesce((t ->> 'created_at')::timestamptz, now()), now()) else now() end,
        (t ->> 'archived_at')::timestamptz, coalesce(t -> 'custom', '{}')
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
      archived_at = case when f ? 'archived_at' then (f ->> 'archived_at')::timestamptz else x.archived_at end,
      custom = case when f ? 'custom' then coalesce(f -> 'custom', '{}') else x.custom end
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


-- Same as before, for fields and status names too
create or replace function public.agent_board(p_key text, p_workspace uuid, p_board uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.agent_act(p_key, 'manage', p_workspace);
  b public.boards;
begin
  if not public.can(p_workspace, 'boards') then
    raise exception 'You can’t create or change boards here' using errcode = '42501';
  end if;
  if p_board is null then
    insert into public.boards (workspace_id, slug, name, prefix, created_by)
    values (p_workspace, p_fields ->> 'slug', btrim(p_fields ->> 'name'), public.board_prefix(p_fields ->> 'name'), me)
    returning * into b;
  else
    update public.boards set
      name = case when p_fields ? 'name' then btrim(p_fields ->> 'name') else name end,
      labels = case when p_fields ? 'labels' then p_fields -> 'labels' else labels end,
      projects = case when p_fields ? 'projects' then p_fields -> 'projects' else projects end,
      fields = case when p_fields ? 'fields' then p_fields -> 'fields' else fields end,
      status_names = case when p_fields ? 'status_names' then p_fields -> 'status_names' else status_names end
    where id = p_board and workspace_id = p_workspace
    returning * into b;
    if b.id is null then
      raise exception 'No such board' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'prefix', b.prefix);
end;
$$;

