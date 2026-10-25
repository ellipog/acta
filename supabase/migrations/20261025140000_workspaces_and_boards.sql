create function public.slug_ok(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
    and s <> all (array[
      'about', 'acta', 'actapage', 'admin', 'administrator', 'api', 'app', 'apps', 'assets', 'auth', 'billing', 'blog',
      'cdn', 'changelog', 'contact', 'dashboard', 'docs', 'download', 'email', 'enterprise', 'explore', 'help', 'home',
      'invite', 'join', 'legal', 'log-in', 'login', 'logout', 'mail', 'moderator', 'new', 'oauth', 'official', 'pricing',
      'privacy', 'roadmap', 'root', 'scim', 'search', 'security', 'settings', 'sign-in', 'sign-up', 'signin', 'signout',
      'signup', 'sso', 'staff', 'static', 'status', 'support', 'system', 'terms', 'www', 'account', 'demo', 'library'
    ]);
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (public.slug_ok(slug)),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sigil text not null default 'crystal-cluster' check (char_length(sigil) <= 40),
  tone text not null default 'lapis' check (tone in ('lapis', 'pyrite', 'malachite', 'hematite')),
  plan text not null default 'free' check (plan in ('free', 'enterprise')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index members_user on public.members (user_id);

create table public.workspace_links (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null check (public.slug_ok(slug)),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  prefix text not null default 'ACT' check (prefix ~ '^[A-Z][A-Z0-9]{0,5}$'),
  next_number int not null default 1 check (next_number > 0),
  labels jsonb not null default '[{"id":"Feature","tone":"lapis"},{"id":"Bug","tone":"hematite"},{"id":"Improvement","tone":"malachite"},{"id":"Design","tone":"pyrite"}]'
    check (jsonb_typeof(labels) = 'array' and octet_length(labels::text) <= 4000),
  projects jsonb not null default '[]' check (jsonb_typeof(projects) = 'array' and octet_length(projects::text) <= 4000),
  roadmap_public boolean not null default false,
  page jsonb not null default '{}' check (jsonb_typeof(page) = 'object' and octet_length(page::text) <= 8000),
  position double precision not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.tasks (
  board_id uuid not null references public.boards (id) on delete cascade,
  number int not null check (number > 0),
  title text not null check (char_length(title) <= 500),
  status text not null check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text not null default 'none' check (priority in ('urgent', 'high', 'medium', 'low', 'none')),
  size text check (size in ('xs', 's', 'm', 'l', 'xl')),
  project text check (char_length(project) <= 60),
  labels text[] not null default '{}' check (cardinality(labels) <= 20),
  start_on date,
  due_on date,
  assignee uuid references public.profiles (id) on delete set null,
  description text not null default '' check (char_length(description) <= 20000),
  subtasks jsonb not null default '[]' check (jsonb_typeof(subtasks) = 'array' and octet_length(subtasks::text) <= 20000),
  public boolean not null default false,
  shipped_on date,
  vote_count int not null default 0,
  position double precision not null default 0,
  origin uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (board_id, number)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  number int not null,
  author uuid default auth.uid() references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (board_id, number) references public.tasks (board_id, number) on delete cascade
);

create index comments_task on public.comments (board_id, number);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  number int not null,
  actor uuid default auth.uid() references public.profiles (id) on delete set null,
  text text not null check (char_length(text) <= 300),
  created_at timestamptz not null default now(),
  foreign key (board_id, number) references public.tasks (board_id, number) on delete cascade
);

create index activity_task on public.activity (board_id, number);

create table public.task_votes (
  board_id uuid not null,
  number int not null,
  voter text not null check (voter ~ '^[uv]:[A-Za-z0-9-]{8,64}$'),
  created_at timestamptz not null default now(),
  primary key (board_id, number, voter),
  foreign key (board_id, number) references public.tasks (board_id, number) on delete cascade
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  details text check (char_length(details) <= 2000),
  by_name text not null default 'Anonymous' check (char_length(by_name) <= 60),
  by_user uuid references public.profiles (id) on delete set null,
  vote_count int not null default 0,
  created_at timestamptz not null default now()
);

create index suggestions_board on public.suggestions (board_id);

create table public.suggestion_votes (
  suggestion_id uuid not null references public.suggestions (id) on delete cascade,
  voter text not null check (voter ~ '^[uv]:[A-Za-z0-9-]{8,64}$'),
  created_at timestamptz not null default now(),
  primary key (suggestion_id, voter)
);

create function public.role_in(ws uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.members where workspace_id = ws and user_id = (select auth.uid());
$$;

create function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where workspace_id = ws and user_id = (select auth.uid()));
$$;

create function public.is_manager(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.role_in(ws) in ('owner', 'admin'), false);
$$;

create function public.can_edit_board(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.boards bo
    join public.members m on m.workspace_id = bo.workspace_id
    where bo.id = b and m.user_id = (select auth.uid())
  );
$$;

create function public.shares_workspace(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members a
    join public.members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

revoke execute on function public.role_in(uuid), public.is_member(uuid), public.is_manager(uuid),
  public.can_edit_board(uuid), public.shares_workspace(uuid) from public, anon;
grant execute on function public.role_in(uuid), public.is_member(uuid), public.is_manager(uuid),
  public.can_edit_board(uuid), public.shares_workspace(uuid) to authenticated;

create policy "Teammates can see each other" on public.profiles
  for select to authenticated using (public.shares_workspace(id));

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.workspace_links enable row level security;
alter table public.boards enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;
alter table public.task_votes enable row level security;
alter table public.suggestions enable row level security;
alter table public.suggestion_votes enable row level security;

revoke all on public.workspaces, public.members, public.workspace_links, public.boards, public.tasks, public.comments,
  public.activity, public.task_votes, public.suggestions, public.suggestion_votes from anon, authenticated;

grant select, insert, update, delete on public.workspaces, public.members, public.workspace_links, public.boards,
  public.tasks, public.comments, public.activity, public.task_votes, public.suggestions, public.suggestion_votes to service_role;

grant select, delete on public.workspaces to authenticated;
grant update (name, slug, sigil, tone) on public.workspaces to authenticated;
grant select, delete on public.members to authenticated;
grant update (role) on public.members to authenticated;
grant select, insert, delete on public.workspace_links to authenticated;
grant update (token) on public.workspace_links to authenticated;
grant select, delete on public.boards to authenticated;
grant insert (workspace_id, slug, name, prefix, labels, projects, roadmap_public, page, position) on public.boards to authenticated;
grant update (slug, name, labels, projects, roadmap_public, page, position) on public.boards to authenticated;
grant select on public.tasks to authenticated;
grant insert (board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee, description,
  subtasks, public, shipped_on, position, origin) on public.tasks to authenticated;
grant update (title, status, priority, size, project, labels, start_on, due_on, assignee, description, subtasks, public,
  shipped_on, position, deleted_at) on public.tasks to authenticated;
grant select, delete on public.comments to authenticated;
grant insert (id, board_id, number, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant select, delete on public.activity to authenticated;
grant insert (id, board_id, number, text) on public.activity to authenticated;
grant select, insert, delete on public.task_votes to authenticated;
grant select, delete on public.suggestions to authenticated;
grant insert (id, board_id, title, details, by_name) on public.suggestions to authenticated;
grant select, insert, delete on public.suggestion_votes to authenticated;

create policy "Members see their workspaces" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "Managers edit workspaces" on public.workspaces
  for update to authenticated using (public.is_manager(id)) with check (public.is_manager(id));
create policy "Owners delete workspaces" on public.workspaces
  for delete to authenticated using (public.role_in(id) = 'owner');

create policy "Members see each other" on public.members
  for select to authenticated using (public.is_member(workspace_id));
create policy "Managers change roles" on public.members
  for update to authenticated
  using (public.is_manager(workspace_id) and (public.role_in(workspace_id) = 'owner' or role <> 'owner'))
  with check (public.role_in(workspace_id) = 'owner' or role <> 'owner');
create policy "People leave, managers remove" on public.members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.is_manager(workspace_id) and (public.role_in(workspace_id) = 'owner' or role <> 'owner'))
  );

create policy "Managers see the join link" on public.workspace_links
  for select to authenticated using (public.is_manager(workspace_id));
create policy "Managers create the join link" on public.workspace_links
  for insert to authenticated with check (public.is_manager(workspace_id));
create policy "Managers reset the join link" on public.workspace_links
  for update to authenticated using (public.is_manager(workspace_id)) with check (public.is_manager(workspace_id));
create policy "Managers remove the join link" on public.workspace_links
  for delete to authenticated using (public.is_manager(workspace_id));

create policy "Members see boards" on public.boards
  for select to authenticated using (public.is_member(workspace_id));
create policy "Members create boards" on public.boards
  for insert to authenticated with check (public.is_member(workspace_id));
create policy "Members edit boards" on public.boards
  for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "Managers delete boards" on public.boards
  for delete to authenticated using (public.is_manager(workspace_id));

create policy "Members see tasks" on public.tasks
  for select to authenticated using (public.can_edit_board(board_id));
create policy "Members create tasks" on public.tasks
  for insert to authenticated with check (public.can_edit_board(board_id));
create policy "Members edit tasks" on public.tasks
  for update to authenticated using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

create policy "Members see comments" on public.comments
  for select to authenticated using (public.can_edit_board(board_id));
create policy "Members comment" on public.comments
  for insert to authenticated with check (public.can_edit_board(board_id) and author = (select auth.uid()));
create policy "People edit their comments" on public.comments
  for update to authenticated using (author = (select auth.uid())) with check (author = (select auth.uid()));
create policy "People delete their comments" on public.comments
  for delete to authenticated using (author = (select auth.uid()));

create policy "Members see activity" on public.activity
  for select to authenticated using (public.can_edit_board(board_id));
create policy "Members log activity" on public.activity
  for insert to authenticated with check (public.can_edit_board(board_id) and actor = (select auth.uid()));
create policy "People remove their activity" on public.activity
  for delete to authenticated using (actor = (select auth.uid()));

create policy "People see their votes" on public.task_votes
  for select to authenticated using (voter = 'u:' || (select auth.uid())::text);
create policy "Members vote" on public.task_votes
  for insert to authenticated with check (voter = 'u:' || (select auth.uid())::text and public.can_edit_board(board_id));
create policy "People take back votes" on public.task_votes
  for delete to authenticated using (voter = 'u:' || (select auth.uid())::text);

create policy "Members see suggestions" on public.suggestions
  for select to authenticated using (public.can_edit_board(board_id));
create policy "Members suggest" on public.suggestions
  for insert to authenticated with check (public.can_edit_board(board_id) and by_user = (select auth.uid()));
create policy "Members decline suggestions" on public.suggestions
  for delete to authenticated using (public.can_edit_board(board_id));

create policy "People see their suggestion votes" on public.suggestion_votes
  for select to authenticated using (voter = 'u:' || (select auth.uid())::text);
create policy "Members vote on suggestions" on public.suggestion_votes
  for insert to authenticated
  with check (
    voter = 'u:' || (select auth.uid())::text
    and exists (select 1 from public.suggestions s where s.id = suggestion_id and public.can_edit_board(s.board_id))
  );
create policy "People take back suggestion votes" on public.suggestion_votes
  for delete to authenticated using (voter = 'u:' || (select auth.uid())::text);

alter table public.suggestions alter column by_user set default auth.uid();

create function public.touch_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_task();

create function public.task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boards set next_number = greatest(next_number, new.number + 1) where id = new.board_id;
  if new.origin is not null then
    insert into public.task_votes (board_id, number, voter)
    select new.board_id, new.number, voter from public.suggestion_votes where suggestion_id = new.origin
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger tasks_created after insert on public.tasks
  for each row execute function public.task_created();

create function public.count_task_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.tasks set vote_count = vote_count + 1 where board_id = new.board_id and number = new.number;
  else
    update public.tasks set vote_count = greatest(vote_count - 1, 0) where board_id = old.board_id and number = old.number;
  end if;
  return null;
end;
$$;

create trigger task_votes_count after insert or delete on public.task_votes
  for each row execute function public.count_task_votes();

create function public.count_suggestion_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.suggestions set vote_count = vote_count + 1 where id = new.suggestion_id;
  else
    update public.suggestions set vote_count = greatest(vote_count - 1, 0) where id = old.suggestion_id;
  end if;
  return null;
end;
$$;

create trigger suggestion_votes_count after insert or delete on public.suggestion_votes
  for each row execute function public.count_suggestion_votes();

create function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and new.role <> 'owner'
    and not exists (
      select 1 from public.members
      where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id
    ) then
    raise exception 'A workspace needs at least one owner' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger members_guard_owner before update of role on public.members
  for each row execute function public.guard_last_owner();

create function public.member_left()
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
    order by case role when 'admin' then 0 else 1 end, created_at
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

create trigger members_left after delete on public.members
  for each row execute function public.member_left();

create function public.take_task_number(p_board uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.can_edit_board(p_board) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.boards set next_number = next_number + 1 where id = p_board returning next_number - 1 into n;
  return n;
end;
$$;

revoke execute on function public.take_task_number(uuid) from public, anon;
grant execute on function public.take_task_number(uuid) to authenticated;

create function public.board_prefix(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x ~ '^[A-Z]' then left(x, 3) else 'ACT' end
  from (select upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g')) as x) s;
$$;

create function public.create_workspace(p_name text, p_slug text, p_board_name text, p_board_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ws uuid;
  tones text[] := array['lapis', 'pyrite', 'malachite', 'hematite'];
  sigils text[] := array['crystal-cluster', 'crystal-prism', 'crystal-tablet', 'crystal-shard', 'geode'];
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.members where user_id = me and role = 'owner') >= 20 then
    raise exception 'You can own up to 20 workspaces' using errcode = 'P0001';
  end if;

  insert into public.workspaces (slug, name, created_by, tone, sigil)
  values (
    p_slug,
    btrim(p_name),
    me,
    tones[1 + floor(random() * array_length(tones, 1))::int],
    sigils[1 + floor(random() * array_length(sigils, 1))::int]
  )
  returning id into ws;

  insert into public.members (workspace_id, user_id, role) values (ws, me, 'owner');
  insert into public.workspace_links (workspace_id) values (ws);
  insert into public.boards (workspace_id, slug, name, prefix, created_by)
  values (ws, p_board_slug, btrim(p_board_name), public.board_prefix(p_board_name), me);

  return jsonb_build_object('workspace', p_slug, 'board', p_board_slug);
end;
$$;

revoke execute on function public.create_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text) to authenticated;

create function public.workspace_slug_taken(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspaces where slug = p_slug);
$$;

revoke execute on function public.workspace_slug_taken(text) from public, anon;
grant execute on function public.workspace_slug_taken(text) to authenticated;

create function public.invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', w.name,
    'slug', w.slug,
    'sigil', w.sigil,
    'tone', w.tone,
    'members', (select count(*) from public.members m where m.workspace_id = w.id),
    'joined', exists (select 1 from public.members m where m.workspace_id = w.id and m.user_id = (select auth.uid()))
  )
  from public.workspace_links l
  join public.workspaces w on w.id = l.workspace_id
  where l.token = p_token;
$$;

revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

create function public.accept_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ws uuid;
  ws_slug text;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select w.id, w.slug into ws, ws_slug
  from public.workspace_links l join public.workspaces w on w.id = l.workspace_id
  where l.token = p_token;
  if ws is null then
    raise exception 'This invite link no longer works' using errcode = 'P0002';
  end if;
  insert into public.members (workspace_id, user_id, role) values (ws, me, 'member') on conflict do nothing;
  return ws_slug;
end;
$$;

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

create function public.apply_board_changes(p_board uuid, p_changes jsonb)
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
begin
  if not public.can_edit_board(p_board) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_changes -> 'created', '[]'))
  loop
    n := (t ->> 'number')::int;
    insert into public.tasks as x (
      board_id, number, title, status, priority, size, project, labels, start_on, due_on, assignee,
      description, subtasks, public, shipped_on, position, origin
    )
    values (
      p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
      coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
      (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
      coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
      (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid
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
        description, subtasks, public, shipped_on, position, origin
      )
      values (
        p_board, n, t ->> 'title', t ->> 'status', coalesce(t ->> 'priority', 'none'), t ->> 'size', t ->> 'project',
        coalesce(array(select jsonb_array_elements_text(coalesce(t -> 'labels', '[]'))), '{}'),
        (t ->> 'start_on')::date, (t ->> 'due_on')::date, (t ->> 'assignee')::uuid,
        coalesce(t ->> 'description', ''), coalesce(t -> 'subtasks', '[]'), coalesce((t ->> 'public')::boolean, false),
        (t ->> 'shipped_on')::date, coalesce((t ->> 'position')::double precision, 0), (t ->> 'origin')::uuid
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

  insert into public.comments (id, board_id, number, body)
  select (c ->> 'id')::uuid, p_board, coalesce((moved ->> (c ->> 'number'))::int, (c ->> 'number')::int), c ->> 'body'
  from jsonb_array_elements(coalesce(p_changes -> 'comments', '[]')) c
  on conflict (id) do nothing;

  delete from public.comments
  where board_id = p_board
    and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'uncomments', '[]')));

  insert into public.activity (id, board_id, number, text)
  select (a ->> 'id')::uuid, p_board, coalesce((moved ->> (a ->> 'number'))::int, (a ->> 'number')::int), left(a ->> 'text', 300)
  from jsonb_array_elements(coalesce(p_changes -> 'activity', '[]')) a
  on conflict (id) do nothing;

  delete from public.activity
  where board_id = p_board
    and id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_changes -> 'unactivity', '[]')));

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

revoke execute on function public.apply_board_changes(uuid, jsonb) from public, anon;
grant execute on function public.apply_board_changes(uuid, jsonb) to authenticated;

alter publication supabase_realtime add table public.tasks, public.comments, public.activity, public.suggestions, public.boards;
