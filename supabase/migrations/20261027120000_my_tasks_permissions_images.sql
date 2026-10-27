-- My tasks gets its own page under each workspace, so no board can take its address
update public.boards set slug = 'my-tasks-' || substr(md5(id::text), 1, 4) where slug = 'my-tasks';

create or replace function public.board_slug_ok(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' and s not in ('settings', 'my-tasks');
$$;

-- Viewers see everything and can comment and vote. On top of their role, members and viewers can be given or
-- denied each of these: edit (create, change and move tasks), delete (tasks), comment (comment, vote and suggest
-- ideas), boards (create boards and change their names, labels and projects), roadmap (publish the roadmap, edit
-- its page and decline ideas) and invite (see and share the invite link). Owners and admins can do all of it
alter table public.members drop constraint members_role_check;
alter table public.members add constraint members_role_check check (role in ('owner', 'admin', 'member', 'viewer'));

create function public.permissions_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) e
    where e.key not in ('edit', 'delete', 'comment', 'boards', 'roadmap', 'invite') or jsonb_typeof(e.value) <> 'boolean'
  );
$$;

alter table public.members add column permissions jsonb not null default '{}' check (public.permissions_ok(permissions));
grant update (role, permissions) on public.members to authenticated;

create function public.can(ws uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin') then true
      when m.permissions ? what then (m.permissions ->> what)::boolean
      when m.role = 'member' then what <> 'invite'
      else what = 'comment'
    end
    from public.members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  ), false);
$$;

create function public.board_can(b uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.can(bo.workspace_id, what) from public.boards bo where bo.id = b), false);
$$;

create function public.has_items(p jsonb, k text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p -> k) = 'array' and jsonb_array_length(p -> k) > 0;
$$;

revoke execute on function public.can(uuid, text), public.board_can(uuid, text) from public, anon;
grant execute on function public.can(uuid, text), public.board_can(uuid, text) to authenticated;

alter policy "Members create boards" on public.boards with check (public.can(workspace_id, 'boards'));

alter policy "Members create tasks" on public.tasks with check (public.board_can(board_id, 'edit'));
alter policy "Members edit tasks" on public.tasks
  using (public.board_can(board_id, 'edit')) with check (public.board_can(board_id, 'edit'));

alter policy "Members comment" on public.comments
  with check (public.board_can(board_id, 'comment') and author = (select auth.uid()));
alter policy "Members log activity" on public.activity
  with check (
    actor = (select auth.uid())
    and (public.board_can(board_id, 'edit') or (text = 'commented' and public.board_can(board_id, 'comment')))
  );
alter policy "Members vote" on public.task_votes
  with check (voter = 'u:' || (select auth.uid())::text and public.board_can(board_id, 'comment'));
alter policy "Members suggest" on public.suggestions
  with check (public.board_can(board_id, 'comment') and by_user = (select auth.uid()));
alter policy "Members decline suggestions" on public.suggestions using (public.board_can(board_id, 'roadmap'));
alter policy "Members vote on suggestions" on public.suggestion_votes
  with check (
    voter = 'u:' || (select auth.uid())::text
    and exists (select 1 from public.suggestions s where s.id = suggestion_id and public.board_can(s.board_id, 'comment'))
  );

alter policy "Managers see the join link" on public.workspace_links using (public.can(workspace_id, 'invite'));

-- Boards are one row, so which of its columns changed decides the permission. Changes the database makes on its
-- own, like taking the next task number, have nobody signed in and aren't checked
create function public.guard_board_edit()
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
  if (new.name, new.slug, new.labels, new.projects, new.position)
    is distinct from (old.name, old.slug, old.labels, old.projects, old.position)
    and not public.can(old.workspace_id, 'boards') then
    raise exception 'You can’t change boards here' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger boards_guard before update on public.boards
  for each row execute function public.guard_board_edit();

-- Deleting a task only marks it deleted, so it's an edit to the policies. This keeps it to those who may delete
create function public.guard_task_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.deleted_at is not null and old.deleted_at is null
    and not public.board_can(old.board_id, 'delete') then
    raise exception 'You can’t delete tasks on this board' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_guard_delete before update of deleted_at on public.tasks
  for each row execute function public.guard_task_delete();

-- Same as before, with each kind of change checked against what this person may do
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

-- Same as before, for people allowed to create and change boards
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
      projects = case when p_fields ? 'projects' then p_fields -> 'projects' else projects end
    where id = p_board and workspace_id = p_workspace
    returning * into b;
    if b.id is null then
      raise exception 'No such board' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'prefix', b.prefix);
end;
$$;

-- Same as before, with viewers last in line to inherit a workspace
create or replace function public.member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  heir uuid;
begin
  if not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return null;
  end if;

  update public.tasks t set assignee = null
  from public.boards b
  where b.id = t.board_id and b.workspace_id = old.workspace_id and t.assignee = old.user_id;

  if not exists (select 1 from public.members where workspace_id = old.workspace_id and role = 'owner') then
    select user_id into heir from public.members
    where workspace_id = old.workspace_id
    order by case role when 'admin' then 0 when 'member' then 1 else 2 end, created_at
    limit 1;
    if heir is null then
      delete from public.workspaces where id = old.workspace_id;
    else
      update public.members set role = 'owner' where workspace_id = old.workspace_id and user_id = heir;
    end if;
  end if;
  return null;
end;
$$;

-- A picture of the workspace's own, in place of its sigil. Uploaded through the server into the avatars bucket
alter table public.workspaces add column image_url text check (
  image_url is null
  or image_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/workspaces/'
);
grant update (image_url) on public.workspaces to authenticated;

-- Public pages have more settings now
alter table public.boards drop constraint boards_page_check;
alter table public.boards add constraint boards_page_check
  check (jsonb_typeof(page) = 'object' and octet_length(page::text) <= 16000);

-- Same as before, with the workspace's picture
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
    return jsonb_build_object(
      'private', true,
      'workspace', jsonb_build_object('name', w.name, 'slug', w.slug, 'sigil', w.sigil, 'tone', w.tone, 'image', w.image_url)
    );
  end if;

  who := case
    when (select auth.uid()) is not null then 'u:' || (select auth.uid())::text
    when p_visitor ~ '^v:[A-Za-z0-9-]{8,64}$' then p_visitor
  end;
  team := public.page_flag(b.page, 'showTeam', false);

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'name', w.name, 'slug', w.slug, 'sigil', w.sigil, 'tone', w.tone, 'image', w.image_url
    ),
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
